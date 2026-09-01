<template>
  <section class="section forum-categories-view">
    <div class="container">
      <h1 class="title is-5 fcv-title">
        <fa-icon icon="folder" />
        &nbsp;{{ $gettext('Catégories du forum') }}
      </h1>

      <div v-if="loading" class="fcv-loading"><fa-icon icon="spinner" spin /> {{ $gettext('Chargement…') }}</div>

      <div v-else-if="error" class="fcv-error">
        {{ $gettext('Impossible de joindre le forum.') }}
      </div>

      <ul v-else-if="categoryTree.length" class="fcv-tree">
        <li v-for="parent in categoryTree" :key="parent.id" class="fcv-node">
          <router-link
            :to="{ name: 'forum-category', params: { slug: parent.slug, id: parent.id } }"
            class="fcv-link"
            :style="{ borderLeftColor: '#' + (parent.color || 'aaaaaa') }"
          >
            <span class="fcv-name">{{ parent.name }}</span>
            <span class="fcv-count">{{ parent.topic_count }}</span>
          </router-link>
          <p v-if="parent.description_text" class="fcv-desc">{{ parent.description_text }}</p>
          <ul v-if="parent.children.length" class="fcv-children">
            <li v-for="child in parent.children" :key="child.id">
              <router-link
                :to="{ name: 'forum-category', params: { slug: child.slug, id: child.id } }"
                class="fcv-link is-child"
                :style="{ borderLeftColor: '#' + (child.color || 'aaaaaa') }"
              >
                <span class="fcv-name">{{ child.name }}</span>
                <span class="fcv-count">{{ child.topic_count }}</span>
              </router-link>
            </li>
          </ul>
        </li>
      </ul>

      <p v-else class="fcv-empty">{{ $gettext('Aucune catégorie disponible.') }}</p>
    </div>
  </section>
</template>

<script>
// Full-screen Discourse category tree — same content as the
// "Catégories" section in ForumView, extracted into its own view so
// the "Catégories" tab of the forum bottom-nav has a clean landing
// route with its own active state. The data source is exactly the
// same Discourse endpoint, so nothing gets out of sync between the
// two entry points.

import forum from '@/js/apis/forum';

export default {
  name: 'ForumCategoriesView',

  data() {
    return {
      categories: [],
      loading: true,
      error: false,
    };
  },

  computed: {
    // Same reconstruction logic as ForumView: Discourse hands us a
    // flat list with parent_category_id pointing to the parent (or
    // null for top-level). Rebuild parent → children so the view
    // renders the hierarchy correctly.
    categoryTree() {
      const parents = this.categories.filter((c) => c.parent_category_id == null);
      return parents.map((p) => ({
        ...p,
        children: this.categories.filter((c) => c.parent_category_id === p.id),
      }));
    },
  },

  mounted() {
    this.load();
  },

  methods: {
    async load() {
      this.loading = true;
      this.error = false;
      try {
        const res = await forum.getCategories().promise_;
        this.categories = res?.data?.category_list?.categories || [];
      } catch {
        this.error = true;
      } finally {
        this.loading = false;
      }
    },
  },
};
</script>

<style scoped lang="scss">
.forum-categories-view {
  padding-bottom: calc(80px + env(safe-area-inset-bottom));
}

.fcv-title {
  margin-bottom: 1rem;
  display: flex;
  align-items: center;
}

.fcv-tree {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.fcv-node {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}

.fcv-children {
  list-style: none;
  margin: 0.2rem 0 0 1rem;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.fcv-link {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  background: white;
  border: 1px solid rgba(0, 0, 0, 0.08);
  border-left: 4px solid transparent;
  padding: 0.6rem 0.75rem;
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
    padding: 0.45rem 0.75rem;
    font-size: 0.9rem;
  }
}
.fcv-name {
  flex: 1;
  min-width: 0;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.fcv-count {
  flex: 0 0 auto;
  font-size: 0.72rem;
  color: #6b6b6b;
  background: rgba(0, 0, 0, 0.05);
  padding: 0.1rem 0.5rem;
  border-radius: 999px;
}
.fcv-desc {
  margin: 0 0 0.2rem 0.65rem;
  font-size: 0.78rem;
  color: #6b6b6b;
  line-height: 1.35;
}

.fcv-loading,
.fcv-empty,
.fcv-error {
  padding: 0.75rem;
  font-size: 0.85rem;
  color: #6b6b6b;
}
.fcv-error {
  color: #b91c1c;
}
</style>

<style lang="scss">
html[data-theme='dark'] {
  .forum-categories-view {
    .fcv-link {
      background: #2a2a2a;
      border-color: rgba(255, 255, 255, 0.08);
      color: #e5e5e5;
      &:hover,
      &:focus {
        background: #333333;
        color: #e5e5e5;
      }
    }
    .fcv-count {
      background: rgba(255, 255, 255, 0.08);
      color: #cfcfcf;
    }
    .fcv-desc,
    .fcv-loading,
    .fcv-empty {
      color: #b5b5b5;
    }
  }
}
</style>
