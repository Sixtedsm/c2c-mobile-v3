<template>
  <section class="section more-view">
    <div class="container">
      <h1 class="title is-5">{{ $gettext('Plus') }}</h1>
      <p class="subtitle is-7">{{ $gettext('Accès aux autres sections Camptocamp') }}</p>

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
            <span class="tile-icon">
              <custom-icon :name="tile.icon" :size="34" />
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
import CustomIcon from '@/components/CustomIcon.vue';
import config from '@/js/config';

export default {
  name: 'MoreView',

  components: { CustomIcon },

  computed: {
    tiles() {
      // Curated set — anything that's already exposed in the BottomNav
      // (Recherche / Récent / Mes topos / Moi) is not duplicated here.
      return [
        {
          key: 'routes',
          label: this.$gettext('Itinéraires'),
          desc: this.$gettext('Voies, courses, parcours'),
          icon: 'mountain-trail',
          to: { name: 'routes' },
        },
        {
          key: 'articles',
          label: this.$gettext('Articles'),
          desc: this.$gettext('Techniques, conseils, récits'),
          icon: 'notebook',
          to: { name: 'articles' },
        },
        {
          key: 'xreports',
          label: this.$gettext('Sérac'),
          desc: this.$gettext("Incidents et accidents"),
          icon: 'serac-warning',
          to: { name: 'xreports' },
        },
        {
          key: 'yeti',
          label: this.$gettext('Yeti'),
          desc: this.$gettext('Préparation de course ski/alpi'),
          icon: 'snowflake-compass',
          to: { name: 'yeti' },
        },
        {
          key: 'forum',
          label: this.$gettext('Forum'),
          desc: this.$gettext('Discussions de la communauté'),
          icon: 'speech-bubbles',
          to: { name: 'forum' },
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
  width: 48px;
  height: 48px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: #fff5e6;
  border-radius: 4px;
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
