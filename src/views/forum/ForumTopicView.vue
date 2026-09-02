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

      <div class="ft-header-row">
        <h1 v-if="title" class="ft-title">
          <fa-icon
            v-if="hasSolution"
            icon="circle-check"
            class="ft-solved-icon"
            :title="$gettext('Résolu — une solution a été acceptée')"
          />
          {{ title }}
        </h1>
        <button
          v-if="topic && $user.isLogged"
          type="button"
          class="ft-bookmark"
          :class="{ 'is-bookmarked': isBookmarked }"
          :disabled="bookmarking"
          :title="isBookmarked ? $gettext('Retirer le marque-page') : $gettext('Ajouter aux marque-pages')"
          @click="toggleBookmark"
        >
          <fa-icon
            :icon="bookmarking ? 'spinner' : isBookmarked ? 'bookmark' : ['far', 'bookmark']"
            :spin="bookmarking"
          />
        </button>
      </div>
      <div v-if="topicCategory || topicTags.length" class="ft-cat-line">
        <category-pill v-if="topicCategory" :category="topicCategory" :parent="topicParentCategory" />
        <router-link v-for="tag in topicTags" :key="tag" :to="{ name: 'forum-tag', params: { tag } }" class="ft-tag">
          # {{ tag }}
        </router-link>
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
          :class="{ 'is-op': post.post_number === 1, 'is-solution': isSolutionPost(post) }"
        >
          <div v-if="isSolutionPost(post)" class="ft-solution-banner">
            <fa-icon icon="circle-check" />
            &nbsp;{{ $gettext('Solution acceptée') }}
          </div>
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
          <!-- Inline edit editor for a post, shown in place of the
               rendered `cooked` HTML when the user is editing one of
               their own messages. Uses the same ReplyEditor as the
               reply flow / new-topic flow so formatting stays
               consistent. -->
          <div v-if="editingPostId === post.id" class="ft-post-edit">
            <reply-editor
              v-model="editRaw"
              :placeholder="$gettext('Contenu du message…')"
              :disabled="savingEdit"
              rows="6"
            />
            <div class="ft-reply-actions">
              <button type="button" class="button is-text is-small" :disabled="savingEdit" @click="cancelEdit">
                {{ $gettext('Annuler') }}
              </button>
              <button
                type="button"
                class="button is-primary is-small"
                :disabled="savingEdit || !editRaw.trim()"
                @click="saveEdit(post)"
              >
                <fa-icon :icon="savingEdit ? 'spinner' : 'check'" :spin="savingEdit" />
                &nbsp;{{ savingEdit ? $gettext('Enregistrement…') : $gettext('Enregistrer') }}
              </button>
            </div>
          </div>
          <div v-else class="ft-post-body prose" v-html="post.cooked" />
          <footer v-if="editingPostId !== post.id" class="ft-post-actions">
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
            <button
              v-if="canEditPost(post)"
              type="button"
              class="ft-post-action"
              :title="$gettext('Modifier votre message')"
              @click="startEdit(post)"
            >
              <fa-icon icon="pen" />
              &nbsp;{{ $gettext('Modifier') }}
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
            <fa-icon icon="reply" />
            &nbsp;{{ $gettext('Répondre') }}
          </button>

          <div v-else class="ft-reply-editor">
            <p v-if="replyTargetLabel" class="ft-reply-target">
              {{ replyTargetLabel }}
              <button type="button" class="ft-reply-target-clear" @click="clearReplyTarget">
                <fa-icon icon="xmark" />
              </button>
            </p>
            <reply-editor
              v-model="replyText"
              :placeholder="$gettext('Votre réponse… (Markdown supporté, images acceptées)')"
              :disabled="sending"
              rows="5"
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
              {{
                $gettext(
                  'Publier une réponse nécessite une session sur forum.camptocamp.org qui n’est pas encore partagée avec l’application. Cette fonctionnalité arrive bientôt.'
                )
              }}
            </p>
          </div>
        </section>

        <!-- Compact icon-row of topic actions, Discourse-mobile style.
             Notifications is a bell that opens a small popover with
             the 4 Discourse levels (Watching / Tracking / Normal /
             Muted). Share uses the platform Web Share API and falls
             back to a link-copy. Flag opens a small confirm — the
             actual POST needs a session cookie on forum.camptocamp.
             org, so if that isn't shared yet the toast tells the user
             what to do. Every write here mirrors what the desktop
             forum toolbar would trigger on the same account. -->
        <div v-if="topic" class="ft-topic-actions">
          <div v-if="$user.isLogged" ref="notifWrap" class="ft-notif-wrap">
            <button
              type="button"
              class="ft-topic-action"
              :class="{ 'is-active': notifMenuOpen, 'is-watching': notificationLevel === 3 }"
              :aria-expanded="notifMenuOpen ? 'true' : 'false'"
              aria-haspopup="menu"
              :title="notificationLevelLabel"
              @click="toggleNotifMenu"
            >
              <fa-icon :icon="notifIconFor(notificationLevel)" />
              <span class="ft-topic-action-label">{{ notificationLevelShortLabel }}</span>
              <fa-icon icon="chevron-down" class="ft-topic-action-caret" />
            </button>
            <div v-if="notifMenuOpen" class="ft-notif-popover" role="menu">
              <button
                v-for="opt in notifOptions"
                :key="opt.value"
                type="button"
                class="ft-notif-option"
                :class="{ 'is-active': notificationLevel === opt.value }"
                role="menuitemradio"
                :aria-checked="notificationLevel === opt.value ? 'true' : 'false'"
                @click="pickNotifLevel(opt.value)"
              >
                <fa-icon :icon="opt.icon" class="ft-notif-option-icon" />
                <span class="ft-notif-option-body">
                  <span class="ft-notif-option-label">{{ opt.label }}</span>
                  <span class="ft-notif-option-hint">{{ opt.hint }}</span>
                </span>
                <fa-icon
                  v-if="notificationLevel === opt.value"
                  :icon="settingNotifLevel ? 'spinner' : 'check'"
                  :spin="settingNotifLevel"
                  class="ft-notif-option-check"
                />
              </button>
            </div>
          </div>

          <button type="button" class="ft-topic-action" @click="shareTopic">
            <fa-icon icon="share-alt" />
            <span class="ft-topic-action-label">{{ $gettext('Partager') }}</span>
          </button>

          <div v-if="$user.isLogged" ref="flagWrap" class="ft-notif-wrap">
            <button
              type="button"
              class="ft-topic-action ft-topic-action-danger"
              :class="{ 'is-active': flagMenuOpen }"
              :aria-expanded="flagMenuOpen ? 'true' : 'false'"
              aria-haspopup="menu"
              @click="toggleFlagMenu"
            >
              <fa-icon icon="flag" />
              <span class="ft-topic-action-label">{{ $gettext('Signaler') }}</span>
            </button>
            <div v-if="flagMenuOpen" class="ft-notif-popover ft-flag-popover" role="menu">
              <p class="ft-flag-intro">{{ $gettext('Pourquoi signalez-vous ce sujet ?') }}</p>
              <button
                v-for="opt in flagOptions"
                :key="opt.value"
                type="button"
                class="ft-notif-option"
                role="menuitem"
                :disabled="flagging"
                @click="pickFlagReason(opt)"
              >
                <fa-icon :icon="opt.icon" class="ft-notif-option-icon ft-flag-icon" />
                <span class="ft-notif-option-body">
                  <span class="ft-notif-option-label">{{ opt.label }}</span>
                  <span class="ft-notif-option-hint">{{ opt.hint }}</span>
                </span>
                <fa-icon v-if="flagging === opt.value" icon="spinner" spin class="ft-notif-option-check" />
              </button>
            </div>
          </div>
        </div>
      </template>

      <!-- Floating "N sur N" scroll indicator. Fades in the first
           time the user scrolls the topic and hides itself 1.2 s
           after the last scroll event, matching how the desktop
           Discourse timeline shows/hides on scroll. Only mounted
           when we actually have a topic and multiple posts —
           useless on a 1-post thread. -->
      <transition name="ft-progress-fade">
        <div
          v-if="progressVisible && totalPostsCount > 1"
          class="ft-progress-floating"
          :aria-hidden="progressVisible ? 'false' : 'true'"
        >
          <span class="ft-progress-count">{{ currentPostNumber }} / {{ totalPostsCount }}</span>
          <span class="ft-progress-bar">
            <span class="ft-progress-fill" :style="{ width: currentProgressPercent + '%' }"></span>
          </span>
        </div>
      </transition>
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
import ReplyEditor from '@/components/forum/ReplyEditor.vue';
import UserAvatar from '@/components/forum/UserAvatar.vue';
import forum from '@/js/apis/forum';
import config from '@/js/config';

