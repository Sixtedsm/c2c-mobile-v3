<template>
  <div class="offline-view container is-fluid">
    <header class="offline-header">
      <h1 class="title is-3">
        <fa-icon icon="download" class="has-text-primary" />
        {{ $gettext('My offline topos') | uppercaseFirstLetter }}
      </h1>
      <div class="offline-status">
        <span :class="$offline.online ? 'tag is-success is-light' : 'tag is-warning'">
          <fa-icon :icon="$offline.online ? 'cloud' : 'plug'" />
          &nbsp;{{ $offline.online ? $gettext('Online') : $gettext('Offline') }}
        </span>
        <span v-if="storageLabel" class="storage-info is-size-7 has-text-grey">{{ storageLabel }}</span>
        <button class="button is-small is-primary" @click="openCreateFolderModal">
          <fa-icon icon="plus" />&nbsp;{{ $gettext('New folder') }}
        </button>
        <button
          v-if="entries.length"
          class="button is-small purge-btn"
          :title="$gettext('Supprimer tous les topos hors-ligne (les brouillons de sortie sont conservés)')"
          @click="purgeAll"
        >
          <fa-icon icon="trash" />&nbsp;<span class="is-hidden-mobile">{{ $gettext('Tout vider') }}</span>
        </button>
      </div>
      <!-- Storage progress bar (Lot 5): the raw byte count is helpful
           but a percentage-of-quota bar tells the user at a glance
           whether they're safe or near the browser storage ceiling. -->
      <div
        v-if="storagePercent !== null"
        class="storage-bar"
        :class="{ 'is-warn': storagePercent > 70, 'is-danger': storagePercent > 90 }"
      >
        <div class="storage-bar-fill" :style="{ width: storagePercent + '%' }" />
      </div>
    </header>

    <section v-if="$offline.pendingOutings.length" class="pending-outings">
      <header class="pending-outings-header">
        <fa-icon icon="upload" />
        <span class="pending-outings-title">
          {{ $offline.pendingOutings.length }}
          {{ $gettext('outing(s) waiting to be published') }}
        </span>
        <button
          v-if="$offline.online"
          class="button is-small is-primary"
          :disabled="$offline.syncing"
          @click="$offline.syncPendingOutings()"
        >
          <fa-icon icon="rotate" :class="{ 'fa-spin': $offline.syncing }" />
          &nbsp;{{ $offline.syncing ? $gettext('Syncing…') : $gettext('Sync now') }}
        </button>
        <span v-else class="tag is-warning">{{ $gettext('Offline') }}</span>
      </header>
      <ul class="pending-outings-list">
        <li
          v-for="item in $offline.pendingOutings"
          :key="item.id"
          class="pending-outing"
          :class="{ 'is-conflict': item.conflict }"
        >
          <div class="pending-outing-info">
            <span class="pending-outing-title">{{ item.title || $gettext('Untitled outing') }}</span>
            <span v-if="item.conflict" class="tag is-warning is-small pending-outing-badge">
              <fa-icon icon="triangle-exclamation" />
              &nbsp;{{ $gettext('En conflit') }}
            </span>
            <span v-else-if="item.attempts > 0" class="tag is-light is-danger is-small pending-outing-badge">
              {{ $gettext('Attempts:') }} {{ item.attempts }}
            </span>
          </div>
          <!-- Conflict resolution row (Lot 5 §2.4): shown only when the
               API returned 409 on a previous attempt. Three moves:
               retry as-is, export the payload as JSON for later manual
               edit, or discard the draft entirely. Retry + discard both
               live on $offline so future surfaces (a dedicated
               resolution page later, e.g.) reuse the same primitives. -->
          <div v-if="item.conflict" class="pending-outing-conflict">
            <p class="pending-outing-conflict-msg">
              {{
                $gettext(
                  'Un itinéraire ou point de passage a été modifié depuis votre brouillon. Choisissez comment continuer :'
                )
              }}
            </p>
            <div class="pending-outing-conflict-actions">
              <button class="button is-small is-primary" :disabled="$offline.syncing" @click="retryConflict(item.id)">
                <fa-icon icon="rotate" />
                &nbsp;{{ $gettext('Réessayer') }}
              </button>
              <button class="button is-small" @click="exportConflict(item)">
                <fa-icon icon="download" />
                &nbsp;{{ $gettext('Exporter JSON') }}
              </button>
              <button class="button is-small is-text" @click="discardPending(item.id)">
                <fa-icon icon="trash" />
                &nbsp;{{ $gettext('Abandonner') }}
              </button>
            </div>
          </div>
          <button
            v-else
            class="button is-small is-text pending-outing-discard"
            :title="$gettext('Discard this pending outing')"
            @click="discardPending(item.id)"
          >
            <fa-icon icon="trash" />
          </button>
        </li>
      </ul>
    </section>

    <div v-if="!entries.length && !$offline.pendingOutings.length" class="empty-state has-text-centered">
      <fa-icon icon="download" size="4x" class="has-text-grey-lighter" />
      <p class="title is-5 mt-4">
        {{ $gettext('No topos saved for offline use yet.') | uppercaseFirstLetter }}
      </p>
      <p class="subtitle is-6 has-text-grey">
        {{ $gettext('Open a route, waypoint or outing, and tap "Save for offline use" to keep it on this device.') }}
      </p>
      <router-link :to="{ name: 'routes' }" class="button is-primary mt-2">
        {{ $gettext('Browse the topoguide') | uppercaseFirstLetter }}
      </router-link>
    </div>

    <template v-else>
      <section v-for="group in groups" :key="group.id || 'unfiled'" class="offline-section">
        <header class="offline-section-header">
          <button class="offline-section-toggle" @click="toggleCollapse(group.id || 'unfiled')">
            <fa-icon :icon="isCollapsed(group.id || 'unfiled') ? 'chevron-right' : 'chevron-down'" fixed-width />
            <fa-icon :icon="group.id ? 'folder' : 'list'" class="has-text-primary" />
            <span class="offline-section-title">{{ group.name }}</span>
            <span class="tag is-light">{{ group.entries.length }}</span>
          </button>
          <div v-if="group.id" class="offline-section-actions">
            <button class="button is-text is-small" :title="$gettext('Rename folder')" @click="renameFolder(group)">
              <fa-icon icon="edit" />
            </button>
            <button class="button is-text is-small" :title="$gettext('Delete folder')" @click="deleteFolder(group)">
              <fa-icon icon="trash" />
            </button>
          </div>
        </header>

        <div v-if="!isCollapsed(group.id || 'unfiled')" class="offline-grid">
          <article v-for="entry in group.entries" :key="entryKey(entry)" class="offline-card">
            <router-link :to="linkTo(entry)" class="offline-card-body">
              <div class="offline-card-icon">
                <fa-icon :icon="iconFor(entry.type)" size="lg" />
              </div>
              <div class="offline-card-content">
                <h3 class="offline-card-title">{{ titleOf(entry) }}</h3>
                <div class="offline-card-meta">
                  <span class="tag is-light">{{ $gettext(entry.type) }}</span>
                  <span class="tag is-light">{{ entry.lang.toUpperCase() }}</span>
                  <!-- Freshness (Lot 5 §2.2): amber if 7-30 d, red past
                       30 d. Visible on every entry so the user can spot
                       obsolete packs at a glance before heading out. -->
                  <span
                    v-if="freshnessOf(entry) !== 'fresh' && freshnessOf(entry) !== 'unknown'"
                    class="tag is-small"
                    :class="freshnessTagClass(entry)"
                    :title="$gettext('Vérifiez le contenu — la sauvegarde peut être obsolète.')"
                  >
                    <fa-icon icon="triangle-exclamation" />
                    &nbsp;{{ ageLabelOf(entry) }}
                  </span>
                  <span v-else class="has-text-grey is-size-7">{{ ageLabelOf(entry) }}</span>
                </div>
              </div>
            </router-link>
            <div class="offline-card-actions">
              <button
                v-if="freshnessOf(entry) === 'stale' || freshnessOf(entry) === 'very-stale'"
                class="offline-card-refresh button is-small is-text"
                :disabled="isRefreshing(entry)"
                :title="$gettext('Rafraîchir depuis Camptocamp')"
                @click="refresh(entry)"
              >
                <fa-icon
                  :icon="isRefreshing(entry) ? 'rotate' : 'rotate'"
                  :class="{ 'fa-spin': isRefreshing(entry) }"
                />
              </button>
              <select
                class="offline-card-select"
                :value="entry.folderId || ''"
                :title="$gettext('Move to folder')"
                @change="moveToFolder(entry, $event.target.value)"
              >
                <option value="">{{ $gettext('No folder') }}</option>
                <option v-for="f in $offline.folders" :key="f.id" :value="f.id">{{ f.name }}</option>
              </select>
              <button
                class="offline-card-remove button is-small is-text"
                :title="$gettext('Remove from offline use')"
                @click="remove(entry)"
              >
                <fa-icon icon="trash" />
              </button>
            </div>
          </article>
        </div>
      </section>
    </template>

    <modal-window ref="folderModal" small>
      <template #header>
        {{ folderModalMode === 'rename' ? $gettext('Rename folder') : $gettext('New folder') }}
      </template>
      <input
        ref="folderInput"
        class="input"
        type="text"
        :placeholder="$gettext('Folder name')"
        v-model="folderInputValue"
        @keyup.enter="confirmFolderModal"
      />
      <template #footer>
        <div class="buttons is-right mt-4">
          <button class="button" @click="$refs.folderModal.hide()">{{ $gettext('Cancel') }}</button>
          <button class="button is-primary" :disabled="!folderInputValue.trim()" @click="confirmFolderModal">
            {{ folderModalMode === 'rename' ? $gettext('Rename') : $gettext('Create') }}
          </button>
        </div>
      </template>
    </modal-window>
  </div>
