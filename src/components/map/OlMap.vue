<template>
  <div style="width: 100%; height: 100%">
    <div ref="map" style="width: 100%; height: 100%" @click="showLayerSwitcher = false" />

    <div
      ref="layerSwitcherButton"
      class="ol-control ol-control-layer-switcher-button"
      :title="$gettext('Layers', 'Map controls')"
    >
      <button @click.stop="showLayerSwitcher = !showLayerSwitcher">
        <fa-icon icon="layer-group" />
      </button>
    </div>

    <!-- V3 mobile quick-toggle for the 3 most-used base layers. Visible
         only on small screens (the full layer switcher panel covers most
         of the map there and is overkill for a quick OTM↔IGN↔Sat
         change). Each button toggles the corresponding layer in
         mapLayers — same `visibleLayer` setter the full panel uses. -->
    <div
      v-if="quickLayers.length"
      class="ol-control ol-control-quick-layers is-hidden-tablet"
      :aria-label="$gettext('Choisir une couche de carte')"
    >
      <button
        v-for="entry in quickLayers"
        :key="entry.layer.get('title')"
        type="button"
        :class="{ 'is-active': entry.layer === visibleLayer }"
        :title="entry.layer.get('title')"
        @click="visibleLayer = entry.layer"
      >
        {{ entry.label }}
      </button>
    </div>

    <div
      v-show="showPinToTopButton && !isFullscreen"
      ref="togglePinToTopButton"
      class="ol-control ol-control-pin-to-top"
      :title="$gettext('Pin the map to a side of the screen')"
    >
      <button @click.stop="$emit('pin-to-top-clicked')">
        <fa-icon icon="fa-regular fa-window-maximize" />
      </button>
    </div>

    <div v-show="showLayerSwitcher" ref="layerSwitcher" class="ol-control ol-control-layer-switcher" @click.stop="">
      <div class="ol-control-layer-switcher-layers">
        <header v-translate>Base layer</header>
        <div class="layer-group">
          <layer-button
            v-for="layer of mapLayers"
            :key="layer.get('title')"
            @click="visibleLayer = layer"
            :selected="layer === visibleLayer"
            :layer="layer"
            title-context="Map layer"
          ></layer-button>
        </div>
        <header v-translate>Slopes</header>
        <div class="layer-group">
          <layer-button
            v-for="layer of dataLayers"
            :key="layer.get('title')"
            @click="toogleMapLayer(layer)"
            :selected="layer.getVisible()"
            :layer="layer"
            title-context="Map slopes layer"
          ></layer-button>
        </div>
        <template v-if="showProtectionAreas && !editable">
          <header v-translate>Protection areas</header>
          <!-- $gettext('Fauna protection areas') -->
          <div class="layer-group">
            <layer-button
              @click="toggleProtectionAreas"
              :selected="protectionAreasVisible"
              :layer="{
                title: 'Fauna protection areas',
                image: 'fauna.jpg',
                set(name, value) {
                  protectionAreasLayerSet(name, value);
                },
                get(name) {
                  return protectionAreasLayerGet(name);
                },
              }"
            ></layer-button>
          </div>
        </template>
      </div>
      <div class="ol-control-layer-switcher-close" @click.stop="showLayerSwitcher = !showLayerSwitcher">
        <fa-icon :title="$gettext('Close')" icon="chevron-left" />
      </div>
    </div>

    <div
      v-show="showCenterOnGeolocation"
      ref="centerOnGeolocation"
      :title="
        geolocationActive ? $gettext('Hide your current position') : $gettext('Show your current position on the map')
      "
      class="ol-control ol-control-center-on-geolocation"
      :class="{ 'is-active': geolocationActive }"
    >
      <button @click="toggleGeolocationTracking">
        <fa-icon :icon="geolocationActive ? 'location-crosshairs' : 'bullseye'" />
      </button>
    </div>

    <div
      v-show="showCenterOnGeolocation && geolocationActive"
      ref="compassControl"
      :title="compassActive ? $gettext('Hide heading arrow') : $gettext('Show compass heading')"
      class="ol-control ol-control-compass"
      :class="{ 'is-active': compassActive }"
    >
      <button @click="toggleCompass">
        <fa-icon icon="compass" />
      </button>
    </div>

    <div v-show="showFilterControl" ref="useMapAsFilter" class="ol-control ol-control-use-map-as-filter">
      <input
        id="filter-documents-with-map"
        class="switch is-rtl is-rounded is-info is-small"
        type="checkbox"
        v-model="filterDocumentsWithMap"
      />
      <label
        for="filter-documents-with-map"
        v-translate
        :title="filterDocumentsWithMap ? $gettext('Map filter on') : $gettext('Map filter off')"
      >
        Filter on map extent
      </label>
    </div>

    <div
      v-show="showRecenterOn"
      ref="recenterOnControl"
      class="ol-control ol-control-recenter-on"
      :class="{ 'ol-control-recenter-on_on-top': !showFilterControl }"
    >
      <input
        type="text"
        ref="recenterOnPropositionsInput"
        :placeholder="$gettext('Recenter on...')"
        @input="searchRecenterOnPropositions"
        @focus="searchRecenterOnPropositions"
        @blur="clearRecenterOnPropositions"
      />
    </div>

    <div
      v-show="showRecenterOnPropositions"
      ref="recenterOnPropositions"
      class="ol-control ol-control-recenter-on-propositions"
      :class="{ 'ol-control-recenter-on-propositions_on-top': !showFilterControl }"
    >
      <ul v-if="recenterPropositions?.data?.features">
        <li v-for="(item, i) of recenterPropositions.data.features" :key="i" @click="recenterOn(item)">
          {{ item.properties.name }},
          <small>
            <template v-if="item.properties.state">{{ item.properties.state }}, </template>{{ item.properties.country }}
          </small>
        </li>
      </ul>
      <div v-else v-translate>Loading...</div>
    </div>

    <div v-show="editable" ref="resetGeometry" class="ol-control ol-control-reset-geometry">
      <button @click="resetGeometry" v-translate>Reset geometry</button>
    </div>

    <div v-show="editable" ref="clearGeometry" class="ol-control ol-control-clear-geometry">
      <button @click="clearGeometry" v-translate>Clear</button>
    </div>

    <div v-show="osmLayer" ref="editMap" class="ol-control ol-control-edit-map">
      <a :href="editMapLink" :title="$gettext('Edit and improve map on Openstreetmap.org')"><fa-icon icon="pen" /></a>
    </div>

    <biodiv-information v-if="protectionAreasVisible" ref="BiodivInformation" :data="biodivData" />

    <swiss-protection-area-information
      v-if="protectionAreasVisible"
      ref="SwissProtectionAreaInformation"
      :data="swissProtectionAreaData"
    />
  </div>
</template>

<script>
import { toast } from 'bulma-toast';

import BiodivInformation from './BiodivInformation';
import LayerButton from './LayerButton';
import SwissProtectionAreaInformation from './SwissProtectionAreaInformation';
import { cartoLayers, dataLayers, protectionAreasLayers } from './map-layers';
import {
  buildDiffStyle,
  buildPolygonStyle,
  geoJSONFormat,
  getDocumentLineStyle,
  getDocumentPointStyle,
  getDocumentPolygonStyle,
  getElevationProfileMarkerStyle,
  isFiniteExtent,
  swissExtent,
} from './map-utils';

