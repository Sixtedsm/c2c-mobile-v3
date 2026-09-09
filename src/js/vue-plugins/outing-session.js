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
import { describePlatform, SCREEN_ON } from '@/pwa/platform-capabilities';
import { createTraceMetrics, isUsableFix } from '@/pwa/trace-metrics';
import { splitOnGaps } from '@/pwa/trace-segments';
import {
  classifyStorageError,
  deleteTrace,
  loadTrace,
  newTraceId,
  pruneTracesExcept,
  requestPersistentStorage,
  writeTail,
} from '@/pwa/trace-store';

const STORAGE_KEY = 'v3.outingSession';
// Schema 1 kept the whole trace inside this key. Schema 2 keeps only the
// session's metadata here and moves the points to IndexedDB — see
// src/pwa/trace-store.js for why. A schema-1 snapshot is migrated on the
// next boot, and never dropped before the migration has succeeded.
const SNAPSHOT_SCHEMA = 2;
// The trace tail is small and its write is asynchronous, so it does not
// need the growing debounce the whole-blob write did.
const TRACE_FLUSH_MS = 2000;
const DEFAULT_TRACK_INTERVAL_MS = 5000; // fallback if $appSettings hasn't loaded yet
// About 28 h at the 5 s setting, a week at 30 s. A recording nobody
// stopped must not be allowed to fill the store.
export const MAX_TRACE_POINTS = 20000;
const MAX_STALE_MS = 48 * 3600 * 1000; // drop sessions older than 48h
// A live watch on a phone in a pocket still delivers a fix every few
// seconds. Going a full minute without one means the watch is dead —
// suspended by the OS, killed by a driver hiccup, or wedged after a
// TIMEOUT — so the watchdog rebuilds it.
const STALE_FIX_MS = 60 * 1000;
const WATCHDOG_INTERVAL_MS = 30 * 1000;
// Debounce the whole-blob write on `positions`. This is now only the
// FALLBACK path — a browser with no usable IndexedDB (a private window,
// site data blocked) still records, the old way, and says so. On the
// normal path the trace never enters this blob at all.
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

