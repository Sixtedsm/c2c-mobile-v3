<template>
  <section class="section forum-view">
    <div class="container">
      <h1 class="title is-5 forum-title">{{ $gettext('Forum') }}</h1>

      <!-- Search: hits Discourse /search.json on submit and lands the
           user on the search results section below. Keeps the query
           in-view so they can refine. -->
      <form class="forum-search" @submit.prevent="runSearch">
        <fa-icon icon="magnifying-glass" class="forum-search-icon" />
        <input
          v-model="searchQuery"
          type="search"
          class="forum-search-input"
          :placeholder="$gettext('Rechercher dans le forum…')"
          :aria-label="$gettext('Rechercher dans le forum')"
        />
        <button v-if="searchQuery" type="button" class="forum-search-clear" @click="clearSearch">
          <fa-icon icon="xmark" />
        </button>
      </form>

      <!-- Search results — displayed when a query is active. -->
      <section v-if="searchActive" class="forum-block">
        <h2 class="forum-block-title">
          <fa-icon icon="magnifying-glass" />
          &nbsp;{{ $gettext('Résultats de recherche') }}
        </h2>
        <div v-if="searching" class="forum-loading"><fa-icon icon="spinner" spin /> {{ $gettext('Recherche…') }}</div>
        <ul v-else-if="searchResults.length" class="forum-list">
          <li v-for="t in searchResults" :key="t.id">
            <topic-row :topic="t" :categories="categories" />
          </li>
        </ul>
        <p v-else class="forum-empty">{{ $gettext('Aucun résultat pour cette recherche.') }}</p>
      </section>

      <template v-else>
        <!-- User-specific block: current logged-in user's own topics.
             Shown at the top so it acts as a quick way back to a
             discussion the user opened. Skipped when the user has no
             Discourse username on file. -->
        <section v-if="myTopics.length" class="forum-block">
          <h2 class="forum-block-title">
            <fa-icon icon="user" />
            &nbsp;{{ $gettext('Mes discussions') }}
          </h2>
          <ul class="forum-list">
            <li v-for="t in myTopics.slice(0, 3)" :key="t.id">
              <topic-row :topic="t" :categories="categories" />
            </li>
          </ul>
          <p v-if="myTopicsUsername" class="forum-block-more">
            <router-link :to="{ name: 'forum-user', params: { username: myTopicsUsername } }">
              {{ $gettext('Voir tout mon profil forum') }} →
            </router-link>
          </p>
        </section>

        <!-- Pinned topics: Discourse marks topics as pinned or
             pinned_globally. Show them prominently — that's where
             announcements live. -->
        <section v-if="pinnedTopics.length" class="forum-block">
          <h2 class="forum-block-title">
            <fa-icon icon="thumbtack" />
            &nbsp;{{ $gettext('Épinglés') }}
          </h2>
          <ul class="forum-list">
            <li v-for="t in pinnedTopics.slice(0, 5)" :key="t.id">
              <topic-row :topic="t" :categories="categories" />
            </li>
          </ul>
        </section>

        <!-- Category tree — parent categories with their children
             indented underneath. Two-level Discourse hierarchy is
             enough (no grand-children in the c2c forum).  -->
        <section v-if="categoryTree.length" class="forum-block">
          <h2 class="forum-block-title">
            <fa-icon icon="folder" />
            &nbsp;{{ $gettext('Catégories') }}
          </h2>
          <ul class="forum-cat-tree">
            <li v-for="parent in categoryTree" :key="parent.id" class="forum-cat-node">
              <router-link
                :to="{ name: 'forum-category', params: { slug: parent.slug, id: parent.id } }"
                class="forum-cat-link"
                :style="{ borderLeftColor: '#' + (parent.color || 'aaaaaa') }"
              >
                <span class="forum-cat-name">{{ parent.name }}</span>
                <span class="forum-cat-count">{{ parent.topic_count }}</span>
              </router-link>
              <ul v-if="parent.children.length" class="forum-cat-children">
                <li v-for="child in parent.children" :key="child.id">
                  <router-link
                    :to="{ name: 'forum-category', params: { slug: child.slug, id: child.id } }"
                    class="forum-cat-link is-child"
                    :style="{ borderLeftColor: '#' + (child.color || 'aaaaaa') }"
                  >
                    <span class="forum-cat-name">{{ child.name }}</span>
                    <span class="forum-cat-count">{{ child.topic_count }}</span>
                  </router-link>
                </li>
              </ul>
            </li>
          </ul>
        </section>

        <!-- Latest — the default landing feed. -->
        <section class="forum-block">
          <h2 class="forum-block-title">
            <fa-icon icon="clock-rotate-left" />
            &nbsp;{{ $gettext('Discussions récentes') }}
          </h2>
          <div v-if="loadingLatest" class="forum-loading">
            <fa-icon icon="spinner" spin /> {{ $gettext('Chargement…') }}
          </div>
          <div v-else-if="latestError" class="forum-error">
            {{ $gettext('Impossible de joindre le forum.') }}
          </div>
          <ul v-else-if="unpinnedLatest.length" class="forum-list">
            <li v-for="t in unpinnedLatest" :key="t.id">
              <topic-row :topic="t" :categories="categories" />
            </li>
          </ul>
          <p v-else class="forum-empty">{{ $gettext('Aucune discussion récente.') }}</p>
        </section>
      </template>
    </div>

    <!-- Floating action button to compose a new topic. Discourse-
         standard "+" pattern the whole forum world already knows.
         Requires login; when the user isn't logged in we still show
         the button but the target route (meta.requiresAuth: true)
         will bounce them to /auth. -->
    <router-link
      :to="{ name: 'forum-new-topic' }"
      class="forum-fab"
      :title="$gettext('Nouveau sujet')"
      :aria-label="$gettext('Nouveau sujet')"
    >
      <fa-icon icon="plus" />
    </router-link>
  </section>