// How many post ids to hydrate at once when the user taps "Load more".
// Discourse recommends batches of 20 — matches the size of the initial
// server-hydrated slice, keeps the visual rhythm predictable.
const LOAD_MORE_BATCH = 20;

export default {
  name: 'ForumTopicView',

  components: { CategoryPill, ReplyEditor, UserAvatar },

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
      // Bookmark state — the topic's first post is what Discourse
      // bookmarks. `bookmarkedId` is the Discourse bookmark record
      // id, needed to delete the bookmark on toggle.
      bookmarkedId: null,
      bookmarking: false,
      // In-place edit state — the post_id currently being edited (at
      // most one at a time), the raw markdown loaded from the server
      // for that post, and a saving flag.
      editingPostId: null,
      editRaw: '',
      savingEdit: false,
      // Notification level for the current viewer on this topic.
      // 0 = Muted, 1 = Regular, 2 = Tracking, 3 = Watching. Bootstrap
      // from topic.notification_level when the payload includes it
      // (only present with a session cookie). Session-cookie-less
      // browsers see it stuck at 1 until forum.camptocamp.org and
      // sixtedsm.github.io share cookies.
      notificationLevel: 1,
      settingNotifLevel: false,
      // Compact popover for the notification level (bell). Closed by
      // default; toggled by the bell button; a click-outside handler
      // in mounted() closes it too.
      notifMenuOpen: false,
      // Flag popover — mirrors the four reasons the Discourse flag
      // dialog offers. `flagging` holds the action-type id being sent
      // so only the tapped row shows a spinner.
      flagMenuOpen: false,
      flagging: null,
      // Floating "N/N" progress pill — visible only while the user
      // is scrolling, hides itself 1.2 s after the last scroll event.
      // currentPostNumber tracks which hydrated post is currently
      // near the top of the reading area (viewport / 3 anchor line).
      progressVisible: false,
      currentPostNumber: 1,
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

    replyTargetLabel() {
      if (!this.replyToPostNumber) return null;
      return this.$gettextInterpolate(this.$gettext('Réponse à @%{u} · message #%{n}'), {
        u: this.replyToUsername || '?',
        n: this.replyToPostNumber,
      });
    },

    // The first post carries the topic-level bookmark. `bookmarked`
    // (server-side) tells us whether the current user has bookmarked
    // it; `bookmark_id` gives us the record id needed to delete.
    firstPost() {
      const posts = this.hydratedPosts;
      return posts.find((p) => p.post_number === 1) || posts[0] || null;
    },
    isBookmarked() {
      if (this.bookmarkedId !== null) return true;
      return !!this.firstPost?.bookmarked;
    },
    // Same-user check for the "Modifier" button. Discourse usernames
    // are case-insensitive server-side but the post payload's
    // username may not match the user's cached casing — normalise.
    myLoweredForumUsername() {
      return String(this.$user?.forumUsername || '').toLowerCase();
    },

    // Tags on the topic — Discourse exposes them as string[]. Empty
    // when the plugin is off or the topic has none.
    topicTags() {
      return Array.isArray(this.topic?.tags) ? this.topic.tags : [];
    },

    // Discourse "Solved" plugin surfaces the accepted answer in
    // several shapes depending on payload version. Try each in turn.
    hasSolution() {
      if (!this.topic) return false;
      if (this.topic.has_accepted_answer) return true;
      if (this.topic.accepted_answer) return true;
      return this.hydratedPosts.some((p) => p.accepted_answer);
    },
    solutionPostId() {
      if (!this.topic) return null;
      // Preferred shape: topic.accepted_answer.post_number (topic
      // payload). Fallback: scan hydrated posts for accepted_answer.
      const acc = this.topic.accepted_answer;
      if (acc?.post_id) return acc.post_id;
      const p = this.hydratedPosts.find((pp) => pp.accepted_answer);
      return p?.id || null;
    },

    // Posts progress — number of posts we currently render vs the
    // total in the thread. Powers the green pill camptocamp.org
    // shows at the bottom of a topic ("N sur N").
    totalPostsCount() {
      const t = this.topic;
      if (!t) return 0;
      // posts_count is the authoritative Discourse value; the stream
      // length matches after all posts hydrate, and highest_post_number
      // is a decent last-resort fallback on very old payloads.
      return t.posts_count || (t.post_stream?.stream?.length ?? 0) || t.highest_post_number || 0;
    },
    postsProgressPercent() {
      if (!this.totalPostsCount) return 0;
      const p = Math.min(this.visiblePosts.length, this.totalPostsCount);
      return Math.round((p / this.totalPostsCount) * 100);
    },
    postsProgressLabel() {
      return `${this.visiblePosts.length} / ${this.totalPostsCount}`;
    },
    notificationLevelLabel() {
      // Same wording Discourse itself surfaces on the "Actions sur le
      // sujet" dropdown at forum.camptocamp.org.
      switch (Number(this.notificationLevel)) {
        case 3:
          return this.$gettext('Vous recevrez des notifications pour chaque nouveau message.');
        case 2:
          return this.$gettext('Vous serez notifié·e si quelqu’un vous mentionne ou répond à votre message.');
        case 0:
          return this.$gettext('Vous ne recevrez aucune notification pour ce sujet.');
        default:
          return this.$gettext('Vous serez notifié·e uniquement pour les mentions et les réponses directes.');
      }
    },
    // Short label for the compact bell button. Uses the same names as
    // Discourse's mobile toolbar so a user coming from the desktop
    // site instantly recognises the state.
    notificationLevelShortLabel() {
      switch (Number(this.notificationLevel)) {
        case 3:
          return this.$gettext('Surveillé');
        case 2:
          return this.$gettext('Suivi');
        case 0:
          return this.$gettext('Muet');
        default:
          return this.$gettext('Normal');
      }
    },
    // Four options for the popover; mirrors what Discourse shows in
    // its own bell dropdown (label + one-line hint + icon).
    notifOptions() {
      return [
        {
          value: 3,
          icon: 'exclamation-circle',
          label: this.$gettext('Surveillé'),
          hint: this.$gettext('Notification à chaque nouveau message.'),
        },
        {
          value: 2,
          icon: 'eye',
          label: this.$gettext('Suivi'),
          hint: this.$gettext('Décompte des non-lus et nouveautés.'),
        },
        {
          value: 1,
          icon: 'bell',
          label: this.$gettext('Normal'),
          hint: this.$gettext('Notification pour mentions et réponses directes.'),
        },
        {
          value: 0,
          icon: 'bell-slash',
          label: this.$gettext('Muet'),
          hint: this.$gettext('Aucune notification.'),
        },
      ];
    },
    // The four reasons forum.camptocamp.org offers a regular member.
    // Ids are Discourse post_action_type_id values.
    flagOptions() {
      return [
        {
          value: 3,
          icon: 'arrow-right',
          label: this.$gettext('Hors-sujet'),
          hint: this.$gettext('Ce message ne concerne pas le sujet.'),
        },
        {
          value: 4,
          icon: 'triangle-exclamation',
          label: this.$gettext('Inapproprié'),
          hint: this.$gettext('Contenu offensant ou contraire aux règles.'),
        },
        {
          value: 8,
          icon: 'ban',
          label: this.$gettext('Spam'),
          hint: this.$gettext('Publicité ou message indésirable.'),
        },
        {
          value: 7,
          icon: 'envelope',
          label: this.$gettext('Autre chose'),
          hint: this.$gettext('Prévenir les modérateurs avec un message.'),
        },
      ];
    },
    currentProgressPercent() {
      if (!this.totalPostsCount) return 0;
      return Math.min(100, Math.round((this.currentPostNumber / this.totalPostsCount) * 100));
    },
  },

  watch: {
    '$route.params.id'() {
      this.load();
    },
    // Load more / a fresh topic changes how many .ft-post nodes exist,
    // so the cached NodeList the scroll handler reads must be dropped.
    'visiblePosts.length'() {
      this.invalidateScrollCache();
    },
  },

  mounted() {
    this.load();
    // Attach scroll + click-outside listeners for the floating "N/N"
    // progress pill and the notification-level popover. The scroll
    // surface in the mobile shell is `.page-content` (see App.vue);
    // in the desktop shell falls back to window. Passive: true so we
    // never delay scrolling.
    this._scrollTarget = document.querySelector('.page-content') || window;
    this._scrollHandler = this.onTopicScroll.bind(this);
    this._scrollTarget.addEventListener('scroll', this._scrollHandler, { passive: true });
    this._clickHandler = this.onDocumentClick.bind(this);
    document.addEventListener('click', this._clickHandler, true);
    // A resize (rotation, keyboard opening) changes the reading-area
    // height the anchor is derived from.
    this._resizeHandler = this.invalidateScrollCache.bind(this);
    window.addEventListener('resize', this._resizeHandler, { passive: true });
  },

  beforeDestroy() {
    if (this._scrollTarget && this._scrollHandler) {
      this._scrollTarget.removeEventListener('scroll', this._scrollHandler);
    }
    if (this._clickHandler) {
      document.removeEventListener('click', this._clickHandler, true);
    }
    if (this._resizeHandler) {
      window.removeEventListener('resize', this._resizeHandler);
    }
    if (this._progressHideT) window.clearTimeout(this._progressHideT);
  },

  methods: {
    async load() {
      this.loading = true;
      this.error = false;
      this.likeOverlay = {};
      this.bookmarkedId = null;
      this.editingPostId = null;
      try {
        const [topicRes, catRes] = await Promise.all([
          forum.getTopic(this.$route.params.id).promise_,
          forum.getCategories().promise_,
        ]);
        this.topic = topicRes?.data;
        this.categories = catRes?.data?.category_list?.categories || [];
        // Bootstrap the bookmark id from whatever Discourse handed us
        // on the topic payload so the star icon renders in the
        // correct state.
        if (this.firstPost?.bookmark_id) {
          this.bookmarkedId = this.firstPost.bookmark_id;
        }
        // notification_level is only present when Discourse could
        // identify the viewer via cookie. Anonymous callers get no
        // field, so we leave the default (1 = Regular).
        if (this.topic?.notification_level != null) {
          this.notificationLevel = this.topic.notification_level;
        }
      } catch (e) {
        this.error = true;
      } finally {
        this.loading = false;
      }
    },

    // ---- Bookmarks -----------------------------------------------

    async toggleBookmark() {
      if (this.bookmarking) return;
      const post = this.firstPost;
      if (!post) return;
      this.bookmarking = true;
      try {
        if (this.isBookmarked) {
          const id = this.bookmarkedId || this.firstPost?.bookmark_id;
          if (id) await forum.deleteBookmark(id);
          this.bookmarkedId = null;
          if (this.firstPost) this.firstPost.bookmarked = false;
          toast({
            type: 'is-info',
            position: 'bottom-center',
            message: this.$gettext('Marque-page retiré.'),
          });
        } else {
          const resp = await forum.bookmarkPost(post.id);
          this.bookmarkedId = resp?.data?.id || 0;
          if (this.firstPost) this.firstPost.bookmarked = true;
          toast({
            type: 'is-success',
            position: 'bottom-center',
            message: this.$gettext('Sujet ajouté à vos marque-pages.'),
          });
        }
      } catch (err) {
        const status = err?.response?.status;
        toast({
          type: 'is-warning',
          position: 'bottom-center',
          duration: 4500,
          message:
            status === 401 || status === 403 || status === 419
              ? this.$gettext('Connectez-vous au forum pour utiliser les marque-pages.')
              : this.$gettext('Action impossible sur ce marque-page.'),
        });
      } finally {
        this.bookmarking = false;
      }
    },

    // ---- Notification level (Watch / Track / Mute) ---------------

    notifIconFor(level) {
      switch (Number(level)) {
        case 3:
          return 'exclamation-circle';
        case 2:
          return 'eye';
        case 0:
          return 'bell-slash';
        default:
          return 'bell';
      }
    },

    toggleNotifMenu() {
      this.notifMenuOpen = !this.notifMenuOpen;
    },

    async pickNotifLevel(level) {
      if (this.settingNotifLevel) return;
      // Optimistic swap so the check moves right away; onNotifLevelChange
      // rolls back on error (same path the old select used to).
      this.notificationLevel = Number(level);
      this.notifMenuOpen = false;
      await this.onNotifLevelChange();
    },

    async onNotifLevelChange() {
      if (!this.topic?.id || this.settingNotifLevel) return;
      const target = Number(this.notificationLevel);
      this.settingNotifLevel = true;
      try {
        await forum.setTopicNotificationLevel(this.topic.id, target);
        toast({
          type: 'is-success',
          position: 'bottom-center',
          message: this.$gettext('Préférence de notification enregistrée.'),
        });
      } catch (err) {
        // Any failure here almost always means the cross-origin cookie
        // isn't set. Revert the picker to the last known good level
        // (or default 1) and surface an honest message.
        this.notificationLevel = Number(this.topic?.notification_level ?? 1);
        const status = err?.response?.status;
        toast({
          type: 'is-warning',
          position: 'bottom-center',
          duration: 5000,
          message:
            status === 401 || status === 403 || status === 419
              ? this.$gettext('Connectez-vous sur forum.camptocamp.org pour modifier vos préférences.')
              : this.$gettext('Cette action n’est pas encore disponible depuis l’app (session forum non partagée).'),
        });
      } finally {
        this.settingNotifLevel = false;
      }
    },

    // ---- Share / Flag --------------------------------------------

    async shareTopic() {
      const url = this.topicExternalUrl;
      const title = this.title || this.$gettext('Forum Camptocamp');
      // Web Share API where the platform supports it (iOS Safari,
      // Android Chrome, most PWAs). Otherwise fall back to a clipboard
      // copy so the user still has a way to hand the link to someone.
      if (navigator.share) {
        try {
          await navigator.share({ title, url });
          return;
        } catch {
          // user cancelled or share failed; fall through to clipboard
        }
      }
      try {
        await navigator.clipboard.writeText(url);
        toast({
          type: 'is-success',
          position: 'bottom-center',
          message: this.$gettext('Lien copié dans le presse-papier.'),
        });
      } catch {
        window.prompt(this.$gettext('Copiez le lien :'), url);
      }
    },

    toggleFlagMenu() {
      this.flagMenuOpen = !this.flagMenuOpen;
    },

    // Send the flag through the API layer so it carries the CSRF
    // token every other Discourse write sends. The previous version
    // POSTed straight from here via forum.authAxios and skipped both
    // the token and the .json suffix, so it could never succeed —
    // and its failure toast blamed the session cookie, which sent
    // the diagnosis down the wrong path.
    async pickFlagReason(opt) {
      if (this.flagging || !this.firstPost?.id) return;
      let message = '';
      if (opt.value === 7) {
        // notify_moderators is the only reason Discourse requires a
        // message for — same as the flag dialog on the site.
        const typed = window.prompt(this.$gettext('Que voulez-vous signaler aux modérateurs ?'), '');
        if (typed === null) return;
        if (!typed.trim()) {
          toast({
            type: 'is-warning',
            position: 'bottom-center',
            message: this.$gettext('Merci de décrire le problème pour les modérateurs.'),
          });
          return;
        }
        message = typed.trim();
      }
      this.flagging = opt.value;
      try {
        await forum.flagPost(this.firstPost.id, { actionTypeId: opt.value, message });
        this.flagMenuOpen = false;
        toast({
          type: 'is-success',
          position: 'bottom-center',
          message: this.$gettext('Signalement transmis aux modérateurs.'),
        });
      } catch (err) {
        const status = err?.response?.status;
        toast({
          type: 'is-warning',
          position: 'bottom-center',
          duration: 5000,
          message:
            status === 401 || status === 403 || status === 419
              ? this.$gettext('Connectez-vous sur forum.camptocamp.org pour signaler un message.')
              : this.$gettext('Signalement impossible pour le moment. Réessayez plus tard.'),
        });
      } finally {
        this.flagging = null;
      }
    },

    // ---- Floating progress pill ---------------------------------

    // Recompute which hydrated post is currently under the "reading
    // line" (a bit below the top of the scroll surface). Called from
    // the scroll listener; kept O(visible posts) — cheap.
    // Cache the post nodes and the reading-area height so a scroll
    // frame does not re-query the DOM. Invalidated when the number of
    // rendered posts changes (Load more) and on resize.
    invalidateScrollCache() {
      this._postNodes = null;
      this._surfaceHeight = 0;
    },

    // Which hydrated post sits under the reading line (top third of
    // the scroll surface). Called at most once per animation frame.
    //
    // getBoundingClientRect forces a synchronous layout, so the cost
    // here is one reflow per post examined. The loop breaks at the
    // first post below the line, which keeps it proportional to the
    // reading position rather than to the length of the thread.
    updateCurrentPost() {
      if (!this._postNodes || !this._postNodes.length) {
        this._postNodes = this.$el ? this.$el.querySelectorAll('.ft-post') : null;
        if (!this._postNodes || !this._postNodes.length) return;
      }
      if (!this._surfaceHeight) {
        const surface = this._scrollTarget && this._scrollTarget.clientHeight ? this._scrollTarget : null;
        this._surfaceHeight = surface ? surface.clientHeight : window.innerHeight;
      }
      const anchor = this._surfaceHeight / 3;
      const nodes = this._postNodes;
      let idx = 0;
      for (let i = 0; i < nodes.length; i++) {
        if (nodes[i].getBoundingClientRect().top <= anchor) idx = i;
        else break;
      }
      const post = this.visiblePosts[idx];
      const next = post?.post_number || idx + 1;
      // Guard the assignment: scrolling within one post would otherwise
      // re-trigger the watcher chain 60 times a second for no change.
      if (next !== this.currentPostNumber) this.currentPostNumber = next;
    },

    // Scroll fires 60-120 times a second on mobile. Coalesce to one
    // measurement per frame — without this the handler forced a layout
    // per post per event and visibly janked the thread.
    onTopicScroll() {
      this.progressVisible = true;
      if (!this._rafPending) {
        this._rafPending = true;
        window.requestAnimationFrame(() => {
          this._rafPending = false;
          this.updateCurrentPost();
        });
      }
      if (this._progressHideT) window.clearTimeout(this._progressHideT);
      this._progressHideT = window.setTimeout(() => {
        this.progressVisible = false;
      }, 1200);
    },
    onDocumentClick(event) {
      if (this.notifMenuOpen) {
        const wrap = this.$refs.notifWrap;
        if (wrap && !wrap.contains(event.target)) this.notifMenuOpen = false;
      }
      if (this.flagMenuOpen) {
        const wrap = this.$refs.flagWrap;
        if (wrap && !wrap.contains(event.target)) this.flagMenuOpen = false;
      }
    },

    // ---- Edit own post -------------------------------------------

    canEditPost(post) {
      if (!this.$user.isLogged || !this.myLoweredForumUsername) return false;
      if (!post?.username) return false;
      return String(post.username).toLowerCase() === this.myLoweredForumUsername;
    },

    isSolutionPost(post) {
      if (!post) return false;
      if (post.accepted_answer) return true;
      return this.solutionPostId && post.id === this.solutionPostId;
    },

    async startEdit(post) {
      this.editingPostId = post.id;
      this.editRaw = '';
      try {
        // Discourse returns the cooked HTML by default on the post
        // endpoint. Pass ?raw=1 to get the markdown source suitable
        // for editing. Fallback: strip cooked HTML if that fails.
        const resp = await forum.getPostRaw(post.id).promise_;
        this.editRaw = resp?.data?.raw || this.stripHtml(post.cooked);
      } catch {
        this.editRaw = this.stripHtml(post.cooked);
      }
    },

    cancelEdit() {
      this.editingPostId = null;
      this.editRaw = '';
    },

    async saveEdit(post) {
      const raw = this.editRaw.trim();
      if (!raw || this.savingEdit) return;
      this.savingEdit = true;
      try {
        await forum.editPost(post.id, { raw });
        toast({
          type: 'is-success',
          position: 'bottom-center',
          message: this.$gettext('Message mis à jour.'),
        });
        this.editingPostId = null;
        this.editRaw = '';
        await this.load();
      } catch (err) {
        const status = err?.response?.status;
        toast({
          type: 'is-warning',
          position: 'bottom-center',
          duration: 4500,
          message:
            status === 401 || status === 403 || status === 419
              ? this.$gettext('Connectez-vous au forum pour modifier votre message.')
              : this.$gettext('Impossible de sauvegarder la modification.'),
        });
      } finally {
        this.savingEdit = false;
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
            message: this.$gettext("Impossible d'envoyer votre réponse depuis l'app pour l'instant."),
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

.ft-header-row {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  margin: 0 0 0.4rem;
}
.ft-title {
  flex: 1;
  margin: 0;
  font-size: 1.15rem;
  line-height: 1.3;
  font-weight: 700;
  color: #4a4a4a;
  overflow-wrap: break-word;
}
.ft-bookmark {
  flex: 0 0 auto;
  background: transparent;
  border: 1px solid rgba(0, 0, 0, 0.12);
  color: #6b6b6b;
  cursor: pointer;
  padding: 0.4rem 0.55rem;
  border-radius: 6px;
  font-size: 1rem;

  &:hover:not(:disabled),
  &:focus:not(:disabled) {
    background: rgba(0, 0, 0, 0.04);
    color: #4a4a4a;
    outline: none;
  }
  &.is-bookmarked {
    background: #fff5e6;
    border-color: #ff9933;
    color: #cc7a29;
  }
  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
}
.ft-post-edit {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin: 0 0 0.5rem;
}

.ft-solved-icon {
  color: #2b8f4c;
  font-size: 0.95rem;
  margin-right: 0.15rem;
  vertical-align: -1px;
}

.ft-cat-line {
  margin-bottom: 0.9rem;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.35rem;
}

.ft-tag {
  display: inline-flex;
  align-items: center;
  padding: 0.1rem 0.5rem;
  background: rgba(51, 122, 183, 0.08);
  color: #337ab7;
  border-radius: 4px;
  font-size: 0.72rem;
  text-decoration: none;

  &:hover,
  &:focus {
    background: rgba(51, 122, 183, 0.16);
    color: #285a8f;
    text-decoration: none;
  }
}

.ft-solution-banner {
  margin: -0.85rem -0.85rem 0.7rem;
  padding: 0.35rem 0.85rem;
  background: linear-gradient(90deg, rgba(43, 143, 76, 0.14), rgba(43, 143, 76, 0.04));
  color: #2b8f4c;
  font-size: 0.75rem;
  font-weight: 600;
  border-bottom: 1px solid rgba(43, 143, 76, 0.25);
  border-top-left-radius: 6px;
  border-top-right-radius: 6px;
  display: flex;
  align-items: center;
  text-transform: uppercase;
  letter-spacing: 0.04em;
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
  &.is-solution {
    border-color: rgba(43, 143, 76, 0.5);
    background: linear-gradient(180deg, rgba(43, 143, 76, 0.04) 0%, transparent 100%);
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
  // Lists — Discourse renders <ol>/<ul> with `list-style-position:
  // outside` (default), which places the marker LEFT of the list's
  // own box. Without a left inset, the "1." / "2." / "•" ends up
  // outside the post card's padding and looks like it's dripping off
  // the card. Push the whole list right so both the marker and the
  // text sit inside the card.
  ::v-deep ol,
  ::v-deep ul {
    padding-left: 1.5rem;
    margin: 0.4rem 0;
  }
  ::v-deep li {
    margin: 0.15rem 0;
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

// Compact topic-actions row — Discourse-mobile style. Each action is
// a small icon+label chip so the row is dense but tap-friendly.
.ft-topic-actions {
  margin: 0.9rem 0 0;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.3rem;
}
.ft-topic-action {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.35rem 0.65rem;
  background: white;
  border: 1px solid rgba(0, 0, 0, 0.1);
  border-radius: 999px;
  font-size: 0.78rem;
  color: #4a4a4a;
  cursor: pointer;

  &:hover:not(:disabled),
  &:focus:not(:disabled) {
    background: #fafafa;
    color: #4a4a4a;
    outline: none;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
  }
  &.is-active {
    background: #fff5e6;
    border-color: rgba(255, 153, 51, 0.5);
    color: #b26f1e;
  }
  &.is-watching {
    color: #b26f1e;
  }
  &.ft-topic-action-danger {
    color: #b91c1c;
  }
}
.ft-topic-action-label {
  font-weight: 600;
}
.ft-topic-action-caret {
  color: #9ca3af;
  font-size: 0.7rem;
}

// Notification-level popover — anchored under the bell button, with
// four Discourse levels. Click-outside handler in mounted() closes it.
.ft-notif-wrap {
  position: relative;
}
.ft-notif-popover {
  position: absolute;
  bottom: calc(100% + 0.35rem);
  left: 0;
  min-width: 260px;
  max-width: min(90vw, 320px);
  background: white;
  border: 1px solid rgba(0, 0, 0, 0.1);
  border-radius: 8px;
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.15);
  padding: 0.3rem;
  z-index: 30;
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
}
.ft-notif-option {
  display: flex;
  align-items: flex-start;
  gap: 0.55rem;
  padding: 0.5rem 0.6rem;
  background: transparent;
  border: none;
  border-radius: 6px;
  text-align: left;
  cursor: pointer;
  color: #4a4a4a;
  width: 100%;

  &:hover,
  &:focus {
    background: rgba(0, 0, 0, 0.04);
    outline: none;
  }
  &.is-active {
    background: rgba(255, 153, 51, 0.12);
    color: #b26f1e;
  }
}
.ft-notif-option-icon {
  flex: 0 0 auto;
  margin-top: 0.15rem;
  color: #ff9933;
}
.ft-notif-option-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.ft-notif-option-label {
  font-weight: 600;
  font-size: 0.85rem;
}
.ft-notif-option-hint {
  font-size: 0.72rem;
  color: #6b6b6b;
  line-height: 1.3;
  margin-top: 0.15rem;
}
// Flag popover reuses the notification popover shell; only the
// accent colour and the intro line differ.
.ft-flag-popover {
  right: 0;
  left: auto;
}
.ft-flag-intro {
  margin: 0;
  padding: 0.45rem 0.6rem 0.3rem;
  font-size: 0.72rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: #6b6b6b;
}
.ft-flag-icon {
  color: #b91c1c;
}
.ft-notif-option:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
.ft-notif-option-check {
  flex: 0 0 auto;
  color: #ff9933;
  margin-top: 0.25rem;
}

// Floating "N / N" progress pill — position:fixed, bottom-right,
// above the mobile bottom nav. Only rendered when the user is
// actively scrolling.
.ft-progress-floating {
  position: fixed;
  right: 0.75rem;
  bottom: calc(76px + env(safe-area-inset-bottom) + 12px);
  z-index: 28;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 0.25rem;
  padding: 0.35rem 0.6rem;
  background: rgba(43, 143, 76, 0.94);
  color: white;
  border-radius: 999px;
  min-width: 92px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
  pointer-events: none;
  font-size: 0.75rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  text-align: center;
}
.ft-progress-count {
  line-height: 1.1;
}
.ft-progress-bar {
  height: 3px;
  background: rgba(255, 255, 255, 0.35);
  border-radius: 999px;
  overflow: hidden;
}
.ft-progress-fill {
  display: block;
  height: 100%;
  background: white;
  border-radius: 999px;
  transition: width 0.18s ease;
}
.ft-progress-fade-enter-active,
.ft-progress-fade-leave-active {
  transition: opacity 0.18s ease, transform 0.18s ease;
}
.ft-progress-fade-enter,
.ft-progress-fade-leave-to {
  opacity: 0;
  transform: translateY(6px);
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
    .ft-load-more {
      color: #6db4ff;
    }
    .ft-tag {
      background: rgba(109, 180, 255, 0.14);
      color: #6db4ff;
      &:hover,
      &:focus {
        background: rgba(109, 180, 255, 0.24);
        color: #a3ccff;
      }
    }
    .ft-solved-icon {
      color: #4bc26b;
    }
    .ft-post.is-solution {
      border-color: rgba(75, 194, 107, 0.5);
      background: linear-gradient(180deg, rgba(75, 194, 107, 0.06) 0%, transparent 100%);
    }
    .ft-solution-banner {
      color: #4bc26b;
      background: linear-gradient(90deg, rgba(75, 194, 107, 0.15), rgba(75, 194, 107, 0.03));
      border-bottom-color: rgba(75, 194, 107, 0.25);
    }
    .ft-topic-action {
      background: #2a2a2a;
      border-color: rgba(255, 255, 255, 0.1);
      color: #e5e5e5;
      &:hover:not(:disabled),
      &:focus:not(:disabled) {
        background: #333333;
        color: #f5f5f5;
      }
      &.is-active {
        background: #3a2f1a;
        border-color: rgba(255, 153, 51, 0.5);
        color: #ffb866;
      }
      &.ft-topic-action-danger {
        color: #ff8f8f;
      }
    }
    .ft-notif-popover {
      background: #2a2a2a;
      border-color: rgba(255, 255, 255, 0.08);
      box-shadow: 0 6px 16px rgba(0, 0, 0, 0.5);
    }
    .ft-notif-option {
      color: #e5e5e5;
      &:hover,
      &:focus {
        background: rgba(255, 255, 255, 0.05);
      }
      &.is-active {
        background: rgba(255, 153, 51, 0.18);
        color: #ffb866;
      }
    }
    .ft-notif-option-hint {
      color: #b5b5b5;
    }
    .ft-flag-intro {
      color: #b5b5b5;
    }
    .ft-flag-icon {
      color: #ff8f8f;
    }
    .ft-progress-floating {
      background: rgba(75, 194, 107, 0.94);
    }
  }
}
</style>
