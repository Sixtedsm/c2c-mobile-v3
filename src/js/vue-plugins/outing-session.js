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

import * as backgroundAudio from '@/pwa/background-audio';
import { haversine } from '@/pwa/haversine';
import { computeTraceMetrics, isUsableFix } from '@/pwa/trace-metrics';
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
// Debounce persist() on `positions` — a long trace should not
// JSON.stringify the whole state on every fix.
//
// localStorage writes synchronously, so the cost lands on the main
// thread of a phone that is already recording. Measured on a desktop, a
// 10 h trace serialises in ~7.5 ms; a phone is several times slower, and
// at a fixed 2 s interval that hitch would repeat every two seconds for
// the rest of the day. So the interval grows with the trace: short
// outings stay responsive to a crash, long ones stop paying per fix.
// The cost of the longer window is bounded — a few lost points, against
// a trace that is already many hours old.
const PERSIST_DEBOUNCE_MIN_MS = 2000;
const PERSIST_DEBOUNCE_MAX_MS = 15000;
const PERSIST_DEBOUNCE_PER_POINT_MS = 4;

// Six decimals is 0.11 m of latitude — an order of magnitude finer than
// the best fix a phone will ever produce, and it cuts the stored trace
// by about a third. Full float precision stores noise, literally.
function round6(value) {
  return Math.round(value * 1e6) / 1e6;
}

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
        // …but do remember that recording was MEANT to be running.
        // Feedback Gilles (forum, sortie réelle): a phone kills the tab
        // during a long outing — memory pressure with the screen locked,
        // which is the normal state of a phone in a pocket. On reload the
        // session came back "en cours" with the GPS silently off, and the
        // walk continued recording nothing. Without this flag there is no
        // way to tell that case apart from a session deliberately started
        // without tracking.
        wasTracking: state.gpsTracking,
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
        // Recording was running when the app went away, and it was not a
        // pause. Surfaced in the UI rather than silently corrected: the
        // stretch walked since then is genuinely lost, and only the user
        // can decide to pick the recording back up.
        recordingInterrupted: !!(snap?.sessionActive && snap?.wasTracking && !snap?.paused),
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
        // Is the background keep-alive actually playing? False means the
        // page will be suspended as soon as the screen goes off, and the
        // UI has to say so rather than let the user pocket the phone.
        keepAliveActive: false,
        // Measurement, not decoration. Whether a PWA can record with the
        // screen off is an open question on iOS, so the session counts
        // what actually arrived while hidden instead of assuming. A real
        // outing then answers it with a number.
        hiddenFixCount: 0,
        hiddenMs: 0,
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
      // Distance, gain and loss, from src/pwa/trace-metrics.js.
      //
      // One computed for all three: they walk the same trace and share
      // the same segment and smoothing rules, and a trace can hold
      // thousands of points that get re-measured on every fix. Three
      // separate loops cost three walks and let the numbers disagree
      // about where a recording break was.
      traceMetrics() {
        return computeTraceMetrics(this.positions);
      },
      tracedDistanceMeters() {
        return this.traceMetrics.distance;
      },
      elevationGainMeters() {
        return this.traceMetrics.gain;
      },
      elevationLossMeters() {
        return this.traceMetrics.loss;
      },
    },

    watch: {
      sessionActive: 'snapshot',
      paused: 'snapshot',
      recordingInterrupted: 'snapshot',
      gpsTracking(active) {
        if (active) {
          // Recording is running again, whatever brought it back.
          this.recordingInterrupted = false;
          // Started here because every path that switches recording on
          // runs through this watcher, and all of them originate in a
          // tap — which is what the autoplay policy requires.
          this.startKeepAlive();
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
          this.stopKeepAlive();
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
          if (this.gpsTracking) this._hiddenSince = Date.now();
          // Last chance to write: a hidden tab can be killed without any
          // further notice, and on mobile this fires where beforeunload
          // does not. Everything still sitting in the debounce window
          // would otherwise be lost — up to fifteen seconds of trace on
          // a long outing.
          this.flushPersist();
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
        if (this._hiddenSince) {
          this.hiddenMs += Math.max(0, Date.now() - this._hiddenSince);
          this._hiddenSince = null;
        }
        if (!this.gpsTracking) return;
        // Back in the foreground. Browsers release the wake lock while
        // hidden, so re-take it; and if fixes stopped arriving while we
        // were away, rebuild the watch rather than trusting a dead one.
        this.acquireWakeLock();
        // The OS can stop the keep-alive on its own. Reflect what is
        // actually true now, and try to pick it back up.
        this.refreshKeepAlive();
        if (this.fixAgeMs > STALE_FIX_MS) this.restartGpsWatch();
      };
      document.addEventListener('visibilitychange', this._onVisibility);
      // pagehide covers the cases visibilitychange does not: a real
      // navigation away, and Safari putting the page into the back/
      // forward cache.
      this._onPageHide = () => this.flushPersist();
      window.addEventListener('pagehide', this._onPageHide);
    },

    // Only reached if something ever tears the singleton down — nothing
    // does today, which is why the trace is flushed from the page
    // lifecycle handlers above rather than from here. Kept correct so it
    // does the right thing the day the plugin stops being a singleton.
    beforeDestroy() {
      this.stopGpsWatch();
      this.stopWatchdog();
      this.releaseWakeLock();
      this.flushPersist();
      if (this._onVisibility && typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', this._onVisibility);
      }
      if (this._onPageHide && typeof window !== 'undefined') {
        window.removeEventListener('pagehide', this._onPageHide);
      }
    },

    methods: {
      snapshot() {
        persist(this.$data);
      },

      // Write now and cancel anything pending, so a queued timer cannot
      // fire later and re-persist a state that has since moved on.
      flushPersist() {
        if (this._persistTimer) {
          clearTimeout(this._persistTimer);
          this._persistTimer = null;
        }
        persist(this.$data);
      },

      snapshotDebounced() {
        if (this._persistTimer) clearTimeout(this._persistTimer);
        const delay = Math.min(
          PERSIST_DEBOUNCE_MAX_MS,
          PERSIST_DEBOUNCE_MIN_MS + this.positions.length * PERSIST_DEBOUNCE_PER_POINT_MS
        );
        this._persistTimer = window.setTimeout(() => {
          this._persistTimer = null;
          persist(this.$data);
        }, delay);
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
        this.recordingInterrupted = false;
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

      // Acknowledge the interruption without restarting the GPS — the
      // user may be back at the car and about to fill the form.
      dismissInterruption() {
        this.recordingInterrupted = false;
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
        this.recordingInterrupted = false;
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

      // Ask the OS to keep the page running once the screen goes off.
      // See src/pwa/background-audio.js for why this takes the shape it
      // does, and for what it costs.
      async startKeepAlive() {
        const ok = await backgroundAudio.start({
          // Pausing from the lock screen would otherwise end the
          // recording without a word. Treat it as what it looks like:
          // the user asking to stop.
          onStopRequest: () => this.pause(),
        });
        this.keepAliveActive = ok;
      },

      stopKeepAlive() {
        backgroundAudio.stop();
        this.keepAliveActive = false;
        this._hiddenSince = null;
      },

      // Called on returning to the foreground: report what is true now
      // rather than what we hoped, and try to restart if the OS cut it.
      async refreshKeepAlive() {
        if (backgroundAudio.isActive()) {
          this.keepAliveActive = true;
          return;
        }
        this.keepAliveActive = await backgroundAudio.resume();
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
            if (typeof document !== 'undefined' && document.hidden) {
              this.hiddenFixCount += 1;
            }
            // A fix the receiver reports as poor is a cell-tower guess,
            // not a position. Keeping it would spike the drawn trace as
            // well as the published totals. Counted as liveness above,
            // because the watch is plainly alive — it just cannot see.
            if (!isUsableFix(pos.coords.accuracy)) return;
            // Browser may fire much more often than we need; throttle.
            if (now - this._lastSampleTime < intervalMs - 500) return;
            // Everything here is read back later. Coordinates and time
            // draw and measure the trace; `accuracy` weights each fix in
            // the smoothing, so a fix taken under forest cover pulls the
            // average less than a clean one (see trace-metrics.js). It is
            // rounded to the metre — a receiver has no business claiming
            // more, and the trace holds thousands of these.
            const sample = {
              lat: round6(pos.coords.latitude),
              lon: round6(pos.coords.longitude),
              alt: Number.isFinite(pos.coords.altitude) ? Math.round(pos.coords.altitude * 10) / 10 : null,
              accuracy: Number.isFinite(pos.coords.accuracy) ? Math.round(pos.coords.accuracy) : null,
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
