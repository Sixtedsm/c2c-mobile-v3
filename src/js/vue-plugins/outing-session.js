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
import { splitOnGaps } from '@/pwa/trace-segments';

const STORAGE_KEY = 'v3.outingSession';
const DEFAULT_TRACK_INTERVAL_MS = 5000; // fallback if $appSettings hasn't loaded yet
const MIN_DISTANCE_M = 3; // ignore jitter under 3m (urban canyon GPS noise)
const MAX_STALE_MS = 48 * 3600 * 1000; // drop sessions older than 48h
// A live watch on a phone in a pocket still delivers a fix every few
// seconds. Going a full minute without one means the watch is dead —
// suspended by the OS, killed by a driver hiccup, or wedged after a
// TIMEOUT — so the watchdog rebuilds it.
const STALE_FIX_MS = 60 * 1000;
const WATCHDOG_INTERVAL_MS = 30 * 1000;
// Debounce persist() on `positions` — a long trace (thousands of
// points) shouldn't JSON.stringify the whole state on every fix. 2 s
// balances battery / CPU vs. the risk of losing the last few points
// on an unexpected crash.
const POSITIONS_PERSIST_DEBOUNCE_MS = 2000;

// XML entity escaping for GPX generation. Hoisted so it's not
// re-created on every exportGpx() call.
function escapeXml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

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
        // A pause has to survive a reload: the phone in a pocket during
        // a long break is exactly when the tab gets killed, and coming
        // back to a session that forgot it was paused would resume
        // charging that break to the outing.
        paused: state.paused,
        pausedAt: state.pausedAt,
        pausedMs: state.pausedMs,
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
        // Explicit pause (CDC §2.4), distinct from "GPS happens to be
        // off": starting a session without tracking is not a pause, so
        // only pause()/resume() move these.
        paused: !!snap?.paused,
        // Start of the pause currently running, null when not paused.
        pausedAt: snap?.pausedAt || null,
        // Total of the pauses already closed.
        pausedMs: snap?.pausedMs || 0,
        currentPosition: null,
        positions: snap?.positions || [],
        watchId: null,
        geoError: null,
        // Timestamp of the last fix the browser delivered. Drives the
        // watchdog and lets the UI prove tracking is actually alive —
        // the original failure was invisible precisely because nothing
        // recorded whether fixes were still arriving.
        lastFixAt: null,
        // Screen Wake Lock sentinel held while recording. Without it
        // the phone locks after ~30 s and the page is frozen, which is
        // what turned a 1 h run into 3 recorded points.
        wakeLockActive: false,
        // NOTE: there used to be a `wasTrackingBeforeHide` flag here,
        // backing a "battery guard" that stopped the watch whenever the
        // tab went hidden. That guard was the bug: a locked screen
        // silently ended every recording. See the visibility handler.
      };
    },

    computed: {
      // How long since the browser last handed us a position. Infinity
      // when tracking has never produced a fix. The watchdog and the
      // visibility handler both read this, and the UI can surface it so
      // a stalled recording is visible instead of silent.
      fixAgeMs() {
        if (!this.lastFixAt) return Infinity;
        return Date.now() - this.lastFixAt;
      },
      // Distance covered by the recorded trace (meters).
      //
      // A point flagged `gap` is the first one recorded after a pause,
      // so the step leading to it did not happen on foot — it is the
      // drive home, the chairlift, or simply the distance between where
      // the user stopped and where they picked the outing back up.
      // Counting it inflates length_total, which is published to
      // camptocamp.org; these three loops are the reason the pause is
      // a data-quality fix and not an ergonomics one.
      tracedDistanceMeters() {
        let d = 0;
        for (let i = 1; i < this.positions.length; i += 1) {
          if (this.positions[i].gap) continue;
          d += haversine(this.positions[i - 1], this.positions[i]);
        }
        return d;
      },
      // Elevation gain along the recorded trace (meters).
      elevationGainMeters() {
        let g = 0;
        for (let i = 1; i < this.positions.length; i += 1) {
          if (this.positions[i].gap) continue;
          const da = (this.positions[i].alt || 0) - (this.positions[i - 1].alt || 0);
          if (da > 0) g += da;
        }
        return g;
      },
      elevationLossMeters() {
        let l = 0;
        for (let i = 1; i < this.positions.length; i += 1) {
          if (this.positions[i].gap) continue;
          const da = (this.positions[i].alt || 0) - (this.positions[i - 1].alt || 0);
          if (da < 0) l += -da;
        }
        return l;
      },
    },

    watch: {
      sessionActive: 'snapshot',
      paused: 'snapshot',
      gpsTracking(active) {
        if (active) {
          // Fresh run: forget the previous throttle cursor, otherwise a
          // restart within one sample interval drops the first fix.
          this._lastSampleTime = 0;
          this.lastFixAt = null;
          // Recording resuming over an existing trace means a hole: the
          // user was somewhere between the last point and the next, and
          // that step was not walked with the app watching. Flagged here
          // rather than in resume() because switching the GPS checkbox
          // off and on opens the very same hole without any pause.
          //
          // A watchdog rebuild deliberately does NOT come through here:
          // fixes dried up while the user kept walking, so that distance
          // is real and dropping it would under-report the outing.
          if (this.positions.length > 0) {
            this._gapPending = true;
          }
          this.startGpsWatch();
        } else {
          this.stopGpsWatch();
          this.stopWatchdog();
          this.releaseWakeLock();
        }
        this.snapshot();
      },
      // Positions accrue at ~5 s intervals — debouncing writes to
      // localStorage prevents a 3600-point trace from re-serializing
      // ~350 KB on every fix.
      positions: { handler: 'snapshotDebounced', deep: false },
      topoRef: { handler: 'snapshot', deep: true },
    },

    created() {
      // Wire the tab-hidden battery guard once. The listener stays for
      // the whole app lifetime — the plugin is a singleton.
      if (typeof document === 'undefined' || typeof document.addEventListener !== 'function') {
        return;
      }
      this._onVisibility = () => {
        if (document.hidden) {
          // Deliberately do NOT stop the watch here.
          //
          // The previous version flipped gpsTracking off on every
          // hide, which meant a phone locking its screen 30 s into a
          // run silently ended the recording. Sixte's 1 h run on
          // 2026-09-02 produced 3 points — one for each time he woke
          // the screen and the watch briefly re-armed.
          //
          // watchPosition keeps delivering in the background on iOS
          // PWA and Android Chrome. Where the OS does suspend it, the
          // watchdog notices the fix drought and rebuilds the watch.
          return;
        }
        if (!this.gpsTracking) return;
        // Back in the foreground. Browsers release the wake lock while
        // hidden, so re-take it; and if fixes stopped arriving while we
        // were away, rebuild the watch rather than trusting a dead one.
        this.acquireWakeLock();
        if (this.fixAgeMs > STALE_FIX_MS) this.restartGpsWatch();
      };
      document.addEventListener('visibilitychange', this._onVisibility);
    },

    beforeDestroy() {
      this.stopGpsWatch();
      this.stopWatchdog();
      this.releaseWakeLock();
      if (this._persistTimer) {
        clearTimeout(this._persistTimer);
        // Flush pending trace on unmount to avoid losing points that
        // were still inside the debounce window.
        persist(this.$data);
      }
      if (this._onVisibility && typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', this._onVisibility);
      }
    },

    methods: {
      snapshot() {
        persist(this.$data);
      },

      snapshotDebounced() {
        if (this._persistTimer) clearTimeout(this._persistTimer);
        this._persistTimer = window.setTimeout(() => {
          this._persistTimer = null;
          persist(this.$data);
        }, POSITIONS_PERSIST_DEBOUNCE_MS);
      },

      // Start an outing on a given topo. Does NOT enable GPS tracking
      // unless the caller passes { track: true }.
      start({ type, id, lang }, { track = false } = {}) {
        this.sessionActive = true;
        this.topoRef = { type, id, lang };
        this.startedAt = Date.now();
        this.positions = [];
        this.paused = false;
        this.pausedAt = null;
        this.pausedMs = 0;
        this._gapPending = false;
        this.gpsTracking = !!track;
      },

      // Suspend an outing in progress (CDC §2.4). The session, the topo
      // and the trace all stay; only the recording stops, and the break
      // is charged to pausedMs instead of to the outing.
      //
      // Idempotent: a second call must not restart the clock on a pause
      // already running, or a double tap would forgive the whole break.
      pause() {
        if (!this.sessionActive || this.paused) return;
        this.paused = true;
        this.pausedAt = Date.now();
        this.gpsTracking = false;
      },

      // Pick the outing back up. The next recorded point is flagged so
      // distance and elevation skip the step across the break — see
      // tracedDistanceMeters.
      resume() {
        if (!this.sessionActive) return;
        if (this.paused) {
          this.pausedMs += Math.max(0, Date.now() - (this.pausedAt ?? Date.now()));
          this.pausedAt = null;
          this.paused = false;
        }
        // The gpsTracking watcher flags the trace discontinuity.
        this.gpsTracking = true;
      },

      // Stop the outing entirely — clears tracking and forgets the topo.
      // Trace kept in memory until export/discard so the user can attach
      // it to a draft outing right after.
      stop() {
        // Setting gpsTracking to false runs the watcher above, which
        // clears the watch, the watchdog and the wake lock.
        this.gpsTracking = false;
        this.sessionActive = false;
        this.topoRef = null;
        this.startedAt = null;
        this.paused = false;
        this.pausedAt = null;
        this.pausedMs = 0;
        this._gapPending = false;
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

      // Keep the screen awake while recording. Without this the phone
      // locks after ~30 s, the page is frozen by the OS and no fixes
      // arrive — the root cause of the 3-points-in-an-hour report.
      // Best-effort: unsupported or denied just means the screen may
      // sleep, and the watchdog then does the recovery work.
      async acquireWakeLock() {
        if (this.wakeLockActive || typeof navigator === 'undefined' || !navigator.wakeLock) return;
        try {
          this._wakeLock = await navigator.wakeLock.request('screen');
          this.wakeLockActive = true;
          // The browser drops the lock on hide; mirror that in state so
          // the visibility handler knows to re-take it.
          this._wakeLock.addEventListener?.('release', () => {
            this.wakeLockActive = false;
            this._wakeLock = null;
          });
        } catch {
          this.wakeLockActive = false;
          this._wakeLock = null;
        }
      },

      releaseWakeLock() {
        try {
          this._wakeLock?.release?.();
        } catch {
          // already released by the browser
        }
        this._wakeLock = null;
        this.wakeLockActive = false;
      },

      // Tear down and rebuild the watch. Used by the watchdog and on
      // returning to the foreground — a watch that stopped delivering
      // never recovers on its own, and because watchId stayed set the
      // old code could never restart it.
      restartGpsWatch() {
        this.stopGpsWatch();
        // Give the fresh watch a full staleness window to produce its
        // first fix. Without this the age stays stale and the watchdog
        // would tear the watch down again every 30 s for as long as
        // there is no signal — a tunnel or a deep couloir would cause
        // continuous churn instead of a patient retry.
        this.lastFixAt = Date.now();
        this.startGpsWatch();
      },

      // Rebuild the watch whenever fixes dry up. This is what catches
      // the silent failures: an OS-suspended watch delivers neither a
      // position nor an error, so only the absence of fixes reveals it.
      startWatchdog() {
        this.stopWatchdog();
        this._watchdog = window.setInterval(() => {
          if (!this.gpsTracking) return;
          if (this.fixAgeMs > STALE_FIX_MS) this.restartGpsWatch();
        }, WATCHDOG_INTERVAL_MS);
      },

      stopWatchdog() {
        if (this._watchdog) {
          window.clearInterval(this._watchdog);
          this._watchdog = null;
        }
      },

      startGpsWatch() {
        if (!navigator.geolocation || this.watchId !== null) return;
        // Sample rate is user-controlled via AppSettings (CDC §2.9).
        // Snapshot at watch start — a mid-watch change is honored by
        // stop+start, not by mutating the closure.
        const intervalMs = this.$appSettings?.gpsIntervalMs ?? DEFAULT_TRACK_INTERVAL_MS;
        this.acquireWakeLock();
        this.startWatchdog();
        this.watchId = navigator.geolocation.watchPosition(
          (pos) => {
            const now = pos.timestamp || Date.now();
            // Record liveness before any throttling, so a stationary
            // user does not look like a dead watch to the watchdog.
            this.lastFixAt = now;
            this.geoError = null;
            // Browser may fire much more often than we need; throttle.
            if (now - this._lastSampleTime < intervalMs - 500) return;
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
              // The flag lands on the first point actually recorded after
              // the break, not merely the first fix: standing still on
              // resume keeps it pending until the user moves, which is
              // where the discontinuity really is.
              if (this._gapPending && last) {
                sample.gap = true;
              }
              this._gapPending = false;
              // push, not [...positions, sample]: the spread reallocated
              // the whole array on every fix, which is O(n²) over a long
              // outing (~6.5M element copies on a 5 h trace). Vue 2
              // intercepts push, so reactivity still fires.
              this.positions.push(sample);
              this._lastSampleTime = now;
            }
          },
          (err) => {
            this.geoError = err;
            // PERMISSION_DENIED is terminal — retrying just re-prompts
            // and burns battery. Everything else (TIMEOUT,
            // POSITION_UNAVAILABLE) is transient, and the watchdog
            // rebuilds the watch if fixes do not resume.
            if (err && err.code === 1) {
              this.gpsTracking = false;
            }
          },
          { enableHighAccuracy: true, timeout: 30000, maximumAge: 0 }
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
        // One <trkseg> per continuous stretch. A pause is a real break
        // in the track and GPX says so with a segment boundary; without
        // it every reader would draw a straight line across the gap and
        // recompute the very distance we just stopped counting.
        const trkpts = splitOnGaps(this.positions)
          .map((segment) =>
            segment
              .map((p) => {
                const ele = Number.isFinite(p.alt) ? `        <ele>${p.alt.toFixed(1)}</ele>\n` : '';
                const time = p.t ? `        <time>${new Date(p.t).toISOString()}</time>\n` : '';
                return `      <trkpt lat="${p.lat}" lon="${p.lon}">\n${ele}${time}      </trkpt>`;
              })
              .join('\n')
          )
          .join('\n    </trkseg>\n    <trkseg>\n');
        return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Camptocamp mobile" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata>
    <name>${escapeXml(name)}</name>
    <desc>${escapeXml(description)}</desc>
    <time>${new Date().toISOString()}</time>
  </metadata>
  <trk>
    <name>${escapeXml(name)}</name>
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
