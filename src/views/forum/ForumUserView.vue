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
            <img
              v-if="avatarLarge && !avatarLargeFailed"
              :src="avatarLarge"
              :alt="user.username"
              @error="avatarLargeFailed = true"
            />
            <span v-else>{{ initials }}</span>
          </div>
          <div class="fu-header-text">
            <h1 class="fu-name">{{ user.name || user.username }}</h1>
            <p v-if="user.name && user.username" class="fu-handle">@{{ user.username }}</p>
            <p v-if="user.title" class="fu-title">{{ user.title }}</p>
            <p v-if="joinedLabel" class="fu-joined">
              <fa-icon icon="calendar" />
              &nbsp;{{ joinedLabel }}
            </p>
          </div>
        </header>

        <!-- Someone else's profile: the one action that makes sense is
             writing to them. Discourse calls this a private message. -->
        <section v-if="!isMyProfile && $user.isLogged" class="fu-my-actions">
          <router-link :to="{ name: 'forum-messages', query: { to: username } }" class="fu-my-action-btn">
            <fa-icon icon="envelope" />
            &nbsp;{{ $gettext('Envoyer un message') }}
          </router-link>
        </section>

        <!-- Own-profile actions row — one-tap access to Bookmarks
             and Notifications. Hidden on someone else's profile, so
             a visitor doesn't see personal shortcuts. -->
        <section v-if="isMyProfile" class="fu-my-actions">
          <router-link :to="{ name: 'forum-bookmarks' }" class="fu-my-action-btn">
            <fa-icon icon="bookmark" />
            &nbsp;{{ $gettext('Mes marque-pages') }}
          </router-link>
          <router-link :to="{ name: 'forum-notifications' }" class="fu-my-action-btn">
            <fa-icon icon="bell" />
            &nbsp;{{ $gettext('Notifications') }}
          </router-link>
          <router-link :to="{ name: 'forum-messages' }" class="fu-my-action-btn">
            <fa-icon icon="envelope" />
            &nbsp;{{ $gettext('Messages') }}
          </router-link>
          <router-link :to="{ name: 'forum-new-topic' }" class="fu-my-action-btn">
            <fa-icon icon="pen-to-square" />
            &nbsp;{{ $gettext('Nouveau sujet') }}
          </router-link>
        </section>

        <!-- Stat tiles — Discourse gives us a fairly rich summary; the
             ones exposed here match what forum.camptocamp.org shows
             on the user card (likes given/received, days visited,
             days read). -->
        <section v-if="statTiles.length" class="fu-stats-grid">
          <div v-for="tile in statTiles" :key="tile.key" class="fu-stat-tile">
            <fa-icon :icon="tile.icon" class="fu-stat-icon" />
            <strong>{{ tile.value }}</strong>
            <span>{{ tile.label }}</span>
          </div>
        </section>

        <section v-if="user.bio_cooked" class="fu-block">
          <h2 class="fu-block-title">{{ $gettext('À propos') }}</h2>
          <div class="fu-bio prose" v-html="user.bio_cooked" />
        </section>

        <section v-if="userTopics.length" class="fu-block">
          <h2 class="fu-block-title">{{ $gettext('Discussions créées') }}</h2>
          <ul class="fu-topics">
            <li v-for="t in userTopics.slice(0, 10)" :key="t.id">
              <topic-row :topic="t" :categories="categories" />
            </li>
          </ul>
        </section>

        <section v-if="topTopics.length" class="fu-block">
          <h2 class="fu-block-title">{{ $gettext('Sujets les plus actifs') }}</h2>
          <ul class="fu-topics">
            <li v-for="t in topTopics.slice(0, 6)" :key="'top-' + t.id">
              <topic-row :topic="hydratedTopTopic(t)" :categories="categories" />
            </li>
          </ul>
        </section>

        <section v-if="recentReplies.length" class="fu-block">
          <h2 class="fu-block-title">{{ $gettext('Réponses récentes') }}</h2>
          <ul class="fu-reply-list">
            <li v-for="r in recentReplies.slice(0, 6)" :key="'reply-' + r.topic_id + '-' + r.post_number">
              <router-link
                :to="{ name: 'forum-topic', params: { id: r.topic_id, slug: r.topic_slug } }"
                class="fu-reply-item"
              >
                <span class="fu-reply-title">{{ r.topic_title }}</span>
                <span class="fu-reply-meta">
                  <span v-if="r.like_count">
                    <fa-icon icon="heart" />
                    &nbsp;{{ r.like_count }}
                  </span>
                  <span>&nbsp;{{ formatDate(r.created_at) }}</span>
                </span>
              </router-link>
            </li>
          </ul>
        </section>

        <section v-if="topCategories.length" class="fu-block">
          <h2 class="fu-block-title">{{ $gettext('Catégories favorites') }}</h2>
          <ul class="fu-cat-list">
            <li v-for="c in topCategories.slice(0, 6)" :key="'topcat-' + c.category_id">
              <router-link
                :to="{ name: 'forum-category', params: { slug: catSlug(c.category_id), id: c.category_id } }"
                class="fu-cat-item"
                :style="{ borderLeftColor: '#' + (catColor(c.category_id) || 'aaaaaa') }"
              >
                <span class="fu-cat-name">{{ catName(c.category_id) }}</span>
                <span class="fu-cat-counts">
                  <span>{{ c.topic_count }} sujets</span>
                  <span>·</span>
                  <span>{{ c.post_count }} messages</span>
                </span>
              </router-link>
            </li>
          </ul>
        </section>

        <section v-if="likedUsers.length || likedByUsers.length" class="fu-block">
          <h2 class="fu-block-title">{{ $gettext('Interactions') }}</h2>
          <div class="fu-people">
            <div v-if="likedByUsers.length" class="fu-people-col">
              <p class="fu-people-label">{{ $gettext('L’aiment') }}</p>
              <div class="fu-people-row">
                <router-link
                  v-for="u in likedByUsers.slice(0, 8)"
                  :key="'lb-' + u.id"
                  :to="{ name: 'forum-user', params: { username: u.username } }"
                  class="fu-people-badge"
                  :title="u.username"
                >
                  <img v-if="peopleAvatarUrl(u)" :src="peopleAvatarUrl(u)" :alt="u.username" />
                  <span v-else>{{ (u.username || '?').charAt(0).toUpperCase() }}</span>
                </router-link>
              </div>
            </div>
            <div v-if="likedUsers.length" class="fu-people-col">
              <p class="fu-people-label">{{ $gettext('Aime') }}</p>
              <div class="fu-people-row">
                <router-link
                  v-for="u in likedUsers.slice(0, 8)"
                  :key="'la-' + u.id"
                  :to="{ name: 'forum-user', params: { username: u.username } }"
                  class="fu-people-badge"
                  :title="u.username"
                >
                  <img v-if="peopleAvatarUrl(u)" :src="peopleAvatarUrl(u)" :alt="u.username" />
                  <span v-else>{{ (u.username || '?').charAt(0).toUpperCase() }}</span>
                </router-link>
              </div>
            </div>
          </div>
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
      </template>
    </div>
  </section>