</template>

<script>
import ModalWindow from '@/components/generics/modals/ModalWindow';
import pullRefreshMixin from '@/js/pull-refresh-mixin';
import { ageLabel, freshnessOf } from '@/pwa/offline-freshness';

const TYPE_ICONS = {
  route: 'route',
  waypoint: 'map-marker-alt',
  outing: ['document-type', 'outing'],
  article: 'newspaper',
  book: 'atlas',
  image: 'image',
  xreport: 'exclamation-circle',
};

export default {
  name: 'OfflineView',

  components: { ModalWindow },

  mixins: [pullRefreshMixin],

  data() {
    return {
      storage: null,
      collapsed: {},
      folderModalMode: 'create',
      folderInputValue: '',
      folderBeingRenamed: null,
      // Bumped once when the view mounts so freshness labels are
      // consistent across the whole listing. A per-item Date.now() call
      // would make one entry read "il y a 6 jours" and its neighbor
      // "il y a 7 jours" mid-scroll.
      nowTick: Date.now(),
    };
  },

  computed: {
    entries() {
      return [...this.$offline.savedDocs].sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
    },

    groups() {
      const result = [];
      for (const folder of this.$offline.folders) {
        const folderEntries = this.entries.filter((entry) => entry.folderId === folder.id);
        result.push({ id: folder.id, name: folder.name, entries: folderEntries });
      }
      const unfiled = this.entries.filter((entry) => !entry.folderId);
      if (unfiled.length || !result.length) {
        result.push({ id: null, name: this.$gettext('Unfiled'), entries: unfiled });
      }
      return result;
    },

    storageLabel() {
      if (!this.storage) {
        return null;
      }
      const { usage, quota } = this.storage;
      if (!usage) {
        return null;
      }
      const used = this.formatBytes(usage);
      if (!quota) {
        return used;
      }
      return `${used} / ${this.formatBytes(quota)}`;
    },

    storagePercent() {
      const usage = this.storage?.usage;
      const quota = this.storage?.quota;
      if (!usage || !quota) return null;
      return Math.min(100, Math.round((usage / quota) * 100));
    },
  },

  async mounted() {
    this.storage = await this.$offline.getStorageUsage();
  },

  methods: {
    // Pull-to-refresh handler (#7) — re-reads from IDB and re-checks
    // pending uploads. Returned for the mixin's done-event.
    pullRefresh() {
      return this.$offline.refresh();
    },

    entryKey(entry) {
      return `${entry.type}/${entry.id}/${entry.lang}`;
    },

    linkTo(entry) {
      return {
        name: entry.type,
        params: { id: String(entry.id), lang: entry.lang },
      };
    },

    iconFor(type) {
      return TYPE_ICONS[type] || 'file-download';
    },

    titleOf(entry) {
      const data = entry.data;
      if (!data) {
        return this.$gettext('Untitled');
      }
      if (data.cooked?.title) {
        return data.cooked.title;
      }
      if (Array.isArray(data.locales)) {
        const localeMatch = data.locales.find((l) => l.lang === entry.lang) || data.locales[0];
        if (localeMatch?.title) {
          return localeMatch.title;
        }
      }
      return this.$gettext('Untitled');
    },

    formatDate(ts) {
      if (!ts) {
        return '';
      }
      try {
        return new Date(ts).toLocaleDateString(this.$language?.current);
      } catch {
        return new Date(ts).toLocaleDateString();
      }
    },

    formatBytes(bytes) {
      if (!bytes || bytes < 1024) {
        return `${bytes || 0} B`;
      }
      const units = ['KB', 'MB', 'GB'];
      let value = bytes / 1024;
      let unit = 0;
      while (value >= 1024 && unit < units.length - 1) {
        value /= 1024;
        unit += 1;
      }
      return `${value.toFixed(value < 10 ? 1 : 0)} ${units[unit]}`;
    },

    isCollapsed(key) {
      return this.collapsed[key] === true;
    },

    toggleCollapse(key) {
      this.$set(this.collapsed, key, !this.collapsed[key]);
    },

    openCreateFolderModal() {
      this.folderModalMode = 'create';
      this.folderInputValue = '';
      this.folderBeingRenamed = null;
      this.$refs.folderModal.show();
      this.$nextTick(() => this.$refs.folderInput?.focus());
    },

    renameFolder(folder) {
      this.folderModalMode = 'rename';
      this.folderInputValue = folder.name;
      this.folderBeingRenamed = folder;
      this.$refs.folderModal.show();
      this.$nextTick(() => this.$refs.folderInput?.focus());
    },

    async confirmFolderModal() {
      const name = this.folderInputValue.trim();
      if (!name) {
        return;
      }
      if (this.folderModalMode === 'rename' && this.folderBeingRenamed) {
        await this.$offline.renameFolder(this.folderBeingRenamed.id, name);
      } else {
        await this.$offline.createFolder(name);
      }
      this.$refs.folderModal.hide();
    },

    async deleteFolder(folder) {
      const message = this.$gettext('Delete this folder? The topos inside will be moved to "Unfiled".');
      if (!window.confirm(message)) {
        return;
      }
      await this.$offline.removeFolder(folder.id);
    },

    async moveToFolder(entry, folderId) {
      await this.$offline.moveDocumentToFolder(entry.type, entry.id, entry.lang, folderId || null);
    },

    async remove(entry) {
      const message = this.$gettext('Remove this topo from offline storage?');
      if (!window.confirm(message)) {
        return;
      }
      await this.$offline.removeDocument(entry.type, entry.id, entry.lang);
      this.storage = await this.$offline.getStorageUsage();
    },

    retryConflict(id) {
      this.$offline.retryConflictedOuting(id);
    },

    exportConflict(item) {
      this.$offline.exportPendingOutingAsJson(item);
    },

    freshnessOf(entry) {
      return freshnessOf(entry.savedAt, this.nowTick);
    },

    freshnessTagClass(entry) {
      const f = freshnessOf(entry.savedAt, this.nowTick);
      if (f === 'very-stale') return 'is-danger';
      if (f === 'stale') return 'is-warning';
      return '';
    },

    ageLabelOf(entry) {
      return ageLabel(entry.savedAt, this.nowTick, this.$gettext);
    },

    isRefreshing(entry) {
      return this.$offline.isDownloading(entry.type, entry.id, entry.lang);
    },

    // Re-download the doc through the same saveDocument path — it
    // overwrites the IDB entry with a fresh `savedAt`, re-prefetches
    // images + tiles + associated waypoints. Preserves the folder.
    async refresh(entry) {
      await this.$offline.saveDocument({
        type: entry.type,
        id: entry.id,
        lang: entry.lang,
        folderId: entry.folderId || null,
      });
    },

    async purgeAll() {
      const count = this.entries.length;
      const msg = this.$gettext(
        'Supprimer les {n} topos hors-ligne ? Les brouillons de sortie non publiés sont conservés.'
      ).replace('{n}', count);
      if (!window.confirm(msg)) return;
      await this.$offline.purgeAllDocuments();
      this.storage = await this.$offline.getStorageUsage();
    },

    async discardPending(id) {
      const message = this.$gettext('Discard this outing? Your data will be lost.');
      if (!window.confirm(message)) {
        return;
      }
      await this.$offline.removePendingOuting(id);
    },
  },
};
</script>

