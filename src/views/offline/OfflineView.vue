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
          :class="{ 'is-conflict': item.conflict, 'needs-route-assoc': item.needsRouteAssoc }"
        >
          <div class="pending-outing-info">
            <span class="pending-outing-title">{{ item.title || $gettext('Untitled outing') }}</span>
            <span v-if="item.needsRouteAssoc" class="tag is-warning is-small pending-outing-badge">
              <fa-icon icon="triangle-exclamation" />
              &nbsp;{{ $gettext('Itinéraire à renseigner') }}
            </span>
            <span v-else-if="item.conflict" class="tag is-warning is-small pending-outing-badge">
              <fa-icon icon="triangle-exclamation" />
              &nbsp;{{ $gettext('En conflit') }}
            </span>
            <span v-else-if="item.attempts > 0" class="tag is-light is-danger is-small pending-outing-badge">
              {{ $gettext('Attempts:') }} {{ item.attempts }}
            </span>
          </div>

          <!-- Free-text hint the user typed on the terrain when they
               couldn't associate a real itinéraire. Displayed verbatim
               so the user recognises which sortie they need to finish
               even weeks later. -->
          <p v-if="item.needsRouteAssoc && item.routeNote" class="pending-outing-note">
            <fa-icon icon="pen-to-square" />
            &nbsp;<em>{{ item.routeNote }}</em>
          </p>
          <div v-if="item.needsRouteAssoc" class="pending-outing-assoc-actions">
            <button class="button is-small is-primary" @click="openAssocModal(item)">
              <fa-icon icon="link" />
              &nbsp;{{ $gettext('Renseigner l’itinéraire') }}
            </button>
            <button class="button is-small is-text" @click="discardPending(item.id)">
              <fa-icon icon="trash" />
              &nbsp;{{ $gettext('Abandonner') }}
            </button>
          </div>
          <!-- Show the last API error verbatim so the user can screenshot
               a real diagnostic message rather than the generic "Échec
               de la synchronisation" toast. Common values: 400 (payload
               invalid), 401/403 (session expired), 500 (server), or a
               network error string. -->
          <p
            v-if="!item.conflict && item.attempts > 0 && item.lastError"
            class="pending-outing-error"
            :title="$gettext('Détail de la dernière erreur API')"
          >
            <fa-icon icon="circle-info" />
            &nbsp;{{ $gettext('Dernière erreur :') }} <code>{{ item.lastError }}</code>
          </p>
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
            v-else-if="!item.needsRouteAssoc"
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
                  <!-- The single most important thing on this card: can
                       I open it with no network? A light save cannot show
                       images or the map, so saying so plainly here is what
                       stops someone counting on it in the field. -->
                  <span v-if="isOffline(entry)" class="tag is-small offline-badge-ready">
                    <fa-icon icon="circle-check" />
                    &nbsp;{{ $gettext('Hors-ligne') }}
                  </span>
                  <span
                    v-else
                    class="tag is-small offline-badge-light"
                    :title="
                      $gettext('Texte seulement : ni photos ni carte. Téléchargez-le pour l’avoir sur le terrain.')
                    "
                  >
                    {{ $gettext('Texte seul') }}
                  </span>
                  <!-- Freshness (Lot 5 §2.2): amber if 7-30 d, red past
                       30 d. Only meaningful for a downloaded package —
                       a light save has nothing to go stale. -->
                  <span
                    v-if="isOffline(entry) && freshnessOf(entry) !== 'fresh' && freshnessOf(entry) !== 'unknown'"
                    class="tag is-small"
                    :class="freshnessTagClass(entry)"
                    :title="$gettext('Vérifiez le contenu — la sauvegarde peut être obsolète.')"
                  >
                    <fa-icon icon="triangle-exclamation" />
                    &nbsp;{{ ageLabelOf(entry) }}
                  </span>
                  <span v-else-if="isOffline(entry)" class="has-text-grey is-size-7">{{ ageLabelOf(entry) }}</span>
                </div>
              </div>
            </router-link>
            <div class="offline-card-actions">
              <!-- The deliberate second step: saving is light, taking a
                   topo to the mountain is an explicit choice. This is the
                   place for it — preparing a trip happens in Mes topos,
                   not while browsing. -->
              <button
                v-if="!isOffline(entry)"
                class="offline-card-download button is-small is-text"
                :disabled="isDownloading(entry)"
                :title="$gettext('Télécharger pour la montagne (photos et carte)')"
                @click="download(entry)"
              >
                <fa-icon :icon="isDownloading(entry) ? 'spinner' : 'download'" :spin="isDownloading(entry)" />
              </button>
              <button
                v-else
                class="offline-card-undownload button is-small is-text"
                :title="$gettext('Libérer l’espace : garder le topo dans Mes topos, sans photos ni carte')"
                @click="undownload(entry)"
              >
                <fa-icon icon="plug" />
              </button>
              <button
                v-if="isOffline(entry) && (freshnessOf(entry) === 'stale' || freshnessOf(entry) === 'very-stale')"
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

    <!-- "Renseigner l'itinéraire" modal — completes a pending outing
         that was saved without a route via the terrain-fallback flow.
         Two picker sources: (1) the routes the user has pre-saved in
         "Mes topos", available even offline; (2) a live Camptocamp
         search shown when the device is online. Once the user picks
         one, $offline.attachRoutesToPendingOuting merges it into the
         payload, clears the needsRouteAssoc flag, and kicks off the
         sync. -->
    <modal-window ref="assocModal">
      <template #header>{{ $gettext('Renseigner l’itinéraire') }}</template>
      <div v-if="assocItem">
        <p v-if="assocItem.routeNote" class="assoc-modal-note">
          <fa-icon icon="pen-to-square" />
          &nbsp;<em>{{ assocItem.routeNote }}</em>
        </p>

        <div v-if="assocOfflineRoutes.length" class="assoc-modal-section">
          <h4 class="assoc-modal-title">
            <fa-icon icon="bookmark" />
            &nbsp;{{ $gettext('Mes itinéraires hors-ligne') }}
          </h4>
          <ul class="assoc-modal-list">
            <li v-for="route in assocOfflineRoutes" :key="'off-' + route.document_id">
              <button
                type="button"
                class="assoc-modal-choice"
                :disabled="assocSaving"
                @click="chooseRouteForPending(route)"
              >
                <strong>{{ $documentUtils.getDocumentTitle(route) }}</strong>
                <small v-if="route.elevation_max">{{ route.elevation_max }} m</small>
              </button>
            </li>
          </ul>
        </div>

        <div v-if="$offline.online" class="assoc-modal-section">
          <h4 class="assoc-modal-title">
            <fa-icon icon="magnifying-glass" />
            &nbsp;{{ $gettext('Rechercher un itinéraire') }}
          </h4>
          <input
            v-model="assocSearchQuery"
            type="search"
            class="input"
            :placeholder="$gettext('Nom de l’itinéraire')"
            @input="onAssocSearch"
          />
          <p v-if="assocSearching" class="assoc-modal-hint">
            <fa-icon icon="spinner" spin />&nbsp;{{ $gettext('Recherche…') }}
          </p>
          <ul v-else-if="assocSearchResults.length" class="assoc-modal-list">
            <li v-for="route in assocSearchResults" :key="'srch-' + route.document_id">
              <button
                type="button"
                class="assoc-modal-choice"
                :disabled="assocSaving"
                @click="chooseRouteForPending(route)"
              >
                <strong>{{ $documentUtils.getDocumentTitle(route) }}</strong>
                <small v-if="route.elevation_max">{{ route.elevation_max }} m</small>
              </button>
            </li>
          </ul>
          <p v-else-if="assocSearchQuery.trim() && !assocSearching" class="assoc-modal-hint">
            {{ $gettext('Aucun itinéraire trouvé.') }}
          </p>
        </div>

        <div v-else-if="!assocOfflineRoutes.length" class="assoc-modal-hint">
          <fa-icon icon="triangle-exclamation" />
          &nbsp;{{
            $gettext(
              'Aucun itinéraire disponible : reconnectez-vous à Internet pour rechercher un itinéraire sur Camptocamp, ou sauvegardez d’abord un itinéraire dans « Mes topos ».'
            )
          }}
        </div>
      </div>
      <template #footer>
        <div class="buttons is-right mt-4">
          <button class="button" @click="closeAssocModal">{{ $gettext('Fermer') }}</button>
        </div>
      </template>
    </modal-window>
  </div>
