<template>
  <div v-if="visible" class="onboarding-overlay" role="dialog" aria-modal="true" :aria-label="$gettext('Bienvenue sur Camptocamp')">
    <div class="onboarding-card">
      <button
        type="button"
        class="onboarding-skip"
        :aria-label="$gettext('Passer')"
        @click="finish"
      >
        <fa-icon icon="xmark" />
      </button>

      <div class="onboarding-slide">
        <div class="onboarding-icon">
          <fa-icon :icon="current.icon" />
        </div>
        <h2 class="onboarding-title">{{ current.title }}</h2>
        <p class="onboarding-text">{{ current.text }}</p>
      </div>

      <div class="onboarding-dots" role="tablist">
        <button
          v-for="(slide, i) in slides"
          :key="i"
          type="button"
          class="onboarding-dot"
          :class="{ 'is-active': i === step }"
          :aria-label="$gettext('Étape ') + (i + 1)"
          @click="step = i"
        />
      </div>

      <div class="onboarding-actions">
        <button
          v-if="step > 0"
          type="button"
          class="onboarding-btn onboarding-btn-secondary"
          @click="step--"
        >
          {{ $gettext('Précédent') }}
        </button>
        <button
          v-if="step < slides.length - 1"
          type="button"
          class="onboarding-btn onboarding-btn-primary"
          @click="step++"
        >
          {{ $gettext('Suivant') }}
        </button>
        <button
          v-else
          type="button"
          class="onboarding-btn onboarding-btn-primary"
          @click="finish"
        >
          {{ $gettext('C\'est parti') }}
        </button>
      </div>
    </div>
  </div>
</template>

<script>
// First-launch tour shown once per device. The flag `v3.onboardingDone`
// lives in localStorage; clearing it (or browser storage) replays the
// tour. Kept dependency-free on purpose — three slides don't justify a
// tour library (and matches the "minimize maintenance" preference).

const STORAGE_KEY = 'v3.onboardingDone';

export default {
  name: 'OnboardingTour',

  data() {
    return {
      visible: false,
      step: 0,
    };
  },

  computed: {
    slides() {
      return [
        {
          icon: 'mountain',
          title: this.$gettext('Bienvenue sur Camptocamp'),
          text: this.$gettext('Topos, sorties, conditions et récits pour la montagne — accessibles depuis votre poche.'),
        },
        {
          icon: 'bars',
          title: this.$gettext('Naviguer'),
          text: this.$gettext('Cinq onglets en bas : Recherche, Récent, Mes topos hors-ligne, Moi et Plus pour le reste.'),
        },
        {
          icon: 'bookmark',
          title: this.$gettext('Hors-ligne'),
          text: this.$gettext('Sur une fiche, touchez le marque-page pour la garder accessible sans réseau.'),
        },
        {
          icon: 'circle-info',
          title: this.$gettext('À tout moment'),
          text: this.$gettext('Onglet Moi → Paramètres pour le thème et la taille du texte. Bonne course !'),
        },
      ];
    },
    current() {
      return this.slides[this.step];
    },
  },

  mounted() {
    try {
      if (!window.localStorage.getItem(STORAGE_KEY)) {
        this.visible = true;
      }
    } catch {
      // localStorage blocked — skip the tour rather than nag every visit
    }
    // Allow other views (AppSettings) to replay the tour without remount.
    this.onReplay = () => {
      this.step = 0;
      this.visible = true;
    };
    window.addEventListener('v3:replayOnboarding', this.onReplay);
  },

  beforeDestroy() {
    if (this.onReplay) {
      window.removeEventListener('v3:replayOnboarding', this.onReplay);
    }
  },

  methods: {
    finish() {
      try {
        window.localStorage.setItem(STORAGE_KEY, '1');
      } catch {
        // ignore
      }
      this.visible = false;
    },
  },
};
</script>

<style lang="scss" scoped>
.onboarding-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 50;
  padding: 1rem;
  // Sit above all V3 chrome (BottomNav z=28, MobileTopBar z=26, FABs z=25)
  // but below the imageViewer overlay (which uses 100+).
}

.onboarding-card {
  position: relative;
  width: 100%;
  max-width: 380px;
  background: white;
  border-radius: 12px;
  padding: 1.5rem 1.25rem 1.25rem;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.3);
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.onboarding-skip {
  position: absolute;
  top: 0.5rem;
  right: 0.5rem;
  background: transparent;
  border: none;
  width: 32px;
  height: 32px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 1rem;
  color: #6b6b6b;
  cursor: pointer;
  border-radius: 50%;

  &:hover {
    background: rgba(0, 0, 0, 0.05);
    color: #4a4a4a;
  }
}

.onboarding-slide {
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.6rem;
  padding: 0.5rem 0;
  min-height: 180px;
}

.onboarding-icon {
  width: 64px;
  height: 64px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: #fff5e6;
  color: #ff9933;
  font-size: 1.8rem;
  border-radius: 50%;
}

.onboarding-title {
  font-size: 1.15rem;
  font-weight: 700;
  color: #4a4a4a;
  margin: 0;
}

.onboarding-text {
  font-size: 0.9rem;
  color: #6b6b6b;
  line-height: 1.4;
  margin: 0;
}

.onboarding-dots {
  display: flex;
  justify-content: center;
  gap: 0.4rem;
}

.onboarding-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #d1d5db;
  border: none;
  padding: 0;
  cursor: pointer;
  transition: background 0.15s, transform 0.15s;

  &.is-active {
    background: #ff9933;
    transform: scale(1.3);
  }
}

.onboarding-actions {
  display: flex;
  gap: 0.5rem;
  justify-content: flex-end;
}

.onboarding-btn {
  padding: 0.55rem 1rem;
  font-size: 0.9rem;
  font-weight: 600;
  border: none;
  border-radius: 6px;
  cursor: pointer;
}

.onboarding-btn-primary {
  background: #ff9933;
  color: white;

  &:hover {
    background: #e6791f;
  }
}

.onboarding-btn-secondary {
  background: transparent;
  color: #4a4a4a;
  border: 1px solid rgba(0, 0, 0, 0.12);

  &:hover {
    background: rgba(0, 0, 0, 0.04);
  }
}
</style>

<style lang="scss">
// Dark mode counterparts. Out-specifies scoped rules via html[data-theme].
html[data-theme='dark'] {
  .onboarding-card {
    background: #2a2a2a;
    box-shadow: 0 12px 40px rgba(0, 0, 0, 0.6);
  }
  .onboarding-title { color: #f5f5f5; }
  .onboarding-text { color: #b5b5b5; }
  .onboarding-skip {
    color: #b5b5b5;
    &:hover { background: rgba(255, 255, 255, 0.08); color: #fff; }
  }
  .onboarding-icon { background: #3a2f1a; }
  .onboarding-btn-secondary {
    color: #e5e5e5;
    border-color: rgba(255, 255, 255, 0.15);
    &:hover { background: rgba(255, 255, 255, 0.06); }
  }
}
</style>
