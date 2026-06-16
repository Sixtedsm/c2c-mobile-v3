<template>
  <div class="box no-print">
    <div v-if="document.areas && document.areas.length" class="has-text-centered">
      <icon-area />
      <span>&nbsp;</span>
      <span v-for="area of document.areas" :key="area.document_id" class="area-link">
        <document-link :document="area" />&#0032;
      </span>
    </div>

    <!-- The fullscreen map container is used to display both the map
         and the elevation profile in fullscreen (if the elevation profile exists) -->
    <div id="fullscreen-map-container">
      <div
        class="map-container"
        :class="{
          'with-elevation-profile': showElevationProfile && !elevationProfileHidden,
          pinned: pinnedMode,
          'pinned-to-top': pinnedSide === 'top',
          'pinned-to-right': pinnedSide === 'right',
          'fill-parent': !pinnedMode,
          'mobile-fullscreen': mobileFullscreen,
        }"
      >
        <!-- Mobile-only close button when the map is taken full-screen
             via the pin-to-top control. The legacy `pinned-to-top` mode
             relied on `body { padding-top: 45vh }` which is silently
             killed by the V3 shell (body { overflow:hidden, height:100% }
             and the actual scroll is `.page-content` position:absolute).
             Result was a "white map block at the top". On mobile we now
             flip into a true full-viewport overlay with this Reduce
             button; on desktop the original pin-to-side logic stays. -->
        <button
          v-if="mobileFullscreen"
          type="button"
          class="map-mobile-close"
          :aria-label="$gettext('Réduire la carte')"
          @click="togglePinToSide(true)"
        >
          <fa-icon icon="compress" />
        </button>
        <map-view
          ref="mapView"
          :documents="new Array(document)"
          :show-protection-areas="['r', 'w'].includes(document.type)"
          :biodiv-sports-activities="document.activities"
          :full-screen-element-id="
            !$screen.isMobile && showElevationProfile && elevationProfileHasData ? 'fullscreen-map-container' : null
          "
          :show-pin-to-top-button="true"
          :show-center-on-geolocation="true"
          @has-protection-area="$emit('has-protection-area')"
          @pin-to-top-clicked="togglePinToSide(true)"
        />
      </div>

      <elevation-profile :document="document" v-if="showElevationProfile" @has-data="elevationProfileHasData = true" />
    </div>

    <div class="buttons is-centered">
      <button v-if="showDownloadTraceButtons" class="button is-primary is-small" @click="downloadGpx">GPX</button>
      <button v-if="showDownloadTraceButtons" class="button is-primary is-small" @click="downloadKml">KML</button>
      <button
        v-if="hasMapLinks"
        class="button is-small"
        @click="mapLinksAreVisible = !mapLinksAreVisible"
        :class="{ 'is-success': mapLinksAreVisible }"
      >
        <icon-map />
      </button>
    </div>
    <map-links v-if="mapLinksAreVisible" :document="document" />
  </div>
</template>

<script>
import ElevationProfile from './ElevationProfile';
import MapLinks from './MapLinks';

import ol from '@/js/libs/ol';
import { requireDocumentProperty } from '@/js/properties-mixins';
import utils from '@/js/utils';

const GeoJSON = new ol.format.GeoJSON();

