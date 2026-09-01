<template>
  <section class="section forum-search-view">
    <div class="container">
      <h1 class="title is-5 fsv-title">
        <fa-icon icon="magnifying-glass" />
        &nbsp;{{ $gettext('Rechercher dans le forum') }}
      </h1>

      <!-- Search input — same Discourse /search.json endpoint the
           ForumView home page uses, but full-screen so the results
           get all the room they need. Debounced (350 ms) so we
           don't burn the endpoint on every keystroke. -->
      <form class="fsv-form" @submit.prevent="runSearch(true)">
        <fa-icon icon="magnifying-glass" class="fsv-form-icon" />
        <input
          ref="searchInput"
          v-model="query"
          type="search"
          class="fsv-form-input"
          :placeholder="$gettext('Titre, mot-clé…')"
          :aria-label="$gettext('Rechercher dans le forum')"
          @input="onInput"
        />
        <button v-if="query" type="button" class="fsv-form-clear" @click="clear">
          <fa-icon icon="xmark" />
        </button>
      </form>

      <div v-if="searching" class="fsv-loading"><fa-icon icon="spinner" spin />&nbsp;{{ $gettext('Recherche…') }}</div>

      <div v-else-if="error" class="fsv-error">
        {{ $gettext('Impossible de joindre le forum.') }}
      </div>

      <ul v-else-if="results.length" class="fsv-results">
        <li v-for="t in results" :key="t.id">
          <topic-row :topic="t" :categories="categories" />
        </li>
      </ul>

      <p v-else-if="query.trim() && !searching" class="fsv-empty">
        {{ $gettext('Aucun résultat pour cette recherche.') }}
      </p>

      <p v-else class="fsv-hint">
        {{ $gettext('Tapez un mot-clé ou un titre pour lancer la recherche.') }}
      </p>
    </div>
  </section>
</template>

<script>
// Dedicated search page for the forum tab. Same call as the ForumView
// header search, but hosted on its own route so:
//   1. the "Rechercher" tab in the forum bottom-nav has a real
//      landing route with a stable active state
//   2. results have full width to breathe on small screens
//   3. the query survives the user briefly navigating into a topic
//      and coming back (component keep-alive isn't used, but the
//      URL round-trip works because we auto-run on mount when a
//      `?q=` param is present)

import TopicRow from '@/components/forum/TopicRow.vue';
import forum from '@/js/apis/forum';

export default {
  name: 'ForumSearchView',

  components: { TopicRow },

  data() {
    return {
      query: this.$route.query.q || '',
      results: [],
      categories: [],
      searching: false,
      error: false,
    };
  },

  mounted() {
    // Categories load in the background so TopicRow renders the
    // colored pill on each result. Failure is silent.
    forum
      .getCategories()
      .then((res) => {
        this.categories = res?.data?.category_list?.categories || [];
      })
      .catch(() => {});
    // Auto-focus for immediate typing.
    this.$nextTick(() => this.$refs.searchInput?.focus?.());
    if (this.query.trim()) this.runSearch(false);
  },

  beforeDestroy() {
    if (this._searchT) window.clearTimeout(this._searchT);
  },

  methods: {
    // Debounced live search — 350 ms after the last keystroke. Also
    // called synchronously from the form-submit handler and the
    // mount hook (skipping the debounce there).
    onInput() {
      if (this._searchT) window.clearTimeout(this._searchT);
      const q = this.query.trim();
      if (!q) {
        this.results = [];
        this.searching = false;
        return;
      }
      this.searching = true;
      this._searchT = window.setTimeout(() => this.runSearch(false), 350);
    },

    async runSearch(fromSubmit) {
      const q = this.query.trim();
      if (!q) {
        this.results = [];
        this.searching = false;
        return;
      }
      if (this._searchT) window.clearTimeout(this._searchT);
      this.searching = true;
      this.error = false;
      // Keep the query in the URL so a browser reload / share keeps
      // the search alive — matches how Discourse itself does it.
      if (fromSubmit || this.$route.query.q !== q) {
        this.$router.replace({ query: { ...this.$route.query, q } }).catch(() => {
          /* NavigationDuplicated is benign */
        });
      }
      try {
        const res = await forum.search(q).promise_;
        const topics = res?.data?.topics || [];
        // Merge users so TopicRow shows an avatar for the poster.
        const usersById = {};
        (res?.data?.users || []).forEach((u) => {
          if (u.id != null) usersById[u.id] = u;
        });
        topics.forEach((t) => {
          const first = t.posters?.[0];
          if (first?.user_id != null) t.first_poster_user = usersById[first.user_id] || null;
        });
        this.results = topics;
      } catch {
        this.error = true;
        this.results = [];
      } finally {
        this.searching = false;
      }
    },

    clear() {
      this.query = '';
      this.results = [];
      this.$router.replace({ query: {} }).catch(() => {
        /* NavigationDuplicated is benign */
      });
      this.$nextTick(() => this.$refs.searchInput?.focus?.());
    },
  },
};
</script>

<style scoped lang="scss">
.forum-search-view {
  padding-bottom: calc(80px + env(safe-area-inset-bottom));
}

.fsv-title {
  margin-bottom: 0.8rem;
  display: flex;
  align-items: center;
}

.fsv-form {
  position: relative;
  margin: 0 0 1rem;
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
.fsv-form-icon {
  color: #6b6b6b;
  margin-right: 0.4rem;
}
.fsv-form-input {
  flex: 1;
  min-width: 0;
  border: none;
  background: transparent;
  outline: none;
  font-size: 0.95rem;
  color: #4a4a4a;

  &::placeholder {
    color: #9a9a9a;
  }
}
.fsv-form-clear {
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

.fsv-results {
  list-style: none;
  padding: 0;
  margin: 0;
}

.fsv-loading,
.fsv-empty,
.fsv-hint,
.fsv-error {
  padding: 0.75rem;
  font-size: 0.85rem;
  color: #6b6b6b;
}
.fsv-error {
  color: #b91c1c;
}
</style>

<style lang="scss">
html[data-theme='dark'] {
  .forum-search-view {
    .fsv-form {
      background: #2a2a2a;
      border-color: rgba(255, 255, 255, 0.1);
    }
    .fsv-form-input {
      color: #f0f0f0;
    }
    .fsv-form-input::placeholder {
      color: #8a8a8a;
    }
    .fsv-loading,
    .fsv-empty,
    .fsv-hint {
      color: #b5b5b5;
    }
  }
}
</style>
