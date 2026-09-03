<template>
  <edition-container v-if="document" :mode="mode" :document="document" :is-loading="saving" @save="save">
    <form-section
      :title="$gettext('general informations')"
      :sub-title="$gettext('Main informations about your outing')"
      expanded-on-load
    >
      <div class="columns">
        <form-field
          class="is-narrow"
          :document="document"
          :field="fields.date_start"
          :max="showBothDates ? document.date_end : currentDate"
          @input="handleDates"
          @click.native="setCurrentDate"
        />
        <form-field
          class="is-narrow"
          v-show="showBothDates"
          :document="document"
          :field="fields.date_end"
          :min="showBothDates ? document.date_start : undefined"
          :max="currentDate"
          @click.native="setCurrentDate"
        />
        <div class="column is-narrow">
          <input-checkbox v-model="showBothDates">{{ $gettext('Several days?') }}</input-checkbox>
        </div>
      </div>

      <div class="columns is-multiline">
        <form-field class="is-two-fifths" :document="document" :field="fields.activities" />
        <div class="column">
          <map-input-row
            class="field"
            :document="document"
            :documents="possibleRoutes"
            geom-detail-editable
            ref="mapInput"
            @move="updateBbox"
            :initial-extent="initialExtent"
          />
        </div>
      </div>

      <div class="field">
        <label class="label">
          {{ $gettext('routes') | uppercaseFirstLetter }}:
          <marker-helper name="1063027#routes" />
        </label>
        <div class="control">
          <input class="input" type="text" placeholder="Name" v-model="routeTitle" />
        </div>
      </div>

      <!-- Offline-saved routes picker — SHOWN FIRST so the user's
           pre-saved topo is immediately reachable when they fill a
           sortie right after coming off it. Feedback Gilles74
           (forum 2026-09-01): the API-proposed list can contain
           hundreds of routes for a large bbox and was drowning
           the user's actual choice at the very bottom of the page.
           The V1 upstream flow is otherwise preserved as-is below. -->
      <div v-if="offlineRoutes.length" class="field offline-routes-field">
        <label class="label offline-routes-label">
          <fa-icon icon="bookmark" />&nbsp;{{ $gettext('Mes itinéraires hors ligne') }}
          <span class="tag is-light">{{ offlineRoutes.length }}</span>
        </label>
        <div class="offline-routes-list">
          <div v-for="route of offlineRoutes" :key="route.document_id" class="offline-route-item">
            <input-checkbox
              :value="routeIsAssociated(route.document_id)"
              @input="changeRouteAssociation($event, route)"
            >
              <activities
                v-if="route.activities && route.activities.length"
                :activities="route.activities"
                class="is-size-4 has-text-secondary"
              />
              <document-title :document="route" />
              <span v-if="route.elevation_max" class="offline-route-meta"> · {{ route.elevation_max }} m </span>
            </input-checkbox>
          </div>
        </div>
      </div>

      <!-- V1 upstream picker — kept identical (bbox-based propositions
           + "please move the map" hint + "more results" banner). It's
           the primary picker on camptocamp.org and stays that way. -->
      <div v-if="possibleRoutes && possibleRoutes.length !== 0" class="field">
        <div v-for="route of possibleRoutes" :key="route.document_id">
          <input-checkbox :value="routeIsAssociated(route.document_id)" @input="changeRouteAssociation($event, route)">
            <activities :activities="route.activities" class="is-size-4 has-text-secondary" />
            <document-title :document="route" />,
            <document-rating :document="route" />
          </input-checkbox>
          <document-link :document="route" target="_blank" :title="$gettext('Open in a new tab')">
            <fa-icon icon="link" />
          </document-link>
        </div>
      </div>

      <div class="notification is-info" v-else>
        <span v-translate>Please move the map, or change the route's name.</span>
        <span v-translate>If the route does not exists in our base, you can create it.</span>
      </div>

      <div class="notification is-info" v-if="showMoreResultsBanner">
        <span v-translate>
          More routes are available. You can move the map, specify the name or set an activity to filter them out.
        </span>
      </div>

      <!-- "Enregistrer sans itinéraire (à compléter plus tard)" — the
           offline escape hatch when the terrain-changed use case hits:
           user is offline, hasn't pre-saved the topo they're now on,
           can't associate a route through the map or search either.
           Rather than losing the sortie, they type a free-text note
           describing the itinéraire and save. The item lives in
           OfflineView with an "Itinéraire à renseigner" badge; once
           back online they resolve the association from there and
           the sync auto-publishes. See offline.js queueOuting +
           attachRoutesToPendingOuting for the machinery. -->
      <div v-if="showIncompleteDraftHelper" class="notification incomplete-draft-notice">
        <p class="incomplete-draft-title">
          <fa-icon icon="triangle-exclamation" />
          &nbsp;{{ $gettext('Aucun itinéraire disponible hors ligne') }}
        </p>
        <p class="incomplete-draft-sub">
          {{
            $gettext(
              'Notez ci-dessous à quel itinéraire cette sortie correspond, vous ferez l’association depuis « Mes topos » une fois la connexion retrouvée.'
            )
          }}
        </p>
        <textarea
          v-model="routeNote"
          class="textarea incomplete-draft-note"
          rows="2"
          :placeholder="$gettext('Ex : Face S de la Dent du Requin, voie normale')"
        />
        <button
          type="button"
          class="button is-warning is-fullwidth incomplete-draft-save"
          :disabled="savingIncomplete || !routeNote.trim()"
          @click="saveAsIncompleteDraft"
        >
          <fa-icon :icon="savingIncomplete ? 'spinner' : 'floppy-disk'" :spin="savingIncomplete" />
          &nbsp;{{
            savingIncomplete
              ? $gettext('Enregistrement…')
              : $gettext('Enregistrer sans itinéraire (à compléter plus tard)')
          }}
        </button>
      </div>

      <div class="columns is-multiline">
        <form-field :document="document" :field="fields.title" />
        <form-field class="is-narrow" :document="document" :field="fields.partial_trip" />
        <form-field
          class="is-12"
          :document="document"
          :field="fields.route_description"
          :placeholder="$gettext('describe route_conditions')"
        />
      </div>
    </form-section>

    <form-section
      :title="$gettext('Weather & conditions')"
      :sub-title="$gettext('Describe the conditions you encountered during your outing')"
    >
      <div class="columns is-multiline">
        <form-field class="is-6" :document="document" :field="fields.condition_rating" />
        <form-field class="is-6" :document="document" :field="fields.glacier_rating" />
        <form-field class="is-12" :document="document" :field="fields.conditions_levels" />
      </div>
      <div class="columns">
        <form-field :document="document" :field="fields.elevation_up_snow" />
        <form-field :document="document" :field="fields.elevation_down_snow" />
      </div>
      <div class="columns">
        <form-field :document="document" :field="fields.snow_quantity" />
        <form-field :document="document" :field="fields.snow_quality" />
      </div>
      <div class="columns is-multiline">
        <form-field
          class="is-12"
          :document="document"
          :field="fields.conditions"
          :placeholder="$gettext('describe conditions')"
        />
        <form-field
          class="is-6"
          :document="document"
          :field="fields.weather"
          :placeholder="$gettext('describe weather')"
        />
        <form-field
          class="is-6"
          :document="document"
          :field="fields.timing"
          :placeholder="$gettext('describe timing')"
        />
        <form-field class="is-12" :document="document" :field="fields.avalanche_signs" />
        <form-field class="is-12" :document="document" :field="fields.avalanches" />
      </div>
    </form-section>

    <form-section
      :title="$gettext('Personal informations')"
      :sub-title="$gettext('People who were with you, and your feelings about this outing')"
    >
      <associations-input-row :label="$gettext('participants')" :document="document" :field="fields.users" />
      <div class="columns">
        <form-field :document="document" :field="fields.participant_count" class="is-narrow" />
        <form-field :document="document" :field="fields.participants" :placeholder="$gettext('Without c2c account')" />
      </div>
      <div class="columns is-multiline">
        <form-field
          class="is-12"
          :document="document"
          :field="fields.description"
          :label="$gettext('personal comments')"
          :placeholder="$gettext('write your comments')"
        />
        <form-field :document="document" :field="fields.disable_comments" />
      </div>
    </form-section>

    <form-section
      :title="$gettext('Details')"
      :sub-title="$gettext('Detailed figures, like ratings, height differences, frequentation...')"
    >
      <div class="columns">
        <form-field class="is-4" :document="document" :field="fields.frequentation" />
      </div>

      <div class="columns is-multiline">
        <div class="column is-4">
          <form-field no-wrapper :document="document" :field="fields.elevation_access" />
          <form-field no-wrapper :document="document" :field="fields.access_condition" />
          <form-field no-wrapper :document="document" :field="fields.public_transport" />
        </div>
        <form-field class="is-8" :document="document" :field="fields.access_comment" />

        <div class="column is-4">
          <form-field no-wrapper :document="document" :field="fields.lift_status" />
          <form-field no-wrapper :document="document" :field="fields.hut_status" />
        </div>
        <form-field class="is-8" :document="document" :field="fields.hut_comment" />
      </div>

      <div class="columns">
        <form-field class="is-4" :document="document" :field="fields.height_diff_up" />
        <form-field class="is-4" :document="document" :field="fields.height_diff_down" />
        <form-field class="is-4" :document="document" :field="fields.height_diff_difficulties" />
      </div>

      <div class="columns">
        <form-field class="is-4" :document="document" :field="fields.length_total" unit="km" :divisor="1000" />
        <form-field class="is-4" :document="document" :field="fields.elevation_min" />
        <form-field class="is-4" :document="document" :field="fields.elevation_max" />
      </div>

      <div class="columns is-multiline">
        <form-field class="is-4" :document="document" :field="fields.global_rating" />
        <form-field class="is-4" :document="document" :field="fields.rock_free_rating" />
        <form-field class="is-4" :document="document" :field="fields.engagement_rating" />
        <form-field class="is-4" :document="document" :field="fields.equipment_rating" />

        <form-field
          class="is-4"
          :document="document"
          :field="fields.ski_rating"
          prefix="?"
          @click-prefix="showCotometer"
        />
        <form-field class="is-4" :document="document" :field="fields.labande_global_rating" />

        <form-field class="is-4" :document="document" :field="fields.ice_rating" />
        <form-field class="is-4" :document="document" :field="fields.snowshoe_rating" />
        <form-field class="is-4" :document="document" :field="fields.via_ferrata_rating" />
        <form-field class="is-4" :document="document" :field="fields.hiking_rating" />
      </div>

      <div class="columns">
        <form-field class="is-4" :document="document" :field="fields.mtb_down_rating" />
        <form-field class="is-4" :document="document" :field="fields.mtb_up_rating" />
      </div>

      <div class="columns">
        <quality-field ref="qualityField" class="is-4" :document="document" />
      </div>
    </form-section>

    <!-- TODO where is that ??
            <form-field :document="document" :field="fields.summary"/>
        -->
    <!-- CDC §4.4. Placed at the end of the form, next to the moment of
         publishing: the question it answers is "is this ready to go out",
         which nobody asks before filling anything in. -->
    <div class="outing-preview-action">
      <button type="button" class="button is-fullwidth outing-preview-btn" @click="openPreview">
        <fa-icon icon="eye" />
        &nbsp;{{ $gettext('Prévisualiser la sortie') }}
      </button>
    </div>

    <outing-preview-modal v-if="document" ref="previewModal" :document="document" :lang="previewLang" />

    <cotometer-window ref="cotometerWindow" v-if="document" v-model="document.ski_rating" />
  </edition-container>
