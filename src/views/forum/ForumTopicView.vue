<template>
  <section class="section forum-topic-view">
    <div class="container">
      <!-- Breadcrumb — Forum > (parent >) category > topic. Uses
           the topic's `category_id` looked up against the categories
           list loaded in parallel with the topic. -->
      <p class="ft-breadcrumb">
        <router-link :to="{ name: 'forum' }">{{ $gettext('Forum') }}</router-link>
        <template v-if="topicParentCategory">
          <span class="ft-breadcrumb-sep">›</span>
          <router-link
            :to="{ name: 'forum-category', params: { slug: topicParentCategory.slug, id: topicParentCategory.id } }"
          >
            {{ topicParentCategory.name }}
          </router-link>
        </template>
        <template v-if="topicCategory">
          <span class="ft-breadcrumb-sep">›</span>
          <router-link :to="{ name: 'forum-category', params: { slug: topicCategory.slug, id: topicCategory.id } }">
            {{ topicCategory.name }}
          </router-link>
        </template>
      </p>

      <h1 v-if="title" class="ft-title">{{ title }}</h1>
      <div v-if="topicCategory" class="ft-cat-line">
        <category-pill :category="topicCategory" :parent="topicParentCategory" />
      </div>

      <div v-if="loading" class="ft-loading"><fa-icon icon="spinner" spin /> {{ $gettext('Chargement…') }}</div>

      <div v-else-if="error" class="ft-error">
        {{ $gettext('Sujet introuvable.') }}
      </div>

      <template v-else>
        <article
          v-for="post in visiblePosts"
          :key="post.id"
          class="ft-post"
          :class="{ 'is-op': post.post_number === 1 }"
        >
          <header class="ft-post-header">
            <user-avatar :user="postUser(post)" :size="48" />
            <div class="ft-post-meta">
              <span class="ft-post-author">
                <router-link
                  v-if="post.username"
                  :to="{ name: 'forum-user', params: { username: post.username } }"
                  class="ft-post-author-link"
                >
                  {{ post.name || post.username }}
                </router-link>
                <span v-else>{{ post.name || $gettext('Anonyme') }}</span>
                <span v-if="post.moderator || post.admin" class="ft-post-badge">
                  {{ post.admin ? $gettext('Admin') : $gettext('Modérateur') }}
                </span>
              </span>
              <time class="ft-post-date">#{{ post.post_number }} · {{ formatDate(post.created_at) }}</time>
            </div>
          </header>
          <div class="ft-post-body prose" v-html="post.cooked" />
          <footer class="ft-post-actions">
            <button
              type="button"
              class="ft-post-action"
              :class="{ 'is-liked': isLiked(post) }"
              :disabled="likePending === post.id"
              :title="isLiked(post) ? $gettext('Retirer le J’aime') : $gettext('J’aime ce message')"
              @click="toggleLike(post)"
            >
              <fa-icon :icon="isLiked(post) ? 'heart' : ['far', 'heart']" />
              <span v-if="post.reply_count || likeCount(post)"> &nbsp;{{ likeCount(post) || post.reply_count }} </span>
            </button>
            <button
              type="button"
              class="ft-post-action"
              :title="$gettext('Répondre à ce message')"
              @click="startReplyTo(post)"
            >
              <fa-icon icon="reply" />
              &nbsp;{{ $gettext('Répondre') }}
            </button>
          </footer>
        </article>

        <!-- Load more: Discourse's post_stream.stream is the full
             ordered list of post ids in the topic. When our visible
             posts are fewer than the stream, we fetch the next batch
             (up to LOAD_MORE_BATCH ids at a time) via
             /t/:id/posts.json. -->
        <button
          v-if="canLoadMorePosts"
          type="button"
          class="button is-text ft-load-more"
          :disabled="loadingMore"
          @click="loadMorePosts"
        >
          <fa-icon :icon="loadingMore ? 'spinner' : 'chevron-down'" :spin="loadingMore" />
          &nbsp;{{
            loadingMore
              ? $gettext('Chargement…')
              : $gettextInterpolate($gettext('Charger les %{n} messages suivants'), { n: remainingPostCount })
          }}
        </button>

        <!-- Inline reply editor: POST directly to Discourse. Session
             cookie required; if it's missing, we surface the SSO link
             so the user can log in and come back. -->
        <section class="ft-reply">
          <button
            v-if="!showReply"
            type="button"
            class="button is-primary is-small ft-reply-toggle"
            @click="startReply"
          >
            <fa-icon icon="pen-to-square" />
            &nbsp;{{ $gettext("Répondre dans l'app") }}
          </button>

          <div v-else class="ft-reply-editor">
            <p v-if="replyTargetLabel" class="ft-reply-target">
              {{ replyTargetLabel }}
              <button type="button" class="ft-reply-target-clear" @click="clearReplyTarget">
                <fa-icon icon="xmark" />
              </button>
            </p>
            <textarea
              ref="replyTextarea"
              v-model="replyText"
              :placeholder="$gettext('Votre réponse… (Markdown supporté)')"
              rows="5"
              :disabled="sending"
            />
            <div class="ft-reply-actions">
              <button type="button" class="button is-text is-small" :disabled="sending" @click="cancelReply">
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
            <p v-if="needsForumLogin" class="ft-reply-hint">
              {{ $gettext("Vous n'êtes pas connecté au forum.") }}
              <a :href="forumLoginUrl" target="_blank" rel="noopener"> {{ $gettext('Se connecter au forum') }} → </a>
            </p>
          </div>
        </section>

        <p class="ft-external">
          <a :href="topicExternalUrl" target="_self" rel="noopener">
            {{ $gettext('Ouvrir sur le forum Camptocamp') }} →
          </a>
        </p>
      </template>
    </div>
  </section>