</template>

<script>
import { toast } from 'bulma-toast';

import ModalWindow from '@/components/generics/modals/ModalWindow';
import c2c from '@/js/apis/c2c';
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
      // "Renseigner l'itinéraire" modal — see assocModal in the
      // template. `assocItem` is the pending outing currently being
      // completed; search state is debounced through _assocSearchT.
      assocItem: null,
      assocSearchQuery: '',
      assocSearchResults: [],
      assocSearching: false,
      assocSaving: false,
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

    // Offline-saved routes surfaced inside the "Renseigner l'itinéraire"
    // modal. Same source as the picker in OutingEditionView so the
    // user sees the exact same list they'd have on the terrain.
    assocOfflineRoutes() {
      // offlineDocs, for the same reason as the picker in
      // OutingEditionView: only genuinely downloaded routes belong here.
      const saved = this.$offline?.offlineDocs || [];
      const routes = saved.filter((entry) => entry.type === 'route' && entry.data);
      routes.sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
      return routes.map((entry) => entry.data);
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

    // Mode helpers. A missing mode means a pre-split entry, which was
    // always fully downloaded — see offline-store.listDocuments().
    isOffline(entry) {
      return (entry.mode ?? 'offline') === 'offline';
    },
    isDownloading(entry) {
      return this.$offline.isDownloading(entry.type, entry.id, entry.lang);
    },

    async download(entry) {
      try {
        await this.$offline.downloadForOffline(entry.type, entry.id, entry.lang);
        toast({
          type: 'is-success',
          position: 'bottom-center',
          message: this.$gettext('Topo téléchargé : photos et carte disponibles hors-ligne.'),
        });
      } catch {
        toast({
          type: 'is-warning',
          position: 'bottom-center',
          duration: 4500,
          message: this.$gettext('Téléchargement impossible. Vérifiez votre connexion et réessayez.'),
        });
      }
    },

    async undownload(entry) {
      if (
        !window.confirm(
          this.$gettext(
            'Retirer les photos et la carte de ce topo ? Il restera dans Mes topos, lisible en texte, mais ne sera plus complet sans réseau.'
          )
        )
      ) {
        return;
      }
      await this.$offline.removeOfflineData(entry.type, entry.id, entry.lang);
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

    // ── "Renseigner l'itinéraire" flow ─────────────────────────
    // Opens the modal for a given pending outing (queued via the
    // terrain fallback with just a text note). Resets the search
    // state — a previous session's results would confuse the user.
    openAssocModal(item) {
      this.assocItem = item;
      this.assocSearchQuery = '';
      this.assocSearchResults = [];
      this.assocSearching = false;
      this.$refs.assocModal.show();
    },
    closeAssocModal() {
      if (this.$refs.assocModal) this.$refs.assocModal.hide();
      this.assocItem = null;
      this.assocSearchQuery = '';
      this.assocSearchResults = [];
    },
    // Debounced route search — 350 ms after the user stops typing.
    // Only runs when the device thinks it's online (the modal hides
    // the search block otherwise). Errors are swallowed silently —
    // the offline picker is always available as a fallback.
    onAssocSearch() {
      window.clearTimeout(this._assocSearchT);
      const q = this.assocSearchQuery.trim();
      if (!q) {
        this.assocSearchResults = [];
        this.assocSearching = false;
        return;
      }
      this.assocSearching = true;
      this._assocSearchT = window.setTimeout(async () => {
        try {
          const res = await c2c.route.getAll({ q, limit: 10 }).promise_;
          this.assocSearchResults = res?.data?.documents || [];
        } catch {
          this.assocSearchResults = [];
        } finally {
          this.assocSearching = false;
        }
      }, 350);
    },
    async chooseRouteForPending(route) {
      if (this.assocSaving || !this.assocItem) return;
      this.assocSaving = true;
      try {
        await this.$offline.attachRoutesToPendingOuting(this.assocItem.id, [route]);
        // Success — the item flips to !needsRouteAssoc and sync fires
        // if the device is online. Close the modal either way; the
        // user will see the status change in the list.
        this.closeAssocModal();
      } finally {
        this.assocSaving = false;
      }
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
    // overwrites the IDB entry, re-prefetches images + tiles +
    // associated waypoints. Preserves the folder.
    //
    // It must also preserve the mode: saveDocument now defaults to a
    // light save, so passing the entry's own mode is what stops a
    // refresh from quietly stripping a downloaded topo of its images
    // and map right before someone heads out.
    async refresh(entry) {
      await this.$offline.saveDocument({
        type: entry.type,
        id: entry.id,
        lang: entry.lang,
        folderId: entry.folderId || null,
        mode: entry.mode ?? 'offline',
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

// Green reads as "ready", neutral grey as "not yet" — the same pairing
// used by the dot on the topo header button, so the two surfaces agree.
.offline-badge-ready {
  background: rgba(43, 143, 76, 0.12);
  color: #2b8f4c;
  font-weight: 600;
}
.offline-badge-light {
  background: rgba(0, 0, 0, 0.06);
  color: #6b6b6b;
}
.offline-card-download {
  color: #2b8f4c;
}
.offline-card-undownload {
  color: #6b6b6b;
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

.pending-outing-error {
  flex: 1 1 100%;
  margin: 0.35rem 0 0;
  padding: 0.4rem 0.55rem;
  background: hsl(0, 80%, 96%);
  border-left: 3px solid hsl(0, 60%, 55%);
  border-radius: 4px;
  font-size: 0.75rem;
  color: hsl(0, 40%, 30%);
  overflow-wrap: anywhere;

  code {
    background: hsl(0, 60%, 90%);
    color: hsl(0, 60%, 25%);
    padding: 0.05rem 0.3rem;
    border-radius: 2px;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 0.72rem;
  }
}

// Terrain-fallback pending items — the user's own note about which
// itinéraire they were on, plus the "Renseigner l'itinéraire"
// action row. Amber palette so it reads as an "à faire" step, not
// an error.
.pending-outing.needs-route-assoc {
  background: hsl(38, 100%, 97%);
  border-left: 3px solid #ff9933;
}
.pending-outing-note {
  flex: 1 1 100%;
  margin: 0.35rem 0 0;
  padding: 0.4rem 0.55rem;
  background: white;
  border-left: 3px solid rgba(255, 153, 51, 0.5);
  border-radius: 4px;
  font-size: 0.82rem;
  color: #6b4a1e;
  overflow-wrap: anywhere;
}
.pending-outing-assoc-actions {
  flex: 1 1 100%;
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
  margin-top: 0.4rem;
}

// "Renseigner l'itinéraire" modal — vertical list of pickers, each
// section titled. The choice buttons are full-width taps so a fat
// finger reliably picks a single route.
.assoc-modal-note {
  padding: 0.4rem 0.55rem;
  background: hsl(38, 100%, 96%);
  border-left: 3px solid #ff9933;
  border-radius: 4px;
  font-size: 0.85rem;
  color: #4a4a4a;
  margin-bottom: 0.75rem;
}
.assoc-modal-section {
  margin-bottom: 1rem;
}
.assoc-modal-title {
  font-size: 0.8rem;
  font-weight: 600;
  color: #6b6b6b;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  margin: 0 0 0.35rem;
  display: flex;
  align-items: center;
}
.assoc-modal-list {
  list-style: none;
  padding: 0;
  margin: 0 0 0.4rem;
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  max-height: 260px;
  overflow-y: auto;
}
.assoc-modal-choice {
  width: 100%;
  text-align: left;
  padding: 0.55rem 0.7rem;
  background: white;
  border: 1px solid rgba(0, 0, 0, 0.12);
  border-radius: 6px;
  color: #4a4a4a;
  font: inherit;
  cursor: pointer;
  display: flex;
  align-items: baseline;
  gap: 0.4rem;

  strong {
    flex: 1;
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  small {
    color: #6b6b6b;
    font-size: 0.75rem;
    flex: 0 0 auto;
  }

  &:hover,
  &:focus {
    background: #fff5e6;
    border-color: #ff9933;
    outline: none;
  }
  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
}
.assoc-modal-hint {
  font-size: 0.8rem;
  color: #6b6b6b;
  margin: 0.4rem 0 0;
}
</style>

<style lang="scss">
html[data-theme='dark'] {
  .pending-outing.needs-route-assoc {
    background: #2f2618;
    border-left-color: #ff9933;
  }
  .pending-outing-note {
    background: #2a2a2a;
    color: #ffb866;
  }
  .assoc-modal-note {
    background: #3a2f1a;
    color: #ffb866;
  }
  .assoc-modal-title {
    color: #b5b5b5;
  }
  .assoc-modal-choice {
    background: #2a2a2a;
    color: #e5e5e5;
    border-color: rgba(255, 255, 255, 0.1);
    &:hover,
    &:focus {
      background: #3a2f1a;
      border-color: #ff9933;
    }
  }
  .assoc-modal-hint {
    color: #b5b5b5;
  }
}
</style>
