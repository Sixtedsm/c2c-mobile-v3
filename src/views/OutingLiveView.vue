<template>
  <div class="outing-live">
    <div v-if="!$outingSession.sessionActive" class="outing-live-empty">
      <p>{{ $gettext('Aucune sortie en cours.') }}</p>
      <router-link class="button is-primary" to="/topoguide">
        {{ $gettext('Choisir un topo') }}
      </router-link>
    </div>

    <template v-else>
      <div class="outing-live-map">
        <map-view :documents="mapDocuments" :show-center-on-geolocation="true" />
      </div>

      <div class="outing-live-panel">
        <!-- The figures, big enough to read at arm's length with gloves.
             Seeing the trace draw itself is the only proof of recording a
             user can get without opening a menu — which is exactly what
             Gilles could not get, and why he walked seven hours believing
             the app was following him. -->
        <div class="outing-live-figures">
          <div>
            <strong>{{ elapsedLabel }}</strong>
            <small>{{ $gettext('durée') }}</small>
          </div>
          <div>
            <strong>{{ traced.value }} {{ traced.unit }}</strong>
            <small>{{ $gettext('distance') }}</small>
          </div>
          <div>
            <strong>+{{ gain.value }} {{ gain.unit }}</strong>
            <small>{{ $gettext('dénivelé') }}</small>
          </div>
          <div>
            <strong>{{ $outingSession.positions.length }}</strong>
            <small>{{ $gettext('points') }}</small>
          </div>
        </div>

        <!-- Health, in one place, in the order that matters when
             something is wrong. -->
        <ul class="outing-live-health">
          <li :class="healthClass(recordingHealth.level)">
            <fa-icon :icon="recordingHealth.icon" />&nbsp;{{ recordingHealth.label }}
          </li>
          <li v-if="accuracyLabel"><fa-icon icon="bullseye" />&nbsp;{{ accuracyLabel }}</li>
          <li :class="healthClass(backgroundHealth.level)">
            <fa-icon :icon="backgroundHealth.icon" />&nbsp;{{ backgroundHealth.label }}
          </li>
          <li v-if="storageLabel" class="is-bad"><fa-icon icon="triangle-exclamation" />&nbsp;{{ storageLabel }}</li>
        </ul>

        <router-link v-if="topoLink" class="button is-fullwidth outing-live-topo" :to="topoLink">
          {{ $gettext('Revenir au topo') }}
        </router-link>
      </div>
    </template>
  </div>
</template>

<script>
// The page the CDC asks for in §2.6 — "visualiser le trajet en cours",
// "afficher la trace GPS" — and the answer to the plainest finding of the
// whole audit: the app captured a current position and displayed it
// nowhere. The only feedback a recording gave was a point counter inside
// a dropdown menu, which is only visible to someone already suspicious.
//
// It draws through V1's own map component rather than a second map: the
// trace is handed over as a synthetic outing document, exactly the shape
// MapBox passes for a real one.

import { formatElapsed } from '@/pwa/elapsed-label';
import { splitOnGaps } from '@/pwa/trace-segments';
import { distance, elevation } from '@/pwa/units';

// The map redraws every feature when `documents` changes, so it must not
// be rebuilt on every fix. Ten seconds is well inside what a walker
// notices and far outside what the renderer minds.
const REDRAW_MS = 10000;

