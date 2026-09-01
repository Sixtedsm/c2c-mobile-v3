<template>
  <section class="section forum-new-topic-view">
    <div class="container">
      <p class="fnt-breadcrumb">
        <router-link :to="{ name: 'forum' }">{{ $gettext('Forum') }}</router-link>
        <span class="fnt-breadcrumb-sep">›</span>
        <span>{{ $gettext('Nouveau sujet') }}</span>
      </p>

      <h1 class="title is-5 fnt-title">
        <fa-icon icon="pen-to-square" />
        &nbsp;{{ $gettext('Nouveau sujet') }}
      </h1>

      <div v-if="!$user.isLogged" class="fnt-signin-notice">
        {{ $gettext('Connectez-vous pour créer un sujet sur le forum.') }}
        <router-link :to="{ name: 'auth' }" class="button is-primary is-small">
          {{ $gettext('Se connecter') }}
        </router-link>
      </div>

      <form v-else class="fnt-form" @submit.prevent="submit">
        <!-- Category picker — Discourse requires a category id on
             topic creation. Fetched from /categories.json and shown
             as a hierarchical dropdown (parent → children). -->
        <div class="fnt-field">
          <label class="label">{{ $gettext('Catégorie') }} *</label>
          <select v-model="categoryId" class="input" :disabled="submitting" required>
            <option value="" disabled>{{ $gettext('Choisissez une catégorie…') }}</option>
            <template v-for="parent in categoryTree">
              <option :key="'p-' + parent.id" :value="parent.id" :disabled="!canPostIn(parent)">
                {{ parent.name }}{{ canPostIn(parent) ? '' : ' — ' + $gettext('lecture seule') }}
              </option>
              <option
                v-for="child in parent.children"
                :key="'c-' + child.id"
                :value="child.id"
                :disabled="!canPostIn(child)"
              >
                &nbsp;&nbsp;└ {{ child.name }}{{ canPostIn(child) ? '' : ' — ' + $gettext('lecture seule') }}
              </option>
            </template>
          </select>
          <p v-if="pickedCategoryDesc" class="fnt-hint">{{ pickedCategoryDesc }}</p>
        </div>

        <div class="fnt-field">
          <label class="label">{{ $gettext('Titre') }} *</label>
          <input
            v-model="title"
            type="text"
            class="input"
            :placeholder="$gettext('Titre du sujet (≥ 15 caractères)')"
            :disabled="submitting"
            maxlength="255"
            required
          />
          <p class="fnt-hint" :class="{ 'is-error': title.trim().length > 0 && title.trim().length < 15 }">
            {{ title.trim().length }} / 255 &nbsp;·&nbsp; {{ $gettext('minimum 15 caractères') }}
          </p>
        </div>

        <div class="fnt-field">
          <label class="label">{{ $gettext('Message') }} *</label>
          <reply-editor
            v-model="raw"
            :placeholder="$gettext('Contenu du sujet… (Markdown supporté, images acceptées)')"
            :disabled="submitting"
            rows="10"
          />
          <p class="fnt-hint" :class="{ 'is-error': raw.trim().length > 0 && raw.trim().length < 20 }">
            {{ raw.trim().length }} {{ $gettext('caractères') }} &nbsp;·&nbsp; {{ $gettext('minimum 20 caractères') }}
          </p>
        </div>

        <div class="fnt-actions">
          <button type="button" class="button is-text" :disabled="submitting" @click="cancel">
            {{ $gettext('Annuler') }}
          </button>
          <button type="submit" class="button is-primary" :disabled="!canSubmit">
            <fa-icon :icon="submitting ? 'spinner' : 'paper-plane'" :spin="submitting" />
            &nbsp;{{ submitting ? $gettext('Publication…') : $gettext('Publier le sujet') }}
          </button>
        </div>

        <p v-if="needsForumLogin" class="fnt-signin-notice">
          {{ $gettext("Vous n'êtes pas connecté au forum.") }}
          <a :href="forumLoginUrl" target="_blank" rel="noopener">{{ $gettext('Se connecter au forum') }} →</a>
        </p>
      </form>
    </div>
  </section>
</template>

<script>
// Create a brand-new forum topic. Discourse's /posts.json endpoint
// creates a topic when `title` + `raw` + `category` are passed
// together. Requires the user's Discourse session cookie (SSO from
// camptocamp.org) — if missing we surface the login link the same
// way the reply flow already does.
//
// Query params support pre-selecting a category:
//   /forum/new-topic?category=<id>
// so the "+" FAB on ForumCategoryView can drop the user straight
// into the right context.

import { toast } from 'bulma-toast';

import ReplyEditor from '@/components/forum/ReplyEditor.vue';
import forum from '@/js/apis/forum';
import config from '@/js/config';