export default {
  components: {
    ElevationProfile,
    MapLinks,
  },

  mixins: [requireDocumentProperty],

  data() {
    return {
      mapLinksAreVisible: false,
      elevationProfileHasData: false,
      elevationProfileHidden: false,
      pinnedMode: 0,
      pinnedSide: '',
      // V3 mobile: real full-viewport overlay replacing the broken
      // pin-to-top behavior (body padding-top doesn't apply with the
      // V3 shell). Toggled by the pin button on mobile, dismissed by
      // the Reduce button rendered on top of the map.
      mobileFullscreen: false,
    };
  },

  computed: {
    showElevationProfile() {
      return this.documentType === 'outing';
    },

    showDownloadTraceButtons() {
      if (!this.document.geometry) {
        return false;
      }
      // Show GPX/KML buttons whenever the document has any geometry, including
      // routes that only have a single geo-reference point (no GPS trace) —
      // those are exported as a single waypoint. This addresses Florence_B
      // and Bubu's feedback on the forum about not being able to download
      // the coordinates of routes without a trace without going through the
      // edition view.
      return Boolean(this.document.geometry.geom_detail || this.document.geometry.geom);
    },

    hasOnlyPointGeometry() {
      return Boolean(this.document.geometry && !this.document.geometry.geom_detail && this.document.geometry.geom);
    },

    hasMapLinks() {
      return (this.document.maps && this.document.maps.length !== 0) || this.document.maps_info;
    },
  },

  mounted() {
    this.$root.$on('elevation_profile', (event, hide) => {
      if (event !== 'toggle_fullscreen') {
        return;
      }

      this.elevationProfileHidden = hide;
    });
    window.addEventListener('resize', this.resizePin);
  },

  beforeDestroy() {
    window.removeEventListener('resize', this.resizePin);
    if (this.pinnedMode) this.togglePinToSide(true);
    if (this.pinnedMode) this.togglePinToSide(true);
  },

  methods: {
    togglePinToSide(toggle) {
      // V3 mobile path: pin button → true full-screen overlay. Avoids
      // the broken body-padding mechanism the legacy desktop logic
      // relied on (V3 body is overflow:hidden/height:100%, so any
      // padding-top on it is invisible — the page-content scroll surface
      // is position:absolute and ignores it). The close button rendered
      // in the template also calls this method, which is why the body
      // is a pure toggle.
      if (toggle && this.$screen?.isMobile) {
        this.mobileFullscreen = !this.mobileFullscreen;
        // OL needs to learn its new size after the layout swap. On the
        // way in we also fit-to-document once the box has reflowed —
        // a 60ms beat is enough for the position:fixed inset to settle.
        if (this.mobileFullscreen) {
          setTimeout(() => {
            const mv = this.$refs.mapView;
            mv?.map?.updateSize();
            mv?.fitMapToDocuments?.();
          }, 60);
        } else {
          this.$nextTick(() => this.$refs.mapView?.map?.updateSize());
        }
        return;
      }

      const previousPinnedMode = this.pinnedMode;
      const width = window.innerWidth;
      const height = window.innerHeight;
      const breakMobile = 769;
      // disable eg pin-to-right on mobile
      const maxMode = width < breakMobile || height < breakMobile ? 2 : 3;

      const toggleAmount = toggle ? 1 : 0;
      // 0: unpinned / 1: pinned side1 / 2: pinned side2
      this.pinnedMode = (this.pinnedMode + toggleAmount) % maxMode;

      // side1 is the preferred side for comfort, ie the larger dimension
      const [side1, side2] = width < height * 1.5 ? ['top', 'right'] : ['right', 'top'];
      this.pinnedSide = this.pinnedMode === 0 ? '' : this.pinnedMode === 1 ? side1 : side2;

      if (this.pinnedSide === 'right') {
        document.body.style.paddingRight = '30%';
        document.body.style.paddingTop = null;
      } else if (this.pinnedSide === 'top') {
        document.body.style.paddingRight = null;
        document.body.style.paddingTop = '45vh'; // as % is relative to width
      } else {
        document.body.style.paddingRight = null;
        document.body.style.paddingTop = null;
      }
      const pinModeChanged = this.pinnedMode !== previousPinnedMode;
      setTimeout(() => {
        const mapView = this.$refs.mapView;
        if (!mapView) {
          return;
        }
        // The OpenLayers canvas needs to know its new size after a layout change.
        mapView.map?.updateSize();
        // Only re-fit the extent when the user explicitly toggled the pin mode.
        // On window-resize-driven calls we preserve the current zoom/center so
        // touching the trace or scrolling the page doesn't constantly snap the
        // map back to a fitted extent (forum-reported friction).
        if (pinModeChanged) {
          mapView.fitMapToDocuments();
        }
      });
    },

    resizePin() {
      this.togglePinToSide(false);
    },

    hasDataChanged(value) {
      this.elevationProfileHasData = value;
    },

    downloadKml() {
      this.downloadFeatures(new ol.format.KML(), '.kml', 'application/vnd.google-earth.kml+xml');
    },

    downloadGpx() {
      this.downloadFeatures(new ol.format.GPX(), '.gpx', 'application/gpx+xml');
    },

    downloadFeatures(format, extension, mimetype) {
      let features = [];
      if (this.document.geometry.geom_detail) {
        features = GeoJSON.readFeatures(this.document.geometry.geom_detail);
      } else if (this.document.geometry.geom) {
        features = GeoJSON.readFeatures(this.document.geometry.geom);
      }
      if (!features.length) {
        return;
      }

      // Export only the current document geometry, not the associated features
      const feature = features[0];
      const name = this.$documentUtils.getDocumentTitle(this.document, this.$route.params.lang);

      feature.set('name', name);

      const filename = this.getDownloadedFileName(name, extension);
      const content = format.writeFeatures([feature], {
        featureProjection: 'EPSG:3857',
      });

      utils.download(content, filename, mimetype + ';charset=utf-8');
    },

    getDownloadedFileName(name, extension) {
      let filename = this.document.document_id + '_' + name.substring(0, 100);
      if (this.documentType === 'outing') {
        filename = filename + '_' + this.document.date_start;
      }
      // Remove forbidden characters/spaces, and replace them with '_'
      return filename.replace(/[/\\?%*:|"<>]/g, ' ').replace(/\s+/g, '_') + extension;
    },
  },
};
</script>

<style lang="scss" scoped>
@import '~bulma/sass/utilities/mixins.sass';

.map-container {
  margin-top: 1rem;
  margin-bottom: 1rem;
  background: beige;

  &.fill-parent {
    height: 275px;
  }
}

:not(:fullscreen) > .map-container {
  &.pinned {
    position: fixed;
    top: $navbar-height;
    margin-top: 0; /*avoid space between nav and map, where body text can be seen while scrolling*/
    z-index: 10; /* on top of body but below navbar (z=25) and side-menu (z=30) */
    box-shadow: 1px 1px 4px 0 rgba(0, 0, 0, 0.4); // <o-x> <o-y> <radius>
  }
  &.pinned-to-top {
    right: 0px;
    height: 45vh;
    width: 100%;
    @include desktop {
      left: $sidemenu-width; /* when sidemenu is shown, as in App.vue */
    }
  }
  &.pinned-to-right {
    right: 0px;
    height: calc(100vh - #{$navbar-height});
    width: 30vw;
  }
}

/**
 * Fullscreen mode *with* elevation profile
 * Without the elevation profile it's the map-view
 * element that goes into fullscreen mode, so the
 * rule doesn't apply
 */
:fullscreen .map-container {
  height: 100%;
  max-height: 100%;
  margin: 0;

  &.with-elevation-profile {
    height: 70%;
    max-height: calc(100% - 200px);
    min-height: calc(100% - 350px);
  }
}

// V3 mobile full-viewport overlay (Sixte's "carte en grand" use case).
// Replaces the legacy half-screen pin-to-top that rendered as a white
// block because the body-padding trick is no-op under the V3 shell.
.map-container.mobile-fullscreen {
  position: fixed !important;
  top: 0 !important;
  left: 0 !important;
  right: 0 !important;
  bottom: 0 !important;
  width: 100% !important;
  height: 100% !important;
  margin: 0 !important;
  z-index: 50; // above MobileTopBar (26) and BottomNav (28)
  background: #000;
}

.map-mobile-close {
  position: absolute;
  top: calc(0.6rem + env(safe-area-inset-top));
  right: 0.6rem;
  z-index: 60;
  width: 44px;
  height: 44px;
  border: none;
  border-radius: 50%;
  background: white;
  color: #4a4a4a;
  font-size: 1.05rem;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;

  &:hover, &:focus { background: #f0f4f8; outline: none; }
}
</style>
