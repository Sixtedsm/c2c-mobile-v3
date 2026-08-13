<template>
  <section class="section forum-topic-view">
    <div class="container">
      <h1 class="title is-5 topic-title">{{ title }}</h1>

      <div v-if="loading" class="loading-row"><fa-icon icon="spinner" spin /> {{ $gettext('Chargement…') }}</div>

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

        <!-- Inline reply editor — POST directly to Discourse API so the
             user stays in the PWA instead of being kicked out to Safari
             for every reply. Discourse uses session cookies; the first
             time the user has to log in on the forum (the link below
             handles that). After that, the cookie is reused and the
             reply flow stays in-app. iOS standalone PWAs may sandbox
             cookies separately from Safari — if the call fails, we
             surface the external-link fallback so the user is never
             stuck. -->
        <section class="forum-reply">
          <button
            v-if="!showReply"
            type="button"
            class="button is-primary is-small forum-reply-toggle"
            @click="startReply"
          >
            <fa-icon icon="pen-to-square" />
            &nbsp;{{ $gettext("Répondre dans l'app") }}
          </button>

          <div v-else class="forum-reply-editor">
            <textarea
              ref="replyTextarea"
              v-model="replyText"
              :placeholder="$gettext('Votre réponse… (Markdown supporté)')"
              rows="5"
              :disabled="sending"
            />
            <div class="forum-reply-actions">
              <button type="button" class="button is-text is-small" :disabled="sending" @click="showReply = false">
                {{ $gettext('Annuler') }}
              </button>
              <button
                type="button"
                class="button is-primary is-small"
                :disabled="sending || !replyText.trim()"
                @click="sendReply"
              >
                <fa-icon :icon="sending ? 'spinner' : 'paper-plane'" :spin="sending" />
                &nbsp;{{ sending ? $gettext('Envoi…') : $gettext('Envoyer') }}
              </button>
            </div>
            <p v-if="needsForumLogin" class="forum-reply-hint">
              {{ $gettext("Vous n'êtes pas connecté au forum.") }}
              <a :href="forumLoginUrl" target="_blank" rel="noopener"> {{ $gettext('Se connecter au forum') }} → </a>
            </p>
          </div>
        </section>

        <p class="forum-link-out">
          <a :href="topicExternalUrl" target="_self" rel="noopener">
            {{ $gettext('Ouvrir sur le forum Camptocamp') }} →
          </a>
        </p>
      </template>
    </div>
  </section>
</template>

<script>
import axios from 'axios';
import { toast } from 'bulma-toast';

import config from '@/js/config';

const forumHttp = axios.create({
  baseURL: config.urls.forum,
  timeout: 15000,
});

// Separate axios instance for authenticated calls — sends the session
// cookie set by forum.camptocamp.org on previous Discourse logins.
const forumAuthHttp = axios.create({
  baseURL: config.urls.forum,
  timeout: 15000,
  withCredentials: true,
});

export default {
  name: 'ForumTopicView',

  data() {
    return {
      topic: null,
      loading: true,
      error: false,
      // Reply editor state
      showReply: false,
      replyText: '',
      sending: false,
      needsForumLogin: false,
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

    forumLoginUrl() {
      // Discourse SSO endpoint. After login, the user is returned to the
      // topic; on the next reply attempt the session cookie is in place.
      return `${config.urls.forum}/login?return_path=${encodeURIComponent('/t/' + this.$route.params.id)}`;
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

    startReply() {
      this.showReply = true;
      this.needsForumLogin = false;
      this.$nextTick(() => this.$refs.replyTextarea?.focus?.());
    },

    async sendReply() {
      const raw = this.replyText.trim();
      if (!raw || !this.topic?.id) return;
      this.sending = true;
      try {
        // Discourse expects a CSRF token alongside the cookie. We fetch
        // one fresh per reply — cheap and avoids stale tokens.
        const csrfResp = await forumAuthHttp.get('/session/csrf.json');
        const csrf = csrfResp?.data?.csrf;
        if (!csrf) throw new Error('no-csrf');

        await forumAuthHttp.post(
          '/posts.json',
          new URLSearchParams({
            topic_id: String(this.topic.id),
            raw,
          }).toString(),
          {
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
              'X-CSRF-Token': csrf,
              'Discourse-Logged-In': 'true',
            },
          }
        );
        toast({
          type: 'is-success',
          position: 'bottom-center',
          message: this.$gettext('Réponse envoyée.'),
        });
        this.replyText = '';
        this.showReply = false;
        // Reload to surface the new post inline.
        await this.load();
      } catch (err) {
        const status = err?.response?.status;
        if (status === 401 || status === 403 || status === 419) {
          // Discourse rejected the request — the most common reason is
          // no/expired session. Point the user at the login flow; once
          // they come back with a fresh cookie, the next attempt works.
          this.needsForumLogin = true;
          toast({
            type: 'is-warning',
            position: 'bottom-center',
            duration: 4500,
            message: this.$gettext("Connectez-vous au forum (lien sous l'éditeur) puis réessayez."),
          });
        } else {
          // Probably CORS or a network problem — the inline path can't
          // recover, so we fall back gracefully to the external link
          // that's always rendered just below.
          toast({
            type: 'is-warning',
            position: 'bottom-center',
            duration: 4500,
            message: this.$gettext("Impossible d'envoyer depuis l'app. Utilisez « Ouvrir sur le forum »."),
          });
        }
      } finally {
        this.sending = false;
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

  ::v-deep p {
    margin: 0.4rem 0;
  }
  ::v-deep a {
    color: #337ab7;
  }
  ::v-deep img {
    max-width: 100%;
    height: auto;
  }
  ::v-deep pre,
  ::v-deep code {
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

.forum-reply {
  margin-top: 0.8rem;
}

.forum-reply-toggle {
  width: 100%;
}

.forum-reply-editor {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;

  textarea {
    width: 100%;
    min-height: 6rem;
    padding: 0.55rem 0.7rem;
    background: white;
    border: 1px solid rgba(0, 0, 0, 0.15);
    border-radius: 6px;
    font-size: 0.9rem;
    font-family: inherit;
    color: #4a4a4a;
    resize: vertical;
    &:focus {
      outline: none;
      border-color: #ff9933;
      box-shadow: 0 0 0 0.125em rgba(255, 153, 51, 0.25);
    }
  }
}

.forum-reply-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.4rem;
}

.forum-reply-hint {
  margin: 0;
  font-size: 0.78rem;
  color: #6b6b6b;

  a {
    color: #337ab7;
    text-decoration: none;
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

<style lang="scss">
// Dark mode — out-specifies the scoped white surfaces above via
// html[data-theme] so posts and the reply editor blend into the page.
html[data-theme='dark'] {
  .forum-topic-view .forum-post {
    background: #2a2a2a;
    border-color: rgba(255, 255, 255, 0.08);
  }
  .forum-topic-view .post-author {
    color: #f0f0f0;
  }
  .forum-topic-view .post-date {
    color: #9a9a9a;
  }
  .forum-topic-view .post-body {
    color: #e5e5e5;
  }
  .forum-topic-view .post-avatar {
    background: #3a3a3a;
  }
  .forum-topic-view .forum-reply-editor textarea {
    background: #1f1f1f;
    color: #e5e5e5;
    border-color: rgba(255, 255, 255, 0.15);
  }
  .forum-topic-view .forum-reply-hint {
    color: #b5b5b5;
  }
  .forum-topic-view .forum-reply-hint a,
  .forum-topic-view .forum-link-out a {
    color: #6db4ff;
  }
}
</style>
