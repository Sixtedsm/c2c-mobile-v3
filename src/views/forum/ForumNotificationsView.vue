<template>
  <section class="section forum-notifications-view">
    <div class="container">
      <p class="fn-breadcrumb">
        <router-link :to="{ name: 'forum' }">{{ $gettext('Forum') }}</router-link>
        <span class="fn-breadcrumb-sep">›</span>
        <span>{{ $gettext('Notifications') }}</span>
      </p>

      <div class="fn-header">
        <h1 class="title is-5 fn-title">
          <fa-icon icon="bell" />
          &nbsp;{{ $gettext('Notifications') }}
        </h1>
        <button
          v-if="notifications.length && hasUnread"
          type="button"
          class="button is-small is-primary"
          :disabled="markingAll"
          @click="markAllRead"
        >
          <fa-icon :icon="markingAll ? 'spinner' : 'check'" :spin="markingAll" />
          &nbsp;{{ $gettext('Tout marquer comme lu') }}
        </button>
      </div>

      <div v-if="!$user.isLogged" class="fn-signin-notice">
        {{ $gettext('Connectez-vous au forum pour voir vos notifications.') }}
        <router-link :to="{ name: 'auth' }" class="button is-primary is-small">
          {{ $gettext('Se connecter') }}
        </router-link>
      </div>

      <template v-else>
        <div v-if="loading" class="fn-loading"><fa-icon icon="spinner" spin /> {{ $gettext('Chargement…') }}</div>

        <div v-else-if="error" class="fn-error">
          {{ $gettext('Impossible de charger vos notifications.') }}
          <p v-if="needsForumLogin" class="fn-signin-hint">
            <a :href="forumLoginUrl" target="_blank" rel="noopener"> {{ $gettext('Se connecter au forum') }} → </a>
          </p>
        </div>

        <ul v-else-if="notifications.length" class="fn-list">
          <li v-for="n in notifications" :key="n.id" class="fn-item" :class="{ 'is-unread': !n.read }">
            <component
              :is="n.topic_id ? 'router-link' : 'div'"
              :to="n.topic_id ? { name: 'forum-topic', params: { id: n.topic_id, slug: n.slug } } : undefined"
              class="fn-link"
              @click.native="onNotifClick(n)"
            >
              <fa-icon :icon="iconFor(n)" class="fn-icon" />
              <div class="fn-body">
                <p class="fn-message">
                  <strong>{{ senderLabel(n) }}</strong>
                  <span>&nbsp;{{ actionLabel(n) }}</span>
                </p>
                <p v-if="n.fancy_title || n.data?.topic_title" class="fn-topic">
                  {{ n.fancy_title || n.data.topic_title }}
                </p>
                <p class="fn-date">{{ formatDate(n.created_at) }}</p>
              </div>
              <span v-if="!n.read" class="fn-unread-dot" />
            </component>
          </li>
        </ul>

        <p v-else class="fn-empty">
          {{ $gettext('Aucune notification pour le moment.') }}
        </p>
      </template>
    </div>
  </section>
</template>

<script>
// Discourse notifications for the current user — the bell inbox.
// Requires login (session cookie). Notifications carry a type id:
// see NOTIF_TYPES map for the ones we surface in French. Clicking
// a notification (a) navigates to the linked topic if any, and
// (b) marks it read on the server so the badge count drops.

import { toast } from 'bulma-toast';

import forum from '@/js/apis/forum';
import config from '@/js/config';

// Human-readable labels for Discourse notification_type ids. Full
// enum: mentioned=1, replied=2, quoted=3, edited=4, liked=5, pm=6,
// invited_to_pm=7, invitee=8, moved_post=9, linked=10, granted_badge=11,
// invited_to_topic=12, custom=13, group_mention=14, group_pm=15,
// watching_first_post=17, topic_reminder=18, liked_consolidated=19,
// post_approved=20, code_review_commit=21, membership_request_accepted=22,
// reaction=25, votes_released=26, event_reminder=27, chat_mention=29,
// bookmark_reminder=42.
const NOTIF_TYPES = {
  1: { icon: 'at', verb: 'vous a mentionné dans' },
  2: { icon: 'reply', verb: 'a répondu à' },
  3: { icon: 'quote-right', verb: 'vous a cité dans' },
  4: { icon: 'pen', verb: 'a modifié votre message dans' },
  5: { icon: 'heart', verb: 'a aimé votre message dans' },
  6: { icon: 'envelope', verb: 'vous a envoyé un message' },
  7: { icon: 'envelope', verb: 'vous a invité dans un message' },
  8: { icon: 'user-plus', verb: 'a rejoint' },
  9: { icon: 'arrow-right', verb: 'a déplacé un message dans' },
  10: { icon: 'link', verb: 'a lié votre message dans' },
  11: { icon: 'award', verb: 'vous a décerné un badge :' },
  12: { icon: 'user-plus', verb: 'vous a invité dans le sujet' },
  17: { icon: 'eye', verb: 'a créé un sujet dans' },
  18: { icon: 'clock', verb: 'rappel de sujet :' },
  19: { icon: 'heart', verb: "J'aime multiples reçus sur" },
  25: { icon: 'face-smile', verb: 'a réagi à votre message dans' },
  42: { icon: 'bookmark', verb: 'rappel de marque-page :' },
};