</template>

<script>
// Home of the in-app forum. Loads categories (for the tree + tag
// resolution), latest topics (for the feed and pinned split), and,
// when the current user has a Discourse username on file, their own
// topics. Search runs on submit against /search.json and replaces
// the feed until cleared.

import TopicRow from '@/components/forum/TopicRow.vue';
import forum from '@/js/apis/forum';

export default {
  name: 'ForumView',

  components: { TopicRow },

  data() {
    return {
      categories: [],
      latest: [],
      myTopics: [],
      loadingLatest: true,
      latestError: false,
      // Search
      searchQuery: '',
      searchActive: false,
      searching: false,
      searchResults: [],
    };
  },

  computed: {
    // Discourse gives us a flat categories list with parent_category_id
    // pointing to the parent (or null for top-level). Rebuild the
    // tree in-place so the template can render parents with their
    // children indented underneath.
    categoryTree() {
      const parents = this.categories.filter((c) => c.parent_category_id == null);
      return parents.map((p) => ({
        ...p,
        children: this.categories.filter((c) => c.parent_category_id === p.id),
      }));
    },
    pinnedTopics() {
      return this.latest.filter((t) => t.pinned || t.pinned_globally);
    },
    unpinnedLatest() {
      // Skip pinned ones from the latest feed — they already surface
      // in the pinned section above.
      return this.latest.filter((t) => !t.pinned && !t.pinned_globally);
    },
    myTopicsUsername() {
      return this.$user?.forumUsername || null;
    },
  },

  mounted() {
    this.load();
  },

  methods: {
    async load() {
      this.loadingLatest = true;
      this.latestError = false;
      try {
        const [catRes, latestRes] = await Promise.all([forum.getCategories().promise_, forum.getLatest().promise_]);
        this.categories = catRes?.data?.category_list?.categories || [];
        this.latest = latestRes?.data?.topic_list?.topics || [];
      } catch (e) {
        this.latestError = true;
      } finally {
        this.loadingLatest = false;
      }
      // Fetch "my topics" only when we have a Discourse username to
      // ask for. Silent on failure — the block just doesn't show.
      if (this.myTopicsUsername) {
        try {
          const res = await forum.getUserTopics(this.myTopicsUsername).promise_;
          this.myTopics = res?.data?.topic_list?.topics || [];
        } catch {
          this.myTopics = [];
        }
      }
    },

    async runSearch() {
      const q = this.searchQuery.trim();
      if (!q) {
        this.clearSearch();
        return;
      }
      this.searchActive = true;
      this.searching = true;
      try {
        const res = await forum.search(q).promise_;
        // /search.json returns `topics` (topic metadata) and `posts`
        // (matching post excerpts). For a mobile-first UI we surface
        // topics only — tapping a topic lands on its posts anyway.
        const topics = res?.data?.topics || [];
        // Merge user data (users[] on the search payload) so
        // TopicRow can render the poster avatar.
        const usersById = {};
        (res?.data?.users || []).forEach((u) => {
          if (u.id != null) usersById[u.id] = u;
        });
        topics.forEach((t) => {
          const first = t.posters?.[0];
          if (first?.user_id != null) t.first_poster_user = usersById[first.user_id] || null;
        });
        this.searchResults = topics;
      } catch {
        this.searchResults = [];
      } finally {
        this.searching = false;
      }
    },

    clearSearch() {
      this.searchQuery = '';
      this.searchActive = false;
      this.searchResults = [];
    },
  },
};
</script>

