// Freshness of an offline-saved document (CDC §2.2 "si le contenu
// offline est potentiellement obsolète"). Pure logic — no Vue, no
// component coupling — so both the UI badge and the offline list can
// consume the same rules, and so tests can validate the thresholds
// without a browser environment.
//
// The C2C API doesn't currently expose a lightweight "did this doc
// change since T?" endpoint, so we approximate obsolescence with age.
// Thresholds are conservative:
//   - fresh:      < 7 days  → nothing to do
//   - stale:      7-30 days → soft warning, encourage refresh
//   - very-stale: > 30 days → clear warning + prompt to refresh
//
// The label is chosen so a user reading it on the trail immediately
// knows whether they can trust the offline copy.

const DAY_MS = 24 * 3600 * 1000;
const STALE_AFTER_MS = 7 * DAY_MS;
const VERY_STALE_AFTER_MS = 30 * DAY_MS;

// Return one of 'fresh' | 'stale' | 'very-stale' | 'unknown'.
export function freshnessOf(savedAt, now = Date.now()) {
  if (!savedAt || typeof savedAt !== 'number') return 'unknown';
  const age = now - savedAt;
  if (age < 0) return 'fresh'; // clock skew — treat as fresh
  if (age < STALE_AFTER_MS) return 'fresh';
  if (age < VERY_STALE_AFTER_MS) return 'stale';
  return 'very-stale';
}

// Human-friendly age label ("il y a 3 jours"). Kept as a pure formatter
// so the UI can call it identically from every surface.
export function ageLabel(savedAt, now = Date.now(), gettext = (s) => s) {
  if (!savedAt) return '';
  const ageMs = Math.max(0, now - savedAt);
  const days = Math.floor(ageMs / DAY_MS);
  if (days < 1) return gettext("aujourd'hui");
  if (days === 1) return gettext('hier');
  if (days < 30) return gettext('il y a {n} jours').replace('{n}', days);
  const months = Math.floor(days / 30);
  if (months === 1) return gettext('il y a 1 mois');
  return gettext('il y a {n} mois').replace('{n}', months);
}

export const FRESHNESS_THRESHOLDS = {
  STALE_AFTER_MS,
  VERY_STALE_AFTER_MS,
};
