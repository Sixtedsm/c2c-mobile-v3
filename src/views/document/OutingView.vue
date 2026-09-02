<template>
  <div class="section has-background-white-print">
    <loading-notification :promise="promise" />
    <masked-document-version-info
      v-if="document === null"
      :version="version"
      :document-type="documentType"
    ></masked-document-version-info>
    <document-view-header v-if="document" :document="document" :version="version" />

    <outing-document-body v-if="document" :document="document" :version="version" />
  </div>
</template>

<script>
import MaskedDocumentVersionInfo from './utils/MaskedDocumentVersionInfo';
import OutingDocumentBody from './utils/OutingDocumentBody';
import documentViewMixin from './utils/document-view-mixin';

export default {
  components: {
    MaskedDocumentVersionInfo,
    OutingDocumentBody,
  },

  mixins: [documentViewMixin],
};
</script>
