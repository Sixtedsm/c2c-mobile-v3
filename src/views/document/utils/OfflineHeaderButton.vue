<template>
  <span class="offline-header-button" :title="label">
    <a @click="toggle" :class="{ 'is-saved': isSaved, 'is-busy': isBusy }">
      <fa-icon v-if="isBusy" icon="spinner" spin />
      <fa-icon v-else-if="isSaved" icon="bookmark" />
      <fa-icon v-else :icon="['far', 'bookmark']" />
      <!-- Freshness dot (Lot 5 §2.2): amber when the copy is 7-30 days
           old, red past 30 days. Silent when fresh so the icon stays
           clean in the common case. Long-press exposes the refresh
           option via the ToolBox — the header stays icon-only. -->
      <span
        v-if="isOfflineReady && freshness !== 'fresh' && freshness !== 'unknown'"
        class="freshness-dot"
        :class="'freshness-dot--' + freshness"
      />
      <!-- A saved topo is light by default: text only, no images, no map
           tiles. This dot is the one signal that says "this one really
           works without a network", so it must not be subtle — someone
           reads it before walking out of coverage. -->
      <span v-else-if="isOfflineReady" class="offline-ready-dot" />
    </a>
  </span>
</template>

<script>
// Mirrors the offline toggle exposed by ToolBox but slotted in the header
// next to favorite / edit / add-photo so the V3 UX matches what Sixte
// expects: every primary action is on the same row.

import { freshnessOf } from '@/pwa/offline-freshness';

export default {
  name: 'OfflineHeaderButton',

  props: {
    document: { type: Object, required: true },
    documentType: { type: String, required: true },
    lang: { type: String, required: true },
  },

  data() {
    return {
      savedAt: null,
      // Bumped every minute so `freshness` re-evaluates without a
      // hard reload. Cheap — one setInterval per open doc page.
      nowTick: Date.now(),
      tickHandle: null,
    };
  },

  computed: {
    docId() {
      return this.document?.document_id;
    },
    isSaved() {
      if (!this.docId) return false;
      return this.$offline.isSaved(this.documentType, this.docId, this.lang);
    },
    // Saved AND fully downloaded — the only state that promises the
    // topo works in the field. isSaved() alone is true for a light save.
    isOfflineReady() {
      if (!this.docId) return false;
      return this.$offline.isOfflineReady(this.documentType, this.docId, this.lang);
    },
    isBusy() {
      if (!this.docId) return false;
      return this.$offline.isDownloading(this.documentType, this.docId, this.lang);
    },
    freshness() {
      return freshnessOf(this.savedAt, this.nowTick);
    },
    label() {
      if (this.isBusy) return this.$gettext('Enregistrement en cours…');
      if (this.isOfflineReady) {
        if (this.freshness === 'very-stale') {
          return this.$gettext('Disponible hors-ligne, copie très ancienne — pensez à la rafraîchir');
        }
        if (this.freshness === 'stale') {
          return this.$gettext('Disponible hors-ligne, copie datée — pensez à la rafraîchir');
        }
        return this.$gettext('Disponible hors-ligne — toucher pour retirer de Mes topos');
      }
      if (this.isSaved) {
        // Deliberately explicit: the user must not assume a bookmark is
        // enough to open this topo on the mountain.
        return this.$gettext(
          'Enregistré dans Mes topos (texte seul) — téléchargez-le depuis Mes topos pour l’avoir sur le terrain'
        );
      }
      return this.$gettext('Enregistrer dans Mes topos');
    },
  },

  watch: {
    // Re-read the saved timestamp whenever the underlying doc changes
    // (page navigation) or when the offline state flips (save/remove).
    docId: 'refreshSavedAt',
    isSaved: 'refreshSavedAt',
  },

  mounted() {
    this.refreshSavedAt();
    // Re-tick every 5 minutes so a very long-open doc page still
    // catches the fresh→stale transition without a reload.
    this.tickHandle = window.setInterval(() => {
      this.nowTick = Date.now();
    }, 5 * 60 * 1000);
  },

  beforeDestroy() {
    if (this.tickHandle) window.clearInterval(this.tickHandle);
  },

  methods: {
    async refreshSavedAt() {
      if (!this.isSaved || !this.docId) {
        this.savedAt = null;
        return;
      }
      // $offline.savedDocs is the reactive source — pull the timestamp
      // from there rather than reaching into the store directly.
      //
      // Freshness is about the downloaded package, so it reads
      // downloadedAt and falls back to savedAt for entries written
      // before the two were distinguished.
      const entry = this.$offline.savedDocs.find(
        (d) => d.type === this.documentType && String(d.id) === String(this.docId) && d.lang === this.lang
      );
      this.savedAt = entry?.downloadedAt ?? entry?.savedAt ?? null;
    },

    async toggle() {
      if (this.isBusy || !this.docId) return;
      if (this.isSaved) {
        // Confirm before delete — accidental tap on the trail used to
        // wipe the only offline copy. Guard lives on $offline so the
        // header bookmark and ToolBox share one source of truth.
        await this.$offline.confirmAndRemoveDocument(
          this.documentType,
          this.docId,
          this.lang,
          this.isOfflineReady
            ? this.$gettext("Retirer ce topo de Mes topos ? Vous ne pourrez plus l'ouvrir sans réseau.")
            : this.$gettext('Retirer ce topo de Mes topos ?')
        );
      } else {
        await this.$offline.saveDocument({
          type: this.documentType,
          id: this.docId,
          lang: this.lang,
        });
        // Saving is light by default now, so say it here rather than let
        // the user discover it with no signal on a ridge.
        this.$offline.notifyLightSave(this.documentType, this.docId, this.lang);
      }
    },
  },
};
</script>

<style lang="scss" scoped>
.offline-header-button a {
  position: relative;
  cursor: pointer;
  color: #4a4a4a;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 1.1rem;

  &.is-saved {
    color: #ff9933;
  }

  &.is-busy {
    color: #9ca3af;
  }
}

// Distinct from the freshness dot on purpose: this one answers "will
// this open without a network?", not "how old is the copy?".
.offline-ready-dot {
  position: absolute;
  top: -1px;
  right: -3px;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #2b8f4c;
  box-shadow: 0 0 0 1.5px white;
}

.freshness-dot {
  position: absolute;
  top: -1px;
  right: -3px;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  box-shadow: 0 0 0 1.5px white;

  &--stale {
    background: #f2b13a;
  }
  &--very-stale {
    background: #e54545;
  }
}
</style>

<style lang="scss">
html[data-theme='dark'] {
  .freshness-dot,
  .offline-ready-dot {
    box-shadow: 0 0 0 1.5px #232323;
  }
  .offline-ready-dot {
    background: #4bc26b;
  }
}
</style>
