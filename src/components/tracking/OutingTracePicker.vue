<template>
  <!-- The trace of a new outing comes from the user's own tracker
       (Strava, Garmin, Suunto…) through camptocamp.org's tracking
       service — the app no longer records one itself: a web app cannot
       keep the GPS alive once the phone puts the tab to sleep.

       Shows nothing while loading and nothing when the service cannot be
       reached (it refuses the beta's origin until Camptocamp allows it,
       and it needs a network): the file import on the map stays the
       fallback, and the block appears on its own once the service
       answers. -->
  <div v-if="state === 'connect'" class="trace-picker-connect">
    <fa-icon icon="route" />
    {{ $gettext('Retrouvez ici les traces de vos sorties Strava, Garmin, Suunto…') }}
    <!-- New tab: the form must survive the trip. Connecting has to
         happen on camptocamp.org, the only address the trackers'
         authorisation pages send back to. -->
    <a href="https://www.camptocamp.org/trackers" target="_blank" rel="noopener">
      {{ $gettext('Connecter mon compte sur camptocamp.org') }}
      <fa-icon icon="external-link-alt" />
    </a>
  </div>

  <div v-else-if="state === 'list'" class="field trace-picker">
    <p id="trace-picker-label" class="label">{{ $gettext('Trace de la sortie') }}</p>
    <ul aria-labelledby="trace-picker-label">
      <li v-for="activity in activities" :key="activity.id">
        <button
          type="button"
          class="trace-picker-row"
          :class="{ 'is-picked': activity.id === pickedId }"
          :aria-pressed="String(activity.id === pickedId)"
          @click="pick(activity)"
        >
          <fa-icon
            :icon="loadingId === activity.id ? 'spinner' : activity.id === pickedId ? 'circle-check' : 'route'"
            :spin="loadingId === activity.id"
            fixed-width
          />
          <span class="trace-picker-day">{{ dayOf(activity) }}</span>
          <span class="trace-picker-name">{{ nameOf(activity) }}</span>
          <span class="trace-picker-figures">{{ figuresOf(activity) }}</span>
        </button>
      </li>
    </ul>
    <p v-if="pickedId !== null" class="help">
      {{
        $gettext(
          'Trace et date reprises de cette activité ; distance et dénivelé positif aussi s’ils sont connus. Vérifiez-les dans « Détails » avant de publier.'
        )
      }}
    </p>
  </div>

  <p v-else-if="state === 'empty'" class="trace-picker-connect">
    <fa-icon icon="route" />
    {{
      $gettext(
        'Aucune activité reçue de votre compte pour l’instant : elle apparaîtra ici après la synchronisation de votre montre.'
      )
    }}
  </p>
</template>

<script>
import { toast } from 'bulma-toast';

import trackingService from '@/js/apis/tracking-service';
import { distance, elevation } from '@/pwa/units';

// Three lines fit above the date on a phone without pushing the form away.
// Older ones: the map's « Upload a GPS track » dialog lists them all.
const SHOWN_ACTIVITIES = 3;
const SETTLE_MS = 1000; // new lines push the form under a finger aiming at it

