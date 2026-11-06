<template>
  <swiper-container ref="swiper" init="false" slides-per-view="auto" space-between="15" class="swiper">
    <swiper-slide style="height: 200px" v-for="image of images" :key="image.document_id">
      <thumbnail
        :img="image"
        size="MI"
        :alt="image.locales[0].title"
        :title="image.locales[0].title"
        @click.stop.prevent="$imageViewer.show(image)"
        loading="lazy"
      />
    </swiper-slide>
    <!-- Optional last slide, when the caller knows there are more images
         than it was given. Off by default, so every other gallery in the
         app is untouched. -->
    <swiper-slide v-if="hasMore" style="height: 200px" class="gallery-more-slide">
      <div
        class="gallery-more-link"
        role="button"
        tabindex="0"
        @click.stop.prevent="$emit('more')"
        @keydown.enter.stop="$emit('more')"
      >
        <fa-icon :icon="loadingMore ? 'spinner' : 'image'" :spin="loadingMore" class="is-size-3" />
        <span>{{ $gettext('Voir toutes les photos') }}</span>
      </div>
    </swiper-slide>
  </swiper-container>
</template>

<script>
import { FreeMode } from 'swiper';

export default {
  props: {
    // True when the caller knows there are photos it has not handed over.
    // A final slide then appears and emits `more` when tapped; the caller
    // fetches the rest and puts them in `images`, so the strip grows in
    // place. The C2C feed hands out at most three images per item
    // (image1/2/3) and flags the rest with `more_images` (feedback Sixte,
    // 2026-09-09).
    hasMore: {
      type: Boolean,
      default: false,
    },
    // Turns the slide's icon into a spinner while the caller fetches.
    loadingMore: {
      type: Boolean,
      default: false,
    },
    images: {
      type: Array,
      required: true,
    },
  },

  watch: {
    images: function () {
      this.images.forEach(this.$imageViewer.push);
    },
  },

  created() {
    this.images.forEach(this.$imageViewer.push);
  },

  mounted() {
    // free mode: a strong swipe goes by several photos and slows down by itself, instead of one photo per swipe
    Object.assign(this.$refs.swiper, {
      modules: [FreeMode],
      freeMode: { enabled: true, momentum: true, momentumRatio: 1, sticky: false },
    });
    this.$refs.swiper.initialize();
  },
};
</script>

<style scoped lang="scss">
swiper-slide {
  height: 200px;
  width: auto;
  cursor: pointer;

  picture::v-deep img {
    height: 200px;
  }
}
</style>

<style scoped lang="scss">
// The "see them all" slide: same footprint as a thumbnail so the strip
// keeps its rhythm, visibly not a photo so it is never mistaken for one.
.gallery-more-slide {
  width: 150px;
}

.gallery-more-link {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.4rem;
  height: 100%;
  padding: 0.5rem;
  border: 1px dashed rgba(0, 0, 0, 0.2);
  border-radius: 4px;
  color: #6b6b6b;
  font-size: 0.8rem;
  text-align: center;
}
</style>
