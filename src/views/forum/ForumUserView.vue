<template>
  <section class="section forum-user-view">
    <div class="container">
      <p class="fu-breadcrumb">
        <router-link :to="{ name: 'forum' }">{{ $gettext('Forum') }}</router-link>
        <span class="fu-breadcrumb-sep">›</span>
        <span>@{{ username }}</span>
      </p>

      <div v-if="loading" class="fu-loading"><fa-icon icon="spinner" spin /> {{ $gettext('Chargement…') }}</div>

      <div v-else-if="error" class="fu-error">
        {{ $gettext("Ce profil est introuvable ou n'est pas accessible.") }}
      </div>

      <template v-else-if="user">
        <header class="fu-header">
          <div class="fu-avatar-lg">
            <img v-if="avatarLarge" :src="avatarLarge" :alt="user.username" />
            <span v-else>{{ initials }}</span>
          </div>
          <div class="fu-header-text">
            <h1 class="fu-name">{{ user.name || user.username }}</h1>
            <p v-if="user.name && user.username" class="fu-handle">@{{ user.username }}</p>
            <p v-if="user.title" class="fu-title">{{ user.title }}</p>
            <ul v-if="stats.length" class="fu-stats">
              <li v-for="s in stats" :key="s.label">
                <strong>{{ s.value }}</strong>
                <span>{{ s.label }}</span>
              </li>
            </ul>
          </div>
        </header>

        <section v-if="user.bio_cooked" class="fu-block">
          <h2 class="fu-block-title">{{ $gettext('À propos') }}</h2>
          <div class="fu-bio prose" v-html="user.bio_cooked" />
        </section>

        <section v-if="badges.length" class="fu-block">
          <h2 class="fu-block-title">{{ $gettext('Badges') }}</h2>
          <ul class="fu-badges">
            <li v-for="b in badges" :key="b.id" class="fu-badge" :title="b.description || b.name">
              <fa-icon :icon="badgeIcon(b)" class="fu-badge-icon" />
              <span>{{ b.name }}</span>
            </li>
          </ul>
        </section>

        <section class="fu-block">
          <h2 class="fu-block-title">{{ $gettext('Discussions créées') }}</h2>
          <div v-if="loadingTopics" class="fu-loading-sm">
            <fa-icon icon="spinner" spin /> {{ $gettext('Chargement…') }}
          </div>
          <ul v-else-if="userTopics.length" class="fu-topics">
            <li v-for="t in userTopics" :key="t.id">
              <topic-row :topic="t" :categories="categories" />
            </li>
          </ul>
          <p v-else class="fu-empty">{{ $gettext('Aucune discussion créée par cet utilisateur.') }}</p>
        </section>

        <p class="fu-external">
          <a :href="externalUrl" target="_self" rel="noopener">
            {{ $gettext('Voir le profil complet sur le forum') }} →
          </a>
        </p>
      </template>
    </div>
  </section>
</template>

<script>
// In-app view of a Discourse forum profile. Loads:
//   - /u/:username.json for the basic user (bio, badges, stats)
//   - /topics/created-by/:username.json for topics the user opened
//   - /categories.json for the sidebar to resolve category ids in
//     the topics list
// External-link fallback at the bottom for anything Discourse serves
// that we haven't ported yet (badge browser, private messages, etc.).

import TopicRow from '@/components/forum/TopicRow.vue';
import forum from '@/js/apis/forum';
import config from '@/js/config';

export default {
  name: 'ForumUserView',

  components: { TopicRow },

  data() {
    return {
      user: null,
      badges: [],
      userTopics: [],
      categories: [],
      loading: true,
      loadingTopics: true,
      error: false,
    };
  },

  computed: {
    username() {
      return this.$route.params.username;
    },
    externalUrl() {
      return `${config.urls.forum}/u/${encodeURIComponent(this.username)}`;
    },
    avatarLarge() {
      return forum.getAvatarUrl(this.user, 240);
    },
    initials() {
      const s = this.user?.name || this.user?.username || '?';
      return s.slice(0, 1).toUpperCase();
    },
    stats() {
      const s = this.user?.stats;
      if (!Array.isArray(s)) return [];
      // Discourse returns an array of {action_type,count}; the ids
      // are documented here — map the useful ones.
      const map = {
        4: this.$gettext('Sujets'),
        5: this.$gettext('Réponses'),
        6: this.$gettext('Messages'),
        1: this.$gettext('Mentions J’aime'),
      };
      const items = [];
      for (const row of s) {
        if (map[row.action_type] != null) {
          items.push({ label: map[row.action_type], value: row.count });
        }
      }
      // Fallback to summary counters when the .stats blob is empty.
      if (!items.length && this.user) {
        if (this.user.topic_count != null) items.push({ label: this.$gettext('Sujets'), value: this.user.topic_count });
        if (this.user.post_count != null) items.push({ label: this.$gettext('Messages'), value: this.user.post_count });
      }
      return items;
    },
  },

  watch: {
    username: 'load',
  },

  mounted() {
    this.load();
  },

  methods: {
    async load() {
      this.loading = true;
      this.loadingTopics = true;
      this.error = false;
      try {
        const [userRes, catRes] = await Promise.all([
          forum.getUser(this.username).promise_,
          forum.getCategories().promise_,
        ]);
        const userPayload = userRes?.data?.user || {};
        this.user = userPayload;
        this.badges = userRes?.data?.badges || [];
        this.categories = catRes?.data?.category_list?.categories || [];
      } catch (e) {
        this.error = true;
      } finally {
        this.loading = false;
      }
      // Fetch topics in parallel-ish (starts after user resolves so
      // the header renders first). Best-effort — a 404 here is
      // silent (Discourse hides it when the user has no topics).
      try {
        const res = await forum.getUserTopics(this.username).promise_;
        this.userTopics = res?.data?.topic_list?.topics || [];
      } catch {
        this.userTopics = [];
      } finally {
        this.loadingTopics = false;
      }
    },

    badgeIcon(badge) {
      // Discourse ships badge icons via FontAwesome class names —
      // some are "certificate", "star", etc. Prefer them when present,
      // fall back to a generic award.
      const raw = badge.icon || 'fa-award';
      // Strip any "fa-" prefix and category — the app uses the
      // Solid free style everywhere.
      return raw.replace(/^fa-/, '').replace(/^far?\s+/, '') || 'award';
    },
  },
};
</script>

