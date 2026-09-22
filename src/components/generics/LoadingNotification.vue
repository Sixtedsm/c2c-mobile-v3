<template>
  <div>
    <div v-if="!promise.data && !promise.error" class="notification is-primary">Loading</div>

    <not-found v-else-if="notFound" />

    <div v-else-if="promise.error" class="notification is-danger">
      {{ errorMessage }}
    </div>
  </div>
</template>

<script>
import NotFound from '@/views/static-views/NotFoundView';

export default {
  components: {
    NotFound,
  },

  props: {
    promise: {
      type: [Object, Promise],
      required: true,
    },
  },

  computed: {
    notFound() {
      return Boolean(this.promise?.error?.response?.status === 404);
    },

    // An error without a response is where "Network Error" comes from, and
    // since 2026-09-13 that phrase covers two situations: no signal, and
    // the Camptocamp API refusing requests from this app's origin — which
    // it does without CORS headers, so the browser reports it exactly like
    // a missing signal. The forum kept working, the topos did not, and the
    // banner said nothing useful. The access probe tells the two apart.
    errorMessage() {
      const error = this.promise.error;
      if (error && !error.response) {
        const access = this.$offline?.apiAccess;
        if (access === 'refused') {
          return this.$gettext(
            'Camptocamp refuse pour l’instant les demandes de cette version de l’application. Les topos enregistrés hors ligne restent consultables dans « Mes topos ».'
          );
        }
        if (access === 'offline') {
          return this.$gettext(
            'Pas de connexion à Camptocamp. Les topos enregistrés hors ligne restent consultables dans « Mes topos ».'
          );
        }
      }
      // A 5xx is the site, not the reader: "Request failed with status
      // code 503" is the axios sentence, and it told a user nothing for
      // days while api.camptocamp.org was serving a maintenance page
      // (septembre 2026).
      const status = error?.response?.status;
      if (status === 429 || status >= 500) {
        return this.$gettext(
          'Camptocamp est momentanément indisponible (maintenance ou serveur surchargé). Réessayez dans quelques minutes. Les topos enregistrés hors ligne restent consultables dans « Mes topos ».'
        );
      }
      return error?.message;
    },
  },

  watch: {
    'promise.error': {
      immediate: true,
      handler(error) {
        if (error && !error.response) {
          this.$offline?.checkApiAccess?.();
        }
      },
    },
  },
};
</script>
