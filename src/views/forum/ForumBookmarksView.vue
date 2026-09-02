<template>
  <section class="section forum-bookmarks-view">
    <div class="container">
      <p class="fb-breadcrumb">
        <router-link :to="{ name: 'forum' }">{{ $gettext('Forum') }}</router-link>
        <span class="fb-breadcrumb-sep">›</span>
        <span>{{ $gettext('Mes marque-pages') }}</span>
      </p>

      <h1 class="title is-5 fb-title">
        <fa-icon icon="bookmark" />
        &nbsp;{{ $gettext('Mes marque-pages') }}
      </h1>

      <div v-if="!$user.isLogged" class="fb-signin-notice">
        {{ $gettext('Connectez-vous au forum pour voir vos marque-pages.') }}
        <router-link :to="{ name: 'auth' }" class="button is-primary is-small">
          {{ $gettext('Se connecter') }}
        </router-link>
      </div>

      <template v-else>
        <div v-if="loading" class="fb-loading"><fa-icon icon="spinner" spin /> {{ $gettext('Chargement…') }}</div>

        <div v-else-if="needsForumLogin" class="fb-notice">
          {{
            $gettext(
              'Vos marque-pages sont stockés sur le forum Discourse et requièrent une session sur forum.camptocamp.org qui n’est pas encore partagée avec l’application. Cette fonctionnalité arrive bientôt.'
            )
          }}
        </div>

        <div v-else-if="error" class="fb-error">
          {{ $gettext('Impossible de charger vos marque-pages.') }}
        </div>

        <ul v-else-if="bookmarks.length" class="fb-list">
          <li v-for="bm in bookmarks" :key="bm.id" class="fb-item">
            <router-link :to="{ name: 'forum-topic', params: { id: bm.topic_id, slug: bm.slug } }" class="fb-link">
              <span class="fb-item-title">{{ bm.fancy_title || bm.title }}</span>
              <span class="fb-item-meta">
                <span v-if="bm.category_id">
                  <fa-icon icon="folder" />
                  &nbsp;{{ categoryName(bm.category_id) }}
                </span>
                <span>&nbsp;·&nbsp;{{ formatDate(bm.bookmark_created_at || bm.created_at) }}</span>
              </span>
            </router-link>
            <button
              type="button"
              class="fb-remove"
              :title="$gettext('Retirer le marque-page')"
              :disabled="removingId === bm.id"
              @click="removeBookmark(bm)"
            >
              <fa-icon :icon="removingId === bm.id ? 'spinner' : 'trash'" :spin="removingId === bm.id" />
            </button>
          </li>
        </ul>

        <p v-else class="fb-empty">
          {{
            $gettext(
              'Aucun marque-page pour l’instant. Cliquez sur l’icône marque-page en haut d’un sujet pour le sauvegarder ici.'
            )
          }}
        </p>
      </template>
    </div>
  </section>
</template>

<script>
// Lists the current user's Discourse bookmarks. Requires login
// (Discourse session cookie). Bookmarking itself happens on
// ForumTopicView via the bookmark button in the header. Delete is
// available from this view so a user can clean up their list.

import { toast } from 'bulma-toast';

import forum from '@/js/apis/forum';

