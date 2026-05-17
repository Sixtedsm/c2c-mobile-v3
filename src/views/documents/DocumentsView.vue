<template>
  <div class="section documents-view">
    <html-header :title="getDocumentTypeTitle(documentType)" />
    <div class="search-infos">
      <div class="header-section">
        <span>
          <dropdown-button class="header-item">
            <span slot="button">
              <span class="title is-3 is-ellipsed">
                {{ getDocumentTypeTitle(documentType) | uppercaseFirstLetter }}
              </span>
              <fa-icon icon="angle-down" aria-hidden="true" />
            </span>
            <router-link
              v-for="type of documentTypes"
              :key="type"
              class="dropdown-item is-size-6"
              :class="{ 'is-active': type === documentType }"
              :to="{ name: type + 's', query: queryWithoutOffsetAndSort }"
            >
              <icon-document :document-type="type" />
              <span>&nbsp;{{ getDocumentTypeTitle(type) | uppercaseFirstLetter }}</span>
            </router-link>
          </dropdown-button>
          &nbsp;
          <br class="is-hidden-tablet" />
          <page-selector :documents="documents" />
        </span>
        <span class="is-pulled-right is-flex header-right" v-if="documentType != 'profile'">
          <!-- Bulk save current page for offline use (#11). Component
               auto-hides for non-savable types (images, profiles). -->
          <bulk-offline-button
            v-if="documents && documents.documents"
            :documents="documents.documents"
            :document-type="documentType"
            class="header-item"
          />
          <load-user-preferences-button class="is-hidden-mobile" />

          <span @click="toogleProperty('listMode')" class="header-item is-size-3 has-cursor-pointer is-hidden-mobile">
            <fa-icon
              v-show="displayMode !== 'map'"
              icon="th-list"
              :class="listMode ? 'has-text-primary' : ''"
              :title="$gettext('List mode')"
            />
            <fa-icon
              v-show="displayMode !== 'map'"
              icon="th"
              :class="!listMode ? 'has-text-primary' : ''"
              :title="$gettext('Cards mode')"
            />
          </span>
          <template v-if="documentAreGeoLocalized">
            <display-mode-switch
              class="header-item is-hidden-mobile"
              list-mode="listMode"
              :value="displayMode"
              @input="setProperty('displayMode', arguments[0])"
            />

            <!-- V1 mini map toggle was visible on mobile (is-hidden-tablet)
                 — duplicates the new V3 floating .map-list-fab below.
                 Hidden across all viewports now; the FAB owns this. -->
            <span v-if="false" class="is-size-3 is-hidden-tablet">
              <fa-icon
                :icon="displayMode === 'map' ? 'th' : 'map-marked-alt'"
                class="has-text-primary"
                @click="setProperty('displayMode', displayMode === 'map' ? 'both' : 'map')"
              />
            </span>
          </template>
        </span>
      </div>

      <query-items class="filter-section" :list-mode="listMode" @documents-load="onQueryDocumentsLoad" />
    </div>

    <div class="columns result-section" :class="['mobile-mode-' + displayMode, { 'query-has-tags': queryHasTags }]">
      <div
        v-if="showResults"
        class="column documents-container"
        :class="{
          'is-12': !showMap,
          'is-8 is-7-fullhd': showMap && listMode,
          'is-8 is-7-widescreen is-6-fullhd': showMap && !listMode,
        }"
      >
        <loading-notification :promise="promise" />

        <image-cards v-if="documents && !listMode && documentType === 'image'" :documents="documents" />

        <div
          v-if="documents && !listMode && documentType !== 'image'"
          class="columns is-multiline is-variable is-1 cards-list"
        >
          <div
            v-for="(document, index) in documents.documents"
            :key="index"
            :class="{
              'is-full-mobile is-half-tablet is-half-desktop is-half-widescreen is-half-fullhd': showMap,
              'is-full-mobile is-one-third-tablet is-one-third-desktop is-one-quarter-widescreen is-one-quarter-fullhd':
                !showMap,
            }"
            class="column card-container"
            @mouseenter="highlightedDocument = document"
            @mouseleave="highlightedDocument = null"
          >
            <document-card :highlighted="highlightedDocument === document" :document="document" />
          </div>
        </div>

        <!-- Without this, an empty `documents.documents` (e.g. /outings?u=<id>
             returning 0 rows) renders nothing — list mode shows ag-grid's
             "No Rows" overlay and map shows a blank map, but cards looked
             silently broken. -->
        <div
          v-if="documents && !listMode && documentType !== 'image' && documents.documents && !documents.documents.length"
          class="empty-state has-text-centered"
        >
          <fa-icon icon="folder-open" class="empty-state-icon" />
          <p>{{ $gettext('No results') }}</p>
        </div>

        <documents-table
          v-if="listMode"
          :documents="documents ? documents : {}"
          :document-type="documentType"
          :highlighted-document="highlightedDocument"
          @highlight-document="highlightedDocument = arguments[0]"
          class="documents-table"
        />
      </div>
      <div v-if="showMap" class="column map-container">
        <map-view
          ref="map"
          :documents="documentsShownOnMap"
          :highlighted-document="highlightedDocument"
          @highlight-document="highlightedDocument = arguments[0]"
          show-filter-control
          show-center-on-geolocation
          show-recenter-on
        />
      </div>
    </div>

    <!-- V3 mobile FAB: tap to toggle between results list and full-screen
         map. Discoverable, thumb-reachable, and stays visible while
         scrolling because position:fixed leaves it nailed to the viewport
         (above the BottomNav). -->
    <button
      v-if="documentAreGeoLocalized"
      type="button"
      class="map-list-fab is-hidden-tablet"
      :aria-label="displayMode === 'map' ? $gettext('Voir la liste') : $gettext('Voir la carte')"
      @click="setProperty('displayMode', displayMode === 'map' ? 'both' : 'map')"
    >
      <fa-icon :icon="displayMode === 'map' ? 'list' : 'map-marked-alt'" />
      <span>{{ displayMode === 'map' ? $gettext('Liste') : $gettext('Carte') }}</span>
    </button>
  </div>
