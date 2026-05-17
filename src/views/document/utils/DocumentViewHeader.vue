<template>
  <div class="view-container">
    <div v-if="!document.not_authorized">
      <html-header v-if="!isDraftView && !isPrintingView" :title="title" />

      <document-version-banner :version="version" :document="document" />

      <div class="box">
        <span v-if="!isDraftView" class="is-pulled-right button-bar no-print">
          <gotop-button v-if="isPrintingView" />
          <follow-button v-if="!isPrintingView" :document="document" />
          <offline-header-button
            v-if="!isPrintingView && offlineSupportedType"
            :document="document"
            :document-type="documentType"
            :lang="lang"
          />
          <tags-button v-if="!isPrintingView" :document="document" />

          <!-- ShareButton uses the Web Share API (native sheet on mobile)
               with a clipboard fallback — no AddThis / GDPR dependency. -->
          <share-button v-if="documentType != 'profile' && isNormalView" :document="document" />
          <social-network-sharing v-if="false" />

          <span
            :title="$gettext('Add images')"
            v-if="isEditable && documentType !== 'image'"
            @click="$refs.imagesUploader.show()"
          >
            <fa-layers>
              <fa-icon icon="image" />
              <fa-icon icon="circle" :style="{ color: 'white' }" transform="shrink-5 right-5 up-6" />
              <fa-icon icon="plus-circle" :style="{ color: 'green' }" transform="shrink-5 right-5 up-5" />
            </fa-layers>
          </span>

          <edit-link v-if="isEditable" :document="document" :lang="lang" :title="$gettext('Edit')">
            <icon-edit />
          </edit-link>
        </span>
        <h1 class="title is-1">
          <slot name="icon-document">
            <icon-document :document-type="documentType" />
          </slot>
          <document-title :document="document" uppercase-first-letter />

          <!-- outing specific  -->
          <span v-if="documentType == 'outing'" class="outing-date is-size-5">
            {{ $documentUtils.getOutingDatesLocalized(document) | uppercaseFirstLetter }}
          </span>

          <!-- xreport specific  -->
          <span v-else-if="documentType == 'xreport'" class="outing-date is-size-5">
            {{ $dateUtils.toLocalizedString(document.date, 'll') | uppercaseFirstLetter }}
          </span>
        </h1>
      </div>

      <images-uploader ref="imagesUploader" :lang="lang" :parent-document="document" />
    </div>
  </div>
</template>

<script>
import DocumentVersionBanner from './DocumentVersionBanner';
import FollowButton from './FollowButton';
import GotopButton from './GotopButton';
import OfflineHeaderButton from './OfflineHeaderButton.vue';
import ShareButton from './ShareButton.vue';
import SocialNetworkSharing from './SocialNetworkSharing';
import TagsButton from './TagsButton';

import ImagesUploader from '@/components/images-uploader/ImagesUploader';
import isEditableMixin from '@/js/is-editable-mixin';
import { requireDocumentProperty } from '@/js/properties-mixins';

export default {
  components: {
    ImagesUploader,
    FollowButton,
    OfflineHeaderButton,
    ShareButton,
    GotopButton,
    TagsButton,
    SocialNetworkSharing,
    DocumentVersionBanner,
  },

  mixins: [isEditableMixin, requireDocumentProperty],

  props: {
    version: {
      type: Object,
      default: null,
    },
  },

  computed: {
    lang() {
      return this.document.cooked.lang;
    },

    title() {
      return this.$documentUtils.getDocumentTitle(this.document, this.lang);
    },

    offlineSupportedType() {
      // Areas / maps / profiles aren't useful to save for field use and the
      // offline plugin doesn't model them — only hide-show, no logic change.
      return [
        'article',
        'book',
        'image',
        'outing',
        'route',
        'waypoint',
        'xreport',
      ].includes(this.documentType);
    },
  },
};
</script>

<style scoped lang="scss">
.button-bar {
  font-size: 1.5rem;
}

.button-bar > a {
  color: $text;
}

.button-bar > span,
.button-bar > a {
  margin-left: 0.25rem;
  cursor: pointer;
}
.button-bar > *:hover {
  color: $black;
}

.title {
  .outing-date {
    margin-left: 0.5rem;
  }
}

// V3 mobile fix (task 9): the 5 action buttons (Follow, Save offline,
// Share, Add photo, Edit) were colliding with the title (right-pulled
// next to it). On a narrow screen the title got pushed under the bar
// and read as garbled. Stack them below the title and let the title
// own its full line.
@media screen and (max-width: 768px) {
  .box {
    display: flex;
    flex-direction: column;
  }
  .button-bar {
    float: none !important;
    order: 2;
    align-self: flex-end;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-top: 0.4rem;
    padding-top: 0.4rem;
    border-top: 1px solid rgba(0, 0, 0, 0.06);
    font-size: 1.25rem;
    width: 100%;
    justify-content: flex-end;
  }
  .button-bar > span,
  .button-bar > a {
    margin-left: 0;
  }
  .title.is-1 {
    order: 1;
    font-size: 1.3rem;
    line-height: 1.25;
    overflow-wrap: break-word;
    word-break: normal;
  }
  .title .outing-date {
    display: block;
    margin-left: 0;
    margin-top: 0.2rem;
    font-size: 0.85rem !important;
    color: #6b6b6b;
  }
}

@media print {
  .title {
    font-size: 1.5rem !important;
  }
}
</style>
