<template>
  <div class="section content">
    <html-header :title="$gettext('Recent changes')" />

    <div clas="links">
      <association-history-link :user-id="userId" v-translate>Associations history</association-history-link>
    </div>

    <table>
      <tr>
        <th v-translate translate-context="modification date">Modified the</th>
        <th v-translate>contributor</th>
        <th v-translate>Links</th>
        <th />
        <th>
          <span v-translate>title</span>
          :
          <span v-translate>comment</span>
        </th>
      </tr>
      <tr v-for="(change, index) of feed" :key="index">
        <td>
          <version-link
            :document-type="change.document.documentType"
            :id="change.document.document_id"
            :version="change.version_id"
            :lang="change.lang"
          >
            {{ $dateUtils.toTechnicalString(change.written_at) }}
          </version-link>
        </td>
        <td>
          <contributor-link :contributor="change.user" />
        </td>
        <td>
          <document-link :document="change.document" :lang="change.lang"> last </document-link>

          <diff-link
            :document-type="change.document.documentType"
            :id="change.document.document_id"
            :lang="change.lang"
            version-from="prev"
            :version-to="change.version_id"
          />

          <history-link :document="change.document" :lang="change.lang" />
        </td>
        <td>
          <marker-quality :quality="change.document.quality" />
          {{ change.lang }}
        </td>
        <td>
          <colored-icon-document :document-type="change.document.documentType" />
          {{ change.document.title }}
          :
          <span v-if="change.comment">
            {{ change.comment }}
          </span>
          <span v-else v-translate>empty comment</span>
        </td>
      </tr>
    </table>
    <div ref="sentinel" class="feed-sentinel" aria-hidden="true"></div>

    <loading-notification :promise="promise" />
  </div>
</template>

<script>
import ColoredIconDocument from './utils/ColoredIconDocument';

import c2c from '@/js/apis/c2c';
import noRobotsMixin from '@/js/no-robots-mixin';

export default {
  components: { ColoredIconDocument },

  mixins: [noRobotsMixin],

  data() {
    return {
      promise: {},
      feed: [],
      endOfFeed: false,
    };
  },

  computed: {
    userId() {
      return this.$route.query.u ? parseInt(this.$route.query.u) : null;
    },
    loading() {
      return this.promise ? this.promise.loading : false;
    },

    nextQuery() {
      if (!this.promise.data) {
        return this.$route.query;
      }

      return Object.assign({}, this.$route.query, { token: this.promise.data.pagination_token });
    },
  },

  watch: {
    $route: {
      handler: 'initialize',
      immediate: true,
    },
  },

  // Same mechanism as the Récent feed (FeedWidget.vue). The scroll-event
  // directive used here never fired when the first page did not fill the
  // screen, nor during iOS momentum scrolling, and the list stopped growing.
  // A watched sentinel does not depend on a gesture, only on being visible.
  mounted() {
    if (typeof IntersectionObserver !== 'function') {
      return;
    }
    this.observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          this.load();
        }
      },
      { rootMargin: '600px' }
    );
    this.observer.observe(this.$refs.sentinel);
  },

  beforeDestroy() {
    this.observer?.disconnect();
  },

  methods: {
    initialize() {
      this.feed = [];
      this.endOfFeed = false;

      if (this.$route.hash) {
        // keep compatible with v6 AngularJs hacks...
        this.$router.replace(this.$route.fullPath.replace('#', '?'));
        // $route watcher will call load
        return;
      }

      this.load();
    },

    load() {
      if (this.promise && this.promise.loading) {
        return;
      }

      if (this.endOfFeed) {
        return;
      }

      this.promise = c2c.getRecentChanges(this.nextQuery).then(this.onLoad);
    },

    onLoad() {
      for (const change of this.promise.data.feed) {
        change.document.documentType = this.$documentUtils.getDocumentType(change.document.type);
        this.feed.push(change);
      }

      this.endOfFeed = this.promise.data.feed.length === 0;

      // The observer only calls back when visibility changes. If the
      // sentinel is still on screen after this page (tall screen), ask again.
      this.$nextTick(() => {
        if (this.endOfFeed || this._isDestroyed || !this.$refs.sentinel) return;
        if (this.$refs.sentinel.getBoundingClientRect().top <= window.innerHeight + 600) {
          this.load();
        }
      });
    },
  },
};
</script>

<style scoped lang="scss">
.feed-sentinel {
  height: 1px;
}

td {
  white-space: nowrap;
}

td:last-child {
  width: 100%;
  white-space: normal;
}

td:last-child > span:last-child,
th:last-child > span:last-child {
  font-style: italic;
}
</style>
