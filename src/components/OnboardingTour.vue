<template>
  <div
    v-if="visible"
    class="onboarding-overlay"
    role="dialog"
    aria-modal="true"
    :aria-label="$gettext('Bienvenue sur Camptocamp')"
  >
    <div class="onboarding-card">
      <button type="button" class="onboarding-skip" :aria-label="$gettext('Passer')" @click="finish">
        <fa-icon icon="xmark" />
      </button>

      <div class="onboarding-slide">
        <div class="onboarding-icon">
          <fa-icon :icon="current.icon" />
        </div>
        <h2 class="onboarding-title">{{ current.title }}</h2>
        <p v-if="current.text" class="onboarding-text">{{ current.text }}</p>
        <app-install-steps v-if="current.install" class="onboarding-install" />
        <ul v-if="current.list" class="onboarding-list">
          <li v-for="item in current.list" :key="item.icon">
            <fa-icon :icon="item.icon" fixed-width class="onboarding-list-icon" />
            <span>{{ item.text }}</span>
          </li>
        </ul>
        <router-link v-if="current.guide" :to="{ name: 'app-guide' }" class="onboarding-guide" @click.native="finish">
          <fa-icon icon="book-open" />
          {{ $gettext("Lire le guide de l'application") }}
        </router-link>
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
        <button v-if="step > 0" type="button" class="onboarding-btn onboarding-btn-secondary" @click="step--">
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
        <button v-else type="button" class="onboarding-btn onboarding-btn-primary" @click="finish">
          {{ $gettext("C'est parti") }}
        </button>
      </div>
    </div>
  </div>
</template>

<script>
// First-launch tour shown once per device. The flag `v3.onboardingDone`
// lives in localStorage; clearing it (or browser storage) replays the
// tour. Kept dependency-free on purpose — four slides don't justify a
// tour library (and matches the "minimize maintenance" preference).
//
// Its second slide asks to add the app to the home screen (Sixte,
// 2026-11-06): that is what makes it an app, and on iPhone what keeps the
// offline topos — Safari clears the storage of a site that is not on the
// home screen after seven days without a visit. Skipped once installed.
import AppInstallSteps from '@/components/AppInstallSteps';
import install from '@/pwa/install';

const STORAGE_KEY = 'v3.onboardingDone';

export default {
  name: 'OnboardingTour',

  components: { AppInstallSteps },

  data() {
    return {
      visible: false,
      step: 0,
      install,
    };
  },

  computed: {
    slides() {
      const slides = [
        {
          icon: 'mountain',
          title: this.$gettext('Bienvenue sur Camptocamp'),
          text: this.$gettext(
            'Topos, sorties, conditions et récits pour la montagne — accessibles depuis votre poche.'
          ),
        },
      ];
      if (!this.install.installed) {
        slides.push({
          icon: 'mobile-screen',
          title: this.$gettext("Installez l'application"),
          text: this.$gettext(
            "Ajoutez Camptocamp à l'écran d'accueil : une icône comme une vraie application, tout l'écran, et vos topos hors ligne à l'abri. Sur iPhone, Safari efface les données d'un site non installé après 7 jours sans visite."
          ),
          install: true,
        });
      }
      slides.push(
        {
          icon: 'list',
          title: this.$gettext("Ce que l'application vous apporte"),
          list: [
            { icon: 'bookmark', text: this.$gettext('Mes topos hors ligne : texte, photos et carte, sans réseau.') },
            {
              icon: 'cloud-arrow-up',
              text: this.$gettext('Vos sorties saisies sans réseau, à publier au retour de la connexion.'),
            },
            {
              icon: 'route',
              text: this.$gettext(
                'La trace de votre sortie, depuis un fichier GPX ou votre montre (Strava, Garmin, Suunto…).'
              ),
            },
            { icon: 'clock', text: this.$gettext('Le fil Récent, avec toutes les photos des sorties.') },
            { icon: 'comments', text: this.$gettext("Le forum, dans l'application.") },
            { icon: 'moon', text: this.$gettext('Thème sombre et texte plus grand : Moi → Paramètres.') },
          ],
        },
        {
          icon: 'book-open',
          title: this.$gettext('Pour aller plus loin'),
          text: this.$gettext(
            'Cinq onglets en bas : Recherche, Récent, Mes topos, Moi et Plus. Tout le fonctionnement est expliqué dans le guide. Bonne course !'
          ),
          guide: true,
        }
      );
      return slides;
    },
    current() {
      // The install slide disappears if the app gets installed meanwhile.
      return this.slides[Math.min(this.step, this.slides.length - 1)];
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

.onboarding-install {
  width: 100%;
}

.onboarding-list {
  width: 100%;
  margin: 0;
  padding: 0;
  list-style: none;
  text-align: left;
  font-size: 0.88rem;
  color: #4a4a4a;

  li {
    display: flex;
    gap: 0.6rem;
    align-items: baseline;
    padding: 0.3rem 0;
  }
}

.onboarding-list-icon {
  flex: none;
  color: #ff9933;
}

.onboarding-guide {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  font-weight: 600;
  color: $color-link;
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
  .onboarding-title {
    color: #f5f5f5;
  }
  .onboarding-text {
    color: #b5b5b5;
  }
  .onboarding-list {
    color: #e5e5e5;
  }
  .onboarding-skip {
    color: #b5b5b5;
    &:hover {
      background: rgba(255, 255, 255, 0.08);
      color: #fff;
    }
  }
  .onboarding-icon {
    background: #3a2f1a;
  }
  .onboarding-btn-secondary {
    color: #e5e5e5;
    border-color: rgba(255, 255, 255, 0.15);
    &:hover {
      background: rgba(255, 255, 255, 0.06);
    }
  }
}
</style>
