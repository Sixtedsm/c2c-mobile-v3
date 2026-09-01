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

        <!-- Feed: Latest vs Top over a period. Two tabs; Top opens a
             sub-selector for the time window (mensuel / hebdo / …).
             All endpoints are public — no cookie needed. -->
        <section class="forum-block">
          <h2 class="forum-block-title">
            <fa-icon icon="clock-rotate-left" />
            &nbsp;{{ feedTab === 'latest' ? $gettext('Discussions récentes') : $gettext('Discussions populaires') }}
          </h2>

          <div class="forum-tabs" role="tablist">
            <button
              type="button"
              class="forum-tab"
              :class="{ 'is-active': feedTab === 'latest' }"
              role="tab"
              :aria-selected="feedTab === 'latest' ? 'true' : 'false'"
              @click="switchFeed('latest')"
            >
              {{ $gettext('Récentes') }}
            </button>
            <button
              type="button"
              class="forum-tab"
              :class="{ 'is-active': feedTab === 'top' }"
              role="tab"
              :aria-selected="feedTab === 'top' ? 'true' : 'false'"
              @click="switchFeed('top')"
            >
              {{ $gettext('Populaires') }}
            </button>
          </div>

          <div v-if="feedTab === 'top'" class="forum-period">
            <label
              v-for="p in periods"
              :key="p.value"
              class="forum-period-pill"
              :class="{ 'is-active': topPeriod === p.value }"
            >
              <input v-model="topPeriod" type="radio" name="topPeriod" :value="p.value" @change="loadTop" />
              <span>{{ p.label }}</span>
            </label>
          </div>

          <div v-if="loadingFeed" class="forum-loading">
            <fa-icon icon="spinner" spin /> {{ $gettext('Chargement…') }}
          </div>
          <div v-else-if="feedError" class="forum-error">
            {{ $gettext('Impossible de joindre le forum.') }}
          </div>
          <ul v-else-if="feedTopics.length" class="forum-list">
            <li v-for="t in feedTopics" :key="t.id">
              <topic-row :topic="t" :categories="categories" />
            </li>
          </ul>
          <p v-else class="forum-empty">
            {{
              feedTab === 'top'
                ? $gettext('Aucune discussion populaire sur cette période.')
                : $gettext('Aucune discussion récente.')
            }}
          </p>
        </section>

        <!-- Popular tags — public endpoint. Tap a tag to browse the
             topics carrying it. Cap the display to top-N so this
             block doesn't push the feed off screen on mobile. -->
        <section v-if="topTags.length" class="forum-block">
          <h2 class="forum-block-title">
            <fa-icon icon="tag" />
            &nbsp;{{ $gettext('Étiquettes populaires') }}
          </h2>
          <ul class="forum-tags">
            <li v-for="tag in topTags" :key="tag.name || tag.id" class="forum-tag-item">
              <router-link :to="{ name: 'forum-tag', params: { tag: tag.name || tag.id } }" class="forum-tag-pill">
                <fa-icon icon="tag" />
                <span>{{ tag.name || tag.id }}</span>
                <span v-if="tag.count" class="forum-tag-count">{{ tag.count }}</span>
              </router-link>
            </li>
          </ul>
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
      top: [],
      topLoadedFor: null, // remember last period fetched, avoid refetch
      myTopics: [],
      loadingLatest: true,
      loadingTop: false,
      latestError: false,
      topError: false,
      feedTab: 'latest',
      topPeriod: 'monthly',
      topTags: [],
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
    // Feed data source depending on the active tab. For Top, we also
    // skip pinned since the Épinglés block already shows them.
    feedTopics() {
      const src = this.feedTab === 'top' ? this.top : this.latest;
      return src.filter((t) => !t.pinned && !t.pinned_globally);
    },
    loadingFeed() {
      return this.feedTab === 'top' ? this.loadingTop : this.loadingLatest;
    },
    feedError() {
      return this.feedTab === 'top' ? this.topError : this.latestError;
    },
    periods() {
      return [
        { value: 'daily', label: this.$gettext('Jour') },
        { value: 'weekly', label: this.$gettext('Semaine') },
        { value: 'monthly', label: this.$gettext('Mois') },
        { value: 'yearly', label: this.$gettext('Année') },
        { value: 'all', label: this.$gettext('Tout') },
      ];
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
      // Popular tags — best effort, silent on failure (endpoint may
      // be disabled by admin). The whole block just doesn't render.
      try {
        const tagRes = await forum.getTags().promise_;
        // Discourse exposes tags either flat (`tags`) or grouped
        // (`extras.tag_groups[].tags`). Merge and rank by count.
        const flat = tagRes?.data?.tags || [];
        const grouped = (tagRes?.data?.extras?.tag_groups || []).flatMap((g) => g.tags || []);
        const all = [...flat, ...grouped];
        // De-dupe by name and keep only the top 12 by usage.
        const seen = new Set();
        this.topTags = all
          .filter((t) => {
            const name = t?.name || t?.id;
            if (!name || seen.has(name)) return false;
            seen.add(name);
            return true;
          })
          .sort((a, b) => (b.count || 0) - (a.count || 0))
          .slice(0, 12);
      } catch {
        this.topTags = [];
      }
    },

    // Switch between latest and top feeds; loads Top lazily on first
    // pick to save a request when the user never leaves Latest.
    switchFeed(tab) {
      this.feedTab = tab;
      if (tab === 'top' && this.topLoadedFor !== this.topPeriod) this.loadTop();
    },

    async loadTop() {
      this.loadingTop = true;
      this.topError = false;
      try {
        const res = await forum.getTop(this.topPeriod).promise_;
        this.top = res?.data?.topic_list?.topics || [];
        this.topLoadedFor = this.topPeriod;
      } catch {
        this.topError = true;
      } finally {
        this.loadingTop = false;
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

// Latest/Top feed tabs — segmented control style, tap-friendly on
// mobile. Matches the visual weight of category pills below.
.forum-tabs {
  display: inline-flex;
  background: rgba(0, 0, 0, 0.04);
  border-radius: 999px;
  padding: 3px;
  margin: 0 0.25rem 0.6rem;
  gap: 2px;
}
.forum-tab {
  border: none;
  background: transparent;
  color: #6b6b6b;
  font-size: 0.8rem;
  font-weight: 600;
  padding: 0.35rem 0.85rem;
  border-radius: 999px;
  cursor: pointer;
  transition: background-color 0.15s ease, color 0.15s ease;

  &.is-active {
    background: white;
    color: #ff9933;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.08);
  }
}
.forum-period {
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem;
  margin: 0 0.25rem 0.6rem;
}
.forum-period-pill {
  display: inline-flex;
  align-items: center;
  padding: 0.25rem 0.65rem;
  font-size: 0.72rem;
  border-radius: 999px;
  background: white;
  border: 1px solid rgba(0, 0, 0, 0.1);
  color: #6b6b6b;
  cursor: pointer;
  user-select: none;

  input {
    display: none;
  }
  &.is-active {
    background: #ff9933;
    color: white;
    border-color: #ff9933;
  }
}

// Popular tags pills — flow layout so 12 tags don't push the feed off.
.forum-tags {
  list-style: none;
  padding: 0 0.25rem;
  margin: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
}
.forum-tag-item {
  display: inline-flex;
}
.forum-tag-pill {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  padding: 0.25rem 0.6rem;
  background: rgba(51, 122, 183, 0.08);
  color: #337ab7;
  border-radius: 999px;
  font-size: 0.75rem;
  text-decoration: none;

  &:hover,
  &:focus {
    background: rgba(51, 122, 183, 0.15);
    color: #285a8f;
    text-decoration: none;
  }
}
.forum-tag-count {
  font-size: 0.65rem;
  color: #6b6b6b;
  background: rgba(0, 0, 0, 0.06);
  padding: 0 0.35rem;
  border-radius: 999px;
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
    .forum-tabs {
      background: rgba(255, 255, 255, 0.06);
    }
    .forum-tab {
      color: #b5b5b5;
      &.is-active {
        background: #333333;
        color: #ffb866;
        box-shadow: none;
      }
    }
    .forum-period-pill {
      background: #2a2a2a;
      border-color: rgba(255, 255, 255, 0.1);
      color: #b5b5b5;
      &.is-active {
        background: #ff9933;
        color: white;
        border-color: #ff9933;
      }
    }
    .forum-tag-pill {
      background: rgba(109, 180, 255, 0.14);
      color: #6db4ff;
      &:hover,
      &:focus {
        background: rgba(109, 180, 255, 0.24);
        color: #a3ccff;
      }
    }
    .forum-tag-count {
      background: rgba(255, 255, 255, 0.08);
      color: #cfcfcf;
    }
  }
}
</style>
