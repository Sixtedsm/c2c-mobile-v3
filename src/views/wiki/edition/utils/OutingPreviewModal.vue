<template>
  <modal-window ref="modal" class="outing-preview-modal">
    <template #header>
      {{ $gettext('Aperçu avant publication') }}
    </template>

    <p class="outing-preview-notice">
      <fa-icon icon="circle-info" />
      &nbsp;{{
        $gettext(
          'Voici la sortie telle qu’elle apparaîtra sur Camptocamp. Rien n’est publié tant que vous n’avez pas validé le formulaire.'
        )
      }}
    </p>

    <p v-if="cooking" class="has-text-centered has-text-grey">
      <fa-icon icon="spinner" spin />
      &nbsp;{{ $gettext('Préparation de l’aperçu…') }}
    </p>

    <!-- The formatted text comes from the API's own cooker, so a failure
         here means the preview would be lying about the formatting. Better
         to say so than to show raw markdown as if it were the result. -->
    <p v-else-if="error" class="notification is-warning">
      {{
        $gettext(
          'L’aperçu du texte mis en forme n’a pas pu être calculé (connexion ?). Le reste de la sortie est affiché tel quel.'
        )
      }}
    </p>

    <outing-document-body v-if="previewDocument" :document="previewDocument" preview />

    <template #footer>
      <div class="buttons is-right mt-4">
        <button class="button is-primary" @click="hide">
          {{ $gettext('Revenir à l’édition') }}
        </button>
      </div>
    </template>
  </modal-window>
</template>

<script>
import ModalWindow from '@/components/generics/modals/ModalWindow';
import cooker from '@/js/cooker';
import { buildPreviewDocument, findLocale } from '@/pwa/outing-preview';
import OutingDocumentBody from '@/views/document/utils/OutingDocumentBody';

// CDC §4.4 asks to preview a sortie before publishing it. V1 already has a
// preview, but per field, inside the markdown editor: it answers "is my
// formatting right", not "is this what the community will see".
//
// This shows the whole outing through OutingDocumentBody — the very
// component the published page renders — so the two cannot drift apart.
export default {
  name: 'OutingPreviewModal',

  components: { ModalWindow, OutingDocumentBody },

  props: {
    document: {
      type: Object,
      required: true,
    },
    lang: {
      type: String,
      required: true,
    },
  },

  data() {
    return {
      previewDocument: null,
      cooking: false,
      error: false,
    };
  },

  methods: {
    async show() {
      this.error = false;
      this.cooking = true;
      // Render immediately from the raw locale so the modal is never empty
      // while the cooker round-trips; the cooked version replaces it.
      const locale = findLocale(this.document, this.lang);
      this.previewDocument = buildPreviewDocument(this.document, locale, this.lang);
      this.$refs.modal.show();

      try {
        const response = await cooker.cook({ ...locale });
        this.previewDocument = buildPreviewDocument(this.document, response.data, this.lang);
      } catch {
        // Keep the uncooked preview on screen and flag it, rather than
        // dropping the user back to the form with nothing.
        this.error = true;
      } finally {
        this.cooking = false;
      }
    },

    hide() {
      this.$refs.modal.hide();
    },
  },
};
</script>

<style scoped lang="scss">
.outing-preview-notice {
  margin-bottom: 1rem;
  padding: 0.5rem 0.75rem;
  border-radius: 4px;
  background: rgba(255, 153, 51, 0.12);
  font-size: 0.9rem;
}
</style>
