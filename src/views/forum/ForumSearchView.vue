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

      <!-- Filters (collapsed by default so the input stays airy on
           small screens). Toggling adds Discourse `q` operators
           (category:, user:, after:, before:) to the search — no
           extra endpoint. -->
      <button
        type="button"
        class="button is-text is-small fsv-filters-toggle"
        :class="{ 'has-filters': hasAnyFilter }"
        @click="showFilters = !showFilters"
      >
        <fa-icon :icon="showFilters ? 'chevron-up' : 'sliders'" />
        &nbsp;{{ showFilters ? $gettext('Masquer les filtres') : $gettext('Filtres') }}
        <span v-if="hasAnyFilter && !showFilters" class="fsv-filters-badge">{{ activeFilterCount }}</span>
      </button>

      <fieldset v-if="showFilters" class="fsv-filters">
        <label class="fsv-filter">
          <span class="fsv-filter-label">{{ $gettext('Catégorie') }}</span>
          <select v-model="filterCategorySlug" class="fsv-filter-input" @change="runSearchIfQuery">
            <option value="">{{ $gettext('Toutes') }}</option>
            <optgroup v-for="grp in categoryGroups" :key="grp.parent.id" :label="grp.parent.name">
              <option :value="grp.parent.slug">{{ grp.parent.name }}</option>
              <option v-for="c in grp.children" :key="c.id" :value="c.slug">— {{ c.name }}</option>
            </optgroup>
          </select>
        </label>
        <label class="fsv-filter">
          <span class="fsv-filter-label">{{ $gettext('Utilisateur') }}</span>
          <input
            v-model="filterUsername"
            type="text"
            class="fsv-filter-input"
            :placeholder="$gettext('Nom d’utilisateur forum')"
            autocomplete="off"
            @change="runSearchIfQuery"
          />
        </label>
        <label class="fsv-filter">
          <span class="fsv-filter-label">{{ $gettext('Après le') }}</span>
          <input v-model="filterAfter" type="date" class="fsv-filter-input" @change="runSearchIfQuery" />
        </label>
        <label class="fsv-filter">
          <span class="fsv-filter-label">{{ $gettext('Avant le') }}</span>
          <input v-model="filterBefore" type="date" class="fsv-filter-input" @change="runSearchIfQuery" />
        </label>
        <button
          v-if="hasAnyFilter"
          type="button"
          class="button is-small is-text fsv-filters-reset"
          @click="resetFilters"
        >
          <fa-icon icon="xmark" />
          &nbsp;{{ $gettext('Réinitialiser') }}
        </button>
      </fieldset>

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
      // Filters — restored from the URL so a shared/reloaded search
      // keeps them applied. Discourse operators: category:, user:,
      // after:, before:.
      showFilters: !!(
        this.$route.query.cat ||
        this.$route.query.user ||
        this.$route.query.after ||
        this.$route.query.before
      ),
      filterCategorySlug: this.$route.query.cat || '',
      filterUsername: this.$route.query.user || '',
      filterAfter: this.$route.query.after || '',
      filterBefore: this.$route.query.before || '',
    };
  },

  computed: {
    // Discourse categories grouped by parent for the filter dropdown.
    categoryGroups() {
      const parents = this.categories.filter((c) => c.parent_category_id == null);
      return parents
        .map((p) => ({
          parent: p,
          children: this.categories.filter((c) => c.parent_category_id === p.id),
        }))
        .filter((g) => g.parent.slug); // guard against malformed rows
    },
    hasAnyFilter() {
      return !!(this.filterCategorySlug || this.filterUsername || this.filterAfter || this.filterBefore);
    },
    activeFilterCount() {
      return (
        (this.filterCategorySlug ? 1 : 0) +
        (this.filterUsername ? 1 : 0) +
        (this.filterAfter ? 1 : 0) +
        (this.filterBefore ? 1 : 0)
      );
    },
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
      // Keep the query + active filters in the URL so a browser reload
      // or a shared link keeps the exact search alive. Skip empty
      // filters so the URL doesn't collect noise.
      const query = { q };
      if (this.filterCategorySlug) query.cat = this.filterCategorySlug;
      if (this.filterUsername) query.user = this.filterUsername;
      if (this.filterAfter) query.after = this.filterAfter;
      if (this.filterBefore) query.before = this.filterBefore;
      if (fromSubmit || !this._queryEqualsUrl(query)) {
        this.$router.replace({ query }).catch(() => {
          /* NavigationDuplicated is benign */
        });
      }
      try {
        const res = await forum.search(q, {
          categorySlug: this.filterCategorySlug || undefined,
          username: this.filterUsername || undefined,
          after: this.filterAfter || undefined,
          before: this.filterBefore || undefined,
        }).promise_;
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

    // Re-run the search when a filter changes, but only if there's a
    // query — filters alone don't make a search.
    runSearchIfQuery() {
      if (this.query.trim()) this.runSearch(false);
    },

    resetFilters() {
      this.filterCategorySlug = '';
      this.filterUsername = '';
      this.filterAfter = '';
      this.filterBefore = '';
      this.runSearchIfQuery();
    },

    _queryEqualsUrl(q) {
      const url = this.$route.query || {};
      const keys = new Set([...Object.keys(url), ...Object.keys(q)]);
      for (const k of keys) if ((url[k] || '') !== (q[k] || '')) return false;
      return true;
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

.fsv-filters-toggle {
  color: #6b6b6b;
  padding: 0.2rem 0.35rem;
  margin-bottom: 0.5rem;
  display: inline-flex;
  align-items: center;
  gap: 0.15rem;

  &.has-filters {
    color: #ff9933;
  }
}
.fsv-filters-badge {
  display: inline-block;
  margin-left: 0.35rem;
  min-width: 1.1rem;
  padding: 0 0.35rem;
  border-radius: 999px;
  background: #ff9933;
  color: white;
  font-size: 0.68rem;
  line-height: 1.1rem;
  text-align: center;
  font-weight: 700;
}
.fsv-filters {
  border: 1px solid rgba(0, 0, 0, 0.08);
  border-radius: 6px;
  padding: 0.6rem 0.7rem;
  margin: 0 0 0.8rem;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.5rem 0.6rem;
}
.fsv-filter {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  min-width: 0;

  &:first-child {
    grid-column: 1 / -1;
  }
}
.fsv-filter-label {
  font-size: 0.7rem;
  font-weight: 600;
  color: #6b6b6b;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}
.fsv-filter-input {
  min-width: 0;
  width: 100%;
  padding: 0.35rem 0.5rem;
  background: white;
  border: 1px solid rgba(0, 0, 0, 0.12);
  border-radius: 4px;
  font-size: 0.85rem;
  color: #4a4a4a;

  &:focus {
    outline: none;
    border-color: #ff9933;
    box-shadow: 0 0 0 0.125em rgba(255, 153, 51, 0.2);
  }
}
.fsv-filters-reset {
  grid-column: 1 / -1;
  justify-self: end;
  color: #6b6b6b;
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
    .fsv-filters {
      border-color: rgba(255, 255, 255, 0.1);
    }
    .fsv-filter-label,
    .fsv-filters-toggle {
      color: #b5b5b5;
    }
    .fsv-filters-toggle.has-filters {
      color: #ffb866;
    }
    .fsv-filter-input {
      background: #2a2a2a;
      color: #e5e5e5;
      border-color: rgba(255, 255, 255, 0.12);
    }
  }
}
</style>
