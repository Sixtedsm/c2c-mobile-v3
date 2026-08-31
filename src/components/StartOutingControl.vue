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
         closing the session. "Créer la sortie" opens the full V1
         edition form (OutingEditionView) with the trace + metrics
         pre-filled — same UI online or offline, same resulting outing
         shape. V1 handles the online publish AND the offline queue
         automatically via document-edition-view-mixin. -->
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
          <!-- "Créer la sortie" is always available, even without a
               trace: the user may have hiked without recording and
               still want to log the outing (activity, date, conditions,
               photos). The redirect opens the full V1 form. -->
          <button type="button" class="start-outing-stop-btn is-primary" @click="startEditingDraft">
            <fa-icon icon="pen-to-square" />
            <span>
              <strong>{{ $gettext('Créer la sortie') }}</strong>
              <small>
                {{
                  hasTrace
                    ? $gettext('Trace pré-remplie · publiée en ligne ou mise en file hors ligne')
                    : $gettext('Formulaire complet · publiée en ligne ou mise en file hors ligne')
                }}
              </small>
            </span>
          </button>
          <!-- "Reprendre plus tard": stops the battery-heavy GPS
               watch but keeps the session (trace + topo) alive so the
               user can come back and hit "Créer la sortie" later,
               even offline. Session state survives reloads via
               localStorage. Typical use: finished a route on the
               field, want to stop tracking without filling the form
               right now (driving, tired, phone battery low). -->
          <button type="button" class="start-outing-stop-btn" @click="pauseForLater">
            <fa-icon icon="pause" />
            <span>
              <strong>{{ $gettext('Reprendre plus tard') }}</strong>
              <small>{{
                $gettext('Coupe le GPS mais garde la trace. La sortie reste ouverte, à remplir plus tard.')
              }}</small>
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
  </div>
</template>

<script>
// "Démarrer la sortie" toggle. Two orthogonal switches per CDC §2.4:
//   1. sessionActive — declares "I'm on the move now". Lightweight.
//   2. gpsTracking   — actively records the trace. Battery-heavy, opt-in.
//
// On stop, three options: open V1's OutingEditionView (with the trace
// pre-filled), export GPX only, or discard. The edition view handles
// both the online publish and the offline queue via V1's existing
// mixin — no custom mini-form here so an outing filled in offline has
// the exact same shape and richness as one filled in online.

import { toast } from 'bulma-toast';

import { formatElapsed } from '@/pwa/elapsed-label';

export default {
  name: 'StartOutingControl',

  props: {
    topoRef: { type: Object, required: true },
    // Route document that the outing is attached to — used to pre-fill
    // the `?act=<activities>` query param so the edition form lands
    // with the right activities pre-selected. Optional: when missing,
    // the user picks activities inside the form.
    route: { type: Object, default: null },
  },

  data() {
    return {
      showStartModal: false,
      showStopModal: false,
      showMenu: false,
      wantTracking: false,
      tickHandle: null,
      now: Date.now(),
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
  },

  methods: {
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

    // Redirect to the V1 edition form with the current route
    // pre-associated (?r=<id>) and its activities pre-selected
    // (?act=<a,b>). The GPS trace + metrics travel through the
    // $outingSession singleton — OutingEditionView.afterLoad reads
    // them and hydrates the document. Session is cleared on
    // successful save (see OutingEditionView.watch.modified).
    startEditingDraft() {
      const query = {};
      if (this.topoRef.type === 'route') {
        query.r = String(this.topoRef.id);
      }
      if (Array.isArray(this.route?.activities) && this.route.activities.length) {
        query.act = this.route.activities.join(',');
      }
      this.showStopModal = false;
      this.showMenu = false;
      this.$router.push({ name: 'outing-add', params: { lang: this.topoRef.lang }, query }).catch(() => {
        /* NavigationDuplicated is benign */
      });
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

    // Halt the battery-draining GPS watch but keep the session state
    // intact so the user can pick it back up later from the topo pill
    // or the persistent bottom banner. Works fully offline: the state
    // is snapshotted to localStorage by the outing-session plugin.
    pauseForLater() {
      this.$outingSession.gpsTracking = false;
      this.showStopModal = false;
      this.showMenu = false;
      toast({
        type: 'is-info',
        position: 'bottom-center',
        duration: 4500,
        message: this.$gettext(
          'Sortie mise en pause. GPS coupé, trace conservée. Reprends-la depuis le topo ou la bannière quand tu veux.'
        ),
      });
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
      this.$outingSession.stop();
      this.showStopModal = false;
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
}
</style>
