<template>
  <span class="custom-icon" :style="wrapStyle" v-html="markup" />
</template>

<script>
import ICONS from '@/assets/icons-custom';

// Render one of the V3 custom SVG icons by name. Keeps the SVG's intrinsic
// stroke color (#FF9933 by default) and just resizes via inline width/height
// substitution on the root element. If the icon name is unknown we render
// nothing rather than throwing — easy to debug visually.

export default {
  name: 'CustomIcon',

  props: {
    name: { type: String, required: true },
    size: { type: [Number, String], default: 24 },
  },

  computed: {
    pxSize() {
      return typeof this.size === 'number' ? `${this.size}` : String(this.size);
    },

    markup() {
      const raw = ICONS[this.name];
      if (!raw) return '';
      // Swap width/height on the root <svg> so callers can choose any size
      // without us having to ship multiple variants per icon.
      return raw
        .replace(/(<svg[^>]*\s)width="[^"]*"/, `$1width="${this.pxSize}"`)
        .replace(/(<svg[^>]*\s)height="[^"]*"/, `$1height="${this.pxSize}"`);
    },

    wrapStyle() {
      const px = typeof this.size === 'number' ? `${this.size}px` : this.size;
      return { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: px, height: px, lineHeight: 0 };
    },
  },
};
</script>
