<template>
  <router-link
    v-if="category"
    :to="{ name: 'forum-category', params: { slug: category.slug, id: category.id } }"
    class="fc-pill"
    :style="pillStyle"
    :title="fullPath"
    @click.native.stop
  >
    <span class="fc-pill-dot" :style="{ backgroundColor: color }"></span>
    <span class="fc-pill-name">{{ category.name }}</span>
  </router-link>
</template>

<script>
// Discourse colored category tag. Renders as a compact clickable pill
// with a colored dot + the category name. Parent category (if any) is
// shown as a hover tooltip.

export default {
  name: 'ForumCategoryPill',

  props: {
    category: { type: Object, default: null },
    parent: { type: Object, default: null },
  },

  computed: {
    color() {
      return '#' + (this.category?.color || 'aaaaaa');
    },
    pillStyle() {
      // Very light tint of the category color as background — matches
      // how Discourse renders category tags in list views.
      return { borderColor: this.color + '55' };
    },
    fullPath() {
      if (this.parent && this.parent.name) {
        return `${this.parent.name} › ${this.category.name}`;
      }
      return this.category?.name || '';
    },
  },
};
</script>

<style scoped lang="scss">
.fc-pill {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.15rem 0.5rem 0.15rem 0.4rem;
  border: 1px solid rgba(0, 0, 0, 0.1);
  border-radius: 3px;
  background: rgba(0, 0, 0, 0.03);
  font-size: 0.7rem;
  font-weight: 600;
  color: #4a4a4a;
  text-decoration: none;
  line-height: 1.3;
  max-width: 100%;

  &:hover,
  &:focus {
    background: rgba(0, 0, 0, 0.06);
    color: #4a4a4a;
    text-decoration: none;
  }
}

.fc-pill-dot {
  width: 8px;
  height: 8px;
  border-radius: 2px;
  flex: 0 0 auto;
}

.fc-pill-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 140px;
}
</style>

<style lang="scss">
html[data-theme='dark'] {
  .fc-pill {
    background: rgba(255, 255, 255, 0.05);
    border-color: rgba(255, 255, 255, 0.12);
    color: #e5e5e5;
    &:hover,
    &:focus {
      background: rgba(255, 255, 255, 0.1);
      color: #e5e5e5;
    }
  }
}
</style>
