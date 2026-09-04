// Format the elapsed time of an outing as "3h45" or "12 min".
// Shared between StartOutingControl (in-header pill) and
// OutingSessionBanner (global floating badge) so both surfaces always
// display the same wording.
//
// Time spent paused is subtracted (CDC §2.4): a three-hour break at the
// refuge must not read as three hours of outing. Kept as a pure function
// of `now` rather than a computed on the session, because a computed
// caching on non-reactive Date.now() would freeze the display — both
// callers already tick their own `now`.
//
// `pausedMs` is the total of the completed pauses; `pausedAt` is set
// while a pause is still running, and that open interval is charged too.

// The duration itself, in milliseconds. Split out from the label because
// the form needs the number, not the wording: comparing how long the GPS
// actually recorded against how long the outing lasted is what tells a
// full trace apart from a few seconds of noise (see trace-usability.js).
export function elapsedMs(startedAt, now = Date.now(), pausedMs = 0, pausedAt = null) {
  if (!startedAt) return 0;
  const openPause = pausedAt ? Math.max(0, now - pausedAt) : 0;
  return Math.max(0, now - startedAt - (pausedMs || 0) - openPause);
}

// The wording, from a plain duration. Callers that already hold a number
// of milliseconds — how long the GPS recorded, say — need the same
// "3h45" / "12 min" phrasing without inventing a fake start timestamp.
export function formatDuration(ms) {
  const sec = Math.floor(Math.max(0, ms || 0) / 1000);
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return h > 0 ? `${h}h${String(m).padStart(2, '0')}` : `${m} min`;
}

export function formatElapsed(startedAt, now = Date.now(), pausedMs = 0, pausedAt = null) {
  if (!startedAt) return '';
  return formatDuration(elapsedMs(startedAt, now, pausedMs, pausedAt));
}