import biodivSportsService from '@/js/apis/biodivsports-service';
import c2c from '@/js/apis/c2c';
import photon from '@/js/apis/photon';
import respecterCestProtegerService from '@/js/apis/respectercestproteger-service';
import { FIT } from '@/js/fit/FIT';
import ol from '@/js/libs/ol';
import { TCX } from '@/js/tcx/TCX';

const DEFAULT_EXTENT = [-400000, 5200000, 1200000, 6000000];
const DEFAULT_POINT_ZOOM = 14;
const MAX_ZOOM = 19;
const TRACKING_INITIAL_ZOOM = 13;

const isNotVirtual = (waypoint) => waypoint.waypoint_type !== 'virtual';

export default {
  components: {
    BiodivInformation,
    LayerButton,
    SwissProtectionAreaInformation,
  },

  props: {
    documents: {
      type: Array,
      default: null,
    },

    showFilterControl: {
      type: Boolean,
      default: false,
    },

    showRecenterOn: {
      type: Boolean,
      default: false,
    },

    showCenterOnGeolocation: {
      type: Boolean,
      default: false,
    },

    showProtectionAreas: {
      type: Boolean,
      default: false,
    },

    biodivSportsActivities: {
      type: Array,
      default: null,
    },

    geomDetailEditable: {
      type: Boolean,
      default: false,
    },

    editedDocument: {
      type: Object,
      default: null,
    },

    oldDocument: {
      type: Object,
      default: null,
    },

    newDocument: {
      type: Object,
      default: null,
    },

    highlightedDocument: {
      type: Object,
      default: null,
    },

    initialExtent: {
      type: Array,
      default: null,
    },

    fullScreenElementId: {
      type: String,
      default: null,
    },

    showPinToTopButton: {
      type: Boolean,
      default: false,
    },

    openInNewTab: {
      type: Boolean,
      default: false,
    },
  },

  data() {
    let cartoLayers_ = cartoLayers();
    let dataLayers_ = dataLayers();

    // swiss topo only for logged users
    if (!this.$user.isLogged) {
      cartoLayers_ = cartoLayers_.filter((layer) => !layer.get('restricted'));
      dataLayers_ = dataLayers_.filter((layer) => !layer.get('restricted'));
    }

    return {
      // map layers, only one of them is visible
      mapLayers: cartoLayers_,

      // slope layers
      dataLayers: dataLayers_,

      // protection areas layer as features
      protectionAreasLayer: new ol.layer.Vector({
        source: new ol.source.Vector(),
      }),

      // protection areas layers
      protectionAreasLayers: protectionAreasLayers(),

      // layer for document icons and paths
      documentsLayer: new ol.layer.Vector({
        source: new ol.source.Vector(),
      }),

      // layer edited document
      editionLayer: new ol.layer.Vector({
        source: new ol.source.Vector(),
      }),

      // layer for associated waypoints
      waypointsLayer: new ol.layer.Vector({
        source: new ol.source.Vector(),
      }),

      // layer for associated images
      imagesLayer: new ol.layer.Vector({
        source: new ol.source.Vector(),
      }),

      // layer for displaying the elevation profile current point
      elevationProfileLayer: new ol.layer.Vector({
        source: new ol.source.Vector(),
      }),

      isFullscreen: false,

      geolocation: null,
      geolocationActive: false,
      positionFeature: new ol.Feature(),
      accuracyFeature: new ol.Feature(),
      geolocationLayer: new ol.layer.Vector({
        source: new ol.source.Vector(),
        zIndex: 1000,
      }),

      compassActive: false,
      currentHeadingDeg: 0,
      orientationHandler: null,

      showLayerSwitcher: false,

      filterDocumentsWithMap: Boolean(this.$route.query.bbox),

      recenterPropositions: null,
      showRecenterOnPropositions: false,

      biodivData: {},
      swissProtectionAreaData: { properties: {} },
      protectionAreasVisible: this.showProtectionAreas && !this.editedDocument,
      hasProtectionAreas: null,

      // on editable mode, there a button reset
      // we must save initial geometry
      initialGeometry: null,

      highlightedFeature: null,

      minZoomLevel: DEFAULT_POINT_ZOOM,

      editMapLink: null,
    };
  },

  computed: {
    editable() {
      return !!this.editedDocument;
    },

    urlValue: {
      get() {
        const result = this.$route.query.bbox;
        return result
          ? result
              .replace('%252C', ',')
              .split(',')
              .map((num) => parseInt(num, 10))
          : undefined;
      },
    },

    view() {
      return this.map.getView();
    },

    visibleLayer: {
      get() {
        return this.mapLayers.find((layer) => layer.getVisible() === true);
      },
      set(layer) {
        this.visibleLayer.setVisible(false);
        layer.setVisible(true);
      },
    },

    // V3 quick-toggle (mobile): pick the three most useful base layers
    // for the c2c audience by title. Falls back to whatever's available
    // — if a layer was removed via cartoLayers_.filter('restricted'),
    // the entry is just dropped silently.
    quickLayers() {
      if (!this.mapLayers) return [];
      const wanted = [
        { title: 'OpenTopoMap', label: 'OTM' },
        { title: 'IGN maps', label: 'IGN' },
        { title: 'ESRI World Imagery', label: 'Sat' },
      ];
      return wanted
        .map((w) => {
          const layer = this.mapLayers.find((l) => l.get('title') === w.title);
          return layer ? { layer, label: w.label } : null;
        })
        .filter(Boolean);
    },

    osmLayer() {
      return this.visibleLayer.get('title') === 'OpenTopoMap';
    },
  },

  watch: {
    documents: 'drawDocumentMarkers',
    'editedDocument.condition_rating': 'drawDocumentMarkers',
    'editedDocument.waypoint_type': 'drawDocumentMarkers',

    // if, for any reason, geometry of edited document is set, center map on it
    // * new value entered in text inputs
    // * first click
    // * new association to route (geometry is copied from route to outing in this case)
    'editedDocument.geometry.geom': {
      handler(to, from) {
        if (from === null && to !== null) {
          this.setDrawInteraction(); // reset interaction mode
        }
      },
    },

    filterDocumentsWithMap: 'sendBoundsToUrl',

    highlightedDocument(newValue) {
      if (newValue) {
        this.setHighlightedFeature(this.documentsLayer.getSource().getFeatureById(newValue.document_id));
      } else {
        this.setHighlightedFeature(null);
      }
    },

    fullScreenElementId(newValue) {
      // update the fullscreen control (we actually need to remove the old
      // one and attach a new one)
      this.map.removeControl(this.fullScreenControl);
      this.fullScreenControl = this.createFullScreenController(newValue || this.$el);
      this.map.addControl(this.fullScreenControl);
    },
  },

  mounted() {
    // if we have an elevation profile, it will be displayed over the map
    // else, we directly use the map element for fullscreen
    this.fullScreenControl = this.createFullScreenController(this.fullScreenElementId || this.$el);

    this.map = new ol.Map({
      target: this.$refs.map,

      controls: [
        this.fullScreenControl,
        new ol.control.Zoom({
          zoomInTipLabel: this.$gettext('Zoom in', 'Map controls'),
          zoomOutTipLabel: this.$gettext('Zoom out', 'Map controls'),
        }),
        new ol.control.ScaleLine(),
        new ol.control.Control({ element: this.$refs.togglePinToTopButton }),
        new ol.control.Control({ element: this.$refs.layerSwitcherButton }),
        new ol.control.Control({ element: this.$refs.layerSwitcher }),
        new ol.control.Control({ element: this.$refs.useMapAsFilter }),
        new ol.control.Control({ element: this.$refs.centerOnGeolocation }),
        new ol.control.Control({ element: this.$refs.compassControl }),
        new ol.control.Control({ element: this.$refs.recenterOnControl }),
        new ol.control.Control({ element: this.$refs.recenterOnPropositions }),
        new ol.control.Control({ element: this.$refs.resetGeometry }),
        new ol.control.Control({ element: this.$refs.clearGeometry }),
        new ol.control.Control({ element: this.$refs.editMap }),
        new ol.control.Attribution({ tipLabel: this.$gettext('Attributions', 'Map controls') }),
      ],

      layers: [
        ...this.mapLayers,
        ...this.dataLayers,
        ...this.protectionAreasLayers,
        this.protectionAreasLayer,
        this.imagesLayer, // images icons will be under documents
        this.documentsLayer,
        this.waypointsLayer, // keep waypoint above trace and documents
        this.elevationProfileLayer,
        this.editionLayer,
        this.geolocationLayer, // user position dot stays on top
      ],

      view: new ol.View({
        maxZoom: MAX_ZOOM,
      }),

      loadTilesWhileAnimating: true,
      loadTilesWhileInteracting: true,

      // pixelRatio: this.pixelRatio,
      // renderer: this.renderer,
      // keyboardEventTarget: this.keyboardEventTarget,
    });

    this.map.on('moveend', this.sendBoundsToUrl);
    this.map.on('moveend', this.getProtectionAreas);
    this.map.on('moveend', this.updateEditMapLink);
    this.map.on('moveend', this.emitMoveEvent);

    if (this.protectionAreasVisible) {
      this.protectionAreasLayers.forEach((layer) => layer.setVisible(true));
    }

    this.geolocation = new ol.Geolocation({
      trackingOptions: {
        enableHighAccuracy: true,
      },

      projection: this.view.getProjection(),
    });

    this.refreshPositionStyle();

    this.accuracyFeature.setStyle(
      new ol.style.Style({
        fill: new ol.style.Fill({ color: 'rgba(29, 114, 255, 0.12)' }),
        stroke: new ol.style.Stroke({ color: 'rgba(29, 114, 255, 0.45)', width: 1 }),
      })
    );

    this.geolocation.on('change:position', this.handleGeolocationChange);
    this.geolocation.on('change:accuracyGeometry', this.handleGeolocationAccuracyChange);
    this.geolocation.on('error', this.handleGeolocationError);

    this.drawDocumentMarkers();

    if (this.urlValue) {
      this.view.fit(this.urlValue, { size: this.map.getSize() });
    } else if (this.initialExtent) {
      this.fit(this.initialExtent);
    } else {
      this.fitMapToDocuments(true);
    }

    if (this.editable) {
      // deep clone : https://stackoverflow.com/questions/122102/what-is-the-most-efficient-way-to-deep-clone-an-object-in-javascript
      this.initialGeometry = JSON.parse(JSON.stringify(this.editedDocument.geometry));

      this.setModifyInteractions();
      this.setDrawInteraction();
      this.setDragAndDropInteraction();
    } else {
      // if map is not editable, feature are clickable
      this.map.on('pointermove', this.onPointerMove);
      this.map.on('click', this.onClick);
    }

    // listen to elevation profile events to display
    // the related point on the map
    this.setElevationProfileInteraction();

    this.updateEditMapLink();
  },

  beforeDestroy() {
    this.fullScreenControl.un('enterfullscreen', this.onFullscreenChange);
    this.fullScreenControl.un('leavefullscreen', this.onFullscreenChange);
    if (this.geolocation) {
      this.geolocation.setTracking(false);
    }
    if (this.compassActive) {
      this.disableCompass();
    }
  },

  methods: {
    createFullScreenController(source) {
      const control = new ol.control.FullScreen({
        source,
        tipLabel: this.$gettext('Toggle full-screen', 'Map Controls'),
      });
      control.on('enterfullscreen', this.onFullscreenChange);
      control.on('leavefullscreen', this.onFullscreenChange);
      return control;
    },

    onFullscreenChange() {
      this.isFullscreen = !this.isFullscreen;
      this.showLayerSwitcher = false;
      this.fitMapToDocuments();
    },

    setModifyInteractions() {
      const source = this.editionLayer.getSource();
      const modify = new ol.interaction.Modify({ source });

      this.map.addInteraction(modify);
      this.map.addInteraction(new ol.interaction.Snap({ source }));

      modify.on('modifyend', (event) => {
        for (const feature of event.features.getArray()) {
          this.setDocumentGeometry(feature.get('geometry'));
        }
      });
    },

    setDrawInteraction() {
      const source = this.editionLayer.getSource();

      if (this.drawInteraction) {
        this.map.removeInteraction(this.drawInteraction);
      }

      this.drawInteraction = null;

      // sometimes, geom may not be set on edited documents
      this.editedDocument.geometry = this.editedDocument.geometry ?? {};

      if (!this.editedDocument.geometry.geom) {
        // the point is not set
        if (this.editedDocument.type !== 'o') {
          // do not let user set the point for outings
          this.drawInteraction = new ol.interaction.Draw({
            source,
            type: 'Point',
          });
        }
      } else if (this.geomDetailEditable && !this.editedDocument.geometry.geom_detail) {
        this.drawInteraction = new ol.interaction.Draw({
          source,
          type: 'LineString',
        });
      }

      if (this.drawInteraction) {
        this.map.addInteraction(this.drawInteraction);

        this.drawInteraction.on('drawend', (event) => {
          this.setDocumentGeometryFromFeature(event.feature);
        });
      }
    },

    setDragAndDropInteraction() {
      // handle use case when user drag&drop a gpx/kml/fit/tcx file on map
      const dragAndDrop = new ol.interaction.DragAndDrop({
        formatConstructors: [ol.format.GPX, ol.format.KML, FIT, TCX],
      });

      dragAndDrop.on(
        'addfeatures',
        function (event) {
          event.features.map((feature) => {
            if (document.type !== 'o') {
              this.cleanZeroElevationFromGeoFileFeature(feature);
            }
            return this.setDocumentGeometryFromFeature(feature);
          });
        }.bind(this)
      );

      this.map.addInteraction(dragAndDrop);
    },

    tryReadFeaturesFromGeoFile(file, format, options) {
      try {
        return format.readFeatures(file, options);
      } catch (e) {
        return null;
      }
    },

    cleanZeroElevationFromGeoFileFeature(feature) {
      // GPS often have a bad elevation (0) for some of the points
      // We do a simple algorithm to prevent most of these cases
      // by applying the elevation of the nearest 'good' coordinate to the
      // 'faulty' coordinates if they are not too far away
      const geometry = feature.get('geometry');
      const type = geometry.getType();
      const coords = geometry.getCoordinates();

      if (type === 'LineString') {
        this.cleanZeroElevationFromLineString(coords);
      } else if (type === 'MultiLineString') {
        coords.forEach(this.cleanZeroElevationFromLineString);
      }
      geometry.setCoordinates(coords);
    },

    cleanZeroElevationFromLineString(coords) {
      const findIndex = (array, callback, start) => {
        const index = array.slice(start).findIndex(callback);
        return index === -1 ? -1 : index + start;
      };
      const findIndexBackwards = (array, callback, start) => {
        const index = findIndex(array.slice().reverse(), callback, array.length - 1 - start);
        return index > 0 ? array.length - 1 - index : index;
      };
      const isElevationOk = (coord) => coord.length > 2 && coord[2] !== 0;
      // Since we use EPSG:3857, we can easily compute the approximated distance
      const distance = (c, i, j) => Math.sqrt((c[i][0] - c[j][0]) ** 2 + (c[i][1] - c[j][1]) ** 2);

      if (!coords.some(isElevationOk)) {
        return;
      }

      let badIndex = 0;
      while ((badIndex = findIndex(coords, (coord) => !isElevationOk(coord), badIndex)) !== -1) {
        // Get the distance between the point without elevation, and the nearest point with elevation
        // If it's less than 100m, we can consider that it's elevation is the same
        const goodIndexFw = findIndex(coords, isElevationOk, badIndex);
        const goodIndexBw = findIndexBackwards(coords, isElevationOk, badIndex);
        const distanceFw = goodIndexFw !== -1 ? distance(coords, badIndex, goodIndexFw) : Infinity;
        const distanceBw = goodIndexBw !== -1 ? distance(coords, badIndex, goodIndexBw) : Infinity;

        if (distanceFw > 100 && distanceBw > 100) {
          badIndex++;
          break;
        }

        coords[badIndex][2] = coords[distanceFw < distanceBw ? goodIndexFw : goodIndexBw][2];
        badIndex++;
      }
    },

    setDocumentGeometryFromGeoFile(file) {
      for (const format of [new ol.format.GPX(), new ol.format.KML(), new ol.format.GeoJSON(), new FIT(), new TCX()]) {
        const features = this.tryReadFeaturesFromGeoFile(file, format, { featureProjection: 'EPSG:3857' });
        if (features?.length) {
          features.map((feature) => {
            if (document.type !== 'o') {
              this.cleanZeroElevationFromGeoFileFeature(feature);
            }
            return this.setDocumentGeometryFromFeature(feature);
          });
          return;
        }
      }
      toast({
        message: this.$gettext('No data could be extracted from GPS file'),
        type: 'is-danger',
      });
    },

    setDocumentGeometryFromFeature(feature) {
      const geometry = feature.get('geometry');
      this.setDocumentGeometry(geometry);
      this.drawDocumentMarkers();
      this.setDrawInteraction();
      this.setOutingStartDate(this.editedDocument, geometry);
    },

    setOutingStartDate(document, geometry) {
      if (document.type !== 'o' || document.date_start) {
        return;
      }

      const firstCoordinate = geometry.getFirstCoordinate();
      let timestamp;
      switch (geometry.getLayout()) {
        case 'XYZM':
          timestamp = firstCoordinate[3];
          break;
        case 'XYM':
          timestamp = firstCoordinate[2];
          break;
        default:
          return;
      }

      if (!timestamp) {
        return;
      }

      document.date_start = this.$dateUtils.toLocalizedString(new Date(timestamp * 1000), 'YYYY-MM-DD');
    },

    setElevationProfileInteraction() {
      this.elevationProfileLayer.setVisible(false);
      const elevationProfileSource = this.elevationProfileLayer.getSource();
      const elevationProfileMarker = new ol.Feature();
      elevationProfileMarker.setStyle(getElevationProfileMarkerStyle());
      elevationProfileSource.addFeature(elevationProfileMarker);
      this.$root.$on('elevation_profile', (event, coord) => {
        switch (event) {
          case 'cursor_end':
            this.elevationProfileLayer.setVisible(false);
            break;
          case 'cursor_move':
            this.elevationProfileLayer.setVisible(true);
            elevationProfileMarker.setGeometry(new ol.geom.Point(coord));
            const visible = ol.extent.containsXY(this.view.calculateExtent(), coord[0], coord[1]);
            if (!visible) {
              this.view.animate({
                center: coord,
                duration: 300,
              });
            }
            break;
          case 'toggle_fullscreen':
            setTimeout(() => this.map.updateSize(), 0);
        }
      });
    },

    setDocumentGeometry(geometry) {
      const document = this.editedDocument;
      const geoJsonGeometry = geoJSONFormat.writeGeometryObject(geometry);

      const change = (newGeometry) => {
        if (newGeometry.geom) {
          document.geometry.geom = newGeometry.geom;
        }

        if (newGeometry.geom_detail) {
          document.geometry.geom_detail = newGeometry.geom_detail;
        }
      };

      if (geoJsonGeometry.type === 'Point') {
        // remove elevation and timestamp
        geoJsonGeometry.coordinates = geoJsonGeometry.coordinates.slice(0, 2);
        change({ geom: JSON.stringify(geoJsonGeometry) });
      } else if (geoJsonGeometry.type === 'LineString' || geoJsonGeometry.type === 'MultiLineString') {
        if (document.type === 'a') {
          // areas need a polygon, let's change the path, check that first and last points are the same
          geoJsonGeometry.type = 'Polygon';
          const firstPoint = JSON.stringify(geoJsonGeometry.coordinates[0][0]);
          const lastPoint = JSON.stringify(geoJsonGeometry.coordinates[0][geoJsonGeometry.coordinates[0].length - 1]);

          if (firstPoint !== lastPoint) {
            // close the loop
            geoJsonGeometry.coordinates[0].push(geoJsonGeometry.coordinates[0][0]);
          }
        }

        change({ geom_detail: JSON.stringify(geoJsonGeometry) });

        if (!document.geometry.geom) {
          const mainLine = geometry.getType() === 'MultiLineString' ? geometry.getLineString(0) : geometry;
          this.setDocumentGeometry(new ol.geom.Point(mainLine.getCoordinateAt(0.5)));
        }
      } else if (geoJsonGeometry.type === 'Polygon' || geoJsonGeometry.type === 'MultiPolygon') {
        // areas
        change({ geom_detail: JSON.stringify(geoJsonGeometry) });
      } else {
        throw new Error(`Unexpected geometry type : ${geometry.type}`);
      }
    },

    drawDocumentMarkers() {
      const editionSource = this.editionLayer.getSource();
      const documentsSource = this.documentsLayer.getSource();
      const waypointsSource = this.waypointsLayer.getSource();
      const imagesSource = this.imagesLayer.getSource();

      editionSource.clear();
      documentsSource.clear();
      waypointsSource.clear();
      imagesSource.clear();

      this.addDocumentFeature(this.oldDocument, documentsSource, buildDiffStyle(true));
      this.addDocumentFeature(this.newDocument, documentsSource, buildDiffStyle(false));

      this.addDocumentFeature(this.editedDocument, editionSource);

      for (const document of this.documents ?? []) {
        this.addDocumentFeature(document, documentsSource);

        if (document.associations) {
          for (const waypoint of document.associations.waypoints?.filter(isNotVirtual) ?? []) {
            this.addDocumentFeature(waypoint, waypointsSource);
          }
          for (const waypoint of document.associations.waypoint_children?.filter(isNotVirtual) ?? []) {
            this.addDocumentFeature(waypoint, waypointsSource);
          }

          // show associated images only for outings
          if (document.type === 'o') {
            for (const image of document.associations.images ?? []) {
              if (!this.$documentUtils.hasSameGeolocation(image, document)) {
                // show image marker only if it's geolocation is different from document
                this.addDocumentFeature(image, imagesSource);
              }
            }
          }
        }
      }
    },

    addDocumentFeature(document, source, style) {
      if (!document?.geometry) {
        return;
      }

      const title = this.$documentUtils.getDocumentTitle(document);

      // special case for documents of type areas, we want a filled polygon.
      if (document.type === 'a') {
        if (document.geometry.geom_detail) {
          this.addFeature(
            source,
            JSON.parse(document.geometry.geom_detail),
            style ?? getDocumentPolygonStyle(title, false, document.properties),
            style ? null : getDocumentPolygonStyle(title, true, document.properties)
          ).set('document', document);
        }
      } else {
        if (document.geometry.geom) {
          const feature = this.addFeature(
            source,
            JSON.parse(document.geometry.geom),
            style ?? getDocumentPointStyle(document, title, false),
            style ? null : getDocumentPointStyle(document, title, true)
          );

          feature.set('document', document);
          feature.setId(document.document_id);
        }
        if (document.geometry.geom_detail) {
          this.addFeature(
            source,
            JSON.parse(document.geometry.geom_detail),
            style ?? getDocumentLineStyle(title, false, document.properties),
            style ? null : getDocumentLineStyle(title, true, document.properties)
          ).set('document', document);
        }
      }
    },

    addFeature(source, data, normalStyle, highlightedStyle) {
      if (!data) {
        return;
      }

      const feature = geoJSONFormat.readFeature(data);

      feature.set('normalStyle', normalStyle);

      if (highlightedStyle) {
        feature.set('highlightedStyle', highlightedStyle);
      }

      feature.setStyle(normalStyle);
      source.addFeature(feature);

      return feature;
    },

    addBiodivSportsData(response) {
      const results = response?.data?.results;
      if (!results.length) {
        return;
      }

      const source = this.protectionAreasLayer.getSource();

      for (const result of results) {
        const geometry = geoJSONFormat.readGeometry(result.geometry, {
          dataProjection: 'EPSG:4326',
          featureProjection: 'EPSG:3857',
        });

        const feature = new ol.Feature({
          geometry,
          id: result.id,
          biodivData: {
            source: 'biodivsports',
            title: result.name,
            description: result.description,
            infoUrl: result.info_url,
            kmlUrl: result.kml_url,
            period: result.period,
          },
        });

        feature.setId('biodiv_' + result.id);

        feature.set('normalStyle', buildPolygonStyle());
        feature.setStyle(feature.get('normalStyle'));

        source.addFeature(feature);
      }
    },

    toggleProtectionAreas() {
      this.protectionAreasVisible = !this.protectionAreasVisible;
      this.protectionAreasLayers.forEach((layer) => layer.setVisible(!layer.getVisible()));
      this.protectionAreasLayer.setVisible(!this.protectionAreasLayer.getVisible());
    },

    protectionAreasLayerSet(name, value) {
      if (name === 'opacity') {
        this.protectionAreasLayers.forEach((layer) => layer.setOpacity(value));
        this.protectionAreasLayer.getSource().forEachFeature((feature) => {
          feature.set('normalStyle', buildPolygonStyle(value));
          feature.setStyle(feature.get('normalStyle'));
        });
      }
    },

    protectionAreasLayerGet(name) {
      switch (name) {
        case 'opacity':
          return this.protectionAreasLayers[0].getOpacity();
        case 'configurable':
          return true;
      }
    },

    emitMoveEvent() {
      const bounds = this.view.calculateExtent();
      this.$emit('move', bounds.map(Math.round));
    },

    // If user want's to filter with map, it will send extent to url
    // otherwise, it set bbox url to undefined
    sendBoundsToUrl() {
      const bounds = this.view.calculateExtent();
      const query = Object.assign({}, this.$route.query);

      query.bbox = this.filterDocumentsWithMap ? bounds.map(Math.round).join(',') : undefined;
      if (query.bbox !== this.$route.query.bbox && !this.$route.name.endsWith('-print')) {
        this.$router.push({ query });
      }
    },

    fit(extent) {
      this.view.fit(extent, { size: this.map.getSize() });

      // slightly increase the extent, for more comfort
      let zoom = this.view.getZoom() * 0.95;

      // and set a minimum zoom level
      zoom = Math.min(this.minZoomLevel, zoom);

      this.view.setZoom(zoom);

      return this.view.calculateExtent().map(Math.round);
    },

    async fitMapToDocuments(force) {
      if ((this.filterDocumentsWithMap || this.editable) && !force) {
        return this.view.calculateExtent().map(Math.round);
      }

      this.drawDocumentMarkers();

      let extent = ol.extent.createEmpty();

      for (const layer of [this.editionLayer, this.documentsLayer, this.waypointsLayer]) {
        ol.extent.extend(extent, layer.getSource().getExtent());
      }

      if (!isFiniteExtent(extent)) {
        const a = this.$route.query.a;
        // compute extent for area(s)
        if (a) {
          const areas = await Promise.all(
            (Array.isArray(a) ? a.map((area) => area.toString()) : a.toString().split(',')).map(
              async (area) => await c2c.area.get(area)
            )
          );
          extent = areas
            .flatMap((response) => {
              const geometry = geoJSONFormat.readGeometry(JSON.parse(response.data.geometry.geom_detail));
              const type = geometry.getType();
              if (type === 'Polygon') {
                return [geometry];
              } else if (type === 'MultiPolygon') {
                return geometry.getPolygons();
              }
              return [];
            })
            .flatMap((polygon) => polygon.getCoordinates())
            .map((coords) => ol.extent.boundingExtent(coords))
            .reduce((acc, ext) => ol.extent.extend(acc, ext));
        }

        // add extent for waypoint
        const w = this.$route.query.w;
        if (w) {
          const waypoints = await Promise.all(
            (Array.isArray(w) ? w.map((wpt) => wpt.toString()) : w.toString().split(',')).map(
              async (wpt) => await c2c.waypoint.get(wpt)
            )
          );
          extent = waypoints
            .map((response) => response.data.geometry?.geom)
            .filter((geom) => !!geom)
            .map((geom) => geoJSONFormat.readFeatures(geom)[0])
            .map((point) => ol.extent.buffer(point.getGeometry().getExtent(), 10000))
            .reduce(
              (acc, ext) => ol.extent.extend(acc, ext),
              isFiniteExtent(extent) ? extent : ol.extent.createEmpty()
            );
        }

        if (!isFiniteExtent(extent)) {
          // if there is infinity, default extent
          // TODO need to be current extent if it exists ...
          extent = DEFAULT_EXTENT;
        }
      }

      return this.fit(extent);
    },

    toogleMapLayer(layer) {
      layer.setVisible(!layer.getVisible());
    },

    getExtent(projection) {
      let extent = this.view.calculateExtent(this.map.getSize() || null);
      if (projection) {
        extent = ol.proj.transformExtent(extent, ol.proj.get('EPSG:3857'), ol.proj.get(projection));
      }
      return extent;
    },

    onPointerMove(event) {
      let resultFeature = null;

      this.map.forEachFeatureAtPixel(event.pixel, function (feature) {
        resultFeature = feature;
        return true;
      });
      this.setHighlightedFeature(resultFeature);
      this.$emit('highlight-document', resultFeature ? resultFeature.get('document') : null);
    },

    setHighlightedFeature(feature) {
      if (feature === this.highlightedFeature) {
        return;
      }

      if (this.highlightedFeature) {
        this.highlightedFeature.setStyle(this.highlightedFeature.get('normalStyle'));
      }

      this.highlightedFeature = feature;

      if (feature && feature.get('highlightedStyle')) {
        feature.setStyle(feature.get('highlightedStyle'));
      }
    },

    intersectsWithSwitzerland(extent) {
      return ol.extent.intersects(extent, swissExtent);
    },

    onClick(event) {
      const feature = this.map.forEachFeatureAtPixel(event.pixel, (f) => f);

      if (feature) {
        const document = feature.get('document');

        if (
          document &&
          document.properties &&
          document.properties.nonInteractive &&
          document.type === 'w' &&
          document.waypoint_type === 'access'
        ) {
          this.$emit('waypoint-clicked', document);
          return;
        }

        if (document && document.properties && document.properties.nonInteractive) {
          return;
        }

        if (document && document.type === 'z') {
          this.$emit('waypoint-clicked', document);
          return;
        }
        if (document && document.type === 's') {
          this.$emit('stop-clicked', document.document_id);
          return;
        }
        if (document) {
          if (this.documents.length === 1 && document.document_id === this.documents[0].document_id) {
            return;
          }
          if (event.originalEvent.ctrlKey || this.openInNewTab) {
            const href = this.$router.resolve({
              name: this.$documentUtils.getDocumentType(document.type),
              params: { id: document.document_id },
            }).href;
            window.open(location.origin + href, '_blank');
          } else {
            this.$router.push({
              name: this.$documentUtils.getDocumentType(document.type),
              params: { id: document.document_id },
            });
          }
        } else if (feature.get('biodivData')) {
          this.biodivData = feature.get('biodivData');
          this.$refs.BiodivInformation.show();
        }
      } else {
        // handle clicks on enabled layers
        if (this.protectionAreasVisible) {
          const extent = this.view.calculateExtent(this.map.getSize() || null);
          if (!this.intersectsWithSwitzerland(extent)) {
            return;
          }
          respecterCestProtegerService
            .identify(event.coordinate, extent, this.map.getSize()[0], this.map.getSize()[1], this.$language.current)
            .then(({ data }) => {
              if (data.results && data.results.length) {
                // if there are several results, then there must be an area and an allowed path. select area
                this.swissProtectionAreaData =
                  data.results.find((result) => result.geometry.type === 'MultiPolygon') ?? data.results[0];
                this.$refs.SwissProtectionAreaInformation.show();
              }
            });
        }
      }
    },

    refreshPositionStyle() {
      if (this.compassActive) {
        // SVG arrow pointing up; OL rotates it clockwise around the feature.
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
  <path d="M16 4 L25 26 L16 21 L7 26 Z" fill="#1d72ff" stroke="white" stroke-width="2" stroke-linejoin="round"/>
</svg>`;
        const rotation = (this.currentHeadingDeg * Math.PI) / 180;
        this.positionFeature.setStyle(
          new ol.style.Style({
            image: new ol.style.Icon({
              src: 'data:image/svg+xml;utf8,' + encodeURIComponent(svg),
              rotation,
              scale: 1,
              anchor: [0.5, 0.5],
            }),
          })
        );
      } else {
        this.positionFeature.setStyle(
          new ol.style.Style({
            image: new ol.style.Circle({
              radius: 7,
              fill: new ol.style.Fill({ color: '#1d72ff' }),
              stroke: new ol.style.Stroke({ color: '#ffffff', width: 2 }),
            }),
          })
        );
      }
    },

    async toggleCompass() {
      if (this.compassActive) {
        this.disableCompass();
      } else {
        await this.enableCompass();
      }
    },

    async enableCompass() {
      // iOS Safari requires an explicit user-gesture-bound permission request
      // for the DeviceOrientation API. Other platforms allow it transparently.
      if (
        typeof DeviceOrientationEvent !== 'undefined' &&
        typeof DeviceOrientationEvent.requestPermission === 'function'
      ) {
        try {
          const permission = await DeviceOrientationEvent.requestPermission();
          if (permission !== 'granted') {
            return;
          }
        } catch {
          return;
        }
      }
      this.orientationHandler = (event) => {
        let heading;
        if (typeof event.webkitCompassHeading === 'number') {
          // iOS Safari: clockwise from magnetic north, already what we want.
          heading = event.webkitCompassHeading;
        } else if (typeof event.alpha === 'number') {
          // W3C: alpha is counter-clockwise from north.
          heading = 360 - event.alpha;
        } else {
          return;
        }
        this.currentHeadingDeg = heading;
        this.refreshPositionStyle();
      };
      // deviceorientationabsolute is more accurate where supported (Android),
      // deviceorientation is the iOS fallback.
      window.addEventListener('deviceorientationabsolute', this.orientationHandler, true);
      window.addEventListener('deviceorientation', this.orientationHandler, true);
      this.compassActive = true;
      this.refreshPositionStyle();
    },

    disableCompass() {
      if (this.orientationHandler) {
        window.removeEventListener('deviceorientationabsolute', this.orientationHandler, true);
        window.removeEventListener('deviceorientation', this.orientationHandler, true);
        this.orientationHandler = null;
      }
      this.compassActive = false;
      this.refreshPositionStyle();
    },

    activateCenterOnGeolocation() {
      // Backwards-compatible entry point still used by edition views: turn tracking on,
      // recenter once, then stop.
      this.recenterOnFirstFix = true;
      this.geolocation.setTracking(true);
    },

    toggleGeolocationTracking() {
      if (this.geolocationActive) {
        this.stopGeolocationTracking();
      } else {
        this.startGeolocationTracking();
      }
    },

    startGeolocationTracking() {
      this.geolocationActive = true;
      this.recenterOnFirstFix = true;
      const source = this.geolocationLayer.getSource();
      source.clear();
      source.addFeatures([this.accuracyFeature, this.positionFeature]);
      this.geolocation.setTracking(true);
    },

    stopGeolocationTracking() {
      this.geolocationActive = false;
      this.geolocation.setTracking(false);
      this.geolocationLayer.getSource().clear();
      this.positionFeature.setGeometry(null);
      this.accuracyFeature.setGeometry(null);
      // The compass arrow only makes sense while we are showing the position.
      if (this.compassActive) {
        this.disableCompass();
      }
    },

    handleGeolocationChange() {
      const position = this.geolocation.getPosition();
      if (!position) {
        return;
      }
      this.positionFeature.setGeometry(new ol.geom.Point(position));
      if (this.recenterOnFirstFix) {
        this.recenterOnFirstFix = false;
        this.view.setCenter(position);
        if (this.view.getZoom() < TRACKING_INITIAL_ZOOM) {
          this.view.setZoom(TRACKING_INITIAL_ZOOM);
        }
        // Maintain the legacy one-shot behaviour for edition views that opt in
        // via activateCenterOnGeolocation rather than the new toggle.
        if (!this.geolocationActive) {
          this.geolocation.setTracking(false);
        }
      }
    },

    handleGeolocationAccuracyChange() {
      const geometry = this.geolocation.getAccuracyGeometry();
      this.accuracyFeature.setGeometry(geometry || null);
    },

    handleGeolocationError() {
      // Permission denied or position unavailable: turn the marker off cleanly.
      if (this.geolocationActive) {
        this.stopGeolocationTracking();
      }
    },

    setCenterOnGeoLocation() {
      this.handleGeolocationChange();
    },

    searchRecenterOnPropositions(event) {
      const query = event.target.value;

      if (query?.length >= 3) {
        const center = this.view.getCenter();
        const centerWgs84 = ol.proj.toLonLat(center);

        this.recenterPropositions = photon.getPropositions(query, this.$language.current, centerWgs84);
        this.showRecenterOnPropositions = true;
      } else {
        this.showRecenterOnPropositions = false;
      }
    },

    clearRecenterOnPropositions() {
      setTimeout(() => {
        this.showRecenterOnPropositions = false;
        this.$refs.recenterOnPropositionsInput.value = '';
      }, 200);
    },

    // https://github.com/c2corg/v6_ui/blob/c9962a6c3bac0670eab732d563f9f480379f84d1/c2corg_ui/static/js/map/search.js#L194
    recenterOn(item) {
      const feature = geoJSONFormat.readFeature(item);
      let extent = feature.get('extent');
      let coordinates = feature.getGeometry().flatCoordinates;

      if (extent) {
        // convert from W N E S to W S E N if needed
        extent = [extent[0], Math.min(extent[1], extent[3]), extent[2], Math.max(extent[1], extent[3])];
        extent = ol.proj.transformExtent(extent, 'EPSG:4326', 'EPSG:3857');
        this.view.fit(extent, { size: this.map.getSize(), maxZoom: 14 });
      } else {
        coordinates = ol.proj.transform(coordinates, 'EPSG:4326', 'EPSG:3857');
        this.view.setCenter(coordinates);
        this.view.setZoom(16);
      }

      this.showRecenterOnPropositions = false;
    },

    getProtectionAreas() {
      if (!this.protectionAreasVisible) {
        return;
      }

      const extent = this.view.calculateExtent(this.map.getSize() || null);
      // get extent in expected format
      const bsExtent = ol.proj.transformExtent(extent, ol.proj.get('EPSG:3857'), ol.proj.get('EPSG:4326'));

      if (this.hasProtectionAreas !== null) {
        // check already made, only update biodivsport areas features
        biodivSportsService
          .fetchData(bsExtent, this.biodivSportsActivities, this.$language.current)
          .then((response) => this.addBiodivSportsData(response));
      } else {
        // first call, check protection areas are contained within map extent and download biodivsports features
        Promise.allSettled([
          biodivSportsService
            .fetchData(bsExtent, this.biodivSportsActivities, this.$language.current)
            .then((response) => {
              this.addBiodivSportsData(response);
              return (response?.data?.results?.length ?? 0) > 0;
            }),
          this.intersectsWithSwitzerland(extent)
            ? respecterCestProtegerService.hasArea(extent)
            : Promise.resolve(false),
        ]).then((hasArea) => {
          this.hasProtectionAreas = hasArea.some((result) => (result.status === 'fulfilled' ? result.value : false));
          if (this.hasProtectionAreas) {
            this.$emit('has-protection-area');
          }
        });
      }
    },

    clearGeometry() {
      if (this.editedDocument.type !== 'o') {
        // user can't set the outing point directly (he must select the route)
        // So do not clear geometry.geom
        this.editedDocument.geometry.geom = null;
      }

      this.editedDocument.geometry.geom_detail = null;
      this.drawDocumentMarkers(); // redraw markers
      this.setDrawInteraction(); // reset interaction mode
    },

    resetGeometry() {
      if (this.editedDocument.type === 'o') {
        // user can't set the outing point directly (he must select the route)
        // So do not reinit geometry.geom to nothing
        this.editedDocument.geometry.geom = this.initialGeometry.geom || this.editedDocument.geometry.geom;
        this.editedDocument.geometry.geom_detail = this.initialGeometry?.geom_detail;
      } else {
        this.editedDocument.geometry = JSON.parse(JSON.stringify(this.initialGeometry));
      }

      this.drawDocumentMarkers(); // redraw markers
      this.setDrawInteraction(); // reset interaction mode
    },

    updateEditMapLink() {
      const coords = ol.proj.transform(
        this.map.getView().getCenter(),
        ol.proj.get('EPSG:3857'),
        ol.proj.get('EPSG:4326')
      );
      this.editMapLink = `https://www.openstreetmap.org/#map=13/${coords[1]}/${coords[0]}`;
    },

    /** Set the style for the highlighted points (hover) */
    highlightStop(stopId) {
      this.resetStopStyles();
      const stopFeature = this.findStopPoint(stopId);

      if (!stopFeature) {
        console.warn(`Stop with ID ${stopId} not found.`);
        return;
      }

      const title = stopFeature.get('document').stoparea_name;
      stopFeature.setStyle(getDocumentPointStyle(stopFeature.get('document'), title, true));
    },

    /** Zoom and move the map to a point */
    goAndZoomOnStop(stopId) {
      const stopFeature = this.findStopPoint(stopId);

      if (!stopFeature) {
        console.warn(`Stop with ID ${stopId} not found.`);
        return;
      }
      const geometry = stopFeature.getGeometry();
      if (geometry) {
        const coordinate = geometry.getCoordinates();

        const view = this.map.getView();
        view.cancelAnimations();

        view.animate({
          center: coordinate,
          zoom: Math.max(view.getZoom(), 14),
          duration: 300,
        });
      }
    },

    /** Center and zoom in/out the map depending on all elements on the map (points, multilines, etc.) */
    recenterOnDocuments() {
      if (!this.map || !this.documents || this.documents.length === 0) {
        console.warn('Cannot recenter - map or documents not available');
        return;
      }

      const extent = [Infinity, Infinity, -Infinity, -Infinity];

      this.documents.forEach((doc) => {
        try {
          if (doc.geometry?.geom_detail) {
            const geom = JSON.parse(doc.geometry.geom_detail);

            if (geom.type === 'LineString' && geom.coordinates?.length > 0) {
              geom.coordinates.forEach((coord) => {
                const [x, y] =
                  Math.abs(coord[0]) <= 180 && Math.abs(coord[1]) <= 90
                    ? ol.proj.transform([coord[0], coord[1]], 'EPSG:4326', 'EPSG:3857')
                    : [coord[0], coord[1]];

                extent[0] = Math.min(extent[0], x);
                extent[1] = Math.min(extent[1], y);
                extent[2] = Math.max(extent[2], x);
                extent[3] = Math.max(extent[3], y);
              });
            }
          }
        } catch (e) {
          console.error('Error processing document geometry:', e);
        }
      });

      if (extent[0] !== Infinity && extent[2] !== -Infinity) {
        const padding = 50;
        const mapSize = this.map.getSize();
        const ratio = padding / Math.min(mapSize[0], mapSize[1]);

        const width = extent[2] - extent[0];
        const height = extent[3] - extent[1];

        const paddedExtent = [
          extent[0] - width * ratio,
          extent[1] - height * ratio,
          extent[2] + width * ratio,
          extent[3] + height * ratio,
        ];

        this.map.getView().fit(paddedExtent, {
          duration: 1000,
          maxZoom: 18,
        });
      } else {
        this.map.getView().fit(DEFAULT_EXTENT);
        console.warn('No valid geometries found - using default extent');
      }
    },

    /** Set map elements to their normal graphic style (unhighlight) */
    resetStopStyles() {
      const documentsSource = this.documentsLayer.getSource();
      const waypointsSource = this.waypointsLayer.getSource();

      documentsSource.forEachFeature((feature) => {
        if (feature.values_.document.type !== 'w' && feature.values_.document.type !== 'z') {
          feature.setStyle(feature.get('normalStyle'));
        }
      });

      waypointsSource.forEachFeature((feature) => {
        feature.setStyle(feature.get('normalStyle'));
      });
    },

    /** Find the object of the stop based on its Id */
    findStopPoint(stopId) {
      const documentsSource = this.documentsLayer.getSource();
      const documentFeature = documentsSource.getFeatureById(stopId);

      if (documentFeature) {
        return documentFeature;
      }

      const waypointsSource = this.waypointsLayer.getSource();
      const waypointFeature = waypointsSource.getFeatureById(stopId);

      if (waypointFeature) {
        return waypointFeature;
      }

      console.warn(`Stop with ID ${stopId} not found.`);
      return null;
    },
  },
};
</script>

<style lang="scss">
// disable mobile CSS for controls.
.ol-touch .ol-control button {
  font-size: 1.14em !important;
}
</style>

<style lang="scss">
@import '~ol/ol.css';

:root,
:host {
  --ol-background-color: rgba(0, 60, 136, 0.6);
  --ol-accent-background-color: #f5f5f5;
  --ol-subtle-background-color: rgba(128, 128, 128, 0.25);
  --ol-partial-background-color: rgba(255, 255, 255, 0.75);
  --ol-foreground-color: #fff;
  --ol-subtle-foreground-color: #fff;
  --ol-brand-color: #00aaff;
}
</style>

<style lang="scss" scoped>
$control-margin: 0.5em;

.ol-control-pin-to-top {
  top: 80px;
  left: $control-margin;
}

.ol-control-center-on-geolocation {
  top: 120px;
  left: $control-margin;
}

.ol-control-compass {
  top: 160px;
  left: $control-margin;

  &.is-active button {
    background: $color-base-c2c;
    color: $white;
  }
}

.ol-control-layer-switcher {
  z-index: 1;
  bottom: 0;
  left: 0;
  height: 100%;
  width: 225px;
  color: white;
  text-decoration: none;
  border: none;
  display: flex;
  align-items: flex-end;
  background-color: initial;
}

.ol-control-layer-switcher-layers {
  width: 205px;
  height: 100%;
  overflow-y: auto;
  padding: 10px 0 10px 10px;
  background-color: rgb(0, 59, 136, 0.7);

  header {
    font-weight: bold;
  }

  .layer-group {
    display: flex;
    flex-flow: row wrap;
    margin-left: -10px;
  }
}

.ol-control-layer-switcher-close {
  background-color: rgb(0, 59, 136, 0.7);
  width: 20px;
  height: 30px;
  margin-bottom: 5px;
  border-top-right-radius: 10px;
  border-bottom-right-radius: 10px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}

:fullscreen {
  .ol-control-layer-switcher {
    width: 320px;
  }
  .ol-control-layer-switcher-layers {
    width: 300px;
    height: 100vh;
  }

  .with-elevation-profile .ol-control-layer-switcher-layers {
    /* elevation profile occupies 30% of the screen, see MapBox.vue */
    height: calc(100vh * 0.7);
    max-height: calc(100vh - 200px);
    min-height: calc(100vh - 350px);
  }
}

.ol-control-layer-switcher-button {
  bottom: $control-margin;
  left: $control-margin;
}

// V3 mobile improvements (#10 map controls): the V1 controls were
// sized for desktop (22px tap targets, planqued at the very bottom-
// left of the map). On a small screen with a 52px BottomNav and a
// safe-area inset at the bottom, the layer button was either too
// close to the nav to tap reliably or hidden behind it entirely. Lift
// it above the safe-area and grow the tap surfaces. Same treatment
// for the geoloc/compass/pin column on the top-left.
@media screen and (max-width: 768px) {
  .ol-control-layer-switcher-button {
    bottom: calc($control-margin + 60px + env(safe-area-inset-bottom));
  }
  .ol-control button {
    width: 2.4em;
    height: 2.4em;
    font-size: 1.05em;
  }
  // The full side-panel takes 60% of a 375px screen — fine to keep,
  // but bump the background opacity so the user can still see they're
  // over the map. Tap anywhere outside closes it (existing logic).
  .ol-control-layer-switcher {
    width: min(225px, 70vw);
  }
  .ol-control-layer-switcher-layers {
    width: calc(min(225px, 70vw) - 20px);
    background-color: rgba(0, 59, 136, 0.85);
  }
}

// V3 quick-toggle pill (OTM / IGN / Sat) at the top-right of the map.
// Always present in the markup, hidden on tablet+ via `is-hidden-tablet`.
.ol-control-quick-layers {
  top: $control-margin;
  right: $control-margin;
  display: inline-flex;
  background: rgba(255, 255, 255, 0.92);
  border-radius: 999px;
  overflow: hidden;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.18);

  button {
    padding: 0.4rem 0.7rem;
    border: none;
    background: transparent;
    font-size: 0.78rem;
    font-weight: 600;
    color: #4a4a4a;
    cursor: pointer;
    line-height: 1;
    min-width: 38px;

    &:hover { background: rgba(0, 0, 0, 0.06); }
    &.is-active {
      background: #ff9933;
      color: white;
    }
  }
}

