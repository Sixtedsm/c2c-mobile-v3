<template>
  <section class="section forum-category-view">
    <div class="container">
      <!-- Breadcrumb: Forum > parent (if any) > this category -->
      <p class="fc-breadcrumb">
        <router-link :to="{ name: 'forum' }">{{ $gettext('Forum') }}</router-link>
        <template v-if="parentCategory">
          <span class="fc-breadcrumb-sep">›</span>
          <router-link :to="{ name: 'forum-category', params: { slug: parentCategory.slug, id: parentCategory.id } }">
            {{ parentCategory.name }}
          </router-link>
        </template>
        <span class="fc-breadcrumb-sep">›</span>
        <span>{{ categoryName }}</span>
      </p>

      <header class="fc-header">
        <span class="fc-color-block" :style="{ backgroundColor: categoryColor }"></span>
        <div class="fc-header-text">
          <h1 class="fc-name">{{ categoryName }}</h1>
          <p v-if="categoryDescription" class="fc-desc">{{ categoryDescription }}</p>
        </div>
      </header>

      <!-- Sub-categories: shown as their own list of cards. Useful for
           parent categories like "Discussions générales" that group
           multiple children. -->
      <section v-if="subcategories.length" class="fc-block">
        <h2 class="fc-block-title">{{ $gettext('Sous-catégories') }}</h2>
        <ul class="fc-subcats">
          <li v-for="sub in subcategories" :key="sub.id">
            <router-link
              :to="{ name: 'forum-category', params: { slug: sub.slug, id: sub.id } }"
              class="fc-subcat-link"
              :style="{ borderLeftColor: '#' + (sub.color || 'aaaaaa') }"
            >
              <span class="fc-subcat-name">{{ sub.name }}</span>
              <span class="fc-subcat-count">{{ sub.topic_count }}</span>
            </router-link>
          </li>
        </ul>
      </section>

      <div v-if="loading" class="fc-loading"><fa-icon icon="spinner" spin /> {{ $gettext('Chargement…') }}</div>

      <div v-else-if="error" class="fc-error">
        {{ $gettext('Impossible de charger cette catégorie.') }}
      </div>

      <template v-else-if="topics.length">
        <ul class="fc-topics">
          <li v-for="t in topics" :key="t.id">
            <topic-row :topic="t" :categories="categories" />
          </li>
        </ul>
        <button
          v-if="canLoadMore"
          type="button"
          class="button is-text fc-load-more"
          :disabled="loadingMore"
          @click="loadMore"
        >
          <fa-icon :icon="loadingMore ? 'spinner' : 'chevron-down'" :spin="loadingMore" />
          &nbsp;{{ loadingMore ? $gettext('Chargement…') : $gettext('Charger plus') }}
        </button>
      </template>

      <p v-else class="fc-empty">{{ $gettext('Aucune discussion dans cette catégorie.') }}</p>
    </div>
  </section>
</template>

<script>
// Topics inside a single Discourse category. Adds a breadcrumb, a
// category header (color + name + description), an inline list of
// sub-categories (when any) and pagination via a "Load more" button
// (Discourse's own pattern rather than infinite scroll — cheaper
// and lets the user reach the "Latest" section on ForumView by
// tapping the browser Back button on the last visible topic).

import TopicRow from '@/components/forum/TopicRow.vue';
import forum from '@/js/apis/forum';

export default {
  name: 'ForumCategoryView',

  components: { TopicRow },

  data() {
    return {
      topics: [],
      categories: [],
      category: null,
      page: 0,
      canLoadMore: false,
      loading: true,
      loadingMore: false,
      error: false,
    };
  },

  computed: {
    slug() {
      return this.$route.params.slug;
    },
    id() {
      return this.$route.params.id;
    },
    categoryName() {
      return this.category?.name || this.slug || this.$gettext('Catégorie');
    },
    categoryDescription() {
      // Discourse serves both a plain-text `description_text` and the
      // rich `description` — the plain one is safer for a mobile list.
      return this.category?.description_text || '';
    },
    categoryColor() {
      return '#' + (this.category?.color || 'aaaaaa');
    },
    parentCategory() {
      const parentId = this.category?.parent_category_id;
      if (parentId == null) return null;
      return this.categories.find((c) => c.id === parentId) || null;
    },
    subcategories() {
      if (!this.category) return [];
      return this.categories.filter((c) => c.parent_category_id === this.category.id);
    },
  },

  watch: {
    '$route.fullPath'() {
      this.reload();
    },
  },

  mounted() {
    this.reload();
  },

  methods: {
    async reload() {
      this.loading = true;
      this.error = false;
      this.topics = [];
      this.page = 0;
      try {
        // Load categories in parallel so pills + breadcrumb work
        // even on a cold cache.
        const [catRes, topicsRes] = await Promise.all([
          forum.getCategories().promise_,
          forum.getCategoryTopics(this.slug, this.id, 0).promise_,
        ]);
        this.categories = catRes?.data?.category_list?.categories || [];
        // Category-specific payload also includes a `category` blob
        // with description + parent — trust it when present, fall
        // back to the flat list lookup.
        this.category = topicsRes?.data?.category ||
          this.categories.find((c) => String(c.id) === String(this.id)) || { name: this.slug };
        this.topics = topicsRes?.data?.topic_list?.topics || [];
        this.canLoadMore = !!topicsRes?.data?.topic_list?.more_topics_url;
      } catch (e) {
        this.error = true;
      } finally {
        this.loading = false;
      }
    },

    async loadMore() {
      if (this.loadingMore || !this.canLoadMore) return;
      this.loadingMore = true;
      const nextPage = this.page + 1;
      try {
        const res = await forum.getCategoryTopics(this.slug, this.id, nextPage).promise_;
        const more = res?.data?.topic_list?.topics || [];
        this.topics = this.topics.concat(more);
        this.page = nextPage;
        this.canLoadMore = !!res?.data?.topic_list?.more_topics_url;
      } catch {
        this.canLoadMore = false;
      } finally {
        this.loadingMore = false;
      }
    },
  },
};
</script>

