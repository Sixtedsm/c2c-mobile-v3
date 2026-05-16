<template>
  <div class="box no-print">
    <associated-documents :document="document" />

    <div class="has-text-centered" v-if="isNormalView && available_langs.length">
      <span v-translate>View in other lang</span>
      <br />
      <span class="lang-switcher-box-list">
        <span v-for="l of available_langs" :key="l">
          <document-link :document="document" :lang="l">
            {{ $gettext(l, 'langs') }}
          </document-link>
        </span>
      </span>
      <hr />
    </div>

    <tool-box-button
      v-if="shouldAddWheatherLink"
      :href="linkToMeteoBlue"
      :label="$gettext('Weather forecast (meteoblue)')"
      icon="sun"
    />

    <tool-box-button
      v-if="shouldAddDirections"
      :href="linkToGoogleMapsDirections"
      :label="$gettext('Directions (Google Maps)')"
      icon="directions"
    />

    <tool-box-button
      v-if="canSaveOffline"
      @click="toggleOffline"
      :icon="offlineIcon"
      :icon-class="offlineIconClass"
      :label="offlineLabel"
    />

    <tool-box-button v-if="canPrint" @click="printDocument" icon="print" :label="$gettext('Print / save as PDF')" />

    <tool-box-button
      v-if="document.geometry && document.geometry.geom && documentType !== 'area'"
      :to="linkToClosestDocuments"
      :label="$gettext('See other documents nearby')"
      icon="compass"
    />

    <tool-box-button
      v-if="document.type === 'w' && document.waypoint_type === 'paragliding_takeoff'"
      :to="linkToParaglidingOutings"
      :label="$gettext('Paragliding outings')"
      :icon="['miscs', 'paragliding']"
    />

    <tool-box-button
      v-if="fundraiser"
      :label="$gettext('Contribute to maintainance')"
      :href="fundraiser.url"
      icon-class="has-text-danger"
      :icon="['miscs', 'drill']"
    />

    <tool-box-button
      v-if="documentType === 'profile'"
      :to="{ name: 'outings', query: { u: document.document_id } }"
      :label="$gettext('outings')"
    >
      <icon-outing slot="icon" />
    </tool-box-button>

    <tool-box-button
      v-if="documentType === 'profile'"
      :to="{ name: 'outings-stats', query: { u: document.document_id } }"
      :label="$gettext('Statistics')"
      icon="chart-bar"
    />

    <hr />

    <tool-box-button
      v-if="documentType === 'profile'"
      :to="{ name: 'whatsnew', query: { u: document.document_id } }"
      :label="$gettext('Contributions')"
      rel="nofollow"
      icon="edit"
    />

    <div class="quality" v-if="quality">
      <icon-quality :quality="quality.value" fixed-width></icon-quality>
      <span>{{ quality.i18nName }}</span> {{ quality.i18nValue }}
    </div>

    <tool-box-button
      v-if="isEditable"
      :to="{ name: documentType + '-edit', params: { id: document.document_id, lang: lang } }"
      icon="edit"
      :label="$gettext('Edit a document')"
    />

    <tool-box-button
      v-if="isEditable && showAssociationEditor"
      @click="$refs.associationsWindow.show()"
      icon="link"
      :label="$gettext('Edit associations')"
    />

    <tool-box-button
      v-if="documentType != 'profile' || $user.isModerator || document.document_id === $user.id"
      :to="{ name: documentType + '-history', params: { id: document.document_id, lang: document.cooked.lang } }"
      :label="$gettext('History')"
      rel="nofollow"
      icon="history"
    />

    <tool-box-button
      v-if="isEditable && hasMissingLangs"
      @click="$refs.translateWindow.show()"
      icon="globe"
      :label="$gettext('Translate')"
    />

    <tool-box-button
      :href="`mailto:${$options.reportingIssueMail}?subject=${reportingSubject}&body=${reportingBody}`"
      :icon="['fas', 'exclamation-circle']"
      icon-class="has-text-danger"
      :label="$gettext('Report an issue')"
    />

    <hr />

    <!-- Moderator zone -->
    <template v-if="isEditable && $user.isModerator">
      <tool-box-button
        v-if="documentType !== 'profile'"
        @click="lockDocumentAction"
        :icon="document.protected ? 'lock' : 'unlock'"
        :class="document.protected ? 'lock-button-red' : 'lock-button-green'"
        :label="document.protected ? $gettext('Unprotect document') : $gettext('Protect document')"
      />

      <tool-box-button
        v-if="documentType !== 'profile'"
        @click="$refs.MergeDocumentWindow.show()"
        icon="object-group"
        :label="$gettext('Merge with other document')"
      />

      <tool-box-button
        v-if="documentType === 'profile'"
        @click="lockAccountAction"
        icon="user-lock"
        :class="{ 'lock-button-red': isAccountBlocked }"
        :label="isAccountBlocked ? $gettext('Unblock account') : $gettext('Block account')"
      />
    </template>

    <template v-if="isDeletable">
      <tool-box-button
        v-if="document.available_langs.length > 1"
        @click="$refs.DeleteLocaleWindow.show()"
        :icon="['fas', 'trash']"
        :label="$gettext('Delete this locale')"
      />

      <tool-box-button
        @click="$refs.deleteDocumentWindow.show()"
        :icon="['fas', 'trash']"
        :label="$gettext('Delete this document')"
      />
    </template>

    <hr v-if="isDeletable || (isEditable && $user.isModerator)" />

    <license-box :document="document" />

    <!-- Modal windows -->
    <div v-if="isEditable">
      <merge-document-window ref="MergeDocumentWindow" :document="document" />
      <delete-document-window ref="deleteDocumentWindow" :document="document" />
      <delete-locale-window ref="DeleteLocaleWindow" :document="document" :locale-lang="document.cooked.lang" />
      <translate-window ref="translateWindow" :document="document" :missing-langs="missingLangs" />
      <associations-window ref="associationsWindow" :document="document" />
    </div>
  </div>
