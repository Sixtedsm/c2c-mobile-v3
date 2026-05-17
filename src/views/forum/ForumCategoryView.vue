<template>
  <section class="section forum-category-view">
    <div class="container">
      <h1 class="title is-5">{{ categoryName }}</h1>

      <div v-if="loading" class="loading-row">
        <fa-icon icon="spinner" spin /> {{ $gettext('Chargement…') }}
      </div>

      <div v-else-if="error" class="error-row">
        {{ $gettext('Impossible de charger cette catégorie.') }}
      </div>

      <ul v-else class="topic-list">
        <li v-for="topic in topics" :key="topic.id" class="topic-item">
          <router-link
            :to="{ name: 'forum-topic', params: { id: topic.id, slug: topic.slug } }"
            class="topic-link"
          >
            <div class="topic-avatar">
              <img
                v-if="topicPoster(topic) && topicPoster(topic).avatar_template"
                :src="avatarUrl(topicPoster(topic).avatar_template, 48)"
                :alt="topicPoster(topic).username"
                loading="lazy"
              />
            </div>
            <div class="topic-text">
              <span class="topic-title">{{ topic.fancy_title || topic.title }}</span>
              <span class="topic-meta">
                {{ topicPoster(topic) ? topicPoster(topic).username : 'Anonyme' }}
                · {{ topic.posts_count }} {{ $gettext('messages') }}
                · {{ formatDate(topic.last_posted_at || topic.created_at) }}
              </span>
            </div>
          </router-link>
        </li>
      </ul>
    </div>
  </section>
</template>

<script>
import axios from 'axios';

import config from '@/js/config';

const forumHttp = axios.create({
  baseURL: config.urls.forum,
  timeout: 15000,
});

export default {
  name: 'ForumCategoryView',

  data() {
    return {
      topics: [],
      users: {},
      category: null,
      loading: true,
      error: false,
    };
  },

  computed: {
    categoryName() {
      return this.category?.name || this.$route.params.slug || this.$gettext('Catégorie');
    },
  },

  watch: {
    '$route.fullPath'() {
      this.load();
    },
  },

  mounted() {
    this.load();
  },

  methods: {
    async load() {
      this.loading = true;
      this.error = false;
      const { slug, id } = this.$route.params;
      try {
        const { data } = await forumHttp.get(`/c/${slug}/${id}.json`);
        this.category = data?.category || { name: slug };
        this.topics = data?.topic_list?.topics || [];
        this.users = Object.fromEntries((data?.users || []).map((u) => [u.id, u]));
      } catch (e) {
        this.error = true;
      } finally {
        this.loading = false;
      }
    },

    topicPoster(topic) {
      const first = topic.posters?.[0];
      if (!first) return null;
      return this.users[first.user_id] || null;
    },

    avatarUrl(template, size) {
      if (!template) return null;
      const path = template.replace('{size}', String(size));
      return path.startsWith('http') ? path : config.urls.forum + path;
    },

    formatDate(d) {
      if (!d) return '';
      try {
        return new Date(d).toLocaleDateString(this.$user.lang || 'fr-FR', {
          day: 'numeric',
          month: 'short',
        });
      } catch {
        return d;
      }
    },
  },
};
</script>

<style scoped lang="scss">
.forum-category-view {
  padding-bottom: calc(80px + env(safe-area-inset-bottom));
}

.title {
  margin-bottom: 1rem;
}

.topic-list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.topic-item + .topic-item {
  border-top: 1px solid rgba(0, 0, 0, 0.06);
}

.topic-link {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  background: white;
  border: 1px solid rgba(0, 0, 0, 0.12);
  padding: 0.6rem 0.75rem;
  color: #4a4a4a;
  text-decoration: none;

  &:hover {
    text-decoration: none;
    color: #4a4a4a;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.06);
  }
}

.topic-avatar {
  flex: 0 0 40px;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: #e5e7eb;
  overflow: hidden;

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
}

.topic-text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.topic-title {
  font-weight: 600;
  font-size: 0.9rem;
  color: #337ab7;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.topic-meta {
  font-size: 0.7rem;
  color: #6b6b6b;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.loading-row,
.error-row {
  padding: 0.75rem;
  font-size: 0.85rem;
  color: #6b6b6b;
}

.error-row {
  color: #b91c1c;
}
</style>