</template>

<script>
import { toast } from 'bulma-toast';

import CotometerWindow from './utils/CotometerWindow';
import OutingPreviewModal from './utils/OutingPreviewModal';
import documentEditionViewMixin from './utils/document-edition-view-mixin';

import c2c from '@/js/apis/c2c';
import ol from '@/js/libs/ol';
import { splitOnGaps } from '@/pwa/trace-segments';

export default {
  components: { CotometerWindow, OutingPreviewModal },

  mixins: [documentEditionViewMixin],

  // The mixin's beforeRouteLeave runs first (Vue Router 3 chains
  // guards from mixins and components via the `created` merge
  // strategy). If the user cancels the confirm-on-unsaved-changes
  // there, this guard is skipped — session stays intact. If the mixin
  // lets navigation through with `modified: false` (only happens on a
  // successful save — the mixin flips it in both the online create
  // and the offline queue `.then` callbacks), we consume the session
  // so the "Sortie en cours" banner disappears.
  //
  // Preferred over a watch on `modified` because watchers fire
  // asynchronously and the router transition can tear the component
  // down before the watcher runs.
  beforeRouteLeave(to, from, next) {
    if (this.mode === 'add' && !this.modified && this.$outingSession?.sessionActive) {
      this.$outingSession.stop();
    }
    next();
  },

  data() {
    return {
      showBothDates: false,
      possibleRoutes: null,
      routeTitle: '',
      bbox: null,
      showMoreResultsBanner: false,
      currentDate: this.getCurrentDateString(),
      // "à compléter plus tard" state — free-text description of the
      // itinéraire when the user is offline and can't associate a
      // real one. Consumed by saveAsIncompleteDraft() below.
      routeNote: '',
      savingIncomplete: false,
    };
  },

  computed: {
    // The mixin reads the language off the route, which has no lang
    // param on the creation form. Falling back keeps the preview working
    // for a brand-new outing — the case it is most useful in.
    previewLang() {
      return this.lang || this.document?.locales?.[0]?.lang || this.$user?.lang || this.$language?.current || 'fr';
    },

    initialExtent() {
      if (this.$route.query.initial_bbox) {
        return this.$route.query.initial_bbox.split(',').map(parseFloat);
      } else if (this.document.associations.routes.length) {
        return this.$documentUtils.getDocumentsBbox(this.document.associations.routes);
      }

      return null;
    },

    // Routes the user has downloaded for offline use — surfaced as a
    // pickable list in the form so the outing can be associated with a
    // route without having to find it through the map / API search
    // (which fails offline anyway). Sorted by most-recently-saved first.
    //
    // Reads offlineDocs, not savedDocs: a light save has no map tiles
    // and no images, so it is not something you carry up a mountain.
    // Keeping those out is also what stops this list from growing
    // endless, which is why the two modes exist at all.
    offlineRoutes() {
      const saved = this.$offline?.offlineDocs || [];
      const routes = saved.filter((entry) => entry.type === 'route' && entry.data);
      routes.sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
      return routes.map((entry) => entry.data);
    },

    // Reactive alias for "the device thinks it is offline right now".
    // $offline exposes an `.online` boolean fed by navigator's
    // online/offline events.
    isOffline() {
      return !!(this.$offline && !this.$offline.online);
    },

    // Show the "à compléter plus tard" helper (note + alternative
    // save button) only when it's actually useful: we're creating a
    // new outing, the device is offline, and no route has been
    // associated yet. Once the user picks a route (from the offline
    // list) the block hides — the normal save flow takes over.
    showIncompleteDraftHelper() {
      return this.mode === 'add' && this.isOffline && this.document.associations.routes.length === 0;
    },
  },

  watch: {
    showBothDates: 'handleDates',
    'document.activities': function (to, from) {
      if (from === undefined) {
        return; // initial load
      }
      this.updateRoutes('activities', false);
    },

    'document.geometry.geom_detail': function (to, from) {
      if (from === null && to !== null) {
        this.possibleRoutes = null;
        this.$nextTick(async () => {
          await this.fitMapToDocuments();
          this.updateRoutes();
        });
      }
    },

    routeTitle() {
      this.updateRoutes('routeTitle', false);
    },
  },

  methods: {
    openPreview() {
      this.$refs.previewModal?.show();
    },

    afterLoad() {
      this.showBothDates = this.document.date_start !== this.document.date_end;
      this.hydrateFromOutingSession();
    },

    // Feature parity between offline and online outing creation:
    // when the user came here from StartOutingControl's "Créer la
    // sortie" button, hydrate the fresh document with the GPS trace +
    // auto-computed metrics captured during the session. Everything
    // else the user fills through the same form as online, so the
    // resulting outing has the exact same shape and richness.
    //
    // Idempotent — only runs when: (a) we're in add mode, (b) a
    // session is active, (c) the session's topoRef matches the ?r=
    // query param (so unrelated /outings/add opens don't clobber a
    // pristine form with a stale trace).
    hydrateFromOutingSession() {
      if (this.mode !== 'add') return;
      const session = this.$outingSession;
      if (!session?.sessionActive) return;
      const routeIdParam = this.$route.query.r;
      if (routeIdParam && session.topoRef?.type === 'route') {
        if (String(session.topoRef.id) !== String(routeIdParam)) return;
      }

      // Associate the route the outing was started from.
      //
      // Feedback Gilles (forum, sortie réelle): he removed that route
      // from his saved topos before finishing the form, and the picker
      // fell back to the bbox list — hundreds of routes, his own no
      // longer among the offered ones. He asked whether removing a saved
      // topo could be forbidden while an outing is unfinished.
      //
      // Forbidding it treats the symptom. The app already knows which
      // route this outing came from — the session holds topoRef and the
      // form receives ?r= — and was only using it as a guard. Ticking it
      // here removes the need to hunt for it at all, and holds whether or
      // not the topo is still saved on the device.
      this.associateSessionRoute();

      // Pre-fill dates from the session start (the user is filling
      // right after the outing — typical case). Overwrites the
      // buildDocument default (today) only if there's a startedAt.
      if (session.startedAt) {
        const iso = new Date(session.startedAt).toISOString().slice(0, 10);
        this.document.date_start = iso;
        this.document.date_end = iso;
        this.showBothDates = false;
      }

      if (!session.positions.length) return;

      // GPS trace in EPSG:3857 (C2C's storage projection), split at the
      // recording breaks: a point flagged `gap` opens a new segment.
      //
      // A single LineString across a pause draws a straight line from
      // where the user stopped to where they resumed — down the valley
      // and back up — on the outing published to camptocamp.org. The
      // published figures already skip that step (see the session's
      // tracedDistanceMeters); the drawn trace has to agree with them.
      //
      // MultiLineString is not a guess here: V1's own track importer
      // emits one for any multi-segment file (src/js/tcx/TCX.js), so the
      // API has been storing this shape for years.
      const segments3857 = splitOnGaps(session.positions).map((seg) =>
        seg.map((point) => ol.proj.fromLonLat([point.lon, point.lat]))
      );
      // A one-point segment is not a line; drop it rather than emit a
      // degenerate geometry the API would have to reject.
      const drawable = segments3857.filter((seg) => seg.length > 1);
      if (drawable.length === 1) {
        this.document.geometry.geom_detail = JSON.stringify({
          type: 'LineString',
          coordinates: drawable[0],
        });
      } else if (drawable.length > 1) {
        this.document.geometry.geom_detail = JSON.stringify({
          type: 'MultiLineString',
          coordinates: drawable,
        });
      }

      // Auto-computed metrics from the trace — round to integers, the
      // API stores meters as ints anyway.
      const distance = Math.round(session.tracedDistanceMeters);
      const gain = Math.round(session.elevationGainMeters);
      const loss = Math.round(session.elevationLossMeters);
      if (distance > 0) this.document.length_total = distance;
      if (gain > 0) this.document.height_diff_up = gain;
      if (loss > 0) this.document.height_diff_down = loss;
    },

    // Tick the outing's own route, fetching it from wherever it can be
    // had: the offline copy first (works with no network), the API
    // otherwise. Silent when neither is possible — the "compléter plus
    // tard" path already covers being offline with nothing saved.
    async associateSessionRoute() {
      const session = this.$outingSession;
      const ref = session?.topoRef;
      if (!ref || ref.type !== 'route') return;
      // Never fight a choice the user already made.
      if (this.document.associations.routes.length) return;

      const lang = ref.lang || this.lang || 'fr';
      let route = null;
      try {
        route = await this.$offline?.getDocument(ref.type, ref.id, lang);
      } catch {
        /* fall through to the network */
      }
      if (!route && this.$offline?.online !== false) {
        try {
          const response = await c2c.route.getCooked(ref.id, lang);
          route = response.data;
        } catch {
          /* the bbox picker below stays the fallback */
        }
      }
      if (!route) return;
      // Re-check: the fetch was awaited, and the user may have ticked
      // something in the meantime.
      if (this.document.associations.routes.length) return;

      // Through the V1 handler rather than pushing onto the array, so the
      // localisation and map-fitting side effects happen exactly as they
      // do when the box is ticked by hand.
      this.changeRouteAssociation(true, route);
    },

    // Terrain-fallback save path — the user filled the form offline
    // without being able to associate a real itinéraire (no matching
    // topo in "Mes topos", no network to search for one). Queue the
    // outing with a free-text description of the itinéraire; the
    // sync loop skips it until the user picks a real route from
    // OfflineView. Bypasses the mixin's normal save() because that
    // path would send the payload to the API right away (offline
    // queue included) — and the API would reject it for lack of
    // route association.
    async saveAsIncompleteDraft() {
      if (this.savingIncomplete) return;
      const note = this.routeNote.trim();
      if (!note) return;
      // Bare-minimum client-side validation: activity + date are the
      // only fields whose absence would trip a re-open of the form
      // as unusable. Skip the "route required" check on purpose.
      this.handleDates();
      if (!this.document.activities || !this.document.activities.length) {
        toast({
          type: 'is-warning',
          position: 'bottom-center',
          message: this.$gettext('Sélectionnez au moins une activité avant d’enregistrer.'),
        });
        return;
      }
      if (!this.document.date_start) {
        toast({
          type: 'is-warning',
          position: 'bottom-center',
          message: this.$gettext('Renseignez la date avant d’enregistrer.'),
        });
        return;
      }
      this.savingIncomplete = true;
      try {
        await this.$offline.queueOuting(this.document, {
          needsRouteAssoc: true,
          routeNote: note,
        });
        this.modified = false;
        toast({
          type: 'is-success',
          position: 'bottom-center',
          duration: 5000,
          message: this.$gettext(
            'Sortie enregistrée localement. Complétez l’itinéraire depuis « Mes topos » une fois en ligne.'
          ),
        });
        this.$router.push({ name: 'offline' });
      } catch {
        toast({
          type: 'is-danger',
          position: 'bottom-center',
          message: this.$gettext('Impossible d’enregistrer localement. Réessayez.'),
        });
      } finally {
        this.savingIncomplete = false;
      }
    },

    updateBbox(bbox) {
      if (this.bbox === null && this.initialExtent === null && this.mode === 'add') {
        // IF it's the very first load
        // AND if there is no specific bbox expected in th URL
        // AND you are creating an outing
        // THEN the bbox will be the default one => do not load possible routes
        this.bbox = bbox;
        return;
      }

      if (bbox.join(',') !== this.bbox?.join(',')) {
        this.bbox = bbox;
        this.updateRoutes('bbox', false);
      }
    },

    async fitMapToDocuments() {
      this.bbox = await this.$refs.mapInput.fitMapToDocuments();
    },

    updateRoutes(reason, fitMap) {
      if (!this.bbox) {
        return reason;
      }

      const query = { limit: 50, bbox: this.bbox.join(',') };

      if (this.routeTitle) {
        query.q = this.routeTitle;
      }

      if (this.document.activities.length) {
        query.act = this.document.activities.join(',');
      }

      const promise = c2c.route.getAll(query);

      promise.then((response) => this.computePossibleRoutes(response.data.documents, response.data.total, fitMap));

      return promise;
    },

    clearPossibleRoutes() {
      this.computePossibleRoutes([], 0, false);
    },

    computePossibleRoutes(routes, total, fitMap) {
      this.showMoreResultsBanner = total !== routes.length;

      // always add actual associations to possible routes
      const routeIds = routes.map((r) => r.document_id);
      routes = [...routes, ...this.document.associations.routes.filter((r) => !routeIds.includes(r.document_id))];

      // sort by title
      routes.sort((a, b) =>
        this.$documentUtils.getDocumentTitle(a).localeCompare(this.$documentUtils.getDocumentTitle(b))
      );

      // assign
      this.possibleRoutes = routes;

      // recenter the map to possible routes
      if (fitMap) {
        this.$nextTick(this.fitMapToDocuments);
      }
    },

    changeRouteAssociation(addRoute, route) {
      // Adding a route still present, or removing a route not present?
      if (
        (!addRoute && !this.routeIsAssociated(route.document_id)) ||
        (addRoute && this.routeIsAssociated(route.document_id))
      ) {
        return;
      }

      const routes = this.document.associations.routes;

      if (addRoute) {
        routes.push(route);

        if (routes.length === 1) {
          this.possibleRoutes = [];

          this.$nextTick(async () => {
            // for first association, force the localization to be the route localization
            this.$documentUtils.propagateProperties(this.document, route);
            await this.fitMapToDocuments();
            this.updateRoutes('First route', false);
          });
        } else {
          this.$documentUtils.propagateProperties(this.document, route);
        }
      } else {
        this.document.associations.routes = routes.filter((r) => r.document_id !== route.document_id);

        if (!this.document.associations.routes.length) {
          // if there is no more route associated, the localization is obsolete
          this.document.geometry.geom = null;
        }
      }
    },

    routeIsAssociated(route_id) {
      return this.document.associations.routes.filter((route) => route.document_id === route_id).length !== 0;
    },

    handleDates() {
      if (!this.showBothDates) {
        this.document.date_end = this.document.date_start;
      } else if (this.document.date_end < this.document.date_start) {
        this.document.date_end = this.document.date_start;
      }
    },

    setCurrentDate() {
      this.currentDate = this.getCurrentDateString();
    },

    beforeSave() {
      this.handleDates();
      this.$refs.qualityField.beforeSave();
    },

    showCotometer() {
      this.$refs.cotometerWindow.show();
    },

    getCurrentDateString() {
      return this.$dateUtils.toLocalizedString(new Date(), 'YYYY-MM-DD');
    },
  },
};
</script>