// Write the session metadata. Returns null on success, or a reason —
// 'quota' / 'blocked' — that the caller shows to the user.
//
// It used to swallow every failure, which meant that once the origin's
// 5 MB was full nothing was durable any more and nothing said so. That
// is precisely the class of silence this whole effort is about.
function persist(state) {
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        schema: SNAPSHOT_SCHEMA,
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
        // Where the points live. The blob itself carries them only in
        // the fallback mode, and only until a migration succeeds —
        // dropping them any earlier would lose a trace to make room for
        // a schema change.
        traceId: state.traceId,
        tracePoints: state.positions.length,
        legacyTrace: state.legacyTrace,
        positions: state.legacyTrace ? state.positions : undefined,
      })
    );
    return null;
  } catch (err) {
    return classifyStorageError(err);
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
        // Timestamp of the last fix the browser actually delivered.
        // Written by the success callback and by nothing else — that is
        // the whole point. It used to be reset by restartGpsWatch() too,
        // so the watchdog silently erased the evidence of the drought it
        // was repairing, and no UI could ever show a stalled recording.
        lastFixAt: null,
        // When the current watch was created. Carries the watchdog's
        // patience (don't tear a fresh watch down before it has had a
        // chance to produce anything) now that lastFixAt no longer lies.
        watchStartedAt: null,
        // 'granted' | 'denied' | 'prompt' | 'unknown'. Asked before the
        // user walks away, and re-read when the OS revokes it mid-outing
        // — which otherwise stops the recording without a word.
        geoPermission: 'unknown',
        // Recording, but nothing is coming in. The state the app could
        // not name: the checkbox said "en cours" while the trace stood
        // still. Real state rather than a computed, because the only
        // thing that changes is the wall clock and Vue cannot observe
        // that — see fixAgeMs() below. Set by the watchdog tick, cleared
        // by every fix that lands.
        gpsSilent: false,
        // Running totals, fed point by point rather than recomputed.
        // See syncTraceMetrics().
        traceMetricsSnapshot: { distance: 0, gain: 0, loss: 0 },
        // Which trace in IndexedDB belongs to this session.
        traceId: snap?.traceId || null,
        // False until the points are back from IndexedDB. Only one
        // consumer must not read through it — the outing form, which
        // turns the trace into a published figure — and it awaits
        // whenTraceReady(). Everything else renders a moment of zero.
        traceReady: false,
        // The trace still lives in the localStorage blob: either a
        // schema-1 session not yet migrated, or a browser where
        // IndexedDB is unusable. Recording still works; it is the old
        // path, with its old limits, and the UI says so.
        legacyTrace: !!snap && snap.schema !== SNAPSHOT_SCHEMA && Array.isArray(snap.positions),
        // 'quota' | 'blocked' | null, one per store. Kept apart because
        // they fail independently: localStorage can be full while
        // IndexedDB is fine, and a successful metadata write must not
        // report that the trace is safe. Read through storageError.
        metadataStorageError: null,
        traceStorageError: null,
        // Whether the browser agreed to make this origin non-evictable.
        // Advisory: nothing is gated on it.
        storagePersisted: null,
        // The cap has been reached and positions are no longer being
        // appended. Surfaced, never silent: see the watch callback.
        traceFull: false,
        // The app re-armed the recording by itself after the phone killed
        // it, rather than waiting behind a menu the user had no reason to
        // open. Carries the "you lost a stretch" meaning from that point
        // on, since the watcher clears recordingInterrupted.
        autoResumed: false,
        // ...and the silent audio could not follow, because the autoplay
        // policy needs a gesture and a reload is not one. The recording is
        // running; it will not survive the screen going off until the user
        // taps once.
        keepAliveBlocked: false,
        // Which background strategy this device can actually honour, and
        // therefore what the app is allowed to promise. See
        // src/pwa/platform-capabilities.js — the two platforms differ in
        // kind, not in degree, and pretending otherwise is what produced
        // a warning that was true nowhere.
        platform: describePlatform(),
        // The user has put the app into the black full-screen hold that
        // keeps an iPhone's screen technically on at almost no cost.
        screenOnMode: false,
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
      // Distance, gain and loss, from src/pwa/trace-metrics.js.
      //
      // Plain reads of a snapshot the accumulator maintains. They used to
      // be a computed that re-walked the entire trace on every fix — and
      // the floating session banner, mounted for the whole outing, reads
      // one of them, so the walk really did happen every five seconds.
      // On a ten-hour outing that is tens of millions of point visits for
      // a number that changed by one step.
      // Whichever store is in trouble, the trace first: it is the one
      // whose failure loses the recording. Two fields rather than one,
      // because a successful metadata write must not be able to report
      // that the trace is safe.
      storageError() {
        return this.traceStorageError || this.metadataStorageError;
      },

      tracedDistanceMeters() {
        return this.traceMetricsSnapshot.distance;
      },
      elevationGainMeters() {
        return this.traceMetricsSnapshot.gain;
      },
      elevationLossMeters() {
        return this.traceMetricsSnapshot.loss;
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
          // Same reason, different API: asked from a gesture, Firefox
          // grants it without a prompt. Without it the whole origin is
          // evictable under storage pressure — the trace, the offline
          // topos and the sync queue alike. Advisory, nothing waits.
          requestPersistentStorage().then((granted) => {
            this.storagePersisted = granted;
          });
          // Fresh run: forget the previous throttle cursor, otherwise a
          // restart within one sample interval drops the first fix.
          this._lastSampleTime = 0;
          this.lastFixAt = null;
          this.geoError = null;
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
          this.gpsSilent = false;
        }
        this.snapshot();
      },
      // Positions accrue at ~5 s intervals — debouncing writes to
      // localStorage prevents a 3600-point trace from re-serializing
      // ~350 KB on every fix.
      positions: { handler: 'onPositionsChanged', deep: false },
      topoRef: { handler: 'snapshot', deep: true },
    },

    created() {
      // A session revived from storage arrives with its trace already in
      // data(), so the positions watcher never fires for it. The totals
      // used to be a computed and simply evaluated on first read; now
      // they are a snapshot, and something has to fill it — otherwise a
      // reload showed 0 km and, worse, published it.
      this.syncTraceMetrics();
      // Bring the trace back from IndexedDB, or migrate a schema-1 one
      // into it. Held so the outing form can await it; it never rejects.
      this._hydration = this.hydrateTrace();

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
          // A hidden tab can be killed with no further notice, and this
          // is the last moment IndexedDB is reliably allowed to finish a
          // write. Not awaited — there is nothing useful to do with the
          // result here, and blocking the handler would only make the
          // kill more likely.
          this.flushTrace();
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
        if (this.fixAgeMs() > STALE_FIX_MS) this.restartGpsWatch();
      };
      document.addEventListener('visibilitychange', this._onVisibility);
      // Fire-and-forget: knowing the permission state is useful, waiting
      // for it is not, and nothing here may delay the app booting.
      this.watchGeoPermission();
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
      if (this._permissionStatus) {
        this._permissionStatus.onchange = null;
        this._permissionStatus = null;
      }
    },

    methods: {
      snapshot() {
        this.metadataStorageError = persist(this.$data);
      },

      // Write now and cancel anything pending, so a queued timer cannot
      // fire later and re-persist a state that has since moved on.
      flushPersist() {
        if (this._persistTimer) {
          clearTimeout(this._persistTimer);
          this._persistTimer = null;
        }
        this.metadataStorageError = persist(this.$data);
      },

      // Advance the running totals over whatever is new, then persist.
      //
      // The cursor and the accumulator are plain instance state, not
      // data(): nothing renders them, and making thousands of window
      // entries reactive would cost more than the walk they replace.
      //
      // The array-identity check is what makes wholesale replacement
      // safe — discardTrace(), and later the reload path — by falling
      // back to a single full recompute. That is correct and rare; the
      // per-fix path never takes it.
      syncTraceMetrics() {
        if (this._metricsArray !== this.positions || this._metricsCursor > this.positions.length) {
          this._metricsAcc = createTraceMetrics();
          this._metricsCursor = 0;
          this._metricsArray = this.positions;
        }
        for (let i = this._metricsCursor; i < this.positions.length; i++) {
          this._metricsAcc.push(this.positions[i]);
        }
        this._metricsCursor = this.positions.length;
        // A fresh object, so one assignment notifies every reader once.
        this.traceMetricsSnapshot = this._metricsAcc.result;
      },

      onPositionsChanged() {
        this.syncTraceMetrics();
        if (this.legacyTrace) {
          // Fallback: the points still travel inside the blob.
          this.snapshotDebounced();
        } else {
          this.scheduleTraceFlush();
        }
      },

      scheduleTraceFlush() {
        if (this._traceTimer) return;
        this._traceTimer = window.setTimeout(() => {
          this._traceTimer = null;
          this.flushTrace();
        }, TRACE_FLUSH_MS);
      },

      // Append everything recorded since the last successful write.
      //
      // Serialised rather than concurrent: two overlapping writes would
      // race on the same tail chunk, and the later one could report a
      // flushed count covering points the earlier one never wrote. A
      // request arriving mid-flight marks the store dirty instead, and
      // is honoured as soon as the current write lands.
      async flushTrace() {
        if (!this.traceId || this.legacyTrace) return;
        if (this._traceWriting) {
          this._traceDirty = true;
          return;
        }
        if (this._traceTimer) {
          window.clearTimeout(this._traceTimer);
          this._traceTimer = null;
        }
        this._traceWriting = true;
        const generation = this._traceGeneration;
        try {
          const flushed = await writeTail(this.traceId, this.positions, this._flushedCount || 0);
          // A start() or discardTrace() during the write invalidates the
          // cursor: it would count points from a trace that no longer
          // exists.
          if (generation === this._traceGeneration) {
            this._flushedCount = flushed;
            this.traceStorageError = null;
          }
        } catch (err) {
          this.traceStorageError = classifyStorageError(err);
        } finally {
          this._traceWriting = false;
          if (this._traceDirty) {
            this._traceDirty = false;
            this.flushTrace();
          }
        }
      },

      // Bring a recorded trace back, or move a schema-1 one into
      // IndexedDB. Never rejects: a session that cannot reach its store
      // still has to run, on the fallback path, with the reason shown.
      async hydrateTrace() {
        const generation = this._traceGeneration;
        try {
          if (this.legacyTrace) {
            // The points are already in memory from the snapshot, so
            // there is no window where the trace is missing. Write them
            // out, and only then stop carrying them in the blob.
            const traceId = newTraceId();
            const flushed = await writeTail(traceId, this.positions, 0);
            if (generation !== this._traceGeneration) return;
            this.traceId = traceId;
            this._flushedCount = flushed;
            this.legacyTrace = false;
            this.snapshot();
          } else if (this.traceId) {
            const points = await loadTrace(this.traceId);
            if (generation !== this._traceGeneration) return;
            if (points.length) {
              // Assigned, not pushed: one notification instead of
              // thousands, and the identity check in syncTraceMetrics
              // turns it into a single full recompute.
              this.positions = points;
              this._flushedCount = points.length;
              this.syncTraceMetrics();
            }
          }
          await pruneTracesExcept(this.traceId);
        } catch (err) {
          // IndexedDB unusable. Keep recording the old way rather than
          // not at all, and keep the points in the blob so a reload
          // still finds them.
          if (generation === this._traceGeneration) {
            this.traceStorageError = classifyStorageError(err);
            this.legacyTrace = true;
          }
        } finally {
          if (generation === this._traceGeneration) {
            this.traceReady = true;
            if (this._watchPendingHydration) {
              this._watchPendingHydration = false;
              this.startGpsWatch();
            }
            await this.maybeAutoResume();
          }
        }
      },

      // Pick the recording back up after the phone killed the app.
      //
      // The old behaviour was to come back with the GPS off and a warning
      // in a dropdown — deliberately, so as not to drain a battery the
      // user had not re-authorised. But the user did authorise it: they
      // started the recording, and the OS ended it against their will.
      // Leaving it off turns a system hiccup into permanent data loss,
      // and Gilles walked seven hours without ever seeing the warning.
      //
      // Deliberately after hydration: _gapPending is only armed when the
      // trace already has points, so resuming first would splice the
      // walk back to the car onto the trace as if it had been recorded.
      async maybeAutoResume() {
        if (!this.sessionActive) return;
        // Never against an explicit choice. A pause is the user saying
        // stop; only an interruption is the phone saying it.
        if (this.paused) return;
        if (!this.recordingInterrupted) return;

        // Re-arming into a refused permission would only re-prompt, and
        // 'unknown' has to proceed — Safari has no answer to give here.
        if ((await this.queryGeoPermission()) === 'denied') {
          this.geoPermission = 'denied';
          this.geoError = { code: 1 };
          return;
        }

        this.autoResumed = true;
        // The audio cannot restart without a gesture; say so rather than
        // let the user pocket a phone that will suspend the page again.
        //
        // Only where there is an audio keep-alive to restart. On Apple
        // there is none by design, and raising the flag there would put
        // up a "touchez ici" button that can never succeed — a button
        // that cannot work is worse than no button. That platform is
        // pointed at the screen-on hold instead.
        this.keepAliveBlocked = this.platform.usesBackgroundAudio;
        this.gpsTracking = true;
      },

      // The gesture the autoplay policy wanted. Called from a tap.
      async retryKeepAlive() {
        await this.startKeepAlive();
        if (this.keepAliveActive) this.keepAliveBlocked = false;
        return this.keepAliveActive;
      },

      // For the one consumer that must not read a half-loaded trace.
      whenTraceReady() {
        return this._hydration || Promise.resolve();
      },

      snapshotDebounced() {
        if (this._persistTimer) clearTimeout(this._persistTimer);
        const delay = Math.min(
          PERSIST_DEBOUNCE_MAX_MS,
          PERSIST_DEBOUNCE_MIN_MS + this.positions.length * PERSIST_DEBOUNCE_PER_POINT_MS
        );
        this._persistTimer = window.setTimeout(() => {
          this._persistTimer = null;
          this.metadataStorageError = persist(this.$data);
        }, delay);
      },

      // Start an outing on a given topo. Does NOT enable GPS tracking
      // unless the caller passes { track: true }.
      start({ type, id, lang }, { track = false } = {}) {
        // Invalidate anything still in flight against the old trace: a
        // hydration reading it back, a write reporting a flushed count.
        const previousTraceId = this.newTraceGeneration();
        this.sessionActive = true;
        this.topoRef = { type, id, lang };
        this.startedAt = Date.now();
        this.positions = [];
        this.paused = false;
        this.pausedAt = null;
        this.pausedMs = 0;
        this.recordingInterrupted = false;
        this._gapPending = false;
        this.traceId = newTraceId();
        this._flushedCount = 0;
        this.legacyTrace = false;
        this.metadataStorageError = null;
        this.traceStorageError = null;
        this.traceFull = false;
        this.autoResumed = false;
        this.keepAliveBlocked = false;
        this._lastFixT = 0;
        // A brand-new trace has nothing to load.
        this.traceReady = true;
        this.gpsTracking = !!track;
        if (previousTraceId) deleteTrace(previousTraceId).catch(() => {});
      },

      // Bump the generation and hand back the trace it retired, so the
      // caller can delete it. Same token idiom as the keep-alive above:
      // async work started under an old generation must not write back.
      newTraceGeneration() {
        const previousTraceId = this.traceId;
        this._traceGeneration = (this._traceGeneration || 0) + 1;
        this._traceDirty = false;
        // A watch deferred by a hydration that this generation retires
        // must not be started by it later.
        this._watchPendingHydration = false;
        if (this._traceTimer) {
          window.clearTimeout(this._traceTimer);
          this._traceTimer = null;
        }
        return previousTraceId;
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
        this.autoResumed = false;
        this.keepAliveBlocked = false;
      },

      // Pick the outing back up. The next recorded point is flagged so
      // distance and elevation skip the step across the break — see
      // tracedDistanceMeters.
      resume() {
        if (!this.sessionActive) return;
        // A deliberate resume supersedes the automatic one, gesture and
        // all — so the keep-alive gets its chance in the same tap.
        this.autoResumed = false;
        this.keepAliveBlocked = false;
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
        // The stored copy has done its job: the session is over, and
        // whatever happens to the trace next (a GPX export, the outing
        // form) happens from memory. Leaving the chunks behind would
        // slowly fill the very store this all exists to protect.
        const previousTraceId = this.newTraceGeneration();
        if (previousTraceId) deleteTrace(previousTraceId).catch(() => {});
        this.traceId = null;
        this._flushedCount = 0;
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
        this.autoResumed = false;
        this.keepAliveBlocked = false;
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
        if (!this.platform.usesBackgroundAudio) {
          // iOS suspends the process when the screen locks, audio or no
          // audio. The clip would not extend the recording by a second,
          // and it would put a pause button on the lock screen. The wake
          // lock and the screen-on hold are the levers here instead.
          this.keepAliveActive = false;
          return;
        }
        const token = this.nextKeepAliveToken();
        const ok = await backgroundAudio.start({
          // The lock-screen media control is not a "stop my outing"
          // button, and it was wired as one. A headset button, a car
          // pairing over Bluetooth, or any other app taking audio focus
          // pauses this element — and that used to pause the outing,
          // stopping the clock and the GPS on someone halfway up a
          // couloir. Withdraw only what was actually lost: the
          // background guarantee. The recording carries on, and the
          // "keep the app on screen" line already written for
          // keepAliveActive === false says exactly the right thing.
          onStopRequest: () => {
            this.keepAliveActive = false;
          },
        });
        // Recording can stop while playback is still starting — toggling
        // the GPS checkbox twice in a second is enough. Without this the
        // clip would go on playing with nothing left to record, leaving a
        // media control on the lock screen and the menu claiming the
        // recording is being held.
        if (token !== this._keepAliveToken || !this.gpsTracking) {
          backgroundAudio.stop();
          this.keepAliveActive = false;
          return;
        }
        this.keepAliveActive = ok;
      },

      // Invalidates any keep-alive call still in flight. Plain instance
      // state rather than data(): Vue reserves underscore-prefixed keys,
      // and nothing renders this.
      nextKeepAliveToken() {
        this._keepAliveToken = (this._keepAliveToken || 0) + 1;
        return this._keepAliveToken;
      },

      stopKeepAlive() {
        // Anything still starting up must not switch itself on after this.
        this.nextKeepAliveToken();
        backgroundAudio.stop();
        this.keepAliveActive = false;
        this._hiddenSince = null;
      },

      // Called on returning to the foreground: report what is true now
      // rather than what we hoped, and try to restart if the OS cut it.
      async refreshKeepAlive() {
        if (!this.platform.usesBackgroundAudio) {
          this.keepAliveActive = false;
          return;
        }
        if (backgroundAudio.isActive()) {
          this.keepAliveActive = true;
          return;
        }
        const token = this.nextKeepAliveToken();
        const resumed = await backgroundAudio.resume();
        // Same race as startKeepAlive: the user can stop the outing while
        // the browser is deciding whether to allow playback again.
        if (token !== this._keepAliveToken || !this.gpsTracking) {
          backgroundAudio.stop();
          this.keepAliveActive = false;
          return;
        }
        this.keepAliveActive = resumed;
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
      //
      // It deliberately does NOT touch lastFixAt. It used to, to buy the
      // patient retry described on the watchdog below, and the price was
      // that a tunnel looked exactly like a healthy recording. The
      // patience now comes from watchStartedAt, which startGpsWatch sets.
      restartGpsWatch() {
        this.stopGpsWatch();
        this.startGpsWatch();
      },

      // Rebuild the watch whenever fixes dry up. This is what catches
      // the silent failures: an OS-suspended watch delivers neither a
      // position nor an error, so only the absence of fixes reveals it.
      //
      // Two conditions, and they measure different things. gpsSilent asks
      // whether data is arriving; watchAgeMs gives a freshly built watch
      // a full staleness window to produce its first fix, so a tunnel or
      // a deep couloir gets a patient retry once a minute instead of
      // continuous teardown churn. Between rebuilds fixAgeMs keeps
      // growing, which is what lets the UI say how long it has been.
      startWatchdog() {
        this.stopWatchdog();
        this._watchdog = window.setInterval(() => {
          if (!this.gpsTracking) return;
          this.gpsSilent = this.fixAgeMs() > STALE_FIX_MS;
          if (this.gpsSilent && this.watchAgeMs() >= STALE_FIX_MS) this.restartGpsWatch();
        }, WATCHDOG_INTERVAL_MS);
      },

      stopWatchdog() {
        if (this._watchdog) {
          window.clearInterval(this._watchdog);
          this._watchdog = null;
        }
      },

      // A usable, strictly increasing timestamp for a fix.
      //
      // pos.timestamp is the receiver's clock, and it is not guaranteed
      // monotonic. A backwards jump used to do two things at once: freeze
      // the sampler — the throttle compares against it, and a negative
      // delta never clears, so every subsequent fix was dropped until the
      // clock caught up — and stop trace-metrics' window from ever
      // evicting, so the smoothing window grew without bound for the rest
      // of the segment.
      //
      // Only monotonicity is enforced, not agreement with the wall clock.
      // A receiver whose clock sits in the wrong era is a nuisance in the
      // GPX metadata and nothing more: every other reader of that field takes a
      // difference, and differences do not care about the offset. An
      // era check here would instead reject a perfectly consistent trace
      // and collapse it onto Date.now(), which — every fix landing in the
      // same millisecond — is the one input that really does destroy it.
      normaliseFixTime(raw) {
        let now = Number.isFinite(raw) && raw > (this._lastFixT || 0) ? raw : Date.now();
        // Never behind the trace itself: two points sharing a timestamp,
        // or going backwards, break every duration the app computes.
        const lastT = this.positions[this.positions.length - 1]?.t;
        if (Number.isFinite(lastT) && now <= lastT) now = lastT + 1;
        this._lastFixT = now;
        return now;
      },

      // How long since the browser last handed us a position; Infinity
      // when tracking has never produced one.
      //
      // A method, not a computed, and that is load-bearing: the only
      // quantity that changes here is the wall clock, which Vue cannot
      // observe. As a computed it froze at whatever it read first and
      // stayed frozen for the whole drought — so the watchdog would have
      // decided a stalled watch was fine, forever. Anything rendered
      // from these ages has to tick its own clock, which is what both UI
      // surfaces already do for the elapsed time.
      fixAgeMs() {
        if (!this.lastFixAt) return Infinity;
        return Date.now() - this.lastFixAt;
      },

      // Age of the current watch, not of the data. Only the watchdog's
      // backoff reads it; everything user-facing reads fixAgeMs().
      watchAgeMs() {
        if (!this.watchStartedAt) return Infinity;
        return Date.now() - this.watchStartedAt;
      },

      // What the browser will actually allow, before the user walks
      // away. Nothing in the app asked this until now, so a revoked
      // permission only showed up as a recording that quietly produced
      // nothing.
      //
      // 'unknown' is a real answer, not a failure: Safari has long
      // thrown on this descriptor, and a browser without the Permissions
      // API must keep every path that a granted permission would open.
      async queryGeoPermission() {
        if (typeof navigator === 'undefined' || !navigator.permissions?.query) return 'unknown';
        try {
          const status = await navigator.permissions.query({ name: 'geolocation' });
          return status?.state || 'unknown';
        } catch {
          return 'unknown';
        }
      },

      // Keep watching it. A permission revoked from the OS settings
      // mid-outing is one of the ways recording stops without a word,
      // and it produces no error callback at all — the fixes simply
      // stop. The PermissionStatus object is held on the instance
      // because Chrome has historically dropped the change event once
      // it is garbage collected.
      async watchGeoPermission() {
        if (typeof navigator === 'undefined' || !navigator.permissions?.query) return;
        try {
          const status = await navigator.permissions.query({ name: 'geolocation' });
          this.geoPermission = status.state || 'unknown';
          this._permissionStatus = status;
          status.onchange = () => {
            this.geoPermission = status.state || 'unknown';
            if (status.state === 'denied' && this.gpsTracking) {
              // Same shape the watch's own error callback produces, so
              // it flows through the one wording helper the app already
              // has (src/js/geolocation-error-message.js).
              this.geoError = { code: 1 };
              this.gpsTracking = false;
            }
          };
        } catch {
          /* Safari: no Permissions API for geolocation. */
        }
      },

      // Turn the black full-screen hold on or off.
      //
      // The Apple answer to a phone in a pocket: the screen stays
      // technically on — so the page is never suspended — while showing
      // almost nothing, which on an OLED panel costs very little. It is
      // also what stops a pocket from tapping the interface.
      //
      // Called from a tap, so this is a good moment to (re)take the wake
      // lock: browsers drop it whenever the page is hidden.
      setScreenOnMode(active) {
        this.screenOnMode = !!active && this.platform.strategy === SCREEN_ON;
        if (this.screenOnMode) this.acquireWakeLock();
      },

      // Apply a new sampling interval to a running recording.
      //
      // AppSettings used to do this by toggling gpsTracking off and on,
      // which runs the watcher above and therefore flags a gap — so
      // changing a preference cut the trace and the GPX in two at an
      // arbitrary point. Rebuilding the watch is documented as not
      // flagging one, which is exactly the semantics wanted here: the
      // user never stopped walking.
      applyGpsInterval() {
        if (!this.gpsTracking) return;
        this.restartGpsWatch();
      },

      startGpsWatch() {
        if (!navigator.geolocation || this.watchId !== null) return;
        // Recording into a trace that is still loading would put the new
        // points before the old ones and lose the count. The hydration
        // calls back here the moment it lands.
        if (!this.traceReady) {
          this._watchPendingHydration = true;
          return;
        }
        // Sample rate is user-controlled via AppSettings (CDC §2.9).
        // Snapshot at watch start — a mid-watch change is honored by
        // stop+start, not by mutating the closure.
        const intervalMs = this.$appSettings?.gpsIntervalMs ?? DEFAULT_TRACK_INTERVAL_MS;
        this.watchStartedAt = Date.now();
        this.acquireWakeLock();
        this.startWatchdog();
        this.watchId = navigator.geolocation.watchPosition(
          (pos) => {
            // Two clocks, deliberately kept apart.
            //
            // Liveness is wall-clock, always. The watchdog and the UI
            // compare it against Date.now(), so taking it from the
            // receiver — as this used to — meant a phone whose clock was
            // off by a year reported an age of a year, and the watchdog
            // tore the watch down every thirty seconds for the whole
            // outing, chasing a drought that did not exist.
            this.lastFixAt = Date.now();
            // Trace time is the receiver's, and only ever read as a
            // difference: the smoothing windows, the speed gate, the
            // recorded duration. A consistent offset is harmless there;
            // going backwards is not. See normaliseFixTime().
            const now = this.normaliseFixTime(pos.timestamp);
            this.gpsSilent = false;
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
            // Advanced for every accepted fix, kept or not, so the trace
            // is uniform in time.
            //
            // There used to be a 3 m step filter here as well, and it did
            // more harm than the noise it removed. It is asymmetric — it
            // keeps excursions over 3 m and drops everything under, so it
            // selects noise rather than rejecting it. It is dependent on
            // the sampling rate, in exactly the direction the metrics'
            // rate-independence is built to avoid: at 30 s a walking step
            // never trips it, at 5 s in a steep couloir it drops most of
            // the real climb. And because the throttle only advanced when
            // a point was kept, the sampling was least uniform precisely
            // where uniformity matters most. Filtering belongs downstream,
            // in trace-metrics.js, which smooths over a window in seconds,
            // weights each fix by its reported accuracy, gates on speed
            // and only counts steps over 14 m — and whose calibration was
            // fitted on unfiltered traces in the first place.
            this._lastSampleTime = now;

            if (this.positions.length >= MAX_TRACE_POINTS) {
              // Stop appending; never drop the head. Rogner la tête would
              // silently rewrite length_total and height_diff_up on an
              // outing the user thinks is fully recorded, whereas
              // refusing new points is a failure they can see and act on.
              // Liveness above keeps updating, so the watchdog stays alive.
              this.traceFull = true;
              return;
            }

            const last = this.positions[this.positions.length - 1];
            // The flag lands on the first point actually recorded after
            // the break, not merely the first fix.
            if (this._gapPending && last) {
              sample.gap = true;
            }
            this._gapPending = false;
            // push, not [...positions, sample]: the spread reallocated
            // the whole array on every fix, which is O(n²) over a long
            // outing (~6.5M element copies on a 5 h trace). Vue 2
            // intercepts push, so reactivity still fires.
            this.positions.push(sample);
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
        this.watchStartedAt = null;
      },

      discardTrace() {
        const previousTraceId = this.newTraceGeneration();
        this.positions = [];
        this._flushedCount = 0;
        this.traceFull = false;
        this.traceId = this.sessionActive ? newTraceId() : null;
        this.snapshot();
        if (previousTraceId) deleteTrace(previousTraceId).catch(() => {});
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
