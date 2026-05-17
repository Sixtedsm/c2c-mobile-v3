<template>
  <a
    href="#"
    class="share-button"
    :title="$gettext('Partager')"
    @click.prevent="share"
  >
    <fa-icon icon="share-alt" />
    <span v-if="copied" class="copied-toast">{{ $gettext('Lien copié') }}</span>
  </a>
</template>

<script>
// Direct share entry point that doesn't depend on AddThis or GDPR consent.
// Tries the Web Share API first (native iOS/Android share sheet with all
// the user's installed apps: WhatsApp, SMS, Mail, AirDrop, etc.). Falls
// back to copying the URL to clipboard with a small "Lien copié" toast.

export default {
  name: 'ShareButton',

  props: {
    document: { type: Object, required: true },
  },

  data() {
    return { copied: false };
  },

  computed: {
    shareUrl() {
      // Share the *site* URL (camptocamp.org), not the V3 mobile URL.
      // The site URL is what people recognise and what'll always resolve
      // even after the user uninstalls the PWA. Pattern:
      // https://www.camptocamp.org/<type>s/<id>/<lang>/<slug>
      const id = this.document?.document_id;
      const lang = this.document?.cooked?.lang || this.$route?.params?.lang || 'fr';
      const type = this.documentType;
      if (!id || !type) return window.location.href;
      const slug = this.slugify(this.title);
      return `https://www.camptocamp.org/${type}s/${id}/${lang}${slug ? '/' + slug : ''}`;
    },

    documentType() {
      // Best-effort guess: try cooked type first, then route name.
      if (this.document?.type) {
        const map = {
          r: 'route', o: 'outing', w: 'waypoint', a: 'article',
          b: 'book', i: 'image', x: 'xreport', m: 'map', u: 'profile',
        };
        return map[this.document.type] || null;
      }
      return this.$route?.name || null;
    },

    title() {
      return this.$documentUtils.getDocumentTitle(this.document) || '';
    },
  },

  methods: {
    async share() {
      const url = this.shareUrl;
      const text = this.title;
      // Web Share API: opens the native share sheet.
      if (navigator.share) {
        try {
          await navigator.share({ title: text, url });
          return;
        } catch (e) {
          // User cancelled or browser refused — fall through to clipboard.
          if (e?.name === 'AbortError') return;
        }
      }
      // Fallback: copy to clipboard.
      try {
        await navigator.clipboard.writeText(url);
        this.copied = true;
        setTimeout(() => { this.copied = false; }, 1800);
      } catch (e) {
        // Last-resort fallback: prompt the user with the URL so they can copy
        // it manually. Old browsers without clipboard API.
        window.prompt(this.$gettext('Lien à partager :'), url);
      }
    },

    slugify(s) {
      if (!s) return '';
      return s
        .toLowerCase()
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_|_$/g, '')
        .slice(0, 60);
    },
  },
};
</script>

<style lang="scss" scoped>
.share-button {
  cursor: pointer;
  color: #4a4a4a;
  position: relative;

  &:hover { color: #ff9933; }
}

.copied-toast {
  position: absolute;
  bottom: -1.6rem;
  right: 0;
  background: #4a4a4a;
  color: white;
  font-size: 0.7rem;
  padding: 0.2rem 0.5rem;
  border-radius: 2px;
  white-space: nowrap;
  z-index: 5;
}
</style>
