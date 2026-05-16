<template>
  <section class="section more-view">
    <div class="container">
      <h1 class="title is-5">{{ $gettext('Plus') }}</h1>
      <p class="subtitle is-7">{{ $gettext('Tout le contenu Camptocamp, à portée de pouce.') }}</p>

      <ul class="tile-grid">
        <li v-for="tile in tiles" :key="tile.key">
          <component
            :is="tile.href ? 'a' : 'router-link'"
            :to="tile.to || undefined"
            :href="tile.href || undefined"
            :target="tile.href ? '_blank' : undefined"
            :rel="tile.href ? 'noopener' : undefined"
            class="tile-link"
          >
            <span class="tile-icon" :style="{ background: tile.color }">
              <fa-icon :icon="tile.icon" />
            </span>
            <span class="tile-text">
              <span class="tile-label">{{ tile.label }}</span>
              <span class="tile-desc">{{ tile.desc }}</span>
            </span>
            <fa-icon icon="chevron-right" class="tile-chevron" />
          </component>
        </li>
      </ul>
    </div>
  </section>
</template>

<script>
import config from '@/js/config';

export default {
  name: 'MoreView',

  computed: {
    tiles() {
      return [
        {
          key: 'routes',
          label: this.$gettext('Itinéraires'),
          desc: this.$gettext('Voies, courses, parcours'),
          icon: ['fas', 'route'],
          color: '#fef3c7',
          to: { name: 'routes' },
        },
        {
          key: 'waypoints',
          label: this.$gettext('Points de passage'),
          desc: this.$gettext('Sommets, cols, refuges, lacs…'),
          icon: ['fas', 'location-dot'],
          color: '#fce7f3',
          to: { name: 'waypoints' },
        },
        {
          key: 'books',
          label: this.$gettext('Livres'),
          desc: this.$gettext('Topoguides référencés'),
          icon: ['fas', 'book'],
          color: '#dcfce7',
          to: { name: 'books' },
        },
        {
          key: 'articles',
          label: this.$gettext('Articles'),
          desc: this.$gettext('Techniques, conseils, récits'),
          icon: ['fas', 'newspaper'],
          color: '#ede9fe',
          to: { name: 'articles' },
        },
        {
          key: 'xreports',
          label: this.$gettext('Sérac'),
          desc: this.$gettext("Récits d'accidents et d'incidents"),
          icon: ['fas', 'triangle-exclamation'],
          color: '#ffe4e6',
          to: { name: 'xreports' },
        },
        {
          key: 'forum',
          label: this.$gettext('Forum'),
          desc: this.$gettext('Discussions de la communauté'),
          icon: ['fas', 'comments'],
          color: '#dbeafe',
          href: config.urls.forum,
        },
        {
          key: 'images',
          label: this.$gettext('Photos'),
          desc: this.$gettext('Galerie de la communauté'),
          icon: ['fas', 'image'],
          color: '#cffafe',
          to: { name: 'images' },
        },
        {
          key: 'areas',
          label: this.$gettext('Massifs'),
          desc: this.$gettext('Régions et zones'),
          icon: ['fas', 'mountain'],
          color: '#fef9c3',
          to: { name: 'areas' },
        },
        {
          key: 'yeti',
          label: this.$gettext('Yeti'),
          desc: this.$gettext('Préparation de course ski/alpi'),
          icon: ['fas', 'snowflake'],
          color: '#e0f2fe',
          to: { name: 'yeti' },
        },
        {
          key: 'outings-stats',
          label: this.$gettext('Statistiques'),
          desc: this.$gettext('Statistiques des sorties'),
          icon: ['fas', 'chart-bar'],
          color: '#f3e8ff',
          to: { name: 'outings-stats' },
        },
        {
          key: 'serac-info',
          label: this.$gettext('À propos de Sérac'),
          desc: this.$gettext('Présentation du module Sérac'),
          icon: ['fas', 'circle-info'],
          color: '#fee2e2',
          to: { name: 'serac' },
        },
      ];
    },
  },
};
</script>

<style lang="scss" scoped>
.more-view {
  padding-bottom: calc(80px + env(safe-area-inset-bottom));
}

.title {
  margin-bottom: 0.25rem;
}

.subtitle {
  margin-bottom: 1rem;
  color: #6b6b6b;
}

.tile-grid {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: 1fr;
  gap: 0.5rem;
}

.tile-link {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem;
  background: white;
  border: 1px solid rgba(0, 0, 0, 0.12);
  color: #4a4a4a;
  text-decoration: none;
  transition: box-shadow 0.15s;

  &:hover,
  &:focus {
    text-decoration: none;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.08);
    color: #4a4a4a;
  }
}

.tile-icon {
  flex: 0 0 auto;
  width: 44px;
  height: 44px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 1.2rem;
  color: #4a4a4a;
}

.tile-text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.tile-label {
  font-weight: 600;
  font-size: 0.95rem;
}

.tile-desc {
  font-size: 0.75rem;
  color: #6b6b6b;
}

.tile-chevron {
  color: #9ca3af;
  flex: 0 0 auto;
}
</style>
