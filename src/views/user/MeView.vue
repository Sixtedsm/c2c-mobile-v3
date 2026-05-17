<template>
  <section class="section me-view">
    <div class="container">
      <!-- Header: avatar, name, username, public profile link -->
      <header v-if="$user.isLogged" class="me-header">
        <div class="avatar" aria-hidden="true">{{ initial }}</div>
        <div class="me-header-text">
          <p class="me-display-name">{{ displayName }}</p>
          <p class="me-username">@{{ $user.userName }}</p>
          <router-link
            v-if="$user.id"
            :to="{ name: 'profile', params: { id: $user.id, lang: $user.lang || 'fr' } }"
            class="public-profile-link"
          >
            {{ $gettext('Voir mon profil') }}
            <fa-icon icon="chevron-right" />
          </router-link>
        </div>
      </header>

      <!-- Not logged in: sign-in CTA. -->
      <div v-else class="me-header me-header--guest">
        <div class="avatar avatar--guest" aria-hidden="true">
          <fa-icon icon="user" />
        </div>
        <div class="me-header-text">
          <p class="me-display-name">{{ $gettext('Non connecté') }}</p>
          <p class="me-username">{{ $gettext('Connecte-toi pour retrouver tes sorties et tes contributions.') }}</p>
          <router-link :to="{ name: 'auth' }" class="button is-primary is-small me-signin">
            {{ $gettext('Se connecter') }}
          </router-link>
        </div>
      </div>

      <!-- My content. Only links to endpoints that actually filter by user
           on the C2C API:
           - /outings?u=<id> filters by participant (works).
           - /xreports?u=<id> filters by report author (works).
           - /whatsnew?u=<id> shows the wiki edit history of this user
             (works, lets us aggregate routes/waypoints/photos/articles
             that have no per-user filter on their bare listing). -->
      <template v-if="$user.isLogged && $user.id">
        <h2 class="section-label">{{ $gettext('Mes contributions') }}</h2>
        <ul class="action-grid">
          <li v-for="action in myContent" :key="action.key">
            <router-link :to="action.to" class="action-link">
              <span class="action-icon">
                <custom-icon :name="action.icon" :size="28" />
              </span>
              <span class="action-text">
                <span class="action-label">{{ action.label }}</span>
                <span class="action-desc">{{ action.desc }}</span>
              </span>
              <fa-icon icon="chevron-right" class="action-chevron" />
            </router-link>
          </li>
        </ul>

        <h2 class="section-label">{{ $gettext('Mon compte') }}</h2>
        <ul class="action-grid">
          <li v-for="action in myAccount" :key="action.key">
            <router-link :to="action.to" class="action-link">
              <span class="action-icon">
                <custom-icon :name="action.icon" :size="28" />
              </span>
              <span class="action-text">
                <span class="action-label">{{ action.label }}</span>
                <span class="action-desc">{{ action.desc }}</span>
              </span>
              <fa-icon icon="chevron-right" class="action-chevron" />
            </router-link>
          </li>
        </ul>

        <button class="button is-light is-fullwidth signout" @click="signOut">
          <fa-icon icon="right-from-bracket" />
          <span>&nbsp;{{ $gettext('Déconnexion') }}</span>
        </button>
      </template>

      <!-- Always visible (logged in or not): app settings + help +
           report a problem + footer links to legal articles. Mirrors
           what the V1 SideMenu footer exposed. -->
      <h2 class="section-label support-label">{{ $gettext('Application') }}</h2>
      <ul class="action-grid">
        <li>
          <router-link :to="{ name: 'app-settings' }" class="action-link">
            <span class="action-icon"><fa-icon icon="palette" /></span>
            <span class="action-text">
              <span class="action-label">{{ $gettext('Paramètres de l\'application') }}</span>
              <span class="action-desc">{{ $gettext('Thème, taille du texte') }}</span>
            </span>
            <fa-icon icon="chevron-right" class="action-chevron" />
          </router-link>
        </li>
      </ul>

      <h2 class="section-label support-label">{{ $gettext('Aide et support') }}</h2>
      <ul class="action-grid">
        <li>
          <router-link :to="{ name: 'article', params: { id: 106732 } }" class="action-link">
            <span class="action-icon"><fa-icon icon="circle-info" /></span>
            <span class="action-text">
              <span class="action-label">{{ $gettext('Aide') }}</span>
              <span class="action-desc">{{ $gettext('Guide d\'utilisation Camptocamp') }}</span>
            </span>
            <fa-icon icon="chevron-right" class="action-chevron" />
          </router-link>
        </li>
        <li>
          <router-link :to="{ name: 'article', params: { id: 106727 } }" class="action-link">
            <span class="action-icon"><fa-icon icon="envelope" /></span>
            <span class="action-text">
              <span class="action-label">{{ $gettext('Contact / Signaler un problème') }}</span>
              <span class="action-desc">secretariat@camptocamp.org</span>
            </span>
            <fa-icon icon="chevron-right" class="action-chevron" />
          </router-link>
        </li>
      </ul>

      <footer class="footer-links">
        <router-link :to="{ name: 'article', params: { id: 106731 } }">{{ $gettext('Conditions') }}</router-link>
        <span>·</span>
        <router-link :to="{ name: 'article', params: { id: 106728 } }">{{ $gettext('Licences') }}</router-link>
        <span>·</span>
        <router-link :to="{ name: 'article', params: { id: 106726 } }">{{ $gettext('Association') }}</router-link>
      </footer>
    </div>
  </section>
</template>

<script>
import c2c from '@/js/apis/c2c';
import CustomIcon from '@/components/CustomIcon.vue';

