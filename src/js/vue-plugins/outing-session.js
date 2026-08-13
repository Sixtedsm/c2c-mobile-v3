// Runtime tracking of an outing in progress. Two orthogonal toggles:
//   - sessionActive: the user has declared they are on the move (changes
//     UI hints, keeps the "current topo" pinned). Doesn't consume battery.
//   - gpsTracking: actively logging GPS positions every ~5s into a local
//     trace that becomes a GPX + can be attached to a draft outing.
//     Battery-heavy. Off by default; opt-in only.
//
// Both states survive route changes because the plugin lives at the Vue
// prototype level. Reload-survival: snapshots to localStorage on every
// change so a browser refresh / OS-killed tab doesn't lose the trace.
//
// Ported from the V4 experimental version — no V4-specific dependencies,
// runs as a plain Vue 2 plugin on the V3 shell.

import { haversine } from '@/pwa/haversine';

const STORAGE_KEY = 'v3.outingSession';
const DEFAULT_TRACK_INTERVAL_MS = 5000; // fallback if $appSettings hasn't loaded yet
const MIN_DISTANCE_M = 3; // ignore jitter under 3m (urban canyon GPS noise)
const MAX_STALE_MS = 48 * 3600 * 1000; // drop sessions older than 48h

function loadSnapshot() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    // Sanity: drop stale sessions to avoid resuming a forgotten tracking
    // run that drained battery overnight.
    if (parsed.startedAt && Date.now() - parsed.startedAt > MAX_STALE_MS) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function persist(state) {
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        sessionActive: state.sessionActive,
        // Never re-persist gpsTracking=true — see restart logic below.
        gpsTracking: false,
        topoRef: state.topoRef,
        startedAt: state.startedAt,
        positions: state.positions,
      })
    );
  } catch {
    // localStorage full or denied — ignore, session won't survive reload
  }
}

