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
    default:
      return t('Erreur de géolocalisation. Réessayez.');
  }
}
