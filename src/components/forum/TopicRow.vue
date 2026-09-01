<template>
  <router-link :to="topicRoute" class="fr-row" :class="{ 'is-pinned': isPinned }">
    <user-avatar :user="displayedPoster" :size="48" class="fr-avatar" />
    <div class="fr-body">
      <div class="fr-title-line">
        <fa-icon v-if="isPinned" icon="thumbtack" class="fr-pinned-icon" :title="$gettext('Épinglé')" />
        <fa-icon
          v-if="hasSolution"
          icon="circle-check"
          class="fr-solved-icon"
          :title="$gettext('Résolu — une solution a été acceptée')"
        />
        <span class="fr-title">{{ topic.fancy_title || topic.title }}</span>
      </div>
      <div v-if="tags.length" class="fr-tags">
        <router-link
          v-for="tag in tags"
          :key="tag"
          :to="{ name: 'forum-tag', params: { tag } }"
          class="fr-tag"
          @click.native.stop
        >
          # {{ tag }}
        </router-link>
      </div>
      <div class="fr-meta-line">
        <category-pill v-if="category" :category="category" :parent="parentCategory" class="fr-cat" />
        <span class="fr-author">
          <template v-if="displayedPoster">{{ displayedPoster.username }}</template>
          <template v-else>{{ $gettext('Anonyme') }}</template>
        </span>
        <span class="fr-sep">·</span>
        <span class="fr-count">
          <fa-icon icon="comment" />
          &nbsp;{{ topic.posts_count || 0 }}
        </span>
        <span class="fr-sep">·</span>
        <span class="fr-date">{{ formatDate(topic.last_posted_at || topic.created_at) }}</span>
      </div>
    </div>
    <span v-if="unreadCount > 0" class="fr-unread" :title="$gettext('Non lus')">{{ unreadCount }}</span>
  </router-link>
</template>

<script>
// Compact topic row shared by ForumView (latest), ForumCategoryView
// (per-category listing) and ForumUserView (user's own topics).
// Renders: avatar of the last poster → title (wrapped, 2 lines max)
// → category pill, author, post count, last-post date → optional
// unread count badge on the right.

import CategoryPill from './CategoryPill.vue';
import UserAvatar from './UserAvatar.vue';

import forum from '@/js/apis/forum';

export default {
  name: 'ForumTopicRow',

  components: { UserAvatar, CategoryPill },

  props: {
    topic: { type: Object, required: true },
    // Full flat list of Discourse categories, used to look up the
    // topic's category (+ its parent for the tooltip). Pass whatever
    // `data.category_list.categories` returned; empty is fine.
    categories: { type: Array, default: () => [] },
  },

  computed: {
    topicRoute() {
      return { name: 'forum-topic', params: { id: this.topic.id, slug: this.topic.slug } };
    },
    // Prefer the last poster (matches Discourse's own default) — the
    // row is a "who posted last" cue. Fall back to first poster then
    // a null user (renders as a grey circle).
    displayedPoster() {
      return this.topic.last_poster_user || this.topic.first_poster_user || null;
    },
    category() {
      const id = this.topic.category_id;
      if (id == null) return null;
      return this.categories.find((c) => c.id === id) || null;
    },
    parentCategory() {
      const parentId = this.category?.parent_category_id;
      if (parentId == null) return null;
      return this.categories.find((c) => c.id === parentId) || null;
    },
    isPinned() {
      return !!(this.topic.pinned || this.topic.pinned_globally);
    },
    // Discourse topic-list payloads expose tags as an array of names
    // (`tags`). Also caps display to 4 to keep rows compact — extras
    // become a "+N" chip.
    tags() {
      const list = Array.isArray(this.topic.tags) ? this.topic.tags : [];
      return list.slice(0, 4);
    },
    // Discourse "Solved" plugin flag. Present when the topic has a
    // post marked as the accepted answer. Older payloads use
    // `accepted_answer` — accept both shapes.
    hasSolution() {
      return !!(this.topic.has_accepted_answer || this.topic.accepted_answer);
    },
    unreadCount() {
      // Discourse's own `unread` + `new_posts` counters (present on
      // the topic row only when the API call is authenticated). Not
      // authenticated → both undefined → 0 (badge hidden).
      const u = Number(this.topic.unread) || 0;
      const n = Number(this.topic.new_posts) || 0;
      return u + n;
    },
  },

  methods: {
    formatDate(d) {
      if (!d) return '';
      try {
        const now = Date.now();
        const then = new Date(d).getTime();
        const diffH = (now - then) / 3600000;
        if (diffH < 24) {
          return new Date(d).toLocaleTimeString(this.$user.lang || 'fr-FR', {
            hour: '2-digit',
            minute: '2-digit',
          });
        }
        if (diffH < 24 * 7) {
          return new Date(d).toLocaleDateString(this.$user.lang || 'fr-FR', {
            weekday: 'short',
          });
        }
        return new Date(d).toLocaleDateString(this.$user.lang || 'fr-FR', {
          day: 'numeric',
          month: 'short',
        });
      } catch {
        return d;
      }
    },
    // Exposed for parent views that need the same URL helper.
    avatarUrl(user, size) {
      return forum.getAvatarUrl(user, size);
    },
  },
};
</script>

