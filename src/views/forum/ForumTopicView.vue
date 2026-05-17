<template>
  <section class="section forum-topic-view">
    <div class="container">
      <h1 class="title is-5 topic-title">{{ title }}</h1>

      <div v-if="loading" class="loading-row">
        <fa-icon icon="spinner" spin /> {{ $gettext('Chargement…') }}
      </div>

      <div v-else-if="error" class="error-row">
        {{ $gettext('Sujet introuvable.') }}
      </div>

      <template v-else>
        <article v-for="post in posts" :key="post.id" class="forum-post">
          <header class="forum-post-header">
            <div class="post-avatar">
              <img
                v-if="post.avatar_template"
                :src="avatarUrl(post.avatar_template, 48)"
                :alt="post.username"
                loading="lazy"
              />
            </div>
            <div class="post-meta">
              <span class="post-author">
                {{ post.name || post.username }}
                <span v-if="post.moderator || post.admin" class="post-badge">
                  {{ post.admin ? $gettext('Admin') : $gettext('Modérateur') }}
                </span>
              </span>
              <time class="post-date">{{ formatDate(post.created_at) }}</time>
            </div>
          </header>
          <div class="post-body prose" v-html="post.cooked" />
        </article>

        <p class="forum-link-out">
          <a
            :href="topicExternalUrl"
            target="_blank"
            rel="noopener"
          >
            {{ $gettext('Ouvrir sur le forum Camptocamp') }} →
          </a>
        </p>
      </template>
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
  name: 'ForumTopicView',

  data() {
    return {
      topic: null,
      loading: true,
      error: false,
    };
  },

  computed: {
    title() {
      return this.topic?.fancy_title || this.topic?.title || '';
    },

    posts() {
      return this.topic?.post_stream?.posts || [];
    },

    topicExternalUrl() {
      const slug = this.topic?.slug || this.$route.params.slug || '';
      const id = this.$route.params.id;
      return `${config.urls.forum}/t/${slug ? slug + '/' : ''}${id}`;
    },
  },

  watch: {
    '$route.params.id'() {
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
      try {
        const { data } = await forumHttp.get(`/t/${this.$route.params.id}.json`);
        this.topic = data;
      } catch (e) {
        this.error = true;
      } finally {
        this.loading = false;
      }
    },

    avatarUrl(template, size) {
      if (!template) return null;
      const path = template.replace('{size}', String(size));
      return path.startsWith('http') ? path : config.urls.forum + path;
    },

    formatDate(d) {
      if (!d) return '';
      try {
        return new Date(d).toLocaleString(this.$user.lang || 'fr-FR', {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        });
      } catch {
        return d;
      }
    },
  },
};
</script>

<style scoped lang="scss">
.forum-topic-view {
  padding-bottom: calc(80px + env(safe-area-inset-bottom));
}

.topic-title {
  margin-bottom: 1rem;
  line-height: 1.25;
}

.forum-post {
  background: white;
  border: 1px solid rgba(0, 0, 0, 0.12);
  padding: 0.85rem;
  margin-bottom: 0.6rem;
}

.forum-post-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.5rem;
}

.post-avatar {
  flex: 0 0 36px;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: #e5e7eb;
  overflow: hidden;

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
}

.post-meta {
  display: flex;
  flex-direction: column;
}

.post-author {
  font-weight: 600;
  font-size: 0.85rem;
  color: #4a4a4a;
}

.post-badge {
  display: inline-block;
  margin-left: 0.3rem;
  background: #fff5e6;
  color: #b26f1e;
  padding: 0.05rem 0.4rem;
  border-radius: 2px;
  font-size: 0.65rem;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.post-date {
  font-size: 0.7rem;
  color: #6b6b6b;
}

.post-body {
  font-size: 0.9rem;
  color: #4a4a4a;
  line-height: 1.5;

  ::v-deep p { margin: 0.4rem 0; }
  ::v-deep a { color: #337ab7; }
  ::v-deep img { max-width: 100%; height: auto; }
  ::v-deep pre, ::v-deep code {
    background: #f4f4f0;
    padding: 0.1rem 0.3rem;
    border-radius: 2px;
    font-size: 0.85rem;
  }
  ::v-deep blockquote {
    border-left: 3px solid #ff9933;
    padding-left: 0.7rem;
    color: #6b6b6b;
  }
}

.forum-link-out {
  margin-top: 1rem;
  text-align: center;
  font-size: 0.8rem;

  a {
    color: #337ab7;
    text-decoration: none;
  }
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