export default {
  name: 'ForumNotificationsView',

  data() {
    return {
      notifications: [],
      loading: true,
      error: false,
      needsForumLogin: false,
      markingAll: false,
    };
  },

  computed: {
    forumLoginUrl() {
      return `${config.urls.forum}/login`;
    },
    hasUnread() {
      return this.notifications.some((n) => !n.read);
    },
  },

  mounted() {
    if (this.$user.isLogged) this.load();
    else this.loading = false;
  },

  methods: {
    async load() {
      this.loading = true;
      this.error = false;
      this.needsForumLogin = false;
      try {
        const res = await forum.getNotifications({ limit: 50 }).promise_;
        this.notifications = res?.data?.notifications || [];
      } catch (err) {
        const status = err?.response?.status;
        if (status === 401 || status === 403 || status === 419) {
          this.needsForumLogin = true;
        }
        this.error = true;
      } finally {
        this.loading = false;
      }
    },

    iconFor(n) {
      return NOTIF_TYPES[n.notification_type]?.icon || 'bell';
    },

    actionLabel(n) {
      const label = NOTIF_TYPES[n.notification_type]?.verb;
      if (label) return this.$gettext(label);
      // Fallback for unknown notification types — just say "a agi".
      return this.$gettext('a fait une action dans');
    },

    senderLabel(n) {
      return n.data?.display_username || n.data?.username || n.data?.original_username || this.$gettext('Quelqu’un');
    },

    async onNotifClick(n) {
      if (n.read) return;
      // Optimistically mark as read in the local list; the server
      // gets a mark-read on best-effort basis.
      const target = this.notifications.find((x) => x.id === n.id);
      if (target) target.read = true;
      try {
        await forum.markNotificationsRead(n.id);
      } catch {
        // silent — the visible state is right, next reload will
        // reconcile with the server.
      }
    },

    async markAllRead() {
      if (this.markingAll) return;
      this.markingAll = true;
      try {
        await forum.markNotificationsRead();
        this.notifications.forEach((n) => {
          n.read = true;
        });
      } catch {
        toast({
          type: 'is-warning',
          position: 'bottom-center',
          message: this.$gettext('Impossible de tout marquer comme lu.'),
        });
      } finally {
        this.markingAll = false;
      }
    },

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
.forum-notifications-view {
  padding-bottom: calc(80px + env(safe-area-inset-bottom));
}
.fn-breadcrumb {
  font-size: 0.78rem;
  color: #6b6b6b;
  margin-bottom: 0.7rem;
  a {
    color: #337ab7;
    text-decoration: none;
  }
}
.fn-breadcrumb-sep {
  margin: 0 0.35rem;
  color: #b5b5b5;
}
.fn-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  margin-bottom: 1rem;
}
.fn-title {
  margin: 0;
  display: flex;
  align-items: center;
}
.fn-signin-notice {
  padding: 0.75rem;
  background: #fff5e6;
  border-left: 3px solid #ff9933;
  border-radius: 4px;
  font-size: 0.85rem;
  color: #6b4a1e;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.fn-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}
.fn-item {
  padding: 0;
  background: white;
  border: 1px solid rgba(0, 0, 0, 0.08);
  border-radius: 6px;
  overflow: hidden;

  &.is-unread {
    background: #fff8ee;
    border-color: rgba(255, 153, 51, 0.4);
  }
}
.fn-link {
  display: flex;
  gap: 0.6rem;
  align-items: flex-start;
  padding: 0.6rem 0.7rem;
  color: #4a4a4a;
  text-decoration: none;
  position: relative;

  &:hover,
  &:focus {
    color: #4a4a4a;
    text-decoration: none;
  }
}
.fn-icon {
  flex: 0 0 auto;
  margin-top: 0.2rem;
  color: #cc7a29;
}
.fn-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}
.fn-message {
  margin: 0;
  font-size: 0.85rem;
  color: #4a4a4a;
  line-height: 1.35;
  strong {
    font-weight: 600;
  }
}
.fn-topic {
  margin: 0;
  font-size: 0.85rem;
  color: #337ab7;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow-wrap: break-word;
}
.fn-date {
  margin: 0;
  font-size: 0.7rem;
  color: #6b6b6b;
}
.fn-unread-dot {
  position: absolute;
  top: 0.7rem;
  right: 0.7rem;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #ff9933;
}
.fn-loading,
.fn-empty,
.fn-error {
  padding: 0.75rem;
  font-size: 0.85rem;
  color: #6b6b6b;
}
.fn-error {
  color: #b91c1c;
}
.fn-signin-hint {
  margin-top: 0.5rem;
  color: #6b4a1e;
  a {
    color: #b26f1e;
  }
}
</style>

<style lang="scss">
html[data-theme='dark'] {
  .forum-notifications-view {
    .fn-item {
      background: #2a2a2a;
      border-color: rgba(255, 255, 255, 0.08);
      color: #e5e5e5;
      &.is-unread {
        background: #3a2f1a;
        border-color: rgba(255, 153, 51, 0.5);
      }
    }
    .fn-topic {
      color: #6db4ff;
    }
    .fn-message,
    .fn-date,
    .fn-loading,
    .fn-empty {
      color: #b5b5b5;
    }
    .fn-message strong {
      color: #f0f0f0;
    }
    .fn-breadcrumb a {
      color: #6db4ff;
    }
    .fn-signin-notice {
      background: #3a2f1a;
      color: #ffb866;
    }
  }
}
</style>
