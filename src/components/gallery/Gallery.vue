<template>
  <swiper-container slides-per-view="auto" space-between="15" class="swiper">
    <swiper-slide style="height: 200px" v-for="image of images" :key="image.document_id">
      <thumbnail
        :img="image"
        size="MI"
        :alt="image.locales[0].title"
        :title="image.locales[0].title"
        @click="$imageViewer.show(image)"
        loading="lazy"
      />
    </swiper-slide>
    <!-- Optional last slide, when the caller knows there are more images
         than it was given. Off by default, so every other gallery in the
         app is untouched. -->
    <swiper-slide v-if="moreDocument" style="height: 200px" class="gallery-more-slide">
      <document-link :document="moreDocument" class="gallery-more-link">
        <fa-icon icon="image" class="is-size-3" />
        <span>{{ $gettext('Voir toutes les photos') }}</span>
      </document-link>
    </swiper-slide>
  </swiper-container>
</template>

<script>
export default {
  props: {
    // The document whose remaining photos are not in `images`. When set,
    // a final slide leads to it. The C2C feed hands out at most three
    // images per item (image1/2/3) and flags the rest with `more_images`
    // — so from a feed card the only way to the others is the document
    // itself, and it may as well be one swipe away (feedback Sixte,
    // 2026-09-09).
    moreDocument: {
      type: Object,
      default: null,
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
