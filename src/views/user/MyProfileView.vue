<template>
  <section class="section my-profile-view">
    <div class="container">
      <!-- Not logged in: bounce to /me which holds the sign-in CTA. -->
      <div v-if="!$user.isLogged">
        <p>{{ $gettext('Connecte-toi pour voir ton profil.') }}</p>
        <router-link :to="{ name: 'auth' }" class="button is-primary">
          {{ $gettext('Se connecter') }}
        </router-link>
      </div>

      <template v-else>
        <!-- Profile header — name + summary + description loaded from
             /profiles/<id>. Avoids the V1 ProfileView's profile-feed widget
             which mixes activities from other users. -->
        <header class="profile-header">
          <div class="avatar">{{ initial }}</div>
          <div class="profile-header-text">
            <h1 class="profile-name">{{ displayName }}</h1>
            <p class="profile-username">@{{ $user.userName }}</p>
            <p v-if="profileSummary" class="profile-summary">{{ profileSummary }}</p>
          </div>
        </header>

        <div v-if="profileDescription" class="profile-description" v-html="profileDescription" />

        <!-- Each section fetches up to 5 items filtered to this user only.
             "Voir tout" links keep the existing V1 listings reachable. -->
        <section v-for="block in sections" :key="block.key" class="contrib-block">
          <header class="contrib-header">
            <h2>{{ block.title }}</h2>
            <router-link :to="block.allLink" class="see-all">
              {{ $gettext('Voir tout') }} →
            </router-link>
          </header>

          <div v-if="block.loading" class="loading-row">
            <fa-icon icon="spinner" spin /> {{ $gettext('Chargement…') }}
          </div>

          <div v-else-if="block.error" class="error-row">
            {{ $gettext('Impossible de charger.') }}
          </div>

          <div v-else-if="!block.items.length" class="empty-row">
            {{ block.emptyLabel }}
          </div>

          <ul v-else class="contrib-list">
            <li v-for="item in block.items.slice(0, 5)" :key="item.document_id" class="contrib-item">
              <router-link
                :to="{ name: block.routeName, params: { id: item.document_id, lang: itemLang(item) } }"
                class="contrib-link"
              >
                <span class="contrib-title">{{ itemTitle(item) }}</span>
                <span v-if="block.subline(item)" class="contrib-subline">{{ block.subline(item) }}</span>
              </router-link>
            </li>
          </ul>
        </section>
      </template>
    </div>
  </section>
</template>

<script>
import c2c from '@/js/apis/c2c';

export default {
  name: 'MyProfileView',

  data() {
    return {
      profileDoc: null,
      outings: { loading: true, error: false, items: [] },
      xreports: { loading: true, error: false, items: [] },
    };
  },

  computed: {
    initial() {
      const src = this.$user.name || this.$user.userName || '?';
      return src.charAt(0).toUpperCase();
    },

    displayName() {
      return this.$user.name || this.$user.userName || '';
    },

    profileLocale() {
      const locales = this.profileDoc?.locales;
      if (!Array.isArray(locales) || !locales.length) return null;
      return locales.find((l) => l.lang === this.$user.lang) || locales[0];
    },

    profileSummary() {
      return this.profileLocale?.summary || '';
    },

    profileDescription() {
      // The cooked endpoint returns HTML — we trust the C2C sanitization.
      return this.profileDoc?.cooked?.description || '';
    },

    sections() {
      const u = String(this.$user.id);
      return [
        {
          key: 'outings',
          title: this.$gettext('Mes sorties'),
          loading: this.outings.loading,
          error: this.outings.error,
          items: this.outings.items,
          emptyLabel: this.$gettext('Aucune sortie publiée pour le moment.'),
          routeName: 'outings',
          allLink: { name: 'outings', query: { u } },
          subline: (o) => {
            if (o.date_start) {
              try {
                return new Date(o.date_start).toLocaleDateString('fr-FR', {
                  day: 'numeric', month: 'short', year: 'numeric',
                });
              } catch {
                return o.date_start;
              }
            }
            return '';
          },
        },
        {
          key: 'xreports',
          title: this.$gettext('Mes récits Sérac'),
          loading: this.xreports.loading,
          error: this.xreports.error,
          items: this.xreports.items,
          emptyLabel: this.$gettext('Aucun récit Sérac partagé.'),
          routeName: 'xreports',
          allLink: { name: 'xreports', query: { u } },
          subline: (x) => x.event_type || '',
        },
      ];
    },
  },

  mounted() {
    this.loadProfile();
    this.loadOutings();
    this.loadXreports();
  },

  methods: {
    itemTitle(item) {
      const locales = item.locales;
      if (Array.isArray(locales) && locales.length) {
        const match = locales.find((l) => l.lang === this.$user.lang) || locales[0];
        return match?.title || this.$gettext('Sans titre');
      }
      return this.$gettext('Sans titre');
    },

    itemLang(item) {
      const locales = item.locales;
      if (Array.isArray(locales) && locales.length) return locales[0].lang;
      return this.$user.lang || 'fr';
    },

    loadProfile() {
      if (!this.$user.id) return;
      c2c.profile
        .get(this.$user.id, this.$user.lang)
        .then((response) => {
          this.profileDoc = response.data;
        })
        .catch(() => {
          this.profileDoc = null;
        });
    },

    loadOutings() {
      if (!this.$user.id) return;
      this.outings.loading = true;
      c2c.outing
        .getAll({ u: String(this.$user.id), limit: 10 })
        .then((response) => {
          this.outings.items = response.data.documents || [];
          this.outings.loading = false;
        })
        .catch(() => {
          this.outings.error = true;
          this.outings.loading = false;
        });
    },

    loadXreports() {
      if (!this.$user.id) return;
      this.xreports.loading = true;
      c2c.xreport
        .getAll({ u: String(this.$user.id), limit: 10 })
        .then((response) => {
          this.xreports.items = response.data.documents || [];
          this.xreports.loading = false;
        })
        .catch(() => {
          this.xreports.error = true;
          this.xreports.loading = false;
        });
    },
  },
};
</script>