<style scoped lang="scss">
.fr-row {
  display: flex;
  align-items: flex-start;
  gap: 0.7rem;
  padding: 0.7rem 0.85rem;
  background: white;
  border: 1px solid rgba(0, 0, 0, 0.08);
  border-radius: 6px;
  color: #4a4a4a;
  text-decoration: none;

  & + & {
    margin-top: 0.35rem;
  }

  &:hover,
  &:focus {
    background: #fafafa;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.06);
    color: #4a4a4a;
    text-decoration: none;
  }

  &.is-pinned {
    background: #fffaf0;
    border-color: rgba(255, 153, 51, 0.35);
  }
}

.fr-avatar {
  margin-top: 0.1rem;
}

.fr-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}

.fr-title-line {
  display: flex;
  align-items: baseline;
  gap: 0.35rem;
  min-width: 0;
}

.fr-pinned-icon {
  color: #cc7a29;
  font-size: 0.72rem;
  flex: 0 0 auto;
}
.fr-solved-icon {
  color: #2b8f4c;
  font-size: 0.85rem;
  flex: 0 0 auto;
}
.fr-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
  margin-top: 0.1rem;
}
.fr-tag {
  display: inline-flex;
  align-items: center;
  padding: 0.05rem 0.4rem;
  background: rgba(51, 122, 183, 0.08);
  color: #337ab7;
  border-radius: 4px;
  font-size: 0.68rem;
  text-decoration: none;
  line-height: 1.35;

  &:hover,
  &:focus {
    background: rgba(51, 122, 183, 0.16);
    color: #285a8f;
    text-decoration: none;
  }
}

.fr-title {
  font-weight: 600;
  font-size: 0.92rem;
  color: #337ab7;
  line-height: 1.3;
  // 2-line clamp — long titles wrap instead of being truncated.
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  overflow-wrap: break-word;
}

.fr-meta-line {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.35rem;
  font-size: 0.72rem;
  color: #6b6b6b;
  min-width: 0;
}

.fr-cat {
  margin-right: 0.1rem;
}

.fr-author {
  font-weight: 600;
  color: #4a4a4a;
  max-width: 40%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.fr-sep {
  color: #b5b5b5;
}

.fr-count {
  display: inline-flex;
  align-items: center;
}

.fr-unread {
  flex: 0 0 auto;
  align-self: center;
  min-width: 20px;
  height: 20px;
  padding: 0 0.35rem;
  border-radius: 999px;
  background: #ff9933;
  color: white;
  font-size: 0.7rem;
  font-weight: 700;
  line-height: 20px;
  text-align: center;
}
</style>

<style lang="scss">
html[data-theme='dark'] {
  .fr-row {
    background: #2a2a2a;
    border-color: rgba(255, 255, 255, 0.08);
    color: #e5e5e5;
    &:hover,
    &:focus {
      background: #333333;
      color: #e5e5e5;
    }
    &.is-pinned {
      background: #3a2f1a;
      border-color: rgba(255, 153, 51, 0.35);
    }
  }
  .fr-title {
    color: #6db4ff;
  }
  .fr-author {
    color: #e5e5e5;
  }
  .fr-meta-line {
    color: #b5b5b5;
  }
  .fr-tag {
    background: rgba(109, 180, 255, 0.14);
    color: #6db4ff;
    &:hover,
    &:focus {
      background: rgba(109, 180, 255, 0.24);
      color: #a3ccff;
    }
  }
  .fr-solved-icon {
    color: #4bc26b;
  }
}
</style>