<style scoped lang="scss">
.offline-view {
  padding: 1rem;
  max-width: 1200px;
  margin: 0 auto;
}

.offline-header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  margin-bottom: 1.5rem;
}

.offline-status {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-wrap: wrap;
}

// Purge-all button: destructive action, tinted red so users don't
// mash it by accident. Confirm modal in JS is the real safety net.
.purge-btn {
  background: transparent;
  color: #c0392b;
  border: 1px solid rgba(192, 57, 43, 0.35);

  &:hover:not([disabled]),
  &:focus:not([disabled]) {
    background: rgba(192, 57, 43, 0.08);
    color: #a5251a;
    border-color: #c0392b;
  }
}

// Storage progress bar under the header (Lot 5 §2.9). Green while
// there's plenty of room, warn amber over 70%, danger red over 90%.
.storage-bar {
  flex-basis: 100%;
  height: 4px;
  background: rgba(0, 0, 0, 0.06);
  border-radius: 2px;
  overflow: hidden;
  margin-top: 0.5rem;

  .storage-bar-fill {
    height: 100%;
    background: #48c774;
    transition: width 0.2s;
  }

  &.is-warn .storage-bar-fill {
    background: #f2b13a;
  }
  &.is-danger .storage-bar-fill {
    background: #e54545;
  }
}