</template>

<script>
import BulkOfflineButton from './utils/BulkOfflineButton';
import DisplayModeSwitch from './utils/DisplayModeSwitch';
import ImageCards from './utils/ImageCards';
import LoadUserPreferencesButton from './utils/LoadUserPreferencesButton';
import PageSelector from './utils/PageSelector';
import QueryItems from './utils/QueryItems';

import c2c from '@/js/apis/c2c';
import constants from '@/js/constants';
import pullRefreshMixin from '@/js/pull-refresh-mixin';

const DocumentsTable = () => import(/* webpackChunkName: "data-table" */ '@/components/datatable/DocumentsTable');

export default {
  name: 'DocumentsView',

  components: {
    QueryItems,
    PageSelector,
    DocumentsTable,
    ImageCards,
    DisplayModeSwitch,
    LoadUserPreferencesButton,
    BulkOfflineButton,
  },

  mixins: [pullRefreshMixin],

  data() {
    return {
      promise: {},

      displayMode: 'both',
      listMode: null,

      isMobile: null,

      highlightedDocument: null,

      filteredWaypoints: [],

      queryHasTags: false,
    };
  },

  computed: {
    showMap() {
      return ['both', 'map'].includes(this.displayMode);
    },
    showResults() {
      return ['result', 'both'].includes(this.displayMode);
    },
    documents() {
      return this.promise.data;
    },
    documentType() {
      return this.$route.name.slice(0, -1);
    },
    documentTypes() {
      return ['route', 'waypoint', 'outing', 'image', 'book', 'area'];
    },
    documentAreGeoLocalized() {
      return constants.objectDefinitions[this.documentType].geoLocalized === true;
    },
    addQuery() {
      return {
        act: this.$route.query.act,
      };
    },
    queryWithoutOffsetAndSort() {
      const result = Object.assign({}, this.$route.query);
      delete result.offset;
      delete result.sort;

      return result;
    },
    documentsShownOnMap() {
      return this.filteredWaypoints.concat(this.documents ? this.documents.documents : []);
    },
  },

  watch: {
    $route: {
      handler: 'load',
      immediate: true,
    },
    displayMode: 'updateMapSize',
  },

  methods: {
    load() {
      this.displayMode = this.$localStorage.get(
        this.documentType + '.displayMode',
        this.documentAreGeoLocalized ? 'both' : 'result'
      );
      this.listMode = this.$localStorage.get(this.documentType + '.listMode', false);

      if (this.$route.hash) {
        // keep compatible with v6 AngularJs hacks...
        this.$router.replace(this.$route.fullPath.replace('#', '?'));
        // $route watcher will call load
        return;
      }

      this.promise = c2c[this.documentType].getAll(this.$route.query);
      // Returned so the pull-to-refresh mixin can await the fetch and
      // stop the spinner exactly when the data lands.
      return this.promise;
    },

    toogleProperty(property) {
      this.setProperty(property, !this[property]);
    },

    setProperty(property, value) {
      this[property] = value;
      this.$localStorage.set(`${this.documentType}.${property}`, this[property]);
    },

    getDocumentTypeTitle(documentType) {
      return this.$gettext(documentType + 's');
    },

    // when map container is resized (which happen when displayMode switchs between both and map),
    // openLayer need an explicit resize
    updateMapSize(newValue, oldValue) {
      if ((newValue === 'map' && oldValue === 'both') || (newValue === 'both' && oldValue === 'map')) {
        this.$nextTick(this.$refs.map.map.updateSize.bind(this.$refs.map.map));
      }
    },

    onQueryDocumentsLoad(documents) {
      this.queryHasTags = documents.length > 0;
      this.filteredWaypoints = documents.filter((document) => document.type === 'w');

      // do not display waypoints associated
      this.filteredWaypoints.forEach((document) => delete document.associations);
    },
  },
};
</script>