export default function install(Vue) {
  const snap = loadSnapshot();

  const vm = new Vue({
    name: 'OutingSession',

    data() {
      return {
        sessionActive: !!snap?.sessionActive,
        // Always restart with GPS off — never silently drain battery
        // after a reload without the user re-opting in.
        gpsTracking: false,
        topoRef: snap?.topoRef || null,
        startedAt: snap?.startedAt || null,
        currentPosition: null,
        positions: snap?.positions || [],
        watchId: null,
        geoError: null,
        // Battery guard (Lot 5): when the tab is hidden (backgrounded
        // browser, phone lock, another app) we pause the GPS watch to
        // stop burning battery. On resume we re-arm if tracking was on.
        // `wasTrackingBeforeHide` remembers the user intent through
        // hide/show cycles.
        wasTrackingBeforeHide: false,
      };
    },

    computed: {
      // Distance covered by the recorded trace (meters).
      tracedDistanceMeters() {
        let d = 0;
        for (let i = 1; i < this.positions.length; i += 1) {
          d += haversine(this.positions[i - 1], this.positions[i]);
        }
        return d;
      },
      // Elevation gain along the recorded trace (meters).
      elevationGainMeters() {
        let g = 0;
        for (let i = 1; i < this.positions.length; i += 1) {
          const da = (this.positions[i].alt || 0) - (this.positions[i - 1].alt || 0);
          if (da > 0) g += da;
        }
        return g;
      },
      elevationLossMeters() {
        let l = 0;
        for (let i = 1; i < this.positions.length; i += 1) {
          const da = (this.positions[i].alt || 0) - (this.positions[i - 1].alt || 0);
          if (da < 0) l += -da;
        }
        return l;
      },
    },

    watch: {
      sessionActive: 'snapshot',
      gpsTracking(active) {
        if (active) this.startGpsWatch();
        else this.stopGpsWatch();
        this.snapshot();
      },
      positions: { handler: 'snapshot', deep: false },
      topoRef: { handler: 'snapshot', deep: true },
    },

    beforeDestroy() {
      this.stopGpsWatch();
      if (this._onVisibility && typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', this._onVisibility);
      }
    },

    created() {
      // Wire the tab-hidden battery guard once. The listener stays for
      // the whole app lifetime — the plugin is a singleton.
      if (typeof document === 'undefined' || typeof document.addEventListener !== 'function') {
        return;
      }
      this._onVisibility = () => {
        if (document.hidden) {
          // Tab going away → flip tracking off through the reactive
          // path so the UI toggle stays truthful and the watcher's
          // stopGpsWatch() call takes effect. Remember the user intent
          // so we can re-arm on resume.
          if (this.gpsTracking) {
            this.wasTrackingBeforeHide = true;
            this.gpsTracking = false;
          }
        } else if (this.wasTrackingBeforeHide && this.sessionActive) {
          this.wasTrackingBeforeHide = false;
          this.gpsTracking = true;
        }
      };
      document.addEventListener('visibilitychange', this._onVisibility);
    },

    methods: {
      snapshot() {
        persist(this.$data);
      },

      // Start an outing on a given topo. Does NOT enable GPS tracking
      // unless the caller passes { track: true }.
      start({ type, id, lang }, { track = false } = {}) {
        this.sessionActive = true;
        this.topoRef = { type, id, lang };
        this.startedAt = Date.now();
        this.positions = [];
        this.gpsTracking = !!track;
      },

      // Stop the outing entirely — clears tracking and forgets the topo.
      // Trace kept in memory until export/discard so the user can attach
      // it to a draft outing right after.
      stop() {
        this.gpsTracking = false;
        this.sessionActive = false;
        this.topoRef = null;
        this.startedAt = null;
      },

      requestCurrentPosition() {
        return new Promise((resolve, reject) => {
          if (!navigator.geolocation) {
            reject(new Error('Geolocation API unavailable'));
            return;
          }
          navigator.geolocation.getCurrentPosition(
            (pos) => {
              const sample = {
                lat: pos.coords.latitude,
                lon: pos.coords.longitude,
                alt: pos.coords.altitude,
                accuracy: pos.coords.accuracy,
                t: pos.timestamp || Date.now(),
              };
              this.currentPosition = sample;
              resolve(sample);
            },
            (err) => {
              this.geoError = err;
              reject(err);
            },
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 5000 }
          );
        });
      },

      startGpsWatch() {
        if (!navigator.geolocation || this.watchId !== null) return;
        // Sample rate is user-controlled via AppSettings (CDC §2.9).
        // Snapshot at watch start — a mid-watch change is honored by
        // stop+start, not by mutating the closure.
        const intervalMs = this.$appSettings?.gpsIntervalMs ?? DEFAULT_TRACK_INTERVAL_MS;
        let lastSampleTime = 0;
        this.watchId = navigator.geolocation.watchPosition(
          (pos) => {
            const now = pos.timestamp || Date.now();
            // Browser may fire much more often than we need; throttle.
            if (now - lastSampleTime < intervalMs - 500) return;
            const sample = {
              lat: pos.coords.latitude,
              lon: pos.coords.longitude,
              alt: pos.coords.altitude,
              accuracy: pos.coords.accuracy,
              t: now,
            };
            this.currentPosition = sample;
            const last = this.positions[this.positions.length - 1];
            if (!last || haversine(last, sample) >= MIN_DISTANCE_M) {
              this.positions = [...this.positions, sample];
              lastSampleTime = now;
            }
          },
          (err) => {
            this.geoError = err;
          },
          { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
        );
      },

      stopGpsWatch() {
        if (this.watchId !== null && navigator.geolocation) {
          navigator.geolocation.clearWatch(this.watchId);
        }
        this.watchId = null;
      },

      discardTrace() {
        this.positions = [];
        this.snapshot();
      },

      // Build a GPX 1.1 document from the recorded trace. Standard
      // format compatible with Garmin / Strava / Komoot / etc.
      exportGpx({ name = 'Sortie Camptocamp', description = '' } = {}) {
        const escape = (s) =>
          String(s ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
        const trkpts = this.positions
          .map((p) => {
            const ele = Number.isFinite(p.alt) ? `      <ele>${p.alt.toFixed(1)}</ele>\n` : '';
            const time = p.t ? `      <time>${new Date(p.t).toISOString()}</time>\n` : '';
            return `    <trkpt lat="${p.lat}" lon="${p.lon}">\n${ele}${time}    </trkpt>`;
          })
          .join('\n');
        return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Camptocamp mobile" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata>
    <name>${escape(name)}</name>
    <desc>${escape(description)}</desc>
    <time>${new Date().toISOString()}</time>
  </metadata>
  <trk>
    <name>${escape(name)}</name>
    <trkseg>
${trkpts}
    </trkseg>
  </trk>
</gpx>`;
      },
    },
  });

  Vue.prototype.$outingSession = vm;
}
