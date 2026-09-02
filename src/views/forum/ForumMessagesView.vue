<template>
  <section class="section forum-messages-view">
    <div class="container">
      <p class="fm-breadcrumb">
        <router-link :to="{ name: 'forum' }">{{ $gettext('Forum') }}</router-link>
        <span class="fm-breadcrumb-sep">›</span>
        <span>{{ $gettext('Messages') }}</span>
      </p>

      <div class="fm-header">
        <h1 class="title is-5 fm-title">
          <fa-icon icon="envelope" />
          &nbsp;{{ $gettext('Messages') }}
        </h1>
        <button v-if="!composing" type="button" class="button is-small is-primary" @click="startCompose">
          <fa-icon icon="pen-to-square" />
          &nbsp;{{ $gettext('Nouveau message') }}
        </button>
      </div>

      <div v-if="!$user.isLogged" class="fm-notice">
        {{ $gettext('Connectez-vous pour consulter vos messages.') }}
        <router-link :to="{ name: 'auth' }" class="button is-primary is-small">
          {{ $gettext('Se connecter') }}
        </router-link>
      </div>

      <template v-else>
        <!-- Compose. Discourse models a private message as a topic with
             a recipient list, so this is the new-topic form minus the
             category and plus the recipients. -->
        <form v-if="composing" class="fm-compose" @submit.prevent="send">
          <label class="fm-field">
            <span class="fm-label">{{ $gettext('Destinataires') }}</span>
            <input
              v-model="recipients"
              type="text"
              class="fm-input"
              :placeholder="$gettext('Noms d’utilisateur, séparés par des virgules')"
              :disabled="sending"
              autocomplete="off"
            />
          </label>
          <label class="fm-field">
            <span class="fm-label">{{ $gettext('Sujet') }}</span>
            <input
              v-model="title"
              type="text"
              class="fm-input"
              :placeholder="$gettext('Objet du message')"
              :disabled="sending"
            />
          </label>
          <div class="fm-field">
            <span class="fm-label">{{ $gettext('Message') }}</span>
            <reply-editor v-model="body" :disabled="sending" rows="6" :placeholder="$gettext('Votre message…')" />
          </div>
          <div class="fm-compose-actions">
            <button type="button" class="button is-text is-small" :disabled="sending" @click="cancelCompose">
              {{ $gettext('Annuler') }}
            </button>
            <button type="submit" class="button is-primary is-small" :disabled="sending || !canSend">
              <fa-icon :icon="sending ? 'spinner' : 'paper-plane'" :spin="sending" />
              &nbsp;{{ sending ? $gettext('Envoi…') : $gettext('Envoyer') }}
            </button>
          </div>
        </form>

        <div v-if="loading" class="fm-loading"><fa-icon icon="spinner" spin /> {{ $gettext('Chargement…') }}</div>

        <div v-else-if="needsForumLogin" class="fm-notice">
          {{
            $gettext(
              'Vos messages privés sont stockés sur le forum Discourse et requièrent une session sur forum.camptocamp.org qui n’est pas encore partagée avec l’application. Cette fonctionnalité arrive bientôt.'
            )
          }}
        </div>

        <div v-else-if="error" class="fm-error">
          {{ $gettext('Impossible de charger vos messages.') }}
        </div>

        <ul v-else-if="messages.length" class="fm-list">
          <li v-for="t in messages" :key="t.id">
            <topic-row :topic="t" :categories="[]" />
          </li>
        </ul>

        <p v-else-if="!composing" class="fm-empty">
          {{ $gettext('Aucun message pour le moment.') }}
        </p>
      </template>
    </div>
  </section>
</template>

<script>
// Discourse private-message inbox.
//
// A PM is just a topic with archetype 'private_message', so the rows
// reuse TopicRow and opening one lands on the normal ForumTopicView —
// no separate reading surface to maintain. Categories are passed empty
// on purpose: a PM has none.
//
// Everything here needs the Discourse session cookie, so until the app
// is served from camptocamp.org it shows the same honest notice as
// bookmarks and notifications rather than a red error.

import { toast } from 'bulma-toast';

import ReplyEditor from '@/components/forum/ReplyEditor.vue';
import TopicRow from '@/components/forum/TopicRow.vue';
import forum from '@/js/apis/forum';

