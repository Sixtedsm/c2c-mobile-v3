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
export function formatElapsed(startedAt, now = Date.now(), pausedMs = 0, pausedAt = null) {
  if (!startedAt) return '';
  const openPause = pausedAt ? Math.max(0, now - pausedAt) : 0;
  const sec = Math.floor((now - startedAt - (pausedMs || 0) - openPause) / 1000);
  if (sec < 0) return '0 min';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return h > 0 ? `${h}h${String(m).padStart(2, '0')}` : `${m} min`;
}