export default {
  name: 'ForumNewTopicView',

  components: { ReplyEditor },

  data() {
    return {
      categories: [],
      categoryId: '',
      title: '',
      raw: '',
      submitting: false,
      needsForumLogin: false,
    };
  },

  computed: {
    categoryTree() {
      const parents = this.categories.filter((c) => c.parent_category_id == null);
      return parents.map((p) => ({
        ...p,
        children: this.categories.filter((c) => c.parent_category_id === p.id),
      }));
    },
    pickedCategoryDesc() {
      const cat = this.categories.find((c) => String(c.id) === String(this.categoryId));
      return cat?.description_text || '';
    },
    canSubmit() {
      return !this.submitting && !!this.categoryId && this.title.trim().length >= 15 && this.raw.trim().length >= 20;
    },
    forumLoginUrl() {
      return `${config.urls.forum}/login`;
    },
  },

  mounted() {
    forum
      .getCategories()
      .promise_.then((res) => {
        this.categories = res?.data?.category_list?.categories || [];
        const prefill = this.$route.query.category;
        if (prefill && this.categories.some((c) => String(c.id) === String(prefill) && this.canPostIn(c))) {
          this.categoryId = String(prefill);
        }
      })
      .catch(() => {
        toast({
          type: 'is-warning',
          position: 'bottom-center',
          message: this.$gettext('Impossible de charger la liste des catégories.'),
        });
      });
  },

  methods: {
    // Discourse exposes a `read_restricted` flag + `permission` (1 =
    // full, 2 = create post, 3 = read only). We only allow posting
    // where the current user can actually post — otherwise the
    // Discourse API rejects with a 403 the user won't understand.
    canPostIn(cat) {
      if (!cat) return false;
      if (cat.read_restricted && !this.$user.isLogged) return false;
      // permission_type: 1=Full, 2=Create Post, 3=Readonly. Absent
      // = no restriction advertised, assume postable.
      if (cat.permission != null && cat.permission === 3) return false;
      return true;
    },

    cancel() {
      // Go back to wherever the user came from, falling back to /forum.
      if (window.history.length > 1) this.$router.back();
      else this.$router.push({ name: 'forum' });
    },

    async submit() {
      if (!this.canSubmit) return;
      this.submitting = true;
      this.needsForumLogin = false;
      try {
        const resp = await forum.createTopic({
          title: this.title.trim(),
          raw: this.raw.trim(),
          category: this.categoryId,
        });
        const topicId = resp?.data?.topic_id;
        const slug = resp?.data?.topic_slug;
        toast({
          type: 'is-success',
          position: 'bottom-center',
          message: this.$gettext('Sujet publié.'),
        });
        if (topicId) {
          this.$router.push({ name: 'forum-topic', params: { id: topicId, slug } });
        } else {
          this.$router.push({ name: 'forum' });
        }
      } catch (err) {
        const status = err?.response?.status;
        if (status === 401 || status === 403 || status === 419) {
          this.needsForumLogin = true;
          toast({
            type: 'is-warning',
            position: 'bottom-center',
            duration: 4500,
            message: this.$gettext('Connectez-vous au forum (lien sous le formulaire) puis réessayez.'),
          });
        } else {
          const apiMsg = err?.response?.data?.errors?.[0] || err?.response?.data?.error || err?.message;
          toast({
            type: 'is-warning',
            position: 'bottom-center',
            duration: 5000,
            message: this.$gettextInterpolate(this.$gettext('Publication impossible : %{msg}'), {
              msg: apiMsg || this.$gettext('erreur réseau'),
            }),
          });
        }
      } finally {
        this.submitting = false;
      }
    },
  },
};
</script>

<style scoped lang="scss">
.forum-new-topic-view {
  padding-bottom: calc(80px + env(safe-area-inset-bottom));
}

.fnt-breadcrumb {
  font-size: 0.78rem;
  color: #6b6b6b;
  margin-bottom: 0.7rem;
  a {
    color: #337ab7;
    text-decoration: none;
  }
}
.fnt-breadcrumb-sep {
  margin: 0 0.35rem;
  color: #b5b5b5;
}

.fnt-title {
  margin-bottom: 1rem;
  display: flex;
  align-items: center;
}

.fnt-form {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.fnt-field {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;

  .label {
    margin-bottom: 0.15rem !important;
    font-weight: 600;
    color: #4a4a4a;
  }
}

.fnt-hint {
  font-size: 0.72rem;
  color: #6b6b6b;
  margin: 0;

  &.is-error {
    color: #b91c1c;
  }
}

.fnt-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  margin-top: 0.5rem;
}

.fnt-signin-notice {
  padding: 0.75rem;
  background: #fff5e6;
  border-left: 3px solid #ff9933;
  border-radius: 4px;
  font-size: 0.85rem;
  color: #6b4a1e;

  a {
    color: #b26f1e;
    font-weight: 600;
  }
}
</style>

<style lang="scss">
html[data-theme='dark'] {
  .forum-new-topic-view {
    .fnt-signin-notice {
      background: #3a2f1a;
      color: #ffb866;
    }
    .fnt-breadcrumb a,
    .fnt-signin-notice a {
      color: #ffb866;
    }
    .fnt-title,
    .label {
      color: #f0f0f0;
    }
    .fnt-hint {
      color: #b5b5b5;
    }
  }
}
</style>
