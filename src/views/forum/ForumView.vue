<template>
  <section class="section forum-view">
    <div class="container">
      <h1 class="title is-5">{{ $gettext('Forum') }}</h1>

      <!-- Catégories grid -->
      <section v-if="categories.length" class="forum-block">
        <h2 class="forum-block-title">{{ $gettext('Catégories') }}</h2>
        <ul class="cat-grid">
          <li v-for="cat in categories" :key="cat.id">
            <router-link
              :to="{ name: 'forum-category', params: { slug: cat.slug, id: cat.id } }"
              class="cat-link"
            >
              <span class="cat-marker" :style="{ backgroundColor: '#' + (cat.color || 'aaaaaa') }" />
              <span class="cat-text">
                <span class="cat-name">{{ cat.name }}</span>
                <span class="cat-count">{{ cat.topic_count }} {{ $gettext('sujets') }}</span>
              </span>
            </router-link>
          </li>
        </ul>
      </section>

      <!-- Latest topics list -->
      <section class="forum-block">
        <h2 class="forum-block-title">{{ $gettext('Discussions récentes') }}</h2>

        <div v-if="loading" class="loading-row">
          <fa-icon icon="spinner" spin /> {{ $gettext('Chargement…') }}
        </div>

        <div v-else-if="error" class="error-row">
          {{ $gettext('Impossible de joindre le forum.') }}
        </div>

        <ul v-else-if="latest.length" class="topic-list">
          <li v-for="topic in latest" :key="topic.id" class="topic-item">
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

        <div v-else class="empty-row">
          {{ $gettext('Aucune discussion récente.') }}
        </div>
      </section>
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
  name: 'ForumView',

  data() {
    return {
      categories: [],
      latest: [],
      users: {},
      loading: true,
      error: false,
    };
  },

  mounted() {
    this.load();
  },

  methods: {
    async load() {
      this.loading = true;
      this.error = false;
      try {
        const [cats, lat] = await Promise.all([
          forumHttp.get('/categories.json'),
          forumHttp.get('/latest.json'),
        ]);
        this.categories = cats.data?.category_list?.categories || [];
        this.latest = lat.data?.topic_list?.topics || [];
        const usersArray = lat.data?.users || [];
        this.users = Object.fromEntries(usersArray.map((u) => [u.id, u]));
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
.forum-view {
  padding-bottom: calc(80px + env(safe-area-inset-bottom));
}

.title {
  margin-bottom: 1rem;
}

.forum-block {
  margin-bottom: 1.2rem;
}

.forum-block-title {
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #6b6b6b;
  margin: 0 0 0.4rem;
  padding: 0 0.25rem;
}

.cat-grid {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.5rem;
}

.cat-link {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  background: white;
  border: 1px solid rgba(0, 0, 0, 0.12);
  padding: 0.5rem 0.6rem;
  color: #4a4a4a;
  text-decoration: none;
  min-height: 56px;

  &:hover {
    text-decoration: none;
    color: #4a4a4a;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.06);
  }
}

.cat-marker {
  flex: 0 0 4px;
  height: 32px;
  border-radius: 2px;
}

.cat-text {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.cat-name {
  font-weight: 600;
  font-size: 0.85rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cat-count {
  font-size: 0.7rem;
  color: #6b6b6b;
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
.error-row,
.empty-row {
  padding: 0.75rem;
  font-size: 0.85rem;
  color: #6b6b6b;
}

.error-row {
  color: #b91c1c;
}
</style>
