<template>
  <span v-if="canSave" class="bulk-offline">
    <button
      type="button"
      class="button is-small bulk-offline-btn"
      :disabled="busy || !documents.length"
      :title="busy ? $gettext('Saving') + ' ' + savedCount + '/' + total : $gettext('Save page offline')"
      :aria-label="$gettext('Save page offline')"
      @click="open"
    >
      <fa-icon :icon="busy ? 'rotate' : 'bookmark'" :class="{ 'fa-spin': busy }" />
      <!-- Label hidden on mobile so the button stays compact in the
           header (tap-target = the whole button via title/aria-label). -->
      <span class="bulk-offline-label is-hidden-mobile">
        &nbsp;{{ busy
          ? $gettext('Saving') + ' ' + savedCount + '/' + total
          : $gettext('Save page offline')
        }}
      </span>
      <!-- On mobile during a bulk save, show the count next to the icon
           so the user gets progress feedback without taking up the
           "Save page offline" text room. -->
      <span v-if="busy" class="bulk-offline-progress-mobile is-hidden-tablet">
        &nbsp;{{ savedCount }}/{{ total }}
      </span>
    </button>

    <div v-if="showPicker" class="bulk-offline-modal" role="dialog">
      <div class="bulk-offline-card">
        <h3 class="bulk-offline-title">{{ $gettext('Sauvegarder cette page hors-ligne') }}</h3>
        <p class="bulk-offline-subtitle">
          {{ documents.length }} {{ $gettext('document(s) on this page — choose a folder:') }}
        </p>
        <select v-model="selectedFolder" class="bulk-offline-select">
          <option value="">{{ $gettext('Sans dossier') }}</option>
          <option v-for="f in $offline.folders" :key="f.id" :value="f.id">{{ f.name }}</option>
          <option value="__new__">{{ $gettext('Nouveau dossier…') }}</option>
        </select>
        <div class="bulk-offline-actions">
          <button type="button" class="button is-text" @click="cancel">{{ $gettext('Annuler') }}</button>
          <button type="button" class="button is-primary" @click="confirm">{{ $gettext('Sauvegarder') }}</button>
        </div>
      </div>
    </div>
  </span>
</template>

<script>
// Bulk-save (#11): tab the currently-displayed listing page into the
// user's offline store, optionally grouped into a folder. Sequential
// saves so the device + tile servers don't drown in parallel fetches —
// each saveDocument already prefetches images and tiles.

const SAVABLE_TYPES = new Set(['route', 'waypoint', 'outing', 'article', 'book', 'xreport']);

export default {
  name: 'BulkOfflineButton',

  props: {
    documents: {
      type: Array,
      required: true,
    },
    documentType: {
      type: String,
      required: true,
    },
  },

  data() {
    return {
      showPicker: false,
      selectedFolder: '',
      busy: false,
      savedCount: 0,
      total: 0,
    };
  },

  computed: {
    canSave() {
      return SAVABLE_TYPES.has(this.documentType);
    },
  },

  methods: {
    open() {
      if (this.busy) return;
      this.selectedFolder = '';
      this.showPicker = true;
    },

    cancel() {
      this.showPicker = false;
    },

    async confirm() {
      let folderId = this.selectedFolder || null;
      if (folderId === '__new__') {
        const name = window.prompt(this.$gettext('Nom du dossier ?'));
        if (!name || !name.trim()) {
          return;
        }
        folderId = await this.$offline.createFolder(name.trim());
      }
      this.showPicker = false;
      await this.runSave(folderId);
    },

    async runSave(folderId) {
      const lang = this.$route.params.lang || this.$language?.current || 'fr';
      this.busy = true;
      this.savedCount = 0;
      this.total = this.documents.length;
      for (const doc of this.documents) {
        try {
          await this.$offline.saveDocument({
            type: this.documentType,
            id: doc.document_id,
            lang,
            folderId,
          });
        } catch {
          // a single failure shouldn't abort the whole batch
        }
        this.savedCount += 1;
      }
      this.busy = false;
      this.savedCount = 0;
      this.total = 0;
    },
  },
};
</script>

<style lang="scss" scoped>
.bulk-offline-btn {
  background: transparent;
  color: #ff9933;
  border: 1px solid #ff9933;
  // Tighten on mobile (icon-only mode) so it fits next to the other
  // header chips without forcing a new line.
  @media screen and (max-width: 768px) {
    padding-left: 0.45rem;
    padding-right: 0.45rem;
  }

  &:hover:not([disabled]),
  &:focus:not([disabled]) {
    background: #fff5e6;
    color: #cc7a29;
    border-color: #cc7a29;
  }
}

.bulk-offline-progress-mobile {
  font-size: 0.7rem;
  font-weight: 600;
}

.bulk-offline-modal {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 40;
  padding: 1rem;
}

.bulk-offline-card {
  background: white;
  border-radius: 10px;
  padding: 1.25rem;
  max-width: 360px;
  width: 100%;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.25);
}

.bulk-offline-title {
  font-size: 1.05rem;
  font-weight: 700;
  color: #4a4a4a;
  margin: 0 0 0.4rem;
}

.bulk-offline-subtitle {
  font-size: 0.85rem;
  color: #6b6b6b;
  margin: 0 0 0.9rem;
}

.bulk-offline-select {
  width: 100%;
  padding: 0.45rem 0.55rem;
  border: 1px solid rgba(0, 0, 0, 0.12);
  border-radius: 6px;
  background: white;
  font-size: 0.95rem;
}

.bulk-offline-actions {
  margin-top: 1rem;
  display: flex;
  justify-content: flex-end;
  gap: 0.4rem;
}
</style>

<style lang="scss">
html[data-theme='dark'] {
  .bulk-offline-btn {
    background: #3a2f1a;
    color: #ffb866;
    border-color: #ff9933;
    &:hover:not([disabled]),
    &:focus:not([disabled]) {
      background: #4a3a20;
      color: #fff;
    }
  }
  .bulk-offline-card {
    background: #2a2a2a;
    color: #e5e5e5;
  }
  .bulk-offline-title { color: #f5f5f5; }
  .bulk-offline-subtitle { color: #9a9a9a; }
  .bulk-offline-select {
    background: #1a1a1a;
    color: #e5e5e5;
    border-color: rgba(255, 255, 255, 0.15);
  }
}
</style>