<style lang="scss" scoped>
.outing-preview-action {
  margin: 1.5rem 0 0.5rem;
}

.outing-preview-btn {
  border-color: rgba(255, 153, 51, 0.6);
  color: #b35c00;
}

.offline-routes-field {
  margin-top: 1rem;
  padding: 0.75rem;
  border: 1px solid rgba(255, 153, 51, 0.4);
  border-radius: 6px;
  background: #fff8ee;
}

.offline-routes-label {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  margin-bottom: 0.5rem !important;
  color: #b26f1e;
  font-weight: 600;

  .tag {
    margin-left: auto;
  }
}

.offline-routes-list {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  max-height: 320px;
  overflow-y: auto;
}

.offline-route-item {
  padding: 0.4rem 0.5rem;
  background: white;
  border: 1px solid rgba(0, 0, 0, 0.08);
  border-radius: 4px;
}

.offline-route-meta {
  color: #6b6b6b;
  font-size: 0.85rem;
  margin-left: 0.25rem;
}

// "à compléter plus tard" notice — surfaces the terrain fallback
// visually as a warning card so the user notices it right below the
// normal itinéraire pickers. Same orange palette as offline-routes-*
// so the two offline-mode helpers read as one coherent flow.
.incomplete-draft-notice {
  margin: 1rem 0 0;
  padding: 0.85rem;
  background: #fff5e6;
  border: 1px solid rgba(255, 153, 51, 0.6);
  border-left: 4px solid #ff9933;
  border-radius: 6px;
  color: #4a4a4a;
}
.incomplete-draft-title {
  margin: 0 0 0.3rem;
  font-weight: 700;
  color: #b26f1e;
  display: flex;
  align-items: center;
}
.incomplete-draft-sub {
  margin: 0 0 0.6rem;
  font-size: 0.85rem;
  line-height: 1.4;
  color: #6b4a1e;
}
.incomplete-draft-note {
  margin-bottom: 0.6rem;
  min-height: 3.5rem;
  font-family: inherit;
}
.incomplete-draft-save {
  font-weight: 600;
  // Bulma buttons default to `white-space: nowrap` + a fixed height,
  // which made "Enregistrer sans itinéraire (à compléter plus tard)"
  // spill past the notice card on narrow phones (Sixte's report
  // 2026-09-01). Let the label wrap onto two lines and grow the
  // button vertically so the icon and text stay inside the border.
  white-space: normal;
  height: auto;
  min-height: 2.5em;
  padding-top: 0.55rem;
  padding-bottom: 0.55rem;
  line-height: 1.25;
  // Belt-and-braces: cap the button width to the notice's content
  // box so `is-fullwidth` never bleeds through the left border-
  // accent (which extra 4 px would push it past the right edge).
  max-width: 100%;
  box-sizing: border-box;
}
</style>

<style lang="scss">
// Dark mode counterparts — out-specifies the scoped rules above via
// html[data-theme] attribute selector.
html[data-theme='dark'] {
  .offline-routes-field {
    background: #3a2f1a;
    border-color: rgba(255, 153, 51, 0.5);
  }
  .offline-routes-label {
    color: #ffb866;
  }
  .offline-route-item {
    background: #2a2a2a;
    border-color: rgba(255, 255, 255, 0.08);
    color: #e5e5e5;
  }
  .offline-route-meta {
    color: #b5b5b5;
  }
  .incomplete-draft-notice {
    background: #3a2f1a;
    border-color: rgba(255, 153, 51, 0.5);
    border-left-color: #ff9933;
    color: #e5e5e5;
  }
  .incomplete-draft-title {
    color: #ffb866;
  }
  .incomplete-draft-sub {
    color: #d5c5a5;
  }
}
</style>
