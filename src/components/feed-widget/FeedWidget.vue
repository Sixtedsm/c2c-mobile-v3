<template>
  <!-- is-multiline : sans retour à la ligne, la sentinelle se plaçait à
       droite des colonnes, en haut du fil, dès 2 colonnes (≥ 769 px) : dix
       pages chargées d'un coup à l'ouverture, plus rien en bas du fil. -->
  <div class="columns is-multiline">
    <!-- Premier chargement : des cartes grises de la forme d'une carte du
         fil, dans chaque colonne. Avant, cette zone restait vide plusieurs
         secondes en 4G lente (LCP 7,2 s mesuré le 05/11). -->
    <p v-if="showSkeleton" class="is-sr-only" role="status">{{ $gettext('Loading...') }}</p>
    <div v-for="(column, i) of columns" :key="i" :class="'column ' + cssColumnsClass">
      <template v-if="showSkeleton">
        <div v-for="n in 2" :key="'skeleton-' + n" class="card feed-card feed-skeleton" aria-hidden="true">
          <div class="skeleton-row">
            <span class="skeleton-block skeleton-icon"></span>
            <span class="skeleton-block skeleton-title"></span>
          </div>
          <span class="skeleton-block skeleton-image"></span>
          <span class="skeleton-block skeleton-line"></span>
          <span class="skeleton-block skeleton-line is-short"></span>
        </div>
      </template>
      <feed-card v-for="item of column.items" :key="item.id" :item="item" class="feed-card" />
    </div>
    <!-- Sentinelle du défilement infini. Visible dans le viewport (avec
         600 px d'avance) => on charge la suite. Un IntersectionObserver
         plutôt qu'un écouteur de défilement : voir le commentaire de
         mounted(). flex-basis 100 % pour qu'elle passe sous les colonnes. -->
    <div ref="sentinel" class="feed-sentinel" aria-hidden="true"></div>
  </div>
</template>

<script>
import FeedCard from '@/components/cards/FeedCard';
import c2c from '@/js/apis/c2c';
import pullRefreshMixin from '@/js/pull-refresh-mixin';

// Garde-fou : une page dont tous les documents sont filtrés fait
// repartir un chargement. Sans borne, un fil entièrement vide
// interrogerait l'API sans fin.
const MAX_AUTO_LOADS = 10;

export default {
  components: {
    FeedCard,
  },

  mixins: [pullRefreshMixin],

  props: {
    type: {
      // valid input : personal Default Profile
      type: String,
      required: true,
    },
    hideEmptyDocuments: {
      type: Boolean,
      default: false,
    },
  },

  data() {
    return {
      promise: null,
      feed: [],
      paginationToken: null,
      endOfFeed: false,
      columns: null,
      cssColumnsClass: null,
      // Chargements enchaînés sans geste de l'utilisateur, remis à zéro
      // dès que la sentinelle réapparaît.
      autoLoads: 0,
      observer: null,
    };
  },

  computed: {
    loading() {
      return this.promise ? this.promise.loading : false;
    },
    showSkeleton() {
      return this.loading && this.feed.length === 0;
    },
  },

  watch: {
    $route: 'initialize',
    type: 'initialize',
  },

  mounted() {
    window.addEventListener('resize', this.initializeColumns);

    // Le défilement infini écoutait l'événement scroll du conteneur. Deux
    // façons de le tuer, et la page « Récent » les réunissait :
    //
    //   - hide-empty-documents filtre les documents vides. Quand une page
    //     de résultats est filtrée en entier, le contenu ne dépasse pas
    //     l'écran : plus rien à faire défiler, donc plus aucun événement
    //     scroll, donc plus jamais de chargement. Le fil restait figé, et
    //     seul un changement d'onglet le relançait.
    //   - sur iOS, le défilement par inertie n'émet pas d'événement scroll
    //     pendant sa course ; le dernier peut être avalé par le limiteur.
    //
    // Une sentinelle observée règle les deux : elle ne dépend pas d'un
    // geste, seulement du fait qu'elle soit visible.
    if (typeof IntersectionObserver === 'function') {
      this.observer = new IntersectionObserver(
        (entries) => {
          if (entries.some((e) => e.isIntersecting)) {
            this.autoLoads = 0;
            this.load();
          }
        },
        { rootMargin: '600px' }
      );
      this.$nextTick(() => {
        if (this.$refs.sentinel) this.observer.observe(this.$refs.sentinel);
      });
    }

    this.initialize();
  },

  beforeDestroy() {
    window.removeEventListener('resize', this.initializeColumns);
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
  },

  methods: {
    initialize() {
      this.paginationToken = undefined;
      this.endOfFeed = false;
      this.feed = [];

      this.initializeColumns();

      this.load();
    },

    // Called by pull-to-refresh (#7). `load()` appends to the feed; this
    // resets and reloads from scratch, then resolves when the data lands
    // so the spinner stops on cue.
    pullRefresh() {
      this.initialize();
      return this.promise;
    },

    initializeColumns() {
      const availableWidth = this.$el.clientWidth;
      const cardLargestWidth = 400;

      let columnCount;

      if (availableWidth < 2 * cardLargestWidth) {
        this.cssColumnsClass = 'is-full';
        columnCount = 1;
      } else if (availableWidth < 3 * cardLargestWidth) {
        this.cssColumnsClass = 'is-half';
        columnCount = 2;
      } else if (availableWidth < 4 * cardLargestWidth) {
        this.cssColumnsClass = 'is-one-third';
        columnCount = 3;
      } else if (availableWidth < 5 * cardLargestWidth) {
        this.cssColumnsClass = 'is-one-quarter';
        columnCount = 4;
      } else if (availableWidth < 6 * cardLargestWidth) {
        // is-one-fifth : cinq colonnes de 40 % (is-two-fifths) faisaient 200 %.
        this.cssColumnsClass = 'is-one-fifth';
        columnCount = 5;
      } else {
        this.cssColumnsClass = 'is-2';
        columnCount = 6;
      }

      this.columns = [];

      for (let i = 0; i < columnCount; i++) {
        this.columns.push({
          items: [],
          height: 0,
        });
      }

      this.dispatchToColumns(this.feed);
    },

    load() {
      // The infinite-scroll directive keeps its listener on the scroll
      // container, not on this component, so a widget whose element is
      // still on screen after being torn down goes on being asked for
      // more. It would then append page after page to an instance that
      // can never render them again — the feed looks frozen while the
      // network works. Refusing here makes that state harmless.
      if (this._isDestroyed || this._isBeingDestroyed) {
        return;
      }

      if (this.promise && this.promise.loading) {
        return;
      }

      if (this.endOfFeed) {
        return;
      }

      const params = {
        pl: c2c.getApiLang(this.$language.current),
        token: this.paginationToken,
        u: this.$route.params.id,
      };

      if (this.type === 'personal') {
        this.promise = c2c.feed.getPersonalFeed(params).then(this.onLoad);
      } else if (this.type === 'default') {
        this.promise = c2c.feed.getDefaultFeed(params).then(this.onLoad);
      } else if (this.type === 'profile') {
        this.promise = c2c.feed.getProfileFeed(params).then(this.onLoad);
      }
    },

    onLoad(response) {
      this.paginationToken = response.data.pagination_token;

      for (const item of response.data.feed) {
        this.feed.push(item);
      }

      this.endOfFeed = response.data.feed.length === 0;

      this.dispatchToColumns(response.data.feed);

      // L'observateur ne rappelle que sur un changement de visibilité. Si
      // la sentinelle est toujours à l'écran après ce chargement — page
      // entièrement filtrée, ou écran haut — il faut redemander, sinon
      // rien ne se passerait plus jamais. Le compteur borne le cas où
      // chaque page revient vide après filtrage : on cesse de marteler
      // l'API, un geste de l'utilisateur relancera.
      this.$nextTick(() => {
        if (this.endOfFeed || this._isDestroyed || !this.$refs.sentinel) return;
        if (this.autoLoads >= MAX_AUTO_LOADS) return;
        const rect = this.$refs.sentinel.getBoundingClientRect();
        if (rect.top <= window.innerHeight + 600) {
          this.autoLoads += 1;
          this.load();
        }
      });
    },

    dispatchToColumns(items) {
      let destColumn = this.columns[0];

      if (this.hideEmptyDocuments) {
        items = items.filter((item) => item.document.quality !== 'empty');
      }

      for (const item of items) {
        for (const column of this.columns) {
          if (column.height < destColumn.height) {
            destColumn = column;
          }
        }

        destColumn.items.push(item);
        destColumn.height += this.estimateSize(item);
      }
    },

    estimateSize(item) {
      const headerSize = 47;
      const titleSize = 29;
      const summarySize = 30;
      const figuresSize = 30;
      const areaSize = 29;
      const footerSize = 38;
      const gallerySize = 223;
      const marginSize = 22;

      let size = headerSize + titleSize + areaSize + footerSize + marginSize;

      if (item.document.locales[0].summary) {
        size += summarySize;
      }
      if (
        document.elevation_max ||
        document.elevation ||
        document.height_diff_up ||
        document.height_diff_difficulties
      ) {
        size += figuresSize;
      }
      if (item.image1 !== null) {
        size += gallerySize;
      }

      return size;
    },
  },
};
</script>

<style scoped lang="scss">
.feed-card {
  margin-bottom: 1.5rem;
}

.feed-sentinel {
  flex: 0 0 100%;
  height: 1px;
}

// Same frame as a feed card (CardContainer): border, white, 200 px gallery.
.feed-skeleton {
  border: $card-border;
  background: white;
  padding: 0.4rem 0.8rem 0.8rem;
}

.skeleton-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin: 0.4rem 0 0.8rem;
}

.skeleton-block {
  display: block;
  border-radius: 4px;
  background: linear-gradient(90deg, #ececec 25%, #f6f6f6 37%, #ececec 63%);
  background-size: 400% 100%;
  animation: skeleton-shimmer 1.4s ease infinite;
}

.skeleton-icon {
  flex: none;
  width: 28px;
  height: 28px;
  border-radius: 50%;
}

.skeleton-title {
  flex: 1;
  max-width: 70%;
  height: 1rem;
}

.skeleton-image {
  height: 200px;
  margin-bottom: 0.8rem;
}

.skeleton-line {
  height: 0.75rem;
  margin-bottom: 0.5rem;

  &.is-short {
    width: 55%;
  }
}

@keyframes skeleton-shimmer {
  0% {
    background-position: 100% 50%;
  }
  100% {
    background-position: 0 50%;
  }
}

@media (prefers-reduced-motion: reduce) {
  .skeleton-block {
    animation: none;
  }
}

html[data-theme='dark'] .skeleton-block {
  background: linear-gradient(90deg, #3a3a3a 25%, #444 37%, #3a3a3a 63%);
  background-size: 400% 100%;
}
</style>