.ol-control-use-map-as-filter {
  top: $control-margin;
  left: 3em;
  padding: 0 2px;
  background: rgba(255, 255, 255, 0.8);

  .is-info:checked + label::before {
    background-color: rgba(0, 60, 136, 0.6);
  }
}

.ol-control-recenter-on {
  top: 35px;
  left: 3em;
  opacity: 0.8;

  input {
    border-radius: 4px;
    border-style: none;
  }
}

.ol-control-recenter-on_on-top {
  top: $control-margin;
}

.ol-control-recenter-on-propositions {
  top: 57px;
  left: 3em;
  background: rgba(255, 255, 255, 0.9);
  padding: 5px;

  li:hover {
    background: lightgrey;
    cursor: pointer;
  }
}

.ol-control-recenter-on-propositions_on-top {
  top: 27px;
}

.ol-control-reset-geometry {
  top: 5px;
  right: 5px;

  button {
    padding: 5px;
    width: auto !important;
    font-weight: normal;
  }
}

.ol-control-clear-geometry {
  top: 35px;
  right: 5px;

  button {
    padding: 5px;
    width: auto !important;
    font-weight: normal;
  }
}

.ol-control-edit-map {
  bottom: 35px;
  right: $control-margin;

  svg {
    height: 0.7em;
    vertical-align: -0.45em;
  }
}

/* make the link look like a button, copy style from ol.css */
.ol-control a {
  display: block;
  margin: 1px;
  padding: 0;
  color: var(--ol-subtle-foreground-color);
  font-weight: bold;
  text-decoration: none;
  font-size: inherit;
  text-align: center;
  height: 1.375em;
  width: 1.375em;
  line-height: 0.4em;
  background-color: var(--ol-background-color);
  border: none;
  border-radius: 2px;
}

.ol-control a:hover,
.ol-control a:focus {
  text-decoration: none;
  outline: 1px solid var(--ol-subtle-foreground-color);
  color: var(--ol-foreground-color);
}
</style>

<style lang="scss">
$control-margin: 0.5em;

.ol-attribution ul,
.ol-scale-line {
  --ol-subtle-foreground-color: #666666;
  --ol-foreground-color: #333333;
}

.ol-attribution ul {
  display: flex;
  flex-direction: column;
}

.ol-scale-line {
  bottom: calc($control-margin + 1px);
  right: 40px;
  left: initial;
  line-height: 1.3;
}

.ol-full-screen {
  right: auto;
  left: $control-margin;
  top: 60px;
}
</style>