<style scoped lang="scss">
.forum-category-view {
  padding-bottom: calc(80px + env(safe-area-inset-bottom));
}

.fc-breadcrumb {
  font-size: 0.78rem;
  color: #6b6b6b;
  margin-bottom: 0.7rem;
  a {
    color: #337ab7;
    text-decoration: none;
  }
}
.fc-breadcrumb-sep {
  margin: 0 0.35rem;
  color: #b5b5b5;
}

.fc-header {
  display: flex;
  gap: 0.7rem;
  align-items: flex-start;
  padding: 0.75rem 0.85rem;
  background: white;
  border: 1px solid rgba(0, 0, 0, 0.08);
  border-radius: 6px;
  margin-bottom: 1rem;
}

.fc-color-block {
  width: 6px;
  align-self: stretch;
  border-radius: 3px;
  flex: 0 0 auto;
}

.fc-header-text {
  flex: 1;
  min-width: 0;
}

.fc-name {
  font-size: 1.1rem;
  font-weight: 700;
  color: #4a4a4a;
  margin: 0;
  line-height: 1.25;
}

.fc-desc {
  margin: 0.35rem 0 0;
  font-size: 0.82rem;
  color: #6b6b6b;
  line-height: 1.4;
}

.fc-block {
  margin-bottom: 1rem;
}

.fc-block-title {
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #6b6b6b;
  margin: 0 0 0.4rem;
  padding: 0 0.25rem;
}

.fc-subcats {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}

.fc-subcat-link {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  padding: 0.5rem 0.7rem;
  background: white;
  border: 1px solid rgba(0, 0, 0, 0.08);
  border-left: 4px solid transparent;
  border-radius: 4px;
  color: #4a4a4a;
  text-decoration: none;

  &:hover,
  &:focus {
    background: #fafafa;
    color: #4a4a4a;
    text-decoration: none;
  }
}
.fc-subcat-name {
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.fc-subcat-count {
  flex: 0 0 auto;
  font-size: 0.72rem;
  color: #6b6b6b;
  background: rgba(0, 0, 0, 0.05);
  padding: 0.1rem 0.45rem;
  border-radius: 999px;
}

.fc-topics {
  list-style: none;
  padding: 0;
  margin: 0;
}

.fc-load-more {
  display: block;
  margin: 0.8rem auto 0;
  color: #337ab7;
}

.fc-loading,
.fc-empty,
.fc-error {
  padding: 0.75rem;
  font-size: 0.85rem;
  color: #6b6b6b;
}
.fc-error {
  color: #b91c1c;
}
</style>

<style lang="scss">
html[data-theme='dark'] {
  .forum-category-view {
    .fc-header,
    .fc-subcat-link {
      background: #2a2a2a;
      border-color: rgba(255, 255, 255, 0.08);
      color: #e5e5e5;
    }
    .fc-subcat-link:hover,
    .fc-subcat-link:focus {
      background: #333333;
      color: #e5e5e5;
    }
    .fc-name {
      color: #f0f0f0;
    }
    .fc-desc,
    .fc-block-title,
    .fc-loading,
    .fc-empty {
      color: #b5b5b5;
    }
    .fc-breadcrumb a {
      color: #6db4ff;
    }
    .fc-subcat-count {
      background: rgba(255, 255, 255, 0.08);
      color: #cfcfcf;
    }
    .fc-load-more {
      color: #6db4ff;
    }
  }
}
</style>
