// Format the elapsed time since a start timestamp as "3h45" or "12 min".
// Shared between StartOutingControl (in-header pill) and
// OutingSessionBanner (global floating badge) so both surfaces always
// display the same wording.
export function formatElapsed(startedAt, now = Date.now()) {
  if (!startedAt) return '';
  const sec = Math.floor((now - startedAt) / 1000);
  if (sec < 0) return '0 min';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return h > 0 ? `${h}h${String(m).padStart(2, '0')}` : `${m} min`;
}
