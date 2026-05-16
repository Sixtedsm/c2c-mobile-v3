<template>
  <span class="offline-header-button" :title="label">
    <a @click="toggle" :class="{ 'is-saved': isSaved, 'is-busy': isBusy }">
      <fa-icon v-if="isBusy" icon="spinner" spin />
      <fa-icon v-else-if="isSaved" icon="bookmark" />
      <fa-icon v-else :icon="['far', 'bookmark']" />
    </a>
  </span>
</template>

<script>
// Mirrors the offline toggle exposed by ToolBox but slotted in the header
// next to favorite / edit / add-photo so the V3 UX matches what Sixte
// expects: every primary action is on the same row.

export default {
  name: 'OfflineHeaderButton',

  props: {
    document: { type: Object, required: true },
    documentType: { type: String, required: true },
    lang: { type: String, required: true },
  },

  computed: {
    docId() {
      return this.document?.document_id;
    },
    isSaved() {
      if (!this.docId) return false;
      return this.$offline.isSaved(this.documentType, this.docId, this.lang);
    },
    isBusy() {
      if (!this.docId) return false;
      return this.$offline.isDownloading(this.documentType, this.docId, this.lang);
    },
    label() {
      if (this.isBusy) return this.$gettext('Téléchargement en cours…');
      return this.isSaved
        ? this.$gettext('Enregistré hors-ligne — toucher pour retirer')
        : this.$gettext('Enregistrer pour usage hors-ligne');
    },
  },

  methods: {
    async toggle() {
      if (this.isBusy || !this.docId) return;
      if (this.isSaved) {
        await this.$offline.removeDocument(this.documentType, this.docId, this.lang);
      } else {
        await this.$offline.saveDocument({
          type: this.documentType,
          id: this.docId,
          lang: this.lang,
        });
      }
    },
  },
};
</script>

<style lang="scss" scoped>
.offline-header-button a {
  cursor: pointer;
  color: #4a4a4a;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 1.1rem;

  &.is-saved {
    color: #ff9933;
  }

  &.is-busy {
    color: #9ca3af;
  }
}
</style>