.empty-state {
  padding: 3rem 1rem;
  border: 2px dashed #e5e5e5;
  border-radius: 12px;
  background: #fafafa;
}

.offline-section {
  margin-bottom: 1.75rem;
}

.offline-section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  padding: 0.4rem 0.2rem;
  border-bottom: 1px solid #ececec;
  margin-bottom: 0.75rem;
}

.offline-section-toggle {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  background: transparent;
  border: 0;
  cursor: pointer;
  font-size: 1rem;
  color: $text;
  padding: 0;
}

.offline-section-title {
  font-weight: 600;
}

.offline-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 1rem;
}

.offline-card {
  display: flex;
  align-items: stretch;
  background: $white;
  border: 1px solid #ececec;
  border-radius: 10px;
  overflow: hidden;
  transition: box-shadow 0.15s ease, transform 0.15s ease;

  &:hover {
    box-shadow: 0 4px 14px rgba(0, 0, 0, 0.08);
    transform: translateY(-1px);
  }
}

.offline-card-body {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.85rem 0.9rem;
  flex: 1;
  color: $text;
  text-decoration: none;
  min-width: 0;
}

.offline-card-icon {
  flex-shrink: 0;
  width: 2.5rem;
  height: 2.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
  background: $color-base-c2c-lighter;
  border-radius: 8px;
  color: $color-base-c2c;
}

