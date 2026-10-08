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
    <p class="label">{{ $gettext('Trace de la sortie') }}</p>
    <ul>
      <li v-for="activity in activities" :key="activity.id">
        <button
          type="button"
          class="trace-picker-row"
          :class="{ 'is-picked': activity.id === pickedId }"
          :disabled="loadingId !== null"
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
      {{ $gettext('Date, distance et dénivelé positif repris de cette activité. Vérifiez-les avant de publier.') }}
    </p>
  </div>
</template>

<script>
import { toast } from 'bulma-toast';

import trackingService from '@/js/apis/tracking-service';
import { distance, elevation } from '@/pwa/units';

// Three lines fit above the date on a phone without pushing the form away.
const SHOWN_ACTIVITIES = 3;

export default {
  data() {
    return {
      state: null, // null (nothing to show) | 'connect' | 'list'
      activities: [],
      pickedId: null,
      loadingId: null,
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
      return trackingService
        .getStatus(userId)
        .then(({ data }) => {
          if (!Object.values(data || {}).includes('configured')) {
            this.state = 'connect';
            return;
          }
          return trackingService.getActivities(userId, this.$user.lang).then(({ data: list }) => {
            this.activities = (list || [])
              .slice()
              .sort((a, b) => Date.parse(b.date) - Date.parse(a.date))
              .slice(0, SHOWN_ACTIVITIES);
            this.state = this.activities.length ? 'list' : null;
          });
        })
        .catch(() => {
          // Unreachable service: keep whatever was shown before, say nothing.
        });
    },

    onVisibilityChange() {
      if (document.visibilityState === 'visible' && this.pickedId === null) {
        this.load();
      }
    },

    pick(activity) {
      if (this.loadingId !== null) return;
      this.loadingId = activity.id;
      trackingService
        .getActivityGeometry(this.$user.id, activity.id)
        .then(({ data }) => {
          // The service answers with no body when the tracker sent no
          // track (an indoor session, a manual entry).
          if (!data || !data.coordinates || !data.coordinates.length) {
            throw new Error('empty geometry');
          }
          this.pickedId = activity.id;
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
        parts.push(`${d.value} ${d.unit}`);
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
  color: $grey;

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

  &:disabled {
    cursor: wait;
  }
}

.trace-picker-day {
  flex: none;
  color: $grey;
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