<style lang="scss" scoped>
.my-profile-view {
  padding-bottom: calc(80px + env(safe-area-inset-bottom));
}

.profile-header {
  display: flex;
  align-items: center;
  gap: 1rem;
  background: white;
  border: 1px solid rgba(0, 0, 0, 0.12);
  padding: 1rem;
  margin-bottom: 0.75rem;
}

.avatar {
  flex: 0 0 auto;
  width: 64px;
  height: 64px;
  border-radius: 50%;
  background: linear-gradient(135deg, #ff9933, #b26f1e);
  color: white;
  font-size: 1.6rem;
  font-weight: 700;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.profile-header-text {
  flex: 1;
  min-width: 0;
}

.profile-name {
  font-size: 1.2rem;
  font-weight: 700;
  color: #4a4a4a;
  margin: 0;
  line-height: 1.2;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.profile-username {
  font-size: 0.85rem;
  color: #6b6b6b;
  margin: 0.1rem 0 0.3rem;
}

.profile-summary {
  font-size: 0.85rem;
  color: #4a4a4a;
  margin: 0;
}

.profile-description {
  background: white;
  border: 1px solid rgba(0, 0, 0, 0.12);
  padding: 0.75rem 1rem;
  margin-bottom: 1rem;
  font-size: 0.85rem;
  color: #4a4a4a;

  ::v-deep p { margin: 0.25rem 0; }
  ::v-deep ul, ::v-deep ol { padding-left: 1.2rem; }
}

.contrib-block {
  background: white;
  border: 1px solid rgba(0, 0, 0, 0.12);
  margin-bottom: 0.75rem;
}

.contrib-header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  padding: 0.75rem;
  border-bottom: 1px solid rgba(0, 0, 0, 0.08);

  h2 {
    font-size: 0.85rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: #4a4a4a;
    margin: 0;
  }
}

.see-all {
  font-size: 0.75rem;
  color: #337ab7;
  text-decoration: none;
}

.loading-row,
.error-row,
.empty-row {
  padding: 0.75rem;
  font-size: 0.85rem;
  color: #6b6b6b;
}

.error-row { color: #b91c1c; }

.contrib-list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.contrib-item + .contrib-item {
  border-top: 1px solid rgba(0, 0, 0, 0.06);
}

.contrib-link {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  padding: 0.65rem 0.75rem;
  color: #4a4a4a;
  text-decoration: none;

  &:hover {
    background: #fbf9f3;
    color: #4a4a4a;
  }
}

.contrib-title {
  font-weight: 600;
  font-size: 0.9rem;
  color: #337ab7;
}

.contrib-subline {
  font-size: 0.75rem;
  color: #6b6b6b;
}
</style>