<style scoped lang="scss">
$section-padding: 1.5rem; //TODO find this variable
$header-height: 34px;
$header-padding-bottom: 1.5rem; //TODO find this variable
$filter-height: 32px;
$tags-height: 28px;
$filter-padding-bottom: 0.5rem;
// prettier-ignore
$result-height: calc(
  100vh - #{$navbar-height} - 2 * #{$section-padding} - #{$header-height} - #{$header-padding-bottom} - #{$filter-padding-bottom} - #{$filter-height}
);
// prettier-ignore
$result-height-with-tags: calc(
  100vh - #{$navbar-height} - 2 * #{$section-padding} - #{$header-height} - #{$header-padding-bottom} - #{$filter-padding-bottom} - #{$filter-height} - #{$tags-height}
);
$cards-gap: 0.25rem;

.header-section {
  padding-bottom: $header-padding-bottom;
}

.header-right {
  align-items: center;
}

.header-item:not(:first-child) {
  margin-bottom: 0;
  margin-left: 0.75rem;
}

.filter-section {
  padding-bottom: $filter-padding-bottom;
  clear: both;
}

@media screen and (max-width: $tablet) {
  $mobile-section-padding: 0.5rem;
  $mobile-header-height: 56px;
  $mobile-filters-height: 25px;

  // V3 shell already handles fixed top bar + scroll inside .page-content.
  // The legacy V1 trick of position:fixed-ing the filter bar against the
  // (now hidden) V1 navbar caused it to float over the first card and
  // hide its title — that was the "rogné" Sixte saw. Let the filter bar
  // scroll with the rest of the content.
  .search-infos {
    position: static;
    z-index: auto;
    background-color: transparent;
    padding-top: $mobile-section-padding;
  }

  .result-section {
    padding-top: $mobile-section-padding;
  }

  .documents-view {
    padding-top: $mobile-section-padding;
    padding-left: 0;
    padding-right: 0;
    padding-bottom: 0;
  }

  .filter-section,
  .header-section {
    padding-left: 0.5rem;
    padding-right: 0.5rem;
    padding-bottom: $mobile-section-padding;
  }

  .header-right {
    line-height: 1em;
  }

  .map-container {
    height: $result-height;
    padding: 0;
  }

  .mobile-mode-map {
    margin-top: 0;
    .map-container {
      height: calc(
        100vh - #{$navbar-height} - 3 * #{$mobile-section-padding} - #{$mobile-header-height} - #{$mobile-filters-height}
      );
    }

    .documents-container {
      display: none;
    }
  }

  .mobile-mode-result,
  .mobile-mode-both {
    .map-container {
      visibility: hidden; // map does not like to be in a display none...
    }
  }
}

@media screen and (min-width: $tablet) {
  .result-section {
    margin-top: 0;
    height: $result-height;

    &.query-has-tags {
      height: $result-height-with-tags;
    }

    .documents-container {
      height: 100%;
      overflow: auto;
      padding-top: 0;
      padding-bottom: 0;

      .cards-list {
        padding-top: 2px;
        height: 100%;
      }

      .documents-table {
        height: 100%;
      }
    }

    .map-container {
      min-height: 100%;
      padding-left: 0;
      padding-top: 0;
      padding-bottom: 0;
    }
  }
}

// V3 mobile FAB: thumb-reachable toggle between list and map. Pinned
// above the BottomNav (56px + safe-area) via position:fixed so it
// stays visible no matter how the user scrolls inside the listing.
.empty-state {
  padding: 2.5rem 1rem;
  color: #6b6b6b;

  .empty-state-icon {
    font-size: 2.5rem;
    color: #d1d5db;
    margin-bottom: 0.5rem;
  }

  p {
    font-size: 0.95rem;
  }
}

.map-list-fab {
  position: fixed;
  right: 0.75rem;
  bottom: calc(70px + env(safe-area-inset-bottom));
  z-index: 25;
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.55rem 0.95rem;
  background: #4a4a4a;
  color: white;
  font-size: 0.85rem;
  font-weight: 600;
  border: none;
  border-radius: 999px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);
  cursor: pointer;

  &:hover,
  &:focus {
    background: #2f2f2f;
    outline: none;
  }
}
</style>
