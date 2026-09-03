<template>
  <section class="section app-settings-view">
    <div class="container">
      <!-- Custom heading classes (not Bulma .title/.subtitle) — Bulma
           applies a negative `margin-top: -1.25rem` on `.title +
           .subtitle` which dragged the subtitle visibly onto the title
           on iOS Safari with a 14px base font. Plain heading + lede is
           predictable. -->
      <h1 class="app-settings-heading">{{ $gettext("Paramètres de l'application") }}</h1>
      <p class="app-settings-lede">
        {{ $gettext('Réglages locaux à cet appareil — pas synchronisés avec votre compte Camptocamp.') }}
      </p>

      <!-- Theme -->
      <h2 class="section-label">{{ $gettext('Thème') }}</h2>
      <div class="option-row">
        <button
          v-for="opt in themeOptions"
          :key="opt.value"
          type="button"
          class="option-btn"
          :class="{ 'is-active': $appSettings.state.theme === opt.value }"
          @click="$appSettings.setTheme(opt.value)"
        >
          <fa-icon :icon="opt.icon" />
          <span>{{ opt.label }}</span>
        </button>
      </div>
      <p class="note">{{ $gettext('« Auto » suit le réglage de votre système.') }}</p>

      <!-- GPS frequency (CDC §2.9). Live-reset the GPS watch when the
           user picks a new value while tracking is running — otherwise
           the change would only kick in on the next start/stop cycle. -->
      <h2 class="section-label">{{ $gettext('Fréquence GPS') }}</h2>
      <div class="option-row">
        <button
          v-for="opt in gpsIntervalOptions"
          :key="opt.value"
          type="button"
          class="option-btn"
          :class="{ 'is-active': $appSettings.state.gpsIntervalS === opt.value }"
          @click="setGpsInterval(opt.value)"
        >
          <span class="gps-interval-value">{{ opt.value }}s</span>
          <span>{{ opt.label }}</span>
        </button>
      </div>
      <p class="note">{{ $gettext('Un intervalle plus long économise la batterie mais lisse la trace.') }}</p>

      <!-- Units (CDC §2.9). Display only: Camptocamp stores metres and
           the app publishes metres whatever is chosen here. -->
      <h2 class="section-label">{{ $gettext('Unités') }}</h2>
      <div class="option-row">
        <button
          v-for="opt in unitOptions"
          :key="opt.value"
          type="button"
          class="option-btn"
          :class="{ 'is-active': $appSettings.state.units === opt.value }"
          @click="setUnits(opt.value)"
        >
          <span class="gps-interval-value">{{ opt.short }}</span>
          <span>{{ opt.label }}</span>
        </button>
      </div>
      <p class="note">
        {{ $gettext('Ne change que l’affichage. Vos sorties restent publiées en mètres sur Camptocamp.') }}
      </p>

      <!-- Text size -->
      <h2 class="section-label">{{ $gettext('Taille du texte') }}</h2>
      <div class="option-row">
        <button
          v-for="opt in textSizeOptions"
          :key="opt.value"
          type="button"
          class="option-btn"
          :class="{ 'is-active': $appSettings.state.textSize === opt.value }"
          @click="$appSettings.setTextSize(opt.value)"
        >
          <span :style="{ fontSize: opt.demoSize }">Aa</span>
          <span>{{ opt.label }}</span>
        </button>
      </div>
      <p class="note">{{ $gettext("Ajuste la taille de base de l'interface. Affecte tous les écrans.") }}</p>

      <!-- Replay onboarding -->
      <h2 class="section-label">{{ $gettext('Découverte') }}</h2>
      <button type="button" class="button is-light is-fullwidth replay-btn" @click="replayOnboarding">
        <fa-icon icon="circle-info" />
        <span>&nbsp;{{ $gettext("Revoir l'introduction") }}</span>
      </button>
    </div>
  </section>
</template>

