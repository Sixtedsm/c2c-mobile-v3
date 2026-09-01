<template>
  <section class="section forum-tag-view">
    <div class="container">
      <p class="ft-breadcrumb">
        <router-link :to="{ name: 'forum' }">{{ $gettext('Forum') }}</router-link>
        <span class="ft-breadcrumb-sep">›</span>
        <span>{{ $gettext('Étiquette') }} · {{ tag }}</span>
      </p>

      <header class="ft-header">
        <fa-icon icon="tag" class="ft-icon" />
        <div class="ft-header-text">
          <h1 class="ft-name"># {{ tag }}</h1>
          <p v-if="topicCount" class="ft-count">
            {{ $ngettext('%{n} discussion', '%{n} discussions', topicCount, { n: topicCount }) }}
          </p>
        </div>
      </header>

      <div v-if="loading" class="ft-loading"><fa-icon icon="spinner" spin /> {{ $gettext('Chargement…') }}</div>

      <div v-else-if="error" class="ft-error">
        {{ $gettext('Impossible de charger les discussions pour cette étiquette.') }}
      </div>

      <ul v-else-if="topics.length" class="ft-topics">
        <li v-for="t in topics" :key="t.id">
          <topic-row :topic="t" :categories="categories" />
        </li>
      </ul>

      <p v-else class="ft-empty">
        {{ $gettext('Aucune discussion ne porte cette étiquette pour le moment.') }}
      </p>
    </div>

    <router-link
      :to="{ name: 'forum-new-topic' }"
      class="ft-fab"
      :title="$gettext('Nouveau sujet')"
      :aria-label="$gettext('Nouveau sujet')"
    >
      <fa-icon icon="plus" />
    </router-link>
  </section>
</template>

<script>
// Topics carrying a given Discourse tag. Public endpoint — no cookie
// needed. Categories are loaded in parallel so TopicRow can render
// its category pill. Route: /forum/tag/:tag where :tag is the raw
// Discourse tag name.

import TopicRow from '@/components/forum/TopicRow.vue';
import forum from '@/js/apis/forum';

export default {
  name: 'ForumTagView',

  components: { TopicRow },

  props: {
    tag: { type: String, required: true },
  },

  data() {
    return {
      topics: [],
      categories: [],
      topicCount: 0,
      loading: true,
      error: false,
    };
  },

  watch: {
    tag() {
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
      this.topics = [];
      try {
        const [catRes, tagRes] = await Promise.all([
          forum.getCategories().promise_,
          forum.getTagTopics(this.tag).promise_,
        ]);
        this.categories = catRes?.data?.category_list?.categories || [];
        this.topics = tagRes?.data?.topic_list?.topics || [];
        this.topicCount = tagRes?.data?.topic_list?.tags?.[0]?.count || this.topics.length;
      } catch {
        this.error = true;
      } finally {
        this.loading = false;
      }
    },
  },
};
</script>

<style scoped lang="scss">
.forum-tag-view {
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
.ft-header {
  display: flex;
  gap: 0.6rem;
  align-items: center;
  padding: 0.75rem 0.85rem;
  background: white;
  border: 1px solid rgba(0, 0, 0, 0.08);
  border-radius: 6px;
  margin-bottom: 1rem;
}
.ft-icon {
  color: #337ab7;
  font-size: 1.2rem;
}
.ft-header-text {
  flex: 1;
  min-width: 0;
}
.ft-name {
  font-size: 1.05rem;
  font-weight: 700;
  color: #4a4a4a;
  margin: 0;
  overflow-wrap: break-word;
}
.ft-count {
  margin: 0.25rem 0 0;
  font-size: 0.78rem;
  color: #6b6b6b;
}
.ft-topics {
  list-style: none;
  padding: 0;
  margin: 0;
}
.ft-loading,
.ft-empty,
.ft-error {
  padding: 0.75rem;
  font-size: 0.85rem;
  color: #6b6b6b;
}
.ft-error {
  color: #b91c1c;
}
.ft-fab {
  position: fixed;
  right: 1rem;
  bottom: calc(76px + env(safe-area-inset-bottom));
  z-index: 27;
  width: 52px;
  height: 52px;
  border-radius: 50%;
  background: #ff9933;
  color: white;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 1.35rem;
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.25);
  text-decoration: none;

  &:hover,
  &:focus {
    background: #e6791f;
    color: white;
    text-decoration: none;
  }
}
</style>

<style lang="scss">
html[data-theme='dark'] {
  .forum-tag-view {
    .ft-header {
      background: #2a2a2a;
      border-color: rgba(255, 255, 255, 0.08);
    }
    .ft-name {
      color: #f0f0f0;
    }
    .ft-icon {
      color: #6db4ff;
    }
    .ft-count,
    .ft-loading,
    .ft-empty {
      color: #b5b5b5;
    }
    .ft-breadcrumb a {
      color: #6db4ff;
    }
  }
}
</style>