export default {
  name: 'MeView',

  components: { CustomIcon },

  computed: {
    initial() {
      const src = this.$user.name || this.$user.userName || '?';
      return src.charAt(0).toUpperCase();
    },

    displayName() {
      // If the user has set a "name" distinct from their login, prefer it,
      // otherwise just use the username. We never concatenate the two — that
      // was the source of the weird "sigDSM / @sig dsm" wrap Sixte saw.
      return this.$user.name || this.$user.userName || '';
    },

    myContent() {
      // Bail out if we don't have a real user id yet — otherwise we'd build
      // links like /outings?u=null which the API treats as "no filter" and
      // returns everyone's data (the bug Sixte saw).
      if (!this.$user.id) return [];
      const u = String(this.$user.id);
      return [
        {
          key: 'my-outings',
          label: this.$gettext('Mes sorties'),
          desc: this.$gettext('Sorties auxquelles j\'ai participé'),
          icon: 'footprint-arrow',
          to: { name: 'outings', query: { u } },
        },
        {
          key: 'my-changes',
          label: this.$gettext('Mes topos publiés'),
          desc: this.$gettext('Itinéraires, points, photos, articles que j\'ai créés ou modifiés'),
          icon: 'mountain-pencil',
          to: { name: 'whatsnew', query: { u } },
        },
        // "Mes récits Sérac" retiré: l'API /xreports?u=<id> ignore le
        // filtre et renvoie toute la base — le lien promettait des
        // récits qui n'existaient pas. Les xreports créés par l'user
        // apparaissent dans "Mes topos publiés" (whatsnew couvre tous
        // les types).
        {
          key: 'offline',
          label: this.$gettext('Mes topos hors-ligne'),
          desc: this.$gettext('Sauvegardes pour usage terrain'),
          icon: 'bookmark-download',
          to: { name: 'offline' },
        },
      ];
    },

    myAccount() {
      return [
        {
          key: 'preferences',
          label: this.$gettext('Préférences'),
          desc: this.$gettext('Activités suivies, filtres par défaut'),
          icon: 'sliders',
          to: { name: 'preferences' },
        },
        {
          key: 'following',
          label: this.$gettext('Personnes suivies'),
          desc: this.$gettext('Voir mes amis et mentors'),
          icon: 'two-hikers',
          to: { name: 'following' },
        },
        {
          key: 'account',
          label: this.$gettext('Compte'),
          desc: this.$gettext('Email, mot de passe, paramètres'),
          icon: 'user-settings',
          to: { name: 'account' },
        },
        {
          key: 'trackers',
          label: this.$gettext('Trackers'),
          desc: this.$gettext('Strava, Suunto, Polar, Garmin…'),
          icon: 'gps-pin',
          to: { name: 'trackers' },
        },
      ];
    },
  },

  methods: {
    signOut() {
      c2c.userProfile
        .logout()
        .then(() => {
          this.$user.signout();
          this.$router.push({ name: 'home' });
        })
        .catch(() => {
          this.$user.signout();
          this.$router.push({ name: 'home' });
        });
    },
  },
};
</script>

<style lang="scss" scoped>
.me-view {
  padding-bottom: calc(80px + env(safe-area-inset-bottom));
}

.me-header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  background: white;
  border: 1px solid rgba(0, 0, 0, 0.12);
  padding: 1rem;
  margin-bottom: 1rem;
}

.avatar {
  flex: 0 0 auto;
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background: linear-gradient(135deg, #ff9933, #b26f1e);
  color: white;
  font-size: 1.4rem;
  font-weight: 700;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.avatar--guest {
  background: #e5e7eb;
  color: #6b7280;
  font-size: 1.6rem;
}

.me-header-text {
  flex: 1;
  min-width: 0;
}

// Plain paragraphs instead of Bulma titles to avoid the responsive scaling
// + word-break tricks that broke the display ("SixteDSM" was being split
// awkwardly into "Sixt" / "edsm" and read as "sig" / "DSM" by users).
.me-display-name {
  font-size: 1.1rem;
  font-weight: 700;
  color: #4a4a4a;
  margin: 0;
  line-height: 1.2;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.me-username {
  font-size: 0.85rem;
  color: #6b6b6b;
  margin: 0.1rem 0 0.4rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.public-profile-link {
  font-size: 0.8rem;
  color: #337ab7;
  text-decoration: none;
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
}

.me-signin {
  margin-top: 0.4rem;
}

.section-label {
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #6b6b6b;
  margin: 1rem 0 0.4rem;
}

.action-grid {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0.4rem;
}

.action-link {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.6rem 0.75rem;
  background: white;
  border: 1px solid rgba(0, 0, 0, 0.12);
  color: #4a4a4a;
  text-decoration: none;
  transition: box-shadow 0.15s;

  &:hover,
  &:focus {
    text-decoration: none;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.08);
    color: #4a4a4a;
  }
}

.action-icon {
  flex: 0 0 auto;
  width: 42px;
  height: 42px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: #fff5e6;
  border-radius: 4px;
}

.action-text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.action-label {
  font-weight: 600;
  font-size: 0.9rem;
}

.action-desc {
  font-size: 0.7rem;
  color: #6b6b6b;
}

.action-chevron {
  color: #9ca3af;
  flex: 0 0 auto;
}

.signout {
  margin-top: 1.2rem;
}

.support-label {
  margin-top: 1.5rem;
}

.footer-links {
  margin-top: 1.5rem;
  padding-top: 1rem;
  border-top: 1px solid rgba(0, 0, 0, 0.08);
  text-align: center;
  font-size: 0.75rem;
  color: #6b6b6b;

  a {
    color: #337ab7;
    text-decoration: none;
    padding: 0 0.25rem;
  }
}
</style>