export default {
  name: 'OutingLiveView',

  data() {
    return {
      now: Date.now(),
      liveDocument: null,
      tickHandle: null,
    };
  },

  computed: {
    mapDocuments() {
      return this.liveDocument ? [this.liveDocument] : [];
    },

    elapsedLabel() {
      return formatElapsed(
        this.$outingSession.startedAt,
        this.now,
        this.$outingSession.pausedMs,
        this.$outingSession.pausedAt
      );
    },

    traced() {
      return distance(this.$outingSession.tracedDistanceMeters, this.$appSettings?.units);
    },

    gain() {
      return elevation(this.$outingSession.elevationGainMeters, this.$appSettings?.units);
    },

    // Is anything actually being recorded, right now. Four states, worst
    // first, each naming what the user can do about it.
    recordingHealth() {
      const session = this.$outingSession;
      if (session.geoError) {
        return { level: 'bad', icon: 'triangle-exclamation', label: this.$gettext('GPS refusé par le navigateur') };
      }
      if (!session.gpsTracking) {
        return {
          level: 'warn',
          icon: 'pause',
          label: session.paused ? this.$gettext('Sortie en pause') : this.$gettext('Trace non enregistrée'),
        };
      }
      if (session.gpsSilent) {
        const last = session.lastFixAt;
        const minutes = last ? Math.max(1, Math.round((this.now - last) / 60000)) : null;
        return {
          level: 'warn',
          icon: 'triangle-exclamation',
          label: minutes
            ? this.$gettext('Aucun point depuis {min} min').replace('{min}', minutes)
            : this.$gettext('Aucune position reçue'),
        };
      }
      if (session.traceFull) {
        return { level: 'warn', icon: 'triangle-exclamation', label: this.$gettext('Trace au maximum') };
      }
      return { level: 'good', icon: 'circle-check', label: this.$gettext('Enregistrement en cours') };
    },

    // What the platform can promise once the phone is out of sight.
    backgroundHealth() {
      const session = this.$outingSession;
      if (session.platform.strategy === 'screen-on') {
        return {
          level: 'warn',
          icon: 'moon',
          label: this.$gettext('iPhone : gardez l’écran allumé'),
        };
      }
      return session.keepAliveActive
        ? { level: 'good', icon: 'circle-check', label: this.$gettext('Tient écran éteint') }
        : { level: 'warn', icon: 'triangle-exclamation', label: this.$gettext('Gardez l’application à l’écran') };
    },

    accuracyLabel() {
      const accuracy = this.$outingSession.currentPosition?.accuracy;
      if (!Number.isFinite(accuracy)) return '';
      return this.$gettext('Précision {n} m').replace('{n}', Math.round(accuracy));
    },

    storageLabel() {
      const reason = this.$outingSession.storageError;
      if (reason === 'quota') return this.$gettext('Mémoire pleine : trace non sauvegardée');
      if (reason === 'blocked') return this.$gettext('Stockage refusé par le navigateur');
      return '';
    },

    topoLink() {
      const ref = this.$outingSession.topoRef;
      if (!ref) return null;
      return { name: ref.type, params: { id: String(ref.id), lang: ref.lang } };
    },
  },

  mounted() {
    this.rebuild();
    this.tickHandle = window.setInterval(() => {
      this.now = Date.now();
      this.rebuild();
    }, REDRAW_MS);
  },

  beforeDestroy() {
    if (this.tickHandle) window.clearInterval(this.tickHandle);
  },

  methods: {
    healthClass(level) {
      return { 'is-good': level === 'good', 'is-warn': level === 'warn', 'is-bad': level === 'bad' };
    },

    // The recorded trace, in the shape V1's map already knows how to
    // draw. Split at the recording breaks for the same reason the
    // published geometry is: a single line across a pause draws a
    // straight run down the valley and back that nobody walked.
    rebuild() {
      const session = this.$outingSession;
      if (!session.sessionActive) {
        this.liveDocument = null;
        return;
      }

      const segments = splitOnGaps(session.positions)
        .map((segment) => segment.map((point) => [point.lon, point.lat]))
        .filter((segment) => segment.length > 1);

      let geomDetail = null;
      if (segments.length === 1) {
        geomDetail = JSON.stringify({ type: 'LineString', coordinates: segments[0] });
      } else if (segments.length > 1) {
        geomDetail = JSON.stringify({ type: 'MultiLineString', coordinates: segments });
      }

      const here = session.currentPosition || session.positions[session.positions.length - 1];
      const geom = here ? JSON.stringify({ type: 'Point', coordinates: [here.lon, here.lat] }) : null;

      if (!geom && !geomDetail) {
        this.liveDocument = null;
        return;
      }

      this.liveDocument = {
        type: 'o',
        // Negative so it can never collide with a real document id in the
        // map's feature index.
        document_id: -1,
        activities: [],
        associations: { images: [], waypoints: [], waypoint_children: [], routes: [] },
        locales: [{ lang: this.$language?.current || 'fr', title: this.$gettext('Sortie en cours') }],
        geometry: { geom, geom_detail: geomDetail },
      };
    },
  },
};
</script>

<style lang="scss" scoped>
.outing-live {
  display: flex;
  flex-flow: column;
  flex: 1 1 auto;
  min-height: 0;
}

.outing-live-empty {
  padding: 2rem 1rem;
  text-align: center;
  color: #6b6b6b;

  .button {
    margin-top: 1rem;
  }
}

.outing-live-map {
  // A definite height, not a flex-derived one. This view is reachable
  // from both shells, and in the desktop shell .page-content is a plain
  // block — so `flex: 1 1 auto` resolved to nothing and the map got no
  // box at all. A viewport-relative height needs no cooperation from any
  // ancestor.
  position: relative;
  height: 55vh;
  min-height: 260px;

  // OlMap's root is an unclassed div carrying inline width/height 100%,
  // so it needs a parent with a *definite* height — and a flex item's
  // height is auto, against which 100% resolves to zero. The map then
  // mounts, builds its layers and draws nothing at all: features in the
  // source, no canvas on the page. Pinning it to the wrapper's box is
  // what gives it something to be 100% of.
  ::v-deep > div {
    position: absolute;
    inset: 0;
  }
}

.outing-live-panel {
  flex: 0 0 auto;
  padding: 0.75rem 0.9rem calc(0.9rem + env(safe-area-inset-bottom));
  background: #fff;
  border-top: 1px solid rgba(0, 0, 0, 0.08);
}

.outing-live-figures {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 0.4rem;
  text-align: center;

  strong {
    display: block;
    font-size: 1.05rem;
    color: #4a4a4a;
    line-height: 1.2;
  }

  small {
    font-size: 0.68rem;
    color: #6b6b6b;
  }
}

.outing-live-health {
  margin-top: 0.7rem;
  display: flex;
  flex-flow: column;
  gap: 0.25rem;
  font-size: 0.78rem;

  li {
    color: #6b6b6b;
  }

  .is-good {
    color: #2f8f4e;
  }
  .is-warn {
    color: #a35a00;
  }
  .is-bad {
    color: #c0392b;
    font-weight: 600;
  }
}

.outing-live-topo {
  margin-top: 0.7rem;
}
</style>