.offline-card-content {
  min-width: 0;
  flex: 1;
}

.offline-card-title {
  font-size: 1rem;
  font-weight: 600;
  margin: 0 0 0.25rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.offline-card-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.4rem;
}

.offline-card-actions {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  justify-content: center;
  border-left: 1px solid #f0f0f0;
  padding: 0.25rem;
  gap: 0.2rem;
}

.offline-card-select {
  font-size: 0.75rem;
  padding: 0.25rem 0.4rem;
  border: 1px solid #ddd;
  border-radius: 6px;
  background: $white;
  max-width: 7.5rem;
}

.offline-card-remove {
  color: $grey;

  &:hover {
    color: $red;
  }
}

.pending-outings {
  margin-bottom: 1.5rem;
  padding: 0.85rem 1rem;
  background: hsl(48, 100%, 95%);
  border-left: 4px solid hsl(48, 100%, 50%);
  border-radius: 6px;
}

.pending-outings-header {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-bottom: 0.5rem;
}

.pending-outings-title {
  font-weight: 600;
  flex: 1;
}

.pending-outings-list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.pending-outing {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
  padding: 0.35rem 0;
  border-top: 1px solid hsl(48, 100%, 88%);

  &:first-child {
    border-top: 0;
  }

  // Conflict items expand vertically to fit the resolution block.
  &.is-conflict {
    align-items: flex-start;
  }
}

.pending-outing-info {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  overflow: hidden;
}

.pending-outing-title {
  flex: 1;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.pending-outing-badge {
  flex: 0 0 auto;
}

.pending-outing-discard {
  flex: 0 0 auto;
}

.pending-outing-conflict {
  flex: 1 1 100%;
  padding: 0.5rem 0.6rem;
  background: hsl(48, 100%, 96%);
  border-radius: 6px;
  margin-top: 0.35rem;
}

.pending-outing-conflict-msg {
  margin: 0 0 0.5rem;
  font-size: 0.82rem;
  color: #6b6b6b;
}

.pending-outing-conflict-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
}
</style>