</template>

<script>
// In-app Discourse profile — everything the user needs stays inside
// the PWA (no "voir sur le site" escape hatch). Loads three payloads
// in parallel:
//   - /u/:username.json         → bio, badges, title, join date
//   - /u/:username/summary.json → stats, top topics, replies, top
//                                 categories, most-interacted users
//   - /categories.json          → for TopicRow category tags
//   - /topics/created-by/:username.json → full topic list beyond the
//                                         summary's top-N
// Fully renders in the app so the user never leaves.

import TopicRow from '@/components/forum/TopicRow.vue';
import forum from '@/js/apis/forum';

export default {
  name: 'ForumUserView',

  components: { TopicRow },

  data() {
    return {
      user: null,
      badges: [],
      userTopics: [],
      categories: [],
      summary: null,
      summaryUsers: {},
      loading: true,
      error: false,
      // Flipped to true when the header <img> 404s / errors so we
      // fall back to the initials block instead of showing a broken
      // image icon. Reset when the URL changes (see watch).
      avatarLargeFailed: false,
    };
  },

  computed: {
    username() {
      return this.$route.params.username;
    },
    // True when the user is viewing their OWN forum profile — drives
    // the "Bookmarks / Notifications / New topic" quick-actions row.
    // Compared case-insensitively because Discourse usernames are
    // canonical lowercase, but the C2C-side forumUsername may not be.
    isMyProfile() {
      const me = String(this.$user?.forumUsername || '').toLowerCase();
      const shown = String(this.username || '').toLowerCase();
      return !!me && me === shown;
    },
    avatarLarge() {
      // Prefer the avatar_template served on /u/:username.json; when
      // that endpoint returns HTML (Discourse's `hide_user_profiles_
      // from_public` setting sends a login page anonymously), fall
      // back to the direct /user_avatar/ path Discourse serves for
      // every account, keyed on the username from the URL. This is
      // the same pattern V1's Navigation.vue uses for the top-right
      // avatar and matches what forum.camptocamp.org itself serves.
      return forum.getAvatarUrl(this.user, 240) || forum.avatarUrlByUsername(this.username, 240);
    },
    initials() {
      // Same fallback ladder as avatarLarge: user object → URL param
      // → '?'. So a profile whose /u/:username.json returned HTML
      // still shows the first letter of the username, not a bare '?'.
      const s = this.user?.name || this.user?.username || this.username || '?';
      return String(s).slice(0, 1).toUpperCase();
    },
    joinedLabel() {
      const d = this.user?.created_at;
      if (!d) return '';
      try {
        return this.$gettextInterpolate(this.$gettext('Inscrit·e le %{date}'), {
          date: new Date(d).toLocaleDateString(this.$user.lang || 'fr-FR', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          }),
        });
      } catch {
        return '';
      }
    },
    statTiles() {
      const s = this.summary || {};
      const tiles = [];
      if (s.topic_count != null)
        tiles.push({ key: 'topics', icon: 'comments', value: s.topic_count, label: this.$gettext('sujets créés') });
      if (s.post_count != null)
        tiles.push({ key: 'posts', icon: 'reply', value: s.post_count, label: this.$gettext('messages') });
      if (s.likes_received != null)
        tiles.push({ key: 'lr', icon: 'heart', value: s.likes_received, label: this.$gettext('J’aime reçus') });
      if (s.likes_given != null)
        tiles.push({ key: 'lg', icon: 'thumbs-up', value: s.likes_given, label: this.$gettext('J’aime donnés') });
      if (s.days_visited != null)
        tiles.push({ key: 'dv', icon: 'calendar-check', value: s.days_visited, label: this.$gettext('jours actifs') });
      if (s.solved_count)
        tiles.push({ key: 'solved', icon: 'circle-check', value: s.solved_count, label: this.$gettext('résolus') });
      return tiles;
    },
    topTopics() {
      return this.summary?.topics || [];
    },
    recentReplies() {
      return this.summary?.replies || [];
    },
    topCategories() {
      return this.summary?.top_categories || [];
    },
    likedUsers() {
      // Users this profile has liked posts from (Discourse: most_liked_users).
      return this.summary?.most_liked_users || [];
    },
    likedByUsers() {
      return this.summary?.most_liked_by_users || [];
    },
  },

  watch: {
    username: 'load',
    // Fresh avatar URL = fresh loading attempt.
    avatarLarge() {
      this.avatarLargeFailed = false;
    },
  },

  mounted() {
    this.load();
  },

  methods: {
    async load() {
      this.loading = true;
      this.error = false;
      this.summary = null;
      this.summaryUsers = {};
      try {
        const [userRes, catRes] = await Promise.all([
          forum.getUser(this.username).promise_,
          forum.getCategories().promise_,
        ]);
        this.user = userRes?.data?.user || {};
        this.badges = userRes?.data?.badges || [];
        this.categories = catRes?.data?.category_list?.categories || [];
      } catch {
        this.error = true;
      } finally {
        this.loading = false;
      }
      // Summary + user's created topics — fire in parallel, both are
      // best-effort. A 404 or offline error leaves the section empty
      // instead of blowing up the whole page.
      const jobs = [
        forum
          .getUserSummary(this.username)
          .promise_.then((res) => {
            this.summary = res?.data?.user_summary || null;
            const users = res?.data?.users || [];
            this.summaryUsers = Object.fromEntries(users.map((u) => [u.id, u]));
          })
          .catch(() => {}),
        forum
          .getUserTopics(this.username)
          .promise_.then((res) => {
            this.userTopics = res?.data?.topic_list?.topics || [];
          })
          .catch(() => {
            this.userTopics = [];
          }),
      ];
      await Promise.all(jobs);
    },

    // Summary "topics" is a compact object — hydrate it enough that
    // TopicRow can render its usual row (last-poster avatar shows the
    // profile user's avatar since they own the topic).
    hydratedTopTopic(t) {
      return {
        ...t,
        first_poster_user: this.user,
        last_poster_user: this.user,
      };
    },

    catName(id) {
      return this.categories.find((c) => c.id === id)?.name || '';
    },
    catSlug(id) {
      return this.categories.find((c) => c.id === id)?.slug || '';
    },
    catColor(id) {
      return this.categories.find((c) => c.id === id)?.color || null;
    },

    peopleAvatarUrl(u) {
      // Same fallback ladder as the header avatar — if the users[]
      // summary blob lacks `avatar_template` for some reason,
      // reconstruct from the username so we don't fall through to
      // the initials block for every liked-by row.
      if (u?.avatar_template) return forum.avatarUrlFromTemplate(u.avatar_template, 48);
      return forum.avatarUrlByUsername(u?.username, 48);
    },

    badgeIcon(badge) {
      const raw = badge.icon || 'fa-award';
      return raw.replace(/^fa-/, '').replace(/^far?\s+/, '') || 'award';
    },

    formatDate(d) {
      if (!d) return '';
      try {
        return new Date(d).toLocaleDateString(this.$user.lang || 'fr-FR', { day: 'numeric', month: 'short' });
      } catch {
        return d;
      }
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
  margin-bottom: 0.8rem;
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
  margin: 0 0 0.35rem;
}

.fu-joined {
  font-size: 0.75rem;
  color: #6b6b6b;
  margin: 0;
}

.fu-my-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  margin-bottom: 1rem;
}
.fu-my-action-btn {
  flex: 1 1 30%;
  min-width: 130px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0.55rem 0.7rem;
  background: white;
  border: 1px solid rgba(255, 153, 51, 0.5);
  border-radius: 6px;
  color: #b26f1e;
  font-weight: 600;
  font-size: 0.85rem;
  text-decoration: none;

  &:hover,
  &:focus {
    background: #fff5e6;
    color: #b26f1e;
    text-decoration: none;
  }
}