<style scoped lang="scss">
.forum-view {
  padding-bottom: calc(80px + env(safe-area-inset-bottom));
}

.forum-title {
  margin-bottom: 0.8rem;
}

.forum-search {
  position: relative;
  margin: 0 0 1.1rem;
  display: flex;
  align-items: center;
  background: white;
  border: 1px solid rgba(0, 0, 0, 0.12);
  border-radius: 999px;
  padding: 0.35rem 0.6rem;

  &:focus-within {
    border-color: #ff9933;
    box-shadow: 0 0 0 0.125em rgba(255, 153, 51, 0.2);
  }
}
.forum-search-icon {
  color: #6b6b6b;
  margin-right: 0.4rem;
}
.forum-search-input {
  flex: 1;
  min-width: 0;
  border: none;
  background: transparent;
  outline: none;
  font-size: 0.9rem;
  color: #4a4a4a;

  &::placeholder {
    color: #9a9a9a;
  }
}
.forum-search-clear {
  border: none;
  background: transparent;
  color: #6b6b6b;
  cursor: pointer;
  padding: 0.2rem 0.35rem;
  border-radius: 999px;

  &:hover {
    background: rgba(0, 0, 0, 0.06);
  }
}

.forum-block {
  margin-bottom: 1.4rem;
}

.forum-block-title {
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #6b6b6b;
  margin: 0 0 0.5rem;
  padding: 0 0.25rem;
  display: flex;
  align-items: center;
  gap: 0.2rem;
}

.forum-block-more {
  margin: 0.5rem 0.25rem 0;
  font-size: 0.78rem;

  a {
    color: #337ab7;
    text-decoration: none;
  }
}

.forum-list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.forum-cat-tree {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}
.forum-cat-node {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}

.forum-cat-children {
  list-style: none;
  margin: 0.2rem 0 0 1rem;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}

.forum-cat-link {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  background: white;
  border: 1px solid rgba(0, 0, 0, 0.08);
  border-left: 4px solid transparent;
  padding: 0.55rem 0.7rem;
  color: #4a4a4a;
  text-decoration: none;
  border-radius: 4px;

  &:hover,
  &:focus {
    background: #fafafa;
    color: #4a4a4a;
    text-decoration: none;
  }

  &.is-child {
    padding: 0.4rem 0.7rem;
    font-size: 0.85rem;
  }
}
.forum-cat-name {
  flex: 1;
  min-width: 0;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.forum-cat-count {
  flex: 0 0 auto;
  font-size: 0.72rem;
  color: #6b6b6b;
  background: rgba(0, 0, 0, 0.05);
  padding: 0.1rem 0.45rem;
  border-radius: 999px;
}

.forum-loading,
.forum-empty,
.forum-error {
  padding: 0.75rem;
  font-size: 0.85rem;
  color: #6b6b6b;
}

.forum-error {
  color: #b91c1c;
}

// Compose-topic FAB — bottom-right, floats above the ForumBottomNav.
// Uses the same 66-px safe-area offset the BottomNav applies so it
// nests cleanly on iPhone home-indicator devices.
.forum-fab {
  position: fixed;
  right: 1rem;
  bottom: calc(76px + env(safe-area-inset-bottom));
  z-index: 27;
  width: 52px;
  height: 52px;
  border-radius: 50%;
  background: #ff9933;
  color: white;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 1.35rem;
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.25);
  text-decoration: none;

  &:hover,
  &:focus {
    background: #e6791f;
    color: white;
    text-decoration: none;
  }
}
</style>

<style lang="scss">
html[data-theme='dark'] {
  .forum-view {
    .forum-search,
    .forum-cat-link {
      background: #2a2a2a;
      border-color: rgba(255, 255, 255, 0.1);
      color: #e5e5e5;
    }
    .forum-search-input {
      color: #f0f0f0;
    }
    .forum-search-input::placeholder {
      color: #8a8a8a;
    }
    .forum-cat-link:hover,
    .forum-cat-link:focus {
      background: #333333;
      color: #e5e5e5;
    }
    .forum-cat-count {
      background: rgba(255, 255, 255, 0.08);
      color: #cfcfcf;
    }
    .forum-block-title,
    .forum-loading,
    .forum-empty {
      color: #b5b5b5;
    }
    .forum-block-more a {
      color: #6db4ff;
    }
  }
}
</style>