</template>

<script>
// Single forum topic: header (breadcrumb + title + category), posts
// (initial batch + "Load more" for long threads), reply editor with
// per-post "Répondre" action that pre-fills a Discourse [quote]
// block. Likes hit /post_actions.json — needs the same Discourse
// session cookie as the reply flow.

import { toast } from 'bulma-toast';

import CategoryPill from '@/components/forum/CategoryPill.vue';
import UserAvatar from '@/components/forum/UserAvatar.vue';
import forum from '@/js/apis/forum';
import config from '@/js/config';

// How many post ids to hydrate at once when the user taps "Load more".
// Discourse recommends batches of 20 — matches the size of the initial
// server-hydrated slice, keeps the visual rhythm predictable.
const LOAD_MORE_BATCH = 20;

export default {
  name: 'ForumTopicView',

  components: { CategoryPill, UserAvatar },

  data() {
    return {
      topic: null,
      categories: [],
      loading: true,
      error: false,
      // Reply editor
      showReply: false,
      replyText: '',
      sending: false,
      needsForumLogin: false,
      replyToPostNumber: null,
      replyToUsername: null,
      // Likes: local optimistic overlay by post id so the UI updates
      // without a full topic reload. { [postId]: { liked: bool, delta: int } }
      likeOverlay: {},
      likePending: null,
      loadingMore: false,
    };
  },

  computed: {
    title() {
      return this.topic?.fancy_title || this.topic?.title || '';
    },

    hydratedPosts() {
      return this.topic?.post_stream?.posts || [];
    },
    // Discourse `post_stream.stream` = every post id in topic order.
    // We progressively hydrate more of them as the user asks.
    postStream() {
      return this.topic?.post_stream?.stream || [];
    },
    // Only posts we actually have full data for — sorted by
    // post_number to stay in thread order.
    visiblePosts() {
      const posts = [...this.hydratedPosts];
      posts.sort((a, b) => (a.post_number || 0) - (b.post_number || 0));
      return posts;
    },
    remainingPostCount() {
      const total = this.postStream.length;
      const shown = this.visiblePosts.length;
      return Math.max(0, total - shown);
    },
    canLoadMorePosts() {
      return this.remainingPostCount > 0;
    },

    topicCategory() {
      const id = this.topic?.category_id;
      if (id == null) return null;
      return this.categories.find((c) => c.id === id) || null;
    },
    topicParentCategory() {
      const parentId = this.topicCategory?.parent_category_id;
      if (parentId == null) return null;
      return this.categories.find((c) => c.id === parentId) || null;
    },

    topicExternalUrl() {
      const slug = this.topic?.slug || this.$route.params.slug || '';
      const id = this.$route.params.id;
      return `${config.urls.forum}/t/${slug ? slug + '/' : ''}${id}`;
    },

    forumLoginUrl() {
      return `${config.urls.forum}/login?return_path=${encodeURIComponent('/t/' + this.$route.params.id)}`;
    },

    replyTargetLabel() {
      if (!this.replyToPostNumber) return null;
      return this.$gettextInterpolate(this.$gettext('Réponse à @%{u} · message #%{n}'), {
        u: this.replyToUsername || '?',
        n: this.replyToPostNumber,
      });
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
      this.likeOverlay = {};
      try {
        const [topicRes, catRes] = await Promise.all([
          forum.getTopic(this.$route.params.id).promise_,
          forum.getCategories().promise_,
        ]);
        this.topic = topicRes?.data;
        this.categories = catRes?.data?.category_list?.categories || [];
      } catch (e) {
        this.error = true;
      } finally {
        this.loading = false;
      }
    },

    async loadMorePosts() {
      if (this.loadingMore || !this.canLoadMorePosts) return;
      this.loadingMore = true;
      try {
        const already = new Set(this.hydratedPosts.map((p) => p.id));
        const missing = this.postStream.filter((id) => !already.has(id)).slice(0, LOAD_MORE_BATCH);
        if (!missing.length) {
          this.loadingMore = false;
          return;
        }
        const res = await forum.getPostsRange(this.$route.params.id, missing).promise_;
        const more = res?.data?.post_stream?.posts || [];
        // Merge into the in-memory topic without mutating the
        // reactive array by reference — assign a new posts array so
        // Vue picks up the change.
        const posts = [...this.hydratedPosts, ...more];
        this.topic = {
          ...this.topic,
          post_stream: { ...this.topic.post_stream, posts },
        };
      } catch {
        toast({
          type: 'is-warning',
          position: 'bottom-center',
          message: this.$gettext('Impossible de charger la suite des messages.'),
        });
      } finally {
        this.loadingMore = false;
      }
    },

    // ---- Users / avatars ----------------------------------------

    postUser(post) {
      // The topic payload embeds `username`, `name`, `avatar_template`
      // directly on each post — build a compact user object for the
      // shared UserAvatar component.
      if (!post.username && !post.avatar_template) return null;
      return {
        username: post.username,
        name: post.name,
        avatar_template: post.avatar_template,
      };
    },

    // ---- Likes ---------------------------------------------------

    isLiked(post) {
      // Prefer local overlay so consecutive taps reflect the current
      // state; fall back to Discourse's `actions_summary` where action
      // type 2 == like and `acted: true` means the current user liked.
      if (this.likeOverlay[post.id]) return this.likeOverlay[post.id].liked;
      const like = (post.actions_summary || []).find((a) => a.id === 2);
      return !!like?.acted;
    },
    likeCount(post) {
      const base = (post.actions_summary || []).find((a) => a.id === 2)?.count || 0;
      const delta = this.likeOverlay[post.id]?.delta || 0;
      return base + delta;
    },
    async toggleLike(post) {
      if (this.likePending === post.id) return;
      const liked = this.isLiked(post);
      // Optimistic update — swapped back on error.
      this.$set(this.likeOverlay, post.id, {
        liked: !liked,
        delta: (this.likeOverlay[post.id]?.delta || 0) + (liked ? -1 : 1),
      });
      this.likePending = post.id;
      try {
        if (liked) await forum.unlikePost(post.id);
        else await forum.likePost(post.id);
      } catch (err) {
        // Revert optimistic overlay.
        this.$set(this.likeOverlay, post.id, {
          liked,
          delta: (this.likeOverlay[post.id]?.delta || 0) + (liked ? 1 : -1),
        });
        const status = err?.response?.status;
        if (status === 401 || status === 403 || status === 419) {
          toast({
            type: 'is-warning',
            position: 'bottom-center',
            duration: 4500,
            message: this.$gettext('Connectez-vous au forum pour aimer ce message.'),
          });
        } else {
          toast({
            type: 'is-warning',
            position: 'bottom-center',
            message: this.$gettext("Action impossible pour l'instant."),
          });
        }
      } finally {
        this.likePending = null;
      }
    },

    // ---- Reply ---------------------------------------------------

    startReply() {
      this.showReply = true;
      this.needsForumLogin = false;
      this.replyToPostNumber = null;
      this.replyToUsername = null;
      this.$nextTick(() => this.$refs.replyTextarea?.focus?.());
    },

    startReplyTo(post) {
      this.showReply = true;
      this.needsForumLogin = false;
      this.replyToPostNumber = post.post_number;
      this.replyToUsername = post.username || null;
      // Pre-fill the textarea with a Discourse [quote] block so the
      // reply reads clearly on the forum. Users can trim or expand
      // the quote before sending.
      const excerpt = this.stripHtml(post.cooked).slice(0, 400);
      const topicId = this.topic?.id;
      const quote = `[quote="${post.username}, post:${post.post_number}, topic:${topicId}"]\n${excerpt}\n[/quote]\n\n`;
      this.replyText = quote + this.replyText;
      this.$nextTick(() => {
        const ta = this.$refs.replyTextarea;
        if (ta) {
          ta.focus();
          // Move caret to the end so typing starts after the quote.
          ta.selectionStart = ta.selectionEnd = ta.value.length;
        }
      });
    },

    clearReplyTarget() {
      this.replyToPostNumber = null;
      this.replyToUsername = null;
    },

    cancelReply() {
      this.showReply = false;
      this.replyText = '';
      this.replyToPostNumber = null;
      this.replyToUsername = null;
    },

    async sendReply() {
      const raw = this.replyText.trim();
      if (!raw || !this.topic?.id) return;
      this.sending = true;
      try {
        await forum.postReply({
          topicId: this.topic.id,
          raw,
          replyToPostNumber: this.replyToPostNumber || undefined,
        });
        toast({
          type: 'is-success',
          position: 'bottom-center',
          message: this.$gettext('Réponse envoyée.'),
        });
        this.replyText = '';
        this.showReply = false;
        this.replyToPostNumber = null;
        this.replyToUsername = null;
        await this.load();
      } catch (err) {
        const status = err?.response?.status;
        if (status === 401 || status === 403 || status === 419) {
          this.needsForumLogin = true;
          toast({
            type: 'is-warning',
            position: 'bottom-center',
            duration: 4500,
            message: this.$gettext("Connectez-vous au forum (lien sous l'éditeur) puis réessayez."),
          });
        } else {
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

    // ---- Utilities ----------------------------------------------

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
    stripHtml(html) {
      if (!html) return '';
      const d = document.createElement('div');
      d.innerHTML = html;
      return (d.textContent || '').replace(/\s+/g, ' ').trim();
    },
  },
};
</script>

<style scoped lang="scss">
.forum-topic-view {
  padding-bottom: calc(80px + env(safe-area-inset-bottom));
}

.ft-breadcrumb {
  font-size: 0.78rem;
  color: #6b6b6b;
  margin-bottom: 0.7rem;
  a {
    color: #337ab7;
    text-decoration: none;
  }
}
.ft-breadcrumb-sep {
  margin: 0 0.35rem;
  color: #b5b5b5;
}

.ft-title {
  margin: 0 0 0.4rem;
  font-size: 1.15rem;
  line-height: 1.3;
  font-weight: 700;
  color: #4a4a4a;
  overflow-wrap: break-word;
}

.ft-cat-line {
  margin-bottom: 0.9rem;
}

.ft-post {
  background: white;
  border: 1px solid rgba(0, 0, 0, 0.1);
  border-radius: 6px;
  padding: 0.85rem;
  margin-bottom: 0.6rem;

  &.is-op {
    border-color: rgba(255, 153, 51, 0.35);
  }
}

.ft-post-header {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  margin-bottom: 0.6rem;
}

.ft-post-meta {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.ft-post-author {
  font-weight: 600;
  font-size: 0.88rem;
  color: #4a4a4a;
  display: flex;
  align-items: center;
  gap: 0.35rem;
  flex-wrap: wrap;
}
.ft-post-author-link {
  color: #4a4a4a;
  text-decoration: none;
  &:hover,
  &:focus {
    color: #337ab7;
    text-decoration: underline;
  }
}

.ft-post-badge {
  display: inline-block;
  background: #fff5e6;
  color: #b26f1e;
  padding: 0.05rem 0.4rem;
  border-radius: 2px;
  font-size: 0.65rem;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.ft-post-date {
  font-size: 0.7rem;
  color: #6b6b6b;
  margin-top: 0.05rem;
}

.ft-post-body {
  font-size: 0.9rem;
  color: #4a4a4a;
  line-height: 1.5;
  word-wrap: break-word;

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
    overflow-wrap: break-word;
    white-space: pre-wrap;
  }
  ::v-deep blockquote {
    border-left: 3px solid #ff9933;
    padding-left: 0.7rem;
    color: #6b6b6b;
    margin: 0.5rem 0;
  }
  ::v-deep aside.quote {
    border-left: 3px solid #ccc;
    padding: 0.3rem 0.6rem;
    background: rgba(0, 0, 0, 0.03);
    border-radius: 3px;
    margin: 0.5rem 0;
    font-size: 0.85rem;
  }
}

.ft-post-actions {
  display: flex;
  gap: 0.5rem;
  margin-top: 0.7rem;
  padding-top: 0.5rem;
  border-top: 1px dashed rgba(0, 0, 0, 0.08);
}

.ft-post-action {
  background: transparent;
  border: none;
  color: #6b6b6b;
  cursor: pointer;
  font-size: 0.78rem;
  padding: 0.2rem 0.5rem;
  border-radius: 4px;
  display: inline-flex;
  align-items: center;

  &:hover,
  &:focus {
    background: rgba(0, 0, 0, 0.05);
    color: #4a4a4a;
  }

  &.is-liked {
    color: #e54545;
  }

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
}

.ft-load-more {
  display: block;
  margin: 0.6rem auto 0.8rem;
  color: #337ab7;
}

.ft-reply {
  margin-top: 0.8rem;
}

.ft-reply-toggle {
  width: 100%;
}

.ft-reply-editor {
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

.ft-reply-target {
  margin: 0;
  padding: 0.3rem 0.5rem;
  background: rgba(255, 153, 51, 0.12);
  border-left: 3px solid #ff9933;
  border-radius: 3px;
  font-size: 0.78rem;
  color: #4a4a4a;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.4rem;
}

.ft-reply-target-clear {
  border: none;
  background: transparent;
  color: #6b6b6b;
  cursor: pointer;
  padding: 0.1rem 0.35rem;
  border-radius: 3px;
  &:hover {
    background: rgba(0, 0, 0, 0.06);
  }
}

.ft-reply-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.4rem;
}

.ft-reply-hint {
  margin: 0;
  font-size: 0.78rem;
  color: #6b6b6b;

  a {
    color: #337ab7;
    text-decoration: none;
  }
}

.ft-external {
  margin-top: 1rem;
  text-align: center;
  font-size: 0.8rem;

  a {
    color: #337ab7;
    text-decoration: none;
  }
}

.ft-loading,
.ft-error {
  padding: 0.75rem;
  font-size: 0.85rem;
  color: #6b6b6b;
}
.ft-error {
  color: #b91c1c;
}
</style>

<style lang="scss">
html[data-theme='dark'] {
  .forum-topic-view {
    .ft-post {
      background: #2a2a2a;
      border-color: rgba(255, 255, 255, 0.08);
      &.is-op {
        border-color: rgba(255, 153, 51, 0.35);
      }
    }
    .ft-title,
    .ft-post-author,
    .ft-post-author-link {
      color: #f0f0f0;
    }
    .ft-post-date,
    .ft-post-action,
    .ft-loading,
    .ft-reply-hint {
      color: #b5b5b5;
    }
    .ft-post-body {
      color: #e5e5e5;
    }
    .ft-post-body ::v-deep pre,
    .ft-post-body ::v-deep code {
      background: #1f1f1f;
    }
    .ft-post-actions {
      border-top-color: rgba(255, 255, 255, 0.08);
    }
    .ft-post-action.is-liked {
      color: #ff8f8f;
    }
    .ft-reply-editor textarea {
      background: #1f1f1f;
      color: #e5e5e5;
      border-color: rgba(255, 255, 255, 0.15);
    }
    .ft-reply-target {
      background: rgba(255, 153, 51, 0.18);
      color: #e5e5e5;
    }
    .ft-breadcrumb a,
    .ft-reply-hint a,
    .ft-external a,
    .ft-load-more {
      color: #6db4ff;
    }
  }
}
</style>