export default {
  name: 'ForumMessagesView',

  components: { ReplyEditor, TopicRow },

  data() {
    return {
      messages: [],
      loading: true,
      error: false,
      needsForumLogin: false,
      composing: false,
      recipients: '',
      title: '',
      body: '',
      sending: false,
    };
  },

  computed: {
    canSend() {
      // Discourse enforces its own minimums server-side; these just stop
      // an obviously empty message from making a round trip.
      return !!(this.recipients.trim() && this.title.trim().length >= 2 && this.body.trim().length >= 2);
    },
  },

  mounted() {
    if (this.$user.isLogged && this.$user.forumUsername) {
      this.load();
    } else {
      this.loading = false;
    }
    // Deep link: /forum/messages?to=username opens the composer with the
    // recipient filled in, which is what a "write to this member" link
    // from a profile needs.
    const to = this.$route.query.to;
    if (to) {
      this.composing = true;
      this.recipients = String(to);
    }
  },

  methods: {
    async load() {
      this.loading = true;
      this.error = false;
      this.needsForumLogin = false;
      try {
        const res = await forum.getPrivateMessages(this.$user.forumUsername);
        this.messages = res?.data?.topic_list?.topics || [];
      } catch (err) {
        // Same broadened cookie-gap detection as the other private
        // views: a 401/403, an HTML login page that fails JSON.parse, or
        // a blocked credentialed request with no status at all.
        const status = err?.response?.status;
        const rawBody = err?.response?.data;
        const looksHtml = typeof rawBody === 'string' && rawBody.trim().startsWith('<');
        const jsonParseFail = /JSON|Unexpected token/i.test(String(err?.message || ''));
        if (status === 401 || status === 403 || status === 419 || looksHtml || jsonParseFail || !status) {
          this.needsForumLogin = true;
        } else {
          this.error = true;
        }
      } finally {
        this.loading = false;
      }
    },

    startCompose() {
      this.composing = true;
    },

    cancelCompose() {
      this.composing = false;
      this.recipients = '';
      this.title = '';
      this.body = '';
    },

    async send() {
      if (!this.canSend || this.sending) return;
      this.sending = true;
      try {
        const res = await forum.sendPrivateMessage({
          recipients: this.recipients
            .split(',')
            .map((r) => r.trim())
            .filter(Boolean),
          title: this.title.trim(),
          raw: this.body.trim(),
        });
        toast({
          type: 'is-success',
          position: 'bottom-center',
          message: this.$gettext('Message envoyé.'),
        });
        this.cancelCompose();
        // Land straight in the conversation when Discourse tells us
        // where it went; otherwise just refresh the inbox.
        const topicId = res?.data?.topic_id;
        if (topicId) {
          this.$router.push({ name: 'forum-topic', params: { id: topicId } });
        } else {
          await this.load();
        }
      } catch (err) {
        const status = err?.response?.status;
        const apiMsg = err?.response?.data?.errors?.[0];
        toast({
          type: 'is-warning',
          position: 'bottom-center',
          duration: 5000,
          message:
            status === 401 || status === 403 || status === 419
              ? this.$gettext('Connectez-vous sur forum.camptocamp.org pour envoyer un message.')
              : apiMsg || this.$gettext('Envoi impossible pour le moment.'),
        });
      } finally {
        this.sending = false;
      }
    },
  },
};
</script>

<style scoped lang="scss">
.forum-messages-view {
  padding-bottom: calc(80px + env(safe-area-inset-bottom));
}
.fm-breadcrumb {
  font-size: 0.78rem;
  color: #6b6b6b;
  margin-bottom: 0.7rem;
  a {
    color: #337ab7;
    text-decoration: none;
  }
}
.fm-breadcrumb-sep {
  margin: 0 0.35rem;
  color: #b5b5b5;
}
.fm-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  margin-bottom: 1rem;
}
.fm-title {
  margin: 0;
  display: flex;
  align-items: center;
}
.fm-notice {
  padding: 0.75rem;
  background: #fff5e6;
  border-left: 3px solid #ff9933;
  border-radius: 4px;
  font-size: 0.85rem;
  color: #6b4a1e;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  line-height: 1.4;
}
.fm-compose {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding: 0.9rem;
  background: white;
  border: 1px solid rgba(0, 0, 0, 0.08);
  border-radius: 6px;
  margin-bottom: 1.2rem;
}
.fm-field {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}
.fm-label {
  font-size: 0.7rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #6b6b6b;
}
.fm-input {
  padding: 0.45rem 0.6rem;
  background: white;
  border: 1px solid rgba(0, 0, 0, 0.15);
  border-radius: 4px;
  font-size: 0.9rem;
  color: #4a4a4a;

  &:focus {
    outline: none;
    border-color: #ff9933;
    box-shadow: 0 0 0 0.125em rgba(255, 153, 51, 0.2);
  }
}
.fm-compose-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.4rem;
}
.fm-list {
  list-style: none;
  padding: 0;
  margin: 0;
}
.fm-loading,
.fm-empty,
.fm-error {
  padding: 0.75rem;
  font-size: 0.85rem;
  color: #6b6b6b;
}
.fm-error {
  color: #b91c1c;
}
</style>

<style lang="scss">
html[data-theme='dark'] {
  .forum-messages-view {
    .fm-compose {
      background: #2a2a2a;
      border-color: rgba(255, 255, 255, 0.08);
    }
    .fm-input {
      background: #1f1f1f;
      color: #e5e5e5;
      border-color: rgba(255, 255, 255, 0.15);
    }
    .fm-label,
    .fm-loading,
    .fm-empty {
      color: #b5b5b5;
    }
    .fm-breadcrumb a {
      color: #6db4ff;
    }
    .fm-notice {
      background: #3a2f1a;
      color: #ffb866;
    }
  }
}
</style>