</template>

<script>
import IconQuality from '../../../../components/generics/icons/IconQuality.vue';
import DeleteDocumentWindow from '../windows/DeleteDocumentWindow';
import DeleteLocaleWindow from '../windows/DeleteLocaleWindow';
import MergeDocumentWindow from '../windows/MergeDocumentWindow';
import TranslateWindow from '../windows/TranslateWindow';

import AssociatedDocuments from './AssociatedDocuments';
import LicenseBox from './LicenseBox';
import ToolBoxButton from './ToolBoxButton';

import AssociationsWindow from '@/components/association-editor/AssociationsWindow';
import c2c from '@/js/apis/c2c';
import constants from '@/js/constants';
import getFundraiser from '@/js/get-fundraiser';
import isEditableMixin from '@/js/is-editable-mixin';
import ol from '@/js/libs/ol';
import { requireDocumentProperty } from '@/js/properties-mixins';
import viewModeMixin from '@/js/view-mode-mixin';

const GeoJSON = new ol.format.GeoJSON();

export default {
  components: {
    ToolBoxButton,
    LicenseBox,
    AssociatedDocuments,
    IconQuality,
    AssociationsWindow,
    DeleteLocaleWindow,
    DeleteDocumentWindow,
    MergeDocumentWindow,
    TranslateWindow,
  },

  mixins: [requireDocumentProperty, viewModeMixin, isEditableMixin],

  data() {
    return {
      isAccountBlocked: null,
    };
  },

  reportingIssueMail: 'topo-fr@camptocamp.org',

  computed: {
    lang() {
      return this.document.cooked.lang;
    },

    reportingSubject() {
      return this.$gettext('Issue report');
    },

    reportingBody() {
      return encodeURIComponent(
        this.$gettext('Describe here your issue') + '\r\n\r\n----\r\n\r\n' + window.location.href
      );
    },

    available_langs() {
      const currentLang = this.$route.params.lang ?? this.document.cooked?.lang;
      return this.document.available_langs.filter((lang) => currentLang !== lang);
    },

    showAssociationEditor() {
      return this.documentType !== 'area';
    },

    missingLangs() {
      const result = [];

      for (const lang of constants.langs) {
        if (!this.document.available_langs.includes(lang)) {
          result.push(lang);
        }
      }

      return result;
    },

    quality() {
      const fields = constants.objectDefinitions[this.documentType].fields;
      if (!fields.quality) {
        return;
      }
      return {
        ...fields.quality,
        value: this.document[fields.quality.name],
        i18nName: this.$gettext(fields.quality.name),
        i18nValue: this.$gettext(this.document[fields.quality.name], fields.quality.i18nContext),
      };
    },

    fundraiser() {
      return getFundraiser(this.document);
    },

    hasMissingLangs() {
      return this.missingLangs.length > 0;
    },

    linkToClosestDocuments() {
      const result = {
        name: this.documentType + 's',
        query: {
          wtyp: this.documentType === 'waypoint' ? this.document.waypoint_type : undefined,
        },
      };

      if (this.document.geometry?.geom) {
        const point = GeoJSON.readFeatures(this.document.geometry.geom)[0];
        const extent = ol.extent.buffer(point.getGeometry().getExtent(), 10000);

        result.query.bbox = extent.map(Math.floor).join(',');
      }

      return result;
    },

    linkToParaglidingOutings() {
      return {
        name: 'outings',
        query: {
          act: 'paragliding',
          w: [
            ...(this.documentType === 'waypoint' ? [this.document.document_id] : []),
            ...this.document.associations.waypoints.map((w) => w.document_id),
            ...this.document.associations.waypoint_children.map((w) => w.document_id),
          ].join(','),
        },
      };
    },

    shouldAddWheatherLink() {
      return (this.document.type === 'w' || this.document.type === 'r') && this.document?.geometry?.geom;
    },

    linkToMeteoBlue() {
      let lang;
      switch (this.$language.current) {
        case 'fr':
          lang = 'fr/meteo/semaine';
          break;
        case 'it':
          lang = 'it/tempo/settimana';
          break;
        case 'de':
          lang = 'de/wetter/woche';
          break;
        case 'es':
        case 'eu':
        case 'ca':
          lang = 'es/tiempo/semana';
          break;
        case 'en':
        default:
          lang = 'en/weather/week';
      }
      const lonLat = ol.proj.toLonLat(
        GeoJSON.readFeatures(this.document.geometry.geom)[0].getGeometry().getCoordinates()
      );
      const coords = ol.coordinate.format(lonLat, '{y}N{x}E', 4);
      // use waypoint elevation, or elevation of difficuties or max elevation for routes, otherwise nothing
      const elevation =
        this.document.elevation ?? this.document.difficulties_height ?? this.document.elevation_max ?? '';
      return `https://meteoblue.com/${lang}/${coords}${elevation}`;
    },

    shouldAddDirections() {
      return (
        this.document.type === 'w' &&
        ['access', 'gite', 'camp_site'].includes(this.document.waypoint_type) &&
        this.document?.geometry?.geom
      );
    },

    linkToGoogleMapsDirections() {
      const lonLat = ol.proj.toLonLat(
        GeoJSON.readFeatures(this.document.geometry.geom)[0].getGeometry().getCoordinates()
      );
      const coords = ol.coordinate.format(lonLat, '{y},{x}', 4);
      return `https://www.google.com/maps/dir/?api=1&destination=${coords}`;
    },

    canSaveOffline() {
      return ['route', 'waypoint', 'outing', 'article', 'book', 'xreport', 'image'].includes(this.documentType);
    },

    canPrint() {
      // Print is useful for documents you take in the field; profile pages do
      // not really fit the use case.
      return this.documentType !== 'profile';
    },

    offlineDocId() {
      return this.document.document_id;
    },

    offlineLang() {
      return this.document.cooked.lang;
    },

    isSavedOffline() {
      return this.$offline.isSaved(this.documentType, this.offlineDocId, this.offlineLang);
    },

    isDownloadingOffline() {
      return this.$offline.isDownloading(this.documentType, this.offlineDocId, this.offlineLang);
    },

    offlineIcon() {
      if (this.isDownloadingOffline) {
        return 'circle-notch';
      }
      return this.isSavedOffline ? 'check-circle' : 'download';
    },

    offlineIconClass() {
      if (this.isDownloadingOffline) {
        return 'fa-spin';
      }
      return this.isSavedOffline ? 'has-text-success' : null;
    },

    offlineLabel() {
      if (this.isDownloadingOffline) {
        return this.$gettext('Saving for offline use…');
      }
      return this.isSavedOffline ? this.$gettext('Saved for offline use') : this.$gettext('Save for offline use');
    },
  },

  created() {
    if (this.$user.isModerator && this.documentType === 'profile') {
      c2c.moderator.isAccountBlocked(this.document.document_id).then((response) => {
        this.isAccountBlocked = response.data.blocked;
      });
    }
  },

  methods: {
    lockDocumentAction() {
      if (this.document.protected) {
        c2c.moderator.unprotectDocument(this.document.document_id).then(() => {
          this.document.protected = false;
        });
      } else {
        c2c.moderator.protectDocument(this.document.document_id).then(() => {
          this.document.protected = true;
        });
      }
    },

    lockAccountAction() {
      if (this.isAccountBlocked) {
        c2c.moderator.unblockAccount(this.document.document_id).then(() => {
          this.isAccountBlocked = false;
        });
      } else {
        c2c.moderator.blockAccount(this.document.document_id).then(() => {
          this.isAccountBlocked = true;
        });
      }
    },

    printDocument() {
      // The C2C stylesheet has plenty of print rules (no-print classes on the
      // nav, side menu, ToolBox itself, ads, etc.), so triggering the native
      // browser print dialog is enough — the user can then save as PDF.
      window.print();
    },

    async toggleOffline() {
      if (this.isDownloadingOffline) {
        return;
      }
      if (this.isSavedOffline) {
        await this.$offline.removeDocument(this.documentType, this.offlineDocId, this.offlineLang);
      } else {
        await this.$offline.saveDocument({
          type: this.documentType,
          id: this.offlineDocId,
          lang: this.offlineLang,
        });
      }
    },
  },
};
</script>

<style scoped lang="scss">
.toolbox-button {
  cursor: pointer;

  span {
    color: $link;
  }
}

.lock-button-green {
  color: $green !important;
}

.lock-button-red {
  color: $red !important;
}

.lang-switcher-box-list span:not(:last-child)::after {
  content: ' \2022 '; /* \2022 is bull */
}

.quality {
  span:nth-of-type(1) {
    @include colon;
  }
}
</style>