export default {
  name: 'ForumBookmarksView',

  data() {
    return {
      bookmarks: [],
      categories: [],
      loading: true,
      error: false,
      needsForumLogin: false,
      removingId: null,
    };
  },

  mounted() {
    if (this.$user.isLogged && this.$user.forumUsername) {
      this.load();
    } else {
      this.loading = false;
    }
  },

  methods: {
    async load() {
      this.loading = true;
      this.error = false;
      this.needsForumLogin = false;
      try {
        // getUserBookmarks now goes through authAxios (cookie-based)
        // and returns a raw axios Promise. Categories still through
        // BaseApi (no cookie needed) — hence the mixed unwrap below.
        const [bmRes, catRes] = await Promise.all([
          forum.getUserBookmarks(this.$user.forumUsername),
          forum.getCategories().promise_,
        ]);
        this.bookmarks = bmRes?.data?.user_bookmark_list?.bookmarks || [];
        this.categories = catRes?.data?.category_list?.categories || [];
      } catch (err) {
        // Every realistic failure on this cross-origin endpoint means
        // the Discourse session cookie is not shared with our origin.
        // Real 401/403/419 obviously; a 200-HTML "please log in" page
        // that fails JSON.parse (Discourse serves that anonymously
        // when hide_user_profiles_from_public is on); and network
        // errors when the browser blocks the credentialed request.
        // Treating them all the same means the user sees the honest
        // "session not shared yet" notice instead of a red error.
        const status = err?.response?.status;
        const rawBody = err?.response?.data;
        const looksHtml = typeof rawBody === 'string' && rawBody.trim().startsWith('<');
        const jsonParseFail = /JSON|Unexpected token/i.test(String(err?.message || ''));
        if (status === 401 || status === 403 || status === 419 || looksHtml || jsonParseFail || !status) {
          this.needsForumLogin = true;
        } else {
          this.error = true;
        }
      } finally {
        this.loading = false;
      }
    },

    categoryName(id) {
      return this.categories.find((c) => c.id === id)?.name || '';
    },

    async removeBookmark(bm) {
      if (this.removingId) return;
      this.removingId = bm.id;
      try {
        await forum.deleteBookmark(bm.id);
        this.bookmarks = this.bookmarks.filter((b) => b.id !== bm.id);
      } catch {
        toast({
          type: 'is-warning',
          position: 'bottom-center',
          message: this.$gettext('Impossible de retirer ce marque-page.'),
        });
      } finally {
        this.removingId = null;
      }
    },

    formatDate(d) {
      if (!d) return '';
      try {
        return new Date(d).toLocaleDateString(this.$user.lang || 'fr-FR', {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
        });
      } catch {
        return d;
      }
    },
  },
};
</script>

<style scoped lang="scss">
.forum-bookmarks-view {
  padding-bottom: calc(80px + env(safe-area-inset-bottom));
}
.fb-breadcrumb {
  font-size: 0.78rem;
  color: #6b6b6b;
  margin-bottom: 0.7rem;
  a {
    color: #337ab7;
    text-decoration: none;
  }
}
.fb-breadcrumb-sep {
  margin: 0 0.35rem;
  color: #b5b5b5;
}
.fb-title {
  margin-bottom: 1rem;
  display: flex;
  align-items: center;
}

.fb-signin-notice,
.fb-notice {
  padding: 0.75rem;
  background: #fff5e6;
  border-left: 3px solid #ff9933;
  border-radius: 4px;
  font-size: 0.85rem;
  color: #6b4a1e;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  line-height: 1.4;
}

.fb-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}
.fb-item {
  display: flex;
  gap: 0.4rem;
  align-items: center;
  padding: 0.55rem 0.7rem;
  background: white;
  border: 1px solid rgba(0, 0, 0, 0.08);
  border-radius: 6px;
}
.fb-link {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  color: #4a4a4a;
  text-decoration: none;

  &:hover,
  &:focus {
    color: #4a4a4a;
    text-decoration: none;
  }
}
.fb-item-title {
  font-weight: 600;
  font-size: 0.9rem;
  color: #337ab7;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow-wrap: break-word;
}
.fb-item-meta {
  font-size: 0.72rem;
  color: #6b6b6b;
  margin-top: 0.2rem;
}
.fb-remove {
  flex: 0 0 auto;
  background: transparent;
  border: none;
  color: #b91c1c;
  cursor: pointer;
  padding: 0.35rem 0.55rem;
  border-radius: 4px;
  font-size: 0.95rem;

  &:hover:not(:disabled) {
    background: rgba(185, 28, 28, 0.08);
  }
  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
}
.fb-loading,
.fb-empty,
.fb-error {
  padding: 0.75rem;
  font-size: 0.85rem;
  color: #6b6b6b;
}
.fb-error {
  color: #b91c1c;
}
.fb-signin-hint {
  margin-top: 0.5rem;
  color: #6b4a1e;
  a {
    color: #b26f1e;
  }
}
</style>

<style lang="scss">
html[data-theme='dark'] {
  .forum-bookmarks-view {
    .fb-item {
      background: #2a2a2a;
      border-color: rgba(255, 255, 255, 0.08);
      color: #e5e5e5;
    }
    .fb-item-title {
      color: #6db4ff;
    }
    .fb-item-meta,
    .fb-loading,
    .fb-empty {
      color: #b5b5b5;
    }
    .fb-breadcrumb a {
      color: #6db4ff;
    }
    .fb-signin-notice {
      background: #3a2f1a;
      color: #ffb866;
    }
  }
}
</style>
