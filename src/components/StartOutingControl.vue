<template>
  <div class="start-outing">
    <!-- Idle: prominent CTA "Démarrer" -->
    <button
      v-if="!isActiveOnThisTopo"
      type="button"
      class="start-outing-btn start-outing-btn-idle"
      :title="$gettext('Démarrer la sortie')"
      @click="openStartModal"
    >
      <fa-icon icon="play" />
      <span class="is-hidden-mobile">&nbsp;{{ $gettext('Démarrer la sortie') }}</span>
    </button>

    <!-- Active on this topo: status pill + dropdown -->
    <div v-else class="start-outing-active">
      <button
        type="button"
        class="start-outing-btn start-outing-btn-active"
        :class="{ 'is-recording': $outingSession.gpsTracking }"
        @click="showMenu = !showMenu"
      >
        <span class="start-outing-dot" :class="{ 'is-recording': $outingSession.gpsTracking }"></span>
        <span class="start-outing-elapsed">{{ elapsedLabel }}</span>
      </button>

      <div v-if="showMenu" class="start-outing-menu" @click.stop>
        <div class="start-outing-menu-row">
          <label class="start-outing-toggle">
            <input type="checkbox" :checked="$outingSession.gpsTracking" @change="toggleTracking" />
            <span>{{ $gettext('Enregistrer la trace GPS') }}</span>
          </label>
          <p class="start-outing-toggle-hint">
            <template v-if="$outingSession.gpsTracking">
              {{ $outingSession.positions.length }} {{ $gettext('points · ') }}
              {{ Math.round($outingSession.tracedDistanceMeters / 100) / 10 }} km
              <template v-if="$outingSession.elevationGainMeters > 0">
                · +{{ Math.round($outingSession.elevationGainMeters) }} m
              </template>
            </template>
            <template v-else>
              {{ $gettext('La trace ne sera pas enregistrée (économise la batterie).') }}
            </template>
          </p>
        </div>

        <hr />

        <button v-if="$outingSession.positions.length > 0" type="button" class="start-outing-link" @click="exportGpx">
          <fa-icon icon="download" />
          &nbsp;{{ $gettext('Exporter la trace GPX') }}
        </button>

        <button type="button" class="start-outing-link" @click="openStopModal">
          <fa-icon icon="stop" />
          &nbsp;{{ $gettext('Arrêter la sortie…') }}
        </button>
      </div>
    </div>

    <!-- Click outside closes menu -->
    <div v-if="showMenu" class="start-outing-overlay" @click="showMenu = false"></div>

    <!-- Start modal -->
    <div v-if="showStartModal" class="start-outing-modal" @click.self="showStartModal = false">
      <div class="start-outing-modal-card">
        <h3>{{ $gettext('Démarrer la sortie') }}</h3>
        <p class="start-outing-modal-sub">
          {{ $gettext('Position GPS sur la carte, distance parcourue, brouillon local, synchro différée.') }}
        </p>

        <label class="start-outing-checkbox">
          <input type="checkbox" v-model="wantTracking" />
          <span>
            <strong>{{ $gettext('Enregistrer la trace GPS') }}</strong>
            <small>{{ $gettext('Position toutes les 5 s · génère un GPX à la fin · consomme de la batterie') }}</small>
          </span>
        </label>

        <div class="start-outing-modal-actions">
          <button type="button" class="button is-text" @click="showStartModal = false">
            {{ $gettext('Annuler') }}
          </button>
          <button type="button" class="button is-primary" @click="confirmStart">
            <fa-icon icon="play" />
            &nbsp;{{ $gettext("C'est parti") }}
          </button>
        </div>
      </div>
    </div>

    <!-- Stop modal: choose what to do with the recorded trace before
         closing the session. When no trace was recorded, we skip
         straight to `finalStop()`. -->
    <div v-if="showStopModal" class="start-outing-modal" @click.self="showStopModal = false">
      <div class="start-outing-modal-card">
        <h3>{{ $gettext('Arrêter la sortie') }}</h3>
        <p v-if="hasTrace" class="start-outing-modal-sub">
          {{ $outingSession.positions.length }} {{ $gettext('points enregistrés · ') }} {{ traceKmLabel }} km ·
          {{ elapsedLabel }}
        </p>
        <p v-else class="start-outing-modal-sub">
          {{ $gettext('Aucune trace GPS enregistrée pour cette sortie.') }}
        </p>

        <div class="start-outing-stop-options">
          <!-- "Enregistrer en brouillon" est toujours disponible, même
               sans trace GPS : l'utilisateur peut vouloir enregistrer
               une sortie qu'il a faite (activité, date, conditions,
               photos) sans avoir enregistré le tracé. -->
          <button type="button" class="start-outing-stop-btn is-primary" @click="openDraftForm">
            <fa-icon icon="floppy-disk" />
            <span>
              <strong>{{ $gettext('Enregistrer en brouillon') }}</strong>
              <small>
                {{
                  hasTrace
                    ? $gettext('Attaché à ce topo · publiée dès retour du réseau')
                    : $gettext('Sans trace GPS · publiée dès retour du réseau')
                }}
              </small>
            </span>
          </button>
          <button v-if="hasTrace" type="button" class="start-outing-stop-btn" @click="exportGpxThenStop">
            <fa-icon icon="download" />
            <span>
              <strong>{{ $gettext('Exporter la trace GPX') }}</strong>
              <small>{{ $gettext('Télécharge le GPX puis termine la sortie') }}</small>
            </span>
          </button>
          <button type="button" class="start-outing-stop-btn is-danger" @click="discardAndStop">
            <fa-icon icon="trash" />
            <span>
              <strong>{{ hasTrace ? $gettext('Arrêter sans sauvegarder') : $gettext('Arrêter la sortie') }}</strong>
              <small v-if="hasTrace">{{ $gettext('La trace est perdue') }}</small>
            </span>
          </button>
        </div>

        <div class="start-outing-modal-actions">
          <button type="button" class="button is-text" @click="showStopModal = false">
            {{ $gettext('Annuler') }}
          </button>
        </div>
      </div>
    </div>

    <!-- Draft form: minimal set of fields for a valid outing. Fills in
         everything the API needs (activity, date, title, associated
         route, GPS trace). The user can enrich the draft later on the
         web edition view. -->
    <div v-if="showDraftForm" class="start-outing-modal" @click.self="showDraftForm = false">
      <div class="start-outing-modal-card">
        <h3>{{ $gettext('Nouveau brouillon de sortie') }}</h3>
        <p class="start-outing-modal-sub">
          {{ $gettext('La sortie sera publiée automatiquement dès que la connexion revient.') }}
        </p>

        <div class="draft-field">
          <label>{{ $gettext('Activité') }}</label>
          <select v-model="draft.activity" class="draft-input">
            <option v-for="a in availableActivities" :key="a" :value="a">
              {{ $gettext(a) }}
            </option>
          </select>
        </div>

        <div class="draft-field">
          <label>{{ $gettext('Date') }}</label>
          <input v-model="draft.date" type="date" class="draft-input" :max="today" />
        </div>

        <div class="draft-field">
          <label>{{ $gettext('Titre') }}</label>
          <input v-model="draft.title" type="text" class="draft-input" maxlength="120" />
        </div>

        <div class="draft-field">
          <label>{{ $gettext('Conditions / commentaires') }}</label>
          <textarea v-model="draft.description" rows="4" class="draft-input" />
        </div>

        <!-- Nearby routes (CDC §2.5): at end of GPS, propose the routes
             that intersect the recorded trace so the user can attach
             the outing to whatever fits, not just the topo they started
             from. Current topo is pre-checked. When the user is offline
             the query silently no-ops — we still keep the pre-checked
             topo association. -->
        <div v-if="hasTrace" class="draft-field">
          <label>{{ $gettext('Itinéraires proches') }}</label>
          <p v-if="loadingNearbyRoutes" class="draft-photos-hint">
            <fa-icon icon="rotate" spin />
            &nbsp;{{ $gettext('Recherche des itinéraires…') }}
          </p>
          <div v-else-if="nearbyRoutes.length" class="draft-routes-list">
            <label
              v-for="r in nearbyRoutes"
              :key="r.document_id"
              class="draft-route-item"
              :class="{ 'is-selected': draft.selectedRouteIds.includes(r.document_id) }"
            >
              <input type="checkbox" :value="r.document_id" v-model="draft.selectedRouteIds" />
              <span class="draft-route-title">
                {{ routeTitleOf(r) }}
                <small v-if="r.elevation_max">· {{ r.elevation_max }} m</small>
              </span>
            </label>
          </div>
          <p v-else class="draft-photos-hint">
            {{
              $gettext(
                'Aucun itinéraire proposé (hors ligne ou zone sans topo indexé). La sortie reste attachée à ce topo.'
              )
            }}
          </p>
        </div>

        <!-- Photos (CDC §2.4 + §2.8): captured now or picked from the
             gallery, stored locally with the draft, uploaded + attached
             at sync time. `capture="environment"` preferentially opens
             the back camera on mobile — falls back to the gallery
             everywhere else. -->
        <div class="draft-field">
          <label>{{ $gettext('Photos') }}</label>
          <div class="draft-photos">
            <div v-for="(p, idx) in draft.photos" :key="idx" class="draft-photo">
              <img :src="p.previewUrl" :alt="'photo ' + (idx + 1)" />
              <button
                type="button"
                class="draft-photo-remove"
                :aria-label="$gettext('Supprimer cette photo')"
                @click="removePhoto(idx)"
              >
                <fa-icon icon="xmark" />
              </button>
            </div>
            <label class="draft-photo-add">
              <fa-icon icon="camera" />
              <span>{{ $gettext('Ajouter') }}</span>
              <input type="file" accept="image/*" capture="environment" multiple @change="onPhotoInput" />
            </label>
          </div>
          <p v-if="draft.photos.length" class="draft-photos-hint">
            {{ draft.photos.length }} {{ $gettext('photo(s) — envoyées avec le brouillon quand le réseau revient.') }}
          </p>
        </div>

        <div class="start-outing-modal-actions">
          <button type="button" class="button is-text" @click="showDraftForm = false">
            {{ $gettext('Annuler') }}
          </button>
          <button
            type="button"
            class="button is-primary"
            :disabled="savingDraft || !draft.activity || !draft.title.trim()"
            @click="saveDraft"
          >
            <fa-icon :icon="savingDraft ? 'rotate' : 'floppy-disk'" :spin="savingDraft" />
            &nbsp;{{ savingDraft ? $gettext('Enregistrement…') : $gettext('Enregistrer le brouillon') }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
// "Démarrer la sortie" toggle. Two orthogonal switches per CDC §2.4:
//   1. sessionActive — declares "I'm on the move now". Lightweight.
//   2. gpsTracking   — actively records the trace. Battery-heavy, opt-in.
//
// On stop, three options: save-as-draft (queued for sync), export GPX
// only, or discard. The draft path pipes into $offline.queueOuting so
// the existing sync machinery publishes it as soon as the network is
// back. Ported from V4's StartOutingControl and reshaped for V3's
// document-header slot.

import { toast } from 'bulma-toast';

import c2c from '@/js/apis/c2c';
import constants from '@/js/constants';
import ol from '@/js/libs/ol';
import { formatElapsed } from '@/pwa/elapsed-label';
import { bboxFromPositions } from '@/pwa/geo-bbox';

// Fallback used when the topo has no `activities` array — order matches
// how likely a mobile user is to record that kind of outing.
const DEFAULT_ACTIVITIES = ['hiking', 'skitouring', 'rock_climbing', 'snowshoeing'];

export default {
  name: 'StartOutingControl',

  props: {
    topoRef: { type: Object, required: true },
    // Route document that the outing is attached to — used to pre-fill
    // activity + title on the draft form. Optional: when missing, we
    // fall back to the default activity list and a generic title.
    route: { type: Object, default: null },
  },

  data() {
    return {
      showStartModal: false,
      showStopModal: false,
      showDraftForm: false,
      showMenu: false,
      wantTracking: false,
      savingDraft: false,
      tickHandle: null,
      now: Date.now(),
      draft: {
        activity: null,
        date: this.todayString(),
        title: '',
        description: '',
        photos: [],
        selectedRouteIds: [],
      },
      nearbyRoutes: [],
      loadingNearbyRoutes: false,
    };
  },

  computed: {
    isActiveOnThisTopo() {
      const s = this.$outingSession;
      if (!s.sessionActive || !s.topoRef) return false;
      return (
        s.topoRef.type === this.topoRef.type &&
        String(s.topoRef.id) === String(this.topoRef.id) &&
        s.topoRef.lang === this.topoRef.lang
      );
    },
    elapsedLabel() {
      return formatElapsed(this.$outingSession.startedAt, this.now);
    },
    hasTrace() {
      return this.$outingSession.positions.length > 0;
    },
    traceKmLabel() {
      return (Math.round(this.$outingSession.tracedDistanceMeters / 100) / 10).toFixed(1);
    },
    today() {
      // Depend on `this.now` (bumped every 30 s) so `today` refreshes
      // after midnight even if the modal was left open. Otherwise the
      // draft form would pre-fill yesterday's date.
      // eslint-disable-next-line no-unused-vars
      const _tick = this.now;
      return this.todayString();
    },
    availableActivities() {
      const routeActivities = Array.isArray(this.route?.activities) ? this.route.activities : [];
      const all = constants.activities || DEFAULT_ACTIVITIES;
      // Route activities first (most relevant), then the rest of the
      // official list so the user can override.
      const ordered = [...routeActivities];
      for (const a of all) {
        if (!ordered.includes(a)) ordered.push(a);
      }
      return ordered;
    },
  },

  mounted() {
    // Tick once every 30s to refresh elapsed time. Cheap and avoids the
    // reactivity churn of a per-second update.
    this.tickHandle = window.setInterval(() => {
      this.now = Date.now();
    }, 30000);
  },

  beforeDestroy() {
    if (this.tickHandle) window.clearInterval(this.tickHandle);
    this.clearPhotoPreviews();
  },

  methods: {
    todayString() {
      const d = new Date();
      const pad = (n) => String(n).padStart(2, '0');
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    },

    openStartModal() {
      // Warn if a session is already running on another topo.
      const s = this.$outingSession;
      if (s.sessionActive && s.topoRef) {
        const proceed = window.confirm(
          this.$gettext(
            'Une sortie est déjà en cours sur un autre topo. La démarrer ici arrêtera la précédente. Continuer ?'
          )
        );
        if (!proceed) return;
      }
      this.wantTracking = false;
      this.showStartModal = true;
    },

    confirmStart() {
      this.$outingSession.start(this.topoRef, { track: this.wantTracking });
      this.showStartModal = false;
    },

    toggleTracking(e) {
      this.$outingSession.gpsTracking = e.target.checked;
    },

    openStopModal() {
      this.showMenu = false;
      this.showStopModal = true;
    },

    openDraftForm() {
      // Pre-fill: activity from route, title from route + date.
      this.draft.activity =
        (Array.isArray(this.route?.activities) && this.route.activities[0]) || this.availableActivities[0] || 'hiking';
      this.draft.date = this.todayString();
      const routeTitle = this.route ? this.$documentUtils.getDocumentTitle(this.route, this.topoRef.lang) : '';
      this.draft.title = routeTitle
        ? `${routeTitle} — ${this.draft.date}`
        : this.$gettext('Sortie du ') + this.draft.date;
      this.draft.description = '';
      this.clearPhotoPreviews();
      this.draft.photos = [];
      // Pre-select the current topo. If we can't find nearby routes,
      // the auto-attach still works via buildOutingPayload's fallback.
      const currentId = this.topoRef.type === 'route' ? Number(this.topoRef.id) : null;
      this.draft.selectedRouteIds = currentId ? [currentId] : [];
      this.nearbyRoutes = [];
      this.showStopModal = false;
      this.showDraftForm = true;
      this.loadNearbyRoutes();
    },

    // Nearby-routes query: build a bbox from the trace, ask the API for
    // routes intersecting it. Filters by the picked activity so a
    // hiking sortie doesn't get flooded with rock-climbing topos in the
    // same bbox. Best-effort — no error toast, the user always has the
    // fallback of the pre-checked current topo.
    async loadNearbyRoutes() {
      if (!this.hasTrace || !this.$offline.online) return;
      this.loadingNearbyRoutes = true;
      try {
        const bbox = this.traceBbox3857();
        if (!bbox) return;
        const query = { bbox, limit: 10 };
        if (this.draft.activity) query.act = this.draft.activity;
        const response = await c2c.route.getAll(query);
        const routes = response?.data?.documents || [];
        // Keep the current topo pinned at the top so the user always
        // sees the pre-checked context first.
        const currentId = this.topoRef.type === 'route' ? Number(this.topoRef.id) : null;
        const currentIdx = routes.findIndex((r) => r.document_id === currentId);
        if (currentIdx > 0) {
          const [current] = routes.splice(currentIdx, 1);
          routes.unshift(current);
        }
        this.nearbyRoutes = routes.slice(0, 5);
      } catch {
        this.nearbyRoutes = [];
      } finally {
        this.loadingNearbyRoutes = false;
      }
    },

    // Thin wrapper — the actual math lives in @/pwa/geo-bbox so it's
    // shared with NearMeButton and unit-testable in isolation.
    traceBbox3857() {
      return bboxFromPositions(ol, this.$outingSession.positions, 500);
    },

    routeTitleOf(route) {
      const title = this.$documentUtils.getDocumentTitle(route, this.topoRef.lang);
      return title || `#${route.document_id}`;
    },

    onPhotoInput(event) {
      const files = Array.from(event.target.files || []);
      for (const file of files) {
        if (!file.type?.startsWith('image/')) continue;
        this.draft.photos.push({
          file,
          previewUrl: URL.createObjectURL(file),
        });
      }
      event.target.value = '';
    },

    removePhoto(idx) {
      const p = this.draft.photos[idx];
      if (p?.previewUrl) URL.revokeObjectURL(p.previewUrl);
      this.draft.photos.splice(idx, 1);
    },

    clearPhotoPreviews() {
      for (const p of this.draft.photos) {
        if (p?.previewUrl) URL.revokeObjectURL(p.previewUrl);
      }
    },

    // Build a valid C2C v6 outing payload from the current session +
    // form input. Geometry is a LineString in EPSG:3857 (what the API
    // stores), stringified as the `geom_detail` column expects.
    buildOutingPayload() {
      const positions = this.$outingSession.positions;
      const coords3857 = positions.map((p) => ol.proj.fromLonLat([p.lon, p.lat]));
      const geomDetail = {
        type: 'LineString',
        coordinates: coords3857,
      };
      // Route associations: whatever the user picked in the nearby-routes
      // list. Falls back to the current topo when the list was empty or
      // never loaded (offline).
      const routeIds =
        this.draft.selectedRouteIds && this.draft.selectedRouteIds.length
          ? this.draft.selectedRouteIds
          : this.topoRef.type === 'route'
          ? [Number(this.topoRef.id)]
          : [];
      // Users association is REQUIRED for an outing (see
      // constants/documentsProperties.json → outing → users:
      // required=true). Attach the logged-in user as the participant.
      const userId = this.$user?.id;
      const payload = {
        // C2C v6 API requires an explicit document type letter on
        // every payload; outings use 'o'.
        type: 'o',
        activities: [this.draft.activity],
        date_start: this.draft.date,
        date_end: this.draft.date,
        quality: 'medium',
        locales: [
          {
            lang: this.topoRef.lang,
            title: this.draft.title.trim(),
            // Summary + description both accepted by the API. Description
            // carries whatever the user wrote in "Conditions / commentaires"
            // — leave empty if untouched.
            description: this.draft.description.trim() || '',
          },
        ],
        associations: {
          routes: routeIds.map((id) => ({ document_id: id })),
          users: userId ? [{ document_id: Number(userId) }] : [],
        },
      };
      if (coords3857.length > 1) {
        payload.geometry = { geom_detail: JSON.stringify(geomDetail) };
      }
      // Enrich with auto-computed metrics when the trace supports them.
      const distance = this.$outingSession.tracedDistanceMeters;
      const gain = this.$outingSession.elevationGainMeters;
      const loss = this.$outingSession.elevationLossMeters;
      if (distance > 0) payload.length_total = Math.round(distance);
      if (gain > 0) payload.height_diff_up = Math.round(gain);
      if (loss > 0) payload.height_diff_down = Math.round(loss);
      return payload;
    },

    async saveDraft() {
      if (this.savingDraft) return;
      this.savingDraft = true;
      try {
        const payload = this.buildOutingPayload();
        const photoFiles = this.draft.photos.map((p) => p.file).filter(Boolean);
        await this.$offline.queueOuting(payload, { photos: photoFiles });
        toast({
          type: 'is-success',
          position: 'bottom-center',
          duration: 3500,
          message: this.$gettext('Brouillon enregistré. Il sera publié dès le retour du réseau.'),
        });
        this.finalStop();
        // If we're already online, kick a sync straight away so the
        // user's draft doesn't wait until the next network event.
        if (this.$offline.online) {
          this.$offline.syncPendingOutings();
        }
      } catch {
        toast({
          type: 'is-warning',
          position: 'bottom-center',
          duration: 4000,
          message: this.$gettext("Échec de l'enregistrement du brouillon. Réessayez ou exportez la trace en GPX."),
        });
      } finally {
        this.savingDraft = false;
      }
    },

    exportGpx() {
      const gpx = this.$outingSession.exportGpx({
        name: this.route
          ? this.$documentUtils.getDocumentTitle(this.route, this.topoRef.lang)
          : this.$gettext('Trace Camptocamp'),
        description: `topo ${this.topoRef.type}/${this.topoRef.id}`,
      });
      const blob = new Blob([gpx], { type: 'application/gpx+xml' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `trace-${Date.now()}.gpx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      // Delay the revoke so slow browsers (iOS Safari especially) have
      // time to start the download before the blob URL becomes invalid.
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      this.showMenu = false;
    },

    exportGpxThenStop() {
      this.exportGpx();
      this.finalStop();
    },

    discardAndStop() {
      if (this.hasTrace) {
        const proceed = window.confirm(this.$gettext('Arrêter la sortie et supprimer la trace enregistrée ?'));
        if (!proceed) return;
        this.$outingSession.discardTrace();
      }
      this.finalStop();
    },

    finalStop() {
      this.clearPhotoPreviews();
      this.draft.photos = [];
      this.$outingSession.stop();
      this.showStopModal = false;
      this.showDraftForm = false;
      this.showMenu = false;
    },
  },
};
</script>

<style lang="scss" scoped>
.start-outing {
  position: relative;
  display: inline-flex;
  align-items: center;
}

.start-outing-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.45rem 0.7rem;
  border: none;
  border-radius: 999px;
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
  line-height: 1;
}

.start-outing-btn-idle {
  background: #ff9933;
  color: white;
  &:hover,
  &:focus {
    background: #e6791f;
  }
}

.start-outing-btn-active {
  background: #f0f4f8;
  color: #4a4a4a;
  border: 1px solid rgba(0, 0, 0, 0.1);

  &.is-recording {
    background: #fff5e6;
    border-color: #ff9933;
    color: #cc7a29;
  }
}

.start-outing-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #4a4a4a;

  &.is-recording {
    background: #e54545;
    animation: pulseRecord 1.5s ease-in-out infinite;
  }
}

@keyframes pulseRecord {
  0%,
  100% {
    transform: scale(1);
    opacity: 1;
  }
  50% {
    transform: scale(1.4);
    opacity: 0.6;
  }
}

.start-outing-menu {
  position: absolute;
  top: 100%;
  right: 0;
  margin-top: 0.4rem;
  min-width: 260px;
  background: white;
  border-radius: 10px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
  padding: 0.5rem 0.6rem;
  z-index: 50;

  hr {
    margin: 0.5rem 0;
    border: none;
    border-top: 1px solid rgba(0, 0, 0, 0.06);
  }
}

.start-outing-overlay {
  position: fixed;
  inset: 0;
  z-index: 40;
}

.start-outing-toggle {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.85rem;
  color: #4a4a4a;
  cursor: pointer;

  input {
    margin: 0;
  }
}

.start-outing-toggle-hint {
  font-size: 0.7rem;
  color: #6b6b6b;
  margin: 0.2rem 0 0 1.3rem;
}

.start-outing-link {
  display: block;
  width: 100%;
  text-align: left;
  padding: 0.45rem 0.4rem;
  background: transparent;
  border: none;
  font-size: 0.85rem;
  color: #4a4a4a;
  cursor: pointer;
  border-radius: 4px;

  &:hover {
    background: rgba(0, 0, 0, 0.04);
  }
}

.start-outing-modal {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
  z-index: 60;
}

.start-outing-modal-card {
  background: white;
  border-radius: 12px;
  padding: 1.25rem;
  max-width: 420px;
  width: 100%;
  max-height: 90vh;
  overflow-y: auto;

  h3 {
    margin: 0 0 0.4rem;
    font-size: 1.15rem;
    font-weight: 700;
    color: #4a4a4a;
  }
}

.start-outing-modal-sub {
  font-size: 0.85rem;
  color: #6b6b6b;
  margin: 0 0 1rem;
  line-height: 1.4;
}

.start-outing-checkbox {
  display: flex;
  align-items: flex-start;
  gap: 0.6rem;
  padding: 0.7rem;
  background: #fff5e6;
  border-radius: 8px;
  cursor: pointer;

  input {
    margin-top: 0.2rem;
    flex: 0 0 auto;
  }

  > span {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    strong {
      font-size: 0.9rem;
      color: #4a4a4a;
    }
    small {
      font-size: 0.7rem;
      color: #6b6b6b;
      line-height: 1.35;
    }
  }
}

.start-outing-stop-options {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  margin: 0.5rem 0 0.75rem;
}

.start-outing-stop-btn {
  display: flex;
  align-items: flex-start;
  gap: 0.6rem;
  padding: 0.7rem 0.85rem;
  background: white;
  border: 1px solid rgba(0, 0, 0, 0.15);
  border-radius: 8px;
  color: #4a4a4a;
  cursor: pointer;
  text-align: left;

  > svg,
  > .svg-inline--fa {
    margin-top: 0.15rem;
    flex: 0 0 auto;
  }

  > span {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    min-width: 0;
    strong {
      font-size: 0.9rem;
      font-weight: 600;
    }
    small {
      font-size: 0.72rem;
      color: #6b6b6b;
      line-height: 1.35;
    }
  }

  &:hover,
  &:focus {
    outline: none;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.1);
  }

  &.is-primary {
    background: #ff9933;
    border-color: #ff9933;
    color: white;
    small {
      color: rgba(255, 255, 255, 0.85);
    }
    &:hover,
    &:focus {
      background: #e6791f;
    }
  }

  &.is-danger {
    color: #c0392b;
    small {
      color: #c0392b;
      opacity: 0.8;
    }
    &:hover,
    &:focus {
      background: rgba(192, 57, 43, 0.06);
      border-color: rgba(192, 57, 43, 0.3);
    }
  }
}

.draft-field {
  margin-bottom: 0.7rem;

  label {
    display: block;
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    color: #6b6b6b;
    margin-bottom: 0.25rem;
  }
}

.draft-input {
  width: 100%;
  padding: 0.5rem 0.6rem;
  background: white;
  border: 1px solid rgba(0, 0, 0, 0.15);
  border-radius: 6px;
  font-size: 0.9rem;
  font-family: inherit;
  color: #4a4a4a;

  &:focus {
    outline: none;
    border-color: #ff9933;
    box-shadow: 0 0 0 0.125em rgba(255, 153, 51, 0.25);
  }
}

textarea.draft-input {
  resize: vertical;
  min-height: 5rem;
}

.draft-photos {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}

.draft-photo {
  position: relative;
  width: 70px;
  height: 70px;
  border-radius: 6px;
  overflow: hidden;
  border: 1px solid rgba(0, 0, 0, 0.1);

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }
}

.draft-photo-remove {
  position: absolute;
  top: 2px;
  right: 2px;
  width: 20px;
  height: 20px;
  padding: 0;
  background: rgba(0, 0, 0, 0.55);
  color: white;
  border: none;
  border-radius: 50%;
  font-size: 0.7rem;
  line-height: 1;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;

  &:hover,
  &:focus {
    background: rgba(0, 0, 0, 0.75);
    outline: none;
  }
}

.draft-photo-add {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 70px;
  height: 70px;
  border: 1px dashed rgba(0, 0, 0, 0.25);
  border-radius: 6px;
  color: #6b6b6b;
  font-size: 0.7rem;
  cursor: pointer;
  gap: 0.15rem;

  input {
    display: none;
  }

  &:hover,
  &:focus-within {
    border-color: #ff9933;
    color: #cc7a29;
  }
}

.draft-photos-hint {
  margin: 0.4rem 0 0;
  font-size: 0.7rem;
  color: #6b6b6b;
}

.draft-routes-list {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  max-height: 180px;
  overflow-y: auto;
}

.draft-route-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.4rem 0.5rem;
  background: white;
  border: 1px solid rgba(0, 0, 0, 0.12);
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.85rem;

  input {
    margin: 0;
    flex: 0 0 auto;
  }

  &.is-selected {
    background: #fff5e6;
    border-color: #ff9933;
  }
}

.draft-route-title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;

  small {
    color: #6b6b6b;
    font-weight: normal;
    margin-left: 0.25rem;
  }
}

.start-outing-modal-actions {
  margin-top: 1rem;
  display: flex;
  justify-content: flex-end;
  gap: 0.4rem;
  flex-wrap: wrap;
}
</style>

<style lang="scss">
html[data-theme='dark'] {
  .start-outing-btn-active {
    background: #2f2f2f;
    color: #e5e5e5;
    border-color: rgba(255, 255, 255, 0.12);
    &.is-recording {
      background: #3a2f1a;
      color: #ffb866;
    }
  }
  .start-outing-menu {
    background: #2a2a2a;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.6);
    hr {
      border-top-color: rgba(255, 255, 255, 0.08);
    }
  }
  .start-outing-toggle {
    color: #e5e5e5;
  }
  .start-outing-toggle-hint {
    color: #9a9a9a;
  }
  .start-outing-link {
    color: #e5e5e5;
    &:hover {
      background: rgba(255, 255, 255, 0.06);
    }
  }
  .start-outing-modal-card {
    background: #2a2a2a;
  }
  .start-outing-modal-card h3 {
    color: #f5f5f5;
  }
  .start-outing-modal-sub {
    color: #b5b5b5;
  }
  .start-outing-checkbox {
    background: #3a2f1a;
    > span strong {
      color: #f5f5f5;
    }
    > span small {
      color: #b5b5b5;
    }
  }
  .start-outing-stop-btn {
    background: #2a2a2a;
    color: #e5e5e5;
    border-color: rgba(255, 255, 255, 0.12);
    > span small {
      color: #9a9a9a;
    }
    &.is-primary {
      background: #ff9933;
      color: white;
      small {
        color: rgba(255, 255, 255, 0.85);
      }
    }
    &.is-danger {
      color: #ff8f6b;
      small {
        color: #ff8f6b;
        opacity: 0.8;
      }
    }
  }
  .draft-field label {
    color: #b5b5b5;
  }
  .draft-input {
    background: #1f1f1f;
    color: #e5e5e5;
    border-color: rgba(255, 255, 255, 0.15);
  }
  .draft-photo {
    border-color: rgba(255, 255, 255, 0.12);
  }
  .draft-photo-add {
    border-color: rgba(255, 255, 255, 0.18);
    color: #b5b5b5;
    &:hover,
    &:focus-within {
      border-color: #ff9933;
      color: #ffb866;
    }
  }
  .draft-photos-hint {
    color: #9a9a9a;
  }
  .draft-route-item {
    background: #2a2a2a;
    color: #e5e5e5;
    border-color: rgba(255, 255, 255, 0.12);
    &.is-selected {
      background: #3a2f1a;
      border-color: #ff9933;
    }
    small {
      color: #b5b5b5;
    }
  }
}
</style>