export default {
  props: {
    // owned by the form, which knows when its trace was replaced or cleared
    pickedId: { type: [Number, String], default: null },
  },

  data() {
    return {
      state: null, // null (nothing to show) | 'connect' | 'list' | 'empty'
      activities: [],
      loadingId: null,
      shownAt: 0,
      loads: 0,
    };
  },

  created() {
    this.load();
    // The usual miss is a watch that has not synced yet: the user goes to
    // Garmin or Strava, then comes back. Reload then, rather than add a
    // refresh button.
    document.addEventListener('visibilitychange', this.onVisibilityChange);
  },

  beforeDestroy() {
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
  },

  methods: {
    load() {
      const userId = this.$user.id;
      // answers can come back out of order: only the latest load writes
      const n = ++this.loads;
      return trackingService
        .getStatus(userId)
        .then(({ data }) => {
          if (n !== this.loads) return;
          if (!Object.values(data || {}).includes('configured')) {
            this.state = 'connect';
            return;
          }
          return trackingService.getActivities(userId, this.$user.lang).then(({ data: list }) => {
            if (n !== this.loads) return;
            const shown = (list || [])
              .slice()
              .sort((a, b) => Date.parse(b.date) - Date.parse(a.date))
              .slice(0, SHOWN_ACTIVITIES);
            if (String(shown.map((a) => a.id)) !== String(this.activities.map((a) => a.id))) this.shownAt = Date.now();
            this.activities = shown;
            this.state = shown.length ? 'list' : 'empty';
          });
        })
        .catch(() => {
          // Unreachable service: keep whatever was shown before, say nothing.
        });
    },

    onVisibilityChange() {
      if (document.visibilityState === 'visible' && this.pickedId === null && this.loadingId === null) {
        this.load();
      }
    },

    pick(activity) {
      if (this.loadingId !== null || activity.id === this.pickedId || Date.now() - this.shownAt < SETTLE_MS) return;
      this.loadingId = activity.id;
      trackingService
        .getActivityGeometry(this.$user.id, activity.id)
        .then(({ data }) => {
          // The service answers with no body when the tracker sent no
          // track (an indoor session, a manual entry).
          if (!data || !data.coordinates || !data.coordinates.length) {
            toast({
              message: this.$gettext('Cette activité n’a pas de trace GPS.'),
              type: 'is-warning',
              position: 'center',
            });
            return;
          }
          this.$emit('pick', { activity, geometry: data });
        })
        .catch(() => {
          toast({
            message: this.$gettext('Geographical data could not be retrieved'),
            type: 'is-danger',
            position: 'center',
          });
        })
        .finally(() => {
          this.loadingId = null;
        });
    },

    dayOf(activity) {
      return this.$dateUtils.toLocalizedString(activity.date, 'ddd D MMM');
    },

    nameOf(activity) {
      return activity.name || (activity.type && activity.type[this.$user.lang]) || '';
    },

    figuresOf(activity) {
      const units = this.$appSettings && this.$appSettings.units;
      const parts = [];
      if (activity.length) {
        const d = distance(activity.length, units);
        parts.push(`${d.value.toLocaleString()} ${d.unit}`);
      }
      if (activity.heightDiffUp) {
        const e = elevation(activity.heightDiffUp, units);
        parts.push(`+${e.value} ${e.unit}`);
      }
      return parts.join(' · ');
    },
  },
};
</script>

<style scoped lang="scss">
.trace-picker-connect {
  margin-bottom: 1rem;
  font-size: 0.9rem;
  color: #6b6b6b;

  a {
    white-space: nowrap;
  }
}

.trace-picker ul {
  border: 1px solid $grey-lighter;
  border-radius: 6px;
  overflow: hidden;
}

.trace-picker li + li {
  border-top: 1px solid $grey-lighter;
}

.trace-picker-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  width: 100%;
  min-height: 44px; // a thumb, not a mouse pointer
  padding: 0.5rem 0.75rem;
  border: none;
  background: $white;
  color: $text;
  font-size: 0.9rem;
  text-align: left;
  cursor: pointer;

  &.is-picked {
    background: $primary-light;
    font-weight: 600;
  }
}

.trace-picker-day {
  flex: none;
}

// The name gives way first: the date and the figures are what tell two
// outings apart.
.trace-picker-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.trace-picker-figures {
  flex: none;
  white-space: nowrap;
}
</style>

<style lang="scss">
// Dark theme: the rows take the surfaces of the form's inputs (App.vue).
html[data-theme='dark'] {
  .trace-picker-connect {
    color: #9a9a9a;
  }
  .trace-picker ul,
  .trace-picker li + li {
    border-color: rgba(255, 255, 255, 0.15);
  }
  .trace-picker-row {
    background: #1f1f1f;
    color: #e5e5e5;

    &.is-picked {
      background: #1e3a5f;
    }
  }
}
</style>