.fu-stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(84px, 1fr));
  gap: 0.4rem;
  margin-bottom: 1rem;
}
.fu-stat-tile {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.15rem;
  padding: 0.5rem 0.3rem;
  background: white;
  border: 1px solid rgba(0, 0, 0, 0.08);
  border-radius: 6px;
  text-align: center;

  strong {
    font-size: 1rem;
    color: #4a4a4a;
    line-height: 1.1;
  }
  span {
    font-size: 0.68rem;
    color: #6b6b6b;
    line-height: 1.1;
  }
}
.fu-stat-icon {
  color: #cc7a29;
  font-size: 0.9rem;
  margin-bottom: 0.1rem;
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

.fu-topics,
.fu-reply-list,
.fu-cat-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.fu-reply-item {
  display: flex;
  flex-direction: column;
  padding: 0.55rem 0.7rem;
  background: white;
  border: 1px solid rgba(0, 0, 0, 0.08);
  border-radius: 6px;
  text-decoration: none;
  color: #4a4a4a;

  &:hover,
  &:focus {
    background: #fafafa;
    color: #4a4a4a;
    text-decoration: none;
  }
}
.fu-reply-title {
  font-weight: 600;
  font-size: 0.88rem;
  color: #337ab7;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow-wrap: break-word;
}
.fu-reply-meta {
  display: flex;
  gap: 0.5rem;
  font-size: 0.72rem;
  color: #6b6b6b;
  margin-top: 0.2rem;
}

.fu-cat-item {
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
.fu-cat-name {
  font-weight: 600;
  font-size: 0.85rem;
}
.fu-cat-counts {
  font-size: 0.72rem;
  color: #6b6b6b;
  display: flex;
  gap: 0.3rem;
}

.fu-people {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}
.fu-people-label {
  font-size: 0.75rem;
  color: #6b6b6b;
  margin: 0 0 0.25rem;
}
.fu-people-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
}
.fu-people-badge {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: #e5e7eb;
  overflow: hidden;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 0.85rem;
  font-weight: 600;
  color: #6b6b6b;
  text-decoration: none;

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
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

.fu-loading {
  padding: 0.75rem;
  font-size: 0.85rem;
  color: #6b6b6b;
}
.fu-error {
  padding: 0.75rem;
  font-size: 0.85rem;
  color: #b91c1c;
}
</style>

<style lang="scss">
html[data-theme='dark'] {
  .forum-user-view {
    .fu-header,
    .fu-bio,
    .fu-badge,
    .fu-stat-tile,
    .fu-reply-item,
    .fu-cat-item {
      background: #2a2a2a;
      border-color: rgba(255, 255, 255, 0.08);
      color: #e5e5e5;
    }
    .fu-avatar-lg,
    .fu-people-badge {
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
    .fu-joined,
    .fu-stat-tile span,
    .fu-cat-counts,
    .fu-reply-meta,
    .fu-people-label {
      color: #b5b5b5;
    }
    .fu-title {
      background: #3a2f1a;
      color: #ffb866;
    }
    .fu-breadcrumb a,
    .fu-reply-title {
      color: #6db4ff;
    }
    .fu-reply-item:hover,
    .fu-reply-item:focus,
    .fu-cat-item:hover,
    .fu-cat-item:focus {
      background: #333333;
      color: #e5e5e5;
    }
  }
}
</style>