<script>
export default {
  name: 'AppSettingsView',

  computed: {
    themeOptions() {
      return [
        { value: 'auto', label: this.$gettext('Auto'), icon: 'gear' },
        { value: 'light', label: this.$gettext('Clair'), icon: 'sun' },
        { value: 'dark', label: this.$gettext('Sombre'), icon: 'moon' },
      ];
    },
    unitOptions() {
      return [
        { value: 'metric', short: 'km / m', label: this.$gettext('Métrique') },
        { value: 'imperial', short: 'mi / ft', label: this.$gettext('Impérial') },
      ];
    },
    textSizeOptions() {
      return [
        { value: 'small', label: this.$gettext('Petit'), demoSize: '0.85rem' },
        { value: 'normal', label: this.$gettext('Normal'), demoSize: '1rem' },
        { value: 'large', label: this.$gettext('Grand'), demoSize: '1.2rem' },
      ];
    },
    gpsIntervalOptions() {
      return [
        { value: '5', label: this.$gettext('Précis') },
        { value: '15', label: this.$gettext('Équilibré') },
        { value: '30', label: this.$gettext('Économe') },
      ];
    },
  },

  methods: {
    setUnits(value) {
      this.$appSettings.setUnits(value);
    },

    setGpsInterval(value) {
      this.$appSettings.setGpsIntervalS(value);
      // If a session is actively tracking, restart the watch so the new
      // interval takes effect immediately.
      if (this.$outingSession?.gpsTracking) {
        this.$outingSession.gpsTracking = false;
        this.$nextTick(() => {
          this.$outingSession.gpsTracking = true;
        });
      }
    },

    replayOnboarding() {
      try {
        window.localStorage.removeItem('v3.onboardingDone');
      } catch {
        // ignore
      }
      // OnboardingTour is mounted permanently in App.vue — tell it to show.
      window.dispatchEvent(new Event('v3:replayOnboarding'));
      // Land on /home so the tour overlays the activity feed — a calmer
      // backdrop than the settings page itself.
      this.$router.push({ name: 'home' }).catch(() => {});
    },
  },
};
</script>

<style lang="scss" scoped>
.app-settings-view {
  padding-bottom: calc(80px + env(safe-area-inset-bottom));
}

.app-settings-heading {
  font-size: 1.15rem;
  font-weight: 700;
  color: #4a4a4a;
  margin: 0 0 0.3rem;
  line-height: 1.25;
}

.app-settings-lede {
  font-size: 0.82rem;
  color: #6b6b6b;
  margin: 0 0 1.25rem;
  line-height: 1.45;
}

.section-label {
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #6b6b6b;
  margin: 1.25rem 0 0.5rem;
}

.option-row {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 0.5rem;
}

.option-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.3rem;
  padding: 0.75rem 0.5rem;
  background: white;
  border: 1px solid rgba(0, 0, 0, 0.12);
  color: #4a4a4a;
  font-size: 0.8rem;
  font-weight: 500;
  cursor: pointer;
  transition: box-shadow 0.15s, border-color 0.15s;

  &:hover,
  &:focus {
    outline: none;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.08);
  }

  &.is-active {
    border-color: #ff9933;
    background: #fff5e6;
    color: #4a4a4a;
  }
}

.note {
  margin-top: 0.5rem;
  font-size: 0.75rem;
  color: #6b6b6b;
}

.gps-interval-value {
  font-weight: 700;
  font-size: 1.05rem;
  color: #4a4a4a;
}
</style>

<style lang="scss">
// Dark mode counterparts — out-specifies the scoped rules above via the
// html[data-theme='dark'] attribute selector.
html[data-theme='dark'] {
  .app-settings-view .app-settings-heading {
    color: #f5f5f5;
  }
  .app-settings-view .app-settings-lede,
  .app-settings-view .section-label,
  .app-settings-view .note {
    color: #9a9a9a;
  }
  .app-settings-view .option-btn {
    background: #2a2a2a;
    border-color: rgba(255, 255, 255, 0.1);
    color: #e5e5e5;
    &.is-active {
      border-color: #ff9933;
      background: #3a2f1a;
      color: #fff;
    }
  }
}
</style>
