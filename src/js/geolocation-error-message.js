// Map a Geolocation API PositionError onto a user-facing French message.
// Single source of truth for the wording — used by OlMap's toast and any
// other surface that needs to explain why a locate call failed.
//
// Usage:
//   import { geolocationErrorMessage } from '@/js/geolocation-error-message';
//   const msg = geolocationErrorMessage(err, this.$gettext);

export function geolocationErrorMessage(err, gettext) {
  const t = gettext || ((s) => s);
  switch (err && err.code) {
    case 1:
      return t('Géolocalisation refusée. Autorisez-la dans les réglages du navigateur, puis réessayez.');
    case 2:
      return t("Position indisponible (signal GPS faible ?). Réessayez à l'extérieur ou attendez quelques secondes.");
    case 3:
      return t('Délai dépassé pour récupérer la position. Réessayez.');
    default: {
      // iOS Safari sometimes emits a PositionError without a numeric
      // `code`, and the same helper is reused for non-Geolocation JS
      // errors surfaced by downstream code. Append whatever detail the
      // error object carries so the user can screenshot us something
      // useful — the raw "Réessayez." fallback was a debugging dead-end.
      const detail = err?.message || err?.name || (err ? String(err) : 'sans détail');
      return t('Erreur de géolocalisation. Réessayez.') + ' (' + detail + ')';
    }
  }
}