<style scoped lang="scss">
.forum-user-view {
  padding-bottom: calc(80px + env(safe-area-inset-bottom));
}

.fu-breadcrumb {
  font-size: 0.78rem;
  color: #6b6b6b;
  margin-bottom: 0.9rem;

  a {
    color: #337ab7;
    text-decoration: none;
  }
}
.fu-breadcrumb-sep {
  margin: 0 0.35rem;
  color: #b5b5b5;
}

.fu-header {
  display: flex;
  gap: 0.9rem;
  align-items: flex-start;
  padding: 0.9rem;
  background: white;
  border: 1px solid rgba(0, 0, 0, 0.08);
  border-radius: 8px;
  margin-bottom: 1rem;
}

.fu-avatar-lg {
  flex: 0 0 84px;
  width: 84px;
  height: 84px;
  border-radius: 50%;
  background: #e5e7eb;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 2rem;
  font-weight: 700;
  color: #6b6b6b;

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }
}

.fu-header-text {
  flex: 1;
  min-width: 0;
}

.fu-name {
  font-size: 1.2rem;
  font-weight: 700;
  color: #4a4a4a;
  margin: 0 0 0.15rem;
}

.fu-handle {
  font-size: 0.85rem;
  color: #6b6b6b;
  margin: 0 0 0.35rem;
}

.fu-title {
  display: inline-block;
  padding: 0.15rem 0.5rem;
  background: #fff5e6;
  color: #b26f1e;
  border-radius: 3px;
  font-size: 0.72rem;
  font-weight: 600;
  margin-bottom: 0.35rem;
}

.fu-stats {
  list-style: none;
  padding: 0;
  margin: 0.4rem 0 0;
  display: flex;
  gap: 0.9rem;
  flex-wrap: wrap;

  li {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    line-height: 1;

    strong {
      font-size: 0.95rem;
      color: #4a4a4a;
    }
    span {
      font-size: 0.7rem;
      color: #6b6b6b;
      margin-top: 0.15rem;
    }
  }
}

.fu-block {
  margin-bottom: 1.2rem;
}

.fu-block-title {
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #6b6b6b;
  margin: 0 0 0.45rem;
  padding: 0 0.25rem;
}

.fu-bio {
  padding: 0.75rem 0.85rem;
  background: white;
  border: 1px solid rgba(0, 0, 0, 0.08);
  border-radius: 6px;
  font-size: 0.88rem;
  color: #4a4a4a;
  line-height: 1.5;

  ::v-deep p {
    margin: 0.3rem 0;
  }
  ::v-deep a {
    color: #337ab7;
  }
  ::v-deep img {
    max-width: 100%;
    height: auto;
  }
}

.fu-badges {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}

.fu-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.35rem 0.6rem;
  background: white;
  border: 1px solid rgba(0, 0, 0, 0.1);
  border-radius: 4px;
  font-size: 0.78rem;
  color: #4a4a4a;
}
.fu-badge-icon {
  color: #cc7a29;
}

.fu-topics {
  list-style: none;
  padding: 0;
  margin: 0;
}

.fu-loading,
.fu-loading-sm {
  padding: 0.75rem;
  font-size: 0.85rem;
  color: #6b6b6b;
}
.fu-error {
  padding: 0.75rem;
  font-size: 0.85rem;
  color: #b91c1c;
}
.fu-empty {
  padding: 0.5rem 0.75rem;
  font-size: 0.82rem;
  color: #6b6b6b;
  font-style: italic;
}

.fu-external {
  margin-top: 1rem;
  text-align: center;
  font-size: 0.8rem;

  a {
    color: #337ab7;
    text-decoration: none;
  }
}
</style>

<style lang="scss">
html[data-theme='dark'] {
  .forum-user-view {
    .fu-header,
    .fu-bio,
    .fu-badge {
      background: #2a2a2a;
      border-color: rgba(255, 255, 255, 0.08);
      color: #e5e5e5;
    }
    .fu-avatar-lg {
      background: #3a3a3a;
      color: #e5e5e5;
    }
    .fu-name,
    .fu-bio {
      color: #f0f0f0;
    }
    .fu-handle,
    .fu-block-title,
    .fu-loading,
    .fu-loading-sm,
    .fu-empty,
    .fu-stats li span {
      color: #b5b5b5;
    }
    .fu-title {
      background: #3a2f1a;
      color: #ffb866;
    }
    .fu-external a,
    .fu-breadcrumb a {
      color: #6db4ff;
    }
  }
}
</style>
