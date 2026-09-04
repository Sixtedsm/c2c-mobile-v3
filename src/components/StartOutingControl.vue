<template>
  <div class="start-outing">
    <!-- Idle: prominent CTA "Démarrer". Feedback Gilles
         (forum 2026-09-01): the pill-and-play-icon was too discreet
         on mobile and users missed it. Full-width label on every
         viewport + bigger padding so the target reads as the primary
         terrain action. -->
    <button
      v-if="!isActiveOnThisTopo"
      type="button"
      class="start-outing-btn start-outing-btn-idle"
      :title="$gettext('Démarrer la sortie')"
      @click="openStartModal"
    >
      <fa-icon icon="play" />
      &nbsp;{{ $gettext('Démarrer la sortie') }}
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
        <span v-if="$outingSession.paused" class="start-outing-paused-tag">
          <fa-icon icon="pause" />
          &nbsp;{{ $gettext('En pause') }}
        </span>
      </button>

      <div v-if="showMenu" class="start-outing-menu" @click.stop>
        <!-- The app was killed while recording (feedback Gilles: 11 points
             for a 3 h outing). Saying so is the whole point — the previous
             behaviour came back looking like a normal outing with the GPS
             quietly off, and the walk continued recording nothing. -->
        <div v-if="$outingSession.recordingInterrupted" class="start-outing-interrupted">
          <p>
            <fa-icon icon="triangle-exclamation" />
            &nbsp;{{
              $gettext(
                'L’enregistrement a été interrompu (application fermée par le téléphone). La portion parcourue depuis n’a pas été enregistrée.'
              )
            }}
          </p>
          <div class="start-outing-interrupted-actions">
            <button type="button" class="button is-small is-primary" @click="resumeOuting">
              <fa-icon icon="play" />&nbsp;{{ $gettext('Reprendre l’enregistrement') }}
            </button>
            <button type="button" class="button is-small is-text" @click="$outingSession.dismissInterruption()">
              {{ $gettext('Ignorer') }}
            </button>
          </div>
        </div>

        <div class="start-outing-menu-row">
          <label class="start-outing-toggle">
            <input type="checkbox" :checked="$outingSession.gpsTracking" @change="toggleTracking" />
            <!-- Names the current state, not the checkbox. "Enregistrement
                 de la trace GPS" left Gilles asking when he was supposed to
                 tick it — at the start of the outing? at the end? A label
                 that says what is happening right now cannot raise that
                 question (mail 2026-09-04). -->
            <span>
              {{
                $outingSession.gpsTracking
                  ? $gettext('Trace GPS : enregistrement en cours')
                  : $gettext('Trace GPS : pas d’enregistrement')
              }}
            </span>
          </label>
          <p class="start-outing-toggle-hint">
            <template v-if="$outingSession.gpsTracking">
              {{ $outingSession.positions.length }} {{ $gettext('points · ') }} {{ tracedDistance.value }}
              {{ tracedDistance.unit }}
              <template v-if="$outingSession.elevationGainMeters > 0">
                · +{{ tracedGain.value }} {{ tracedGain.unit }}
              </template>
              <!-- What actually decides whether a pocketed phone keeps
                   recording. The wake lock only covers the app being on
                   screen; the browser drops it the moment the phone is
                   locked. Saying "screen stays on" and nothing else left
                   the user to guess about the case that matters. -->
              <span class="start-outing-wakelock">
                <br />
                <template v-if="$outingSession.keepAliveActive">
                  {{ $gettext('Enregistrement maintenu écran éteint. Vous pouvez ranger le téléphone.') }}
                </template>
                <template v-else>
                  {{
                    $gettext(
                      'Gardez l’application à l’écran : l’enregistrement s’arrêtera si vous verrouillez le téléphone.'
                    )
                  }}
                </template>
              </span>
              <!-- The measurement. Whether a PWA can record with the
                   screen off is an open question on iOS, so the app
                   counts what really arrived instead of claiming. -->
              <span v-if="$outingSession.hiddenMs > 0" class="start-outing-wakelock"> <br />{{ hiddenSummary }} </span>
            </template>
            <template v-else>
              {{ $gettext('Enregistrement désactivé — cochez pour enregistrer la trace. (Économise la batterie.)') }}
            </template>
          </p>
        </div>

        <hr />

        <!-- The command that was missing: a paused outing could only be
             picked back up by re-ticking the GPS checkbox above, which
             reads as starting something new rather than resuming. -->
        <button v-if="$outingSession.paused" type="button" class="start-outing-link is-resume" @click="resumeOuting">
          <fa-icon icon="play" />
          <span>{{ $gettext('Reprendre la sortie') }}</span>
        </button>
        <button v-else type="button" class="start-outing-link" @click="pauseOuting">
          <fa-icon icon="pause" />
          <span>{{ $gettext('Mettre en pause') }}</span>
        </button>

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
            <!-- Two sentences rather than one neutral description: what
                 unticking costs is the thing that was missing, and it is
                 only worth saying in the state where it applies. -->
            <small v-if="wantTracking">
              {{
                $gettext('Position toutes les 5 s · trace, distance et dénivelés calculés · consomme de la batterie')
              }}
            </small>
            <small v-else class="is-warning">
              {{ $gettext('Décoché : aucune trace ne sera enregistrée pour cette sortie. Économise la batterie.') }}
            </small>
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
          {{ $outingSession.positions.length }} {{ $gettext('points enregistrés · ') }} {{ tracedDistance.value }}
          {{ tracedDistance.unit }} ·
          {{ elapsedLabel }}
        </p>
        <p v-if="hasTrace && $outingSession.hiddenMs > 0" class="start-outing-modal-sub">
          {{ hiddenSummary }}
        </p>
        <!-- Said loudly and once, here: this is the last moment where the
             absence of a trace can still be explained rather than
             discovered on the published outing. -->
        <p v-if="!hasTrace" class="start-outing-modal-warning">
          <fa-icon icon="triangle-exclamation" />
          &nbsp;{{
            $gettext(
              'Aucune trace GPS n’a été enregistrée : l’enregistrement était désactivé pendant cette sortie. Distance et dénivelés seront à saisir à la main.'
            )
          }}
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
          <!-- The real pause (CDC §2.4). This used to be "Reprendre plus
               tard", which stopped the GPS and kept the session alive —
               a pause in everything but the two things that matter: it
               offered no way back, and the break kept counting as
               outing time and as distance walked. It is now the pause,
               under the name it always deserved, rather than a second
               mechanism sitting next to one. -->
          <button type="button" class="start-outing-stop-btn" @click="pauseForLater">
            <fa-icon icon="pause" />
            <span>
              <strong>{{ $gettext('Mettre en pause') }}</strong>
              <small>{{
                $gettext('Coupe le GPS et suspend le décompte. La sortie reste ouverte, à reprendre quand tu veux.')
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
import { distance, elevation } from '@/pwa/units';

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
    // CDC §2.9 — the figures shown while walking follow the same unit
    // preference as the published ones. Reading kilometres in the field
    // and miles on the topo would be its own kind of wrong.
    tracedDistance() {
      return distance(this.$outingSession.tracedDistanceMeters, this.$appSettings?.units);
    },

    tracedGain() {
      return elevation(this.$outingSession.elevationGainMeters, this.$appSettings?.units);
    },

    // Reads as a verdict, not a statistic: after a stretch with the
    // screen off, either points came in or they did not.
    hiddenSummary() {
      const session = this.$outingSession;
      const minutes = Math.max(1, Math.round(session.hiddenMs / 60000));
      if (session.hiddenFixCount === 0) {
        return this.$gettext(
          'Écran éteint {min} min : aucun point enregistré. Le téléphone a suspendu l’application.'
        ).replace('{min}', minutes);
      }
      return this.$gettext('Écran éteint {min} min : {n} points enregistrés.')
        .replace('{min}', minutes)
        .replace('{n}', session.hiddenFixCount);
    },

    elapsedLabel() {
      return formatElapsed(
        this.$outingSession.startedAt,
        this.now,
        this.$outingSession.pausedMs,
        this.$outingSession.pausedAt
      );
    },
    hasTrace() {
      return this.$outingSession.positions.length > 0;
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
      // Recording is the default, and unticking it is the deliberate
      // choice. Feedback Gilles (mail 2026-09-04): he walked 30 km and
      // +1900 m, came back, and had no trace — the box had been off, and
      // nothing about "Démarrer la sortie" suggested it had to be ticked
      // first. His own question says it: "quand faut-il cocher ?".
      // Someone starting an outing from the topo page is, by that act,
      // asking the app to follow them.
      this.wantTracking = true;
      this.showStartModal = true;
    },

    confirmStart() {
      this.$outingSession.start(this.topoRef, { track: this.wantTracking });
      this.showStartModal = false;
    },

    // The checkbox is a battery choice, not the pause: turning the GPS
    // off mid-outing does not stop the clock. It must still close an
    // open pause when ticked, though — otherwise resuming this way
    // would leave the break accumulating for the rest of the outing.
    toggleTracking(e) {
      if (e.target.checked) {
        this.$outingSession.resume();
      } else {
        this.$outingSession.gpsTracking = false;
      }
    },

    pauseOuting() {
      this.$outingSession.pause();
      this.showMenu = false;
      toast({
        type: 'is-info',
        position: 'bottom-center',
        duration: 4500,
        message: this.$gettext('Sortie en pause. Le temps et la distance ne comptent plus jusqu’à la reprise.'),
      });
    },

    resumeOuting() {
      this.$outingSession.resume();
      this.showMenu = false;
      toast({
        type: 'is-success',
        position: 'bottom-center',
        duration: 3500,
        message: this.$gettext('Sortie reprise. Enregistrement de la trace relancé.'),
      });
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
      // Feedback Gilles (forum 2026-09-01): a topo often has multiple
      // activities (ski rando + rando été + raquettes). Pre-checking
      // them all pushed the user to publish sorties with incompatible
      // activities. Leave `activities` empty on purpose — the V1
      // form's validator will bark if the user tries to save without
      // picking their real activity of the day.
      // Stop recording before leaving for the form (feedback Gilles: the
      // black banner kept counting time and kilometres after he had
      // finished). Beyond the wrong reading, a GPS still running while a
      // form is filled adds the walk back to the car — and the drive
      // home — to the trace that gets published.
      //
      // Paused rather than stopped: the session and the trace have to
      // survive until the outing is actually saved, in case the user
      // leaves the form and comes back.
      this.$outingSession.pause();
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
      this.$outingSession.pause();
      this.showStopModal = false;
      this.showMenu = false;
      toast({
        type: 'is-info',
        position: 'bottom-center',
        duration: 4500,
        message: this.$gettext(
          'Sortie en pause. Le temps et la distance ne comptent plus. Reprends-la depuis le topo ou la bannière.'
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
  // Bumped from the pill baseline: bigger tap target + full label
  // so "Démarrer la sortie" reads at a glance. Slight shadow +
  // pulse on the play icon draw the eye to the primary CTA of
  // the topo page.
  padding: 0.6rem 1.1rem;
  font-size: 0.95rem;
  background: #ff9933;
  color: white;
  box-shadow: 0 2px 6px rgba(255, 153, 51, 0.35);
  white-space: nowrap;

  &:hover,
  &:focus {
    background: #e6791f;
    box-shadow: 0 4px 10px rgba(255, 153, 51, 0.45);
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

.start-outing-interrupted {
  padding: 0.6rem;
  margin-bottom: 0.5rem;
  border-radius: 4px;
  background: rgba(229, 69, 69, 0.1);
  font-size: 0.82rem;
  line-height: 1.35;
}

.start-outing-interrupted-actions {
  display: flex;
  gap: 0.4rem;
  align-items: center;
  margin-top: 0.4rem;
}

.start-outing-paused-tag {
  display: inline-flex;
  align-items: center;
  margin-left: 0.35rem;
  padding: 0 0.4rem;
  border-radius: 999px;
  background: #ff9933;
  color: #fff;
  font-size: 0.7rem;
  font-weight: 600;
}

// The way back into a paused outing. Coloured so it reads as the
// action to take, not as one more entry in a list of links.
.start-outing-link.is-resume {
  color: #ff9933;
  font-weight: 600;
}

.start-outing-menu {
  // Anchored to the viewport (position: fixed) instead of to the
  // pill trigger (position: absolute). The pill sits wherever the
  // topo header puts it — often centred or left-of-centre — and an
  // absolute menu with `right: 0` then drifts off the left side of
  // the screen on narrow phones (Gilles' Vivaldi report, forum
  // 2026-09-01). Pinning to the viewport gives us a predictable
  // right-aligned card whatever the underlying layout does.
  position: fixed;
  top: calc(52px + env(safe-area-inset-top) + 0.5rem);
  right: 0.5rem;
  left: auto;
  min-width: 280px;
  max-width: calc(100vw - 1rem);
  background: white;
  border-radius: 10px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
  padding: 0.75rem 0.9rem;
  z-index: 50;

  hr {
    margin: 0.6rem 0;
    border: none;
    border-top: 1px solid rgba(0, 0, 0, 0.06);
  }
}

.start-outing-menu-row {
  // Explicit inner padding so the toggle label + hint never touch
  // the menu edges, even when the menu itself is cropped by the
  // viewport width guard above.
  padding: 0 0.15rem;
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

.start-outing-wakelock {
  opacity: 0.75;
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

.start-outing-modal-warning {
  display: flex;
  align-items: flex-start;
  padding: 0.6rem 0.7rem;
  margin: 0 0 1rem;
  border-radius: 8px;
  background: #fff5e6;
  border: 1px solid rgba(255, 153, 51, 0.5);
  color: #a35a00;
  font-size: 0.8rem;
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
  .start-outing-modal-warning {
    background: #3a2f1a;
    border-color: rgba(255, 153, 51, 0.4);
    color: #ffb866;
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
