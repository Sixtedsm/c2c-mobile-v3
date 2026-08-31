<template>
  <router-link
    v-if="username"
    :to="{ name: 'forum-user', params: { username } }"
    class="fu-avatar"
    :class="{ 'is-small': small }"
    :title="username"
    @click.native.stop
  >
    <img v-if="src" :src="src" :alt="username" loading="lazy" />
    <span v-else class="fu-avatar-placeholder">{{ initials }}</span>
  </router-link>
  <span v-else class="fu-avatar" :class="{ 'is-small': small }">
    <img v-if="src" :src="src" alt="" loading="lazy" />
    <span v-else class="fu-avatar-placeholder">?</span>
  </span>
</template>

<script>
// Clickable Discourse avatar. Given a `user` (either a full user
// object with avatar_template, or a template string + username), it
// renders the avatar and routes to the in-app forum profile view on
// tap. Anonymous / unknown users render as an inert grey circle.

import forum from '@/js/apis/forum';

export default {
  name: 'ForumUserAvatar',

  props: {
    user: { type: Object, default: null },
    // Fallback size in pixels used to pick the right avatar variant
    // from Discourse. Discourse serves multiple sizes off the same
    // template — 24/45/48/60/64/96/120 are all valid.
    size: { type: Number, default: 48 },
    small: { type: Boolean, default: false },
  },

  computed: {
    username() {
      return this.user?.username || null;
    },
    src() {
      const template = this.user?.avatar_template;
      if (!template) return null;
      return forum.avatarUrlFromTemplate(template, this.size);
    },
    initials() {
      const name = this.user?.name || this.user?.username || '';
      return name.slice(0, 1).toUpperCase();
    },
  },
};
</script>

<style scoped lang="scss">
.fu-avatar {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: #e5e7eb;
  overflow: hidden;
  text-decoration: none;
  color: inherit;

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }

  &:hover img,
  &:focus img {
    filter: brightness(0.92);
  }

  &.is-small {
    width: 28px;
    height: 28px;
  }
}

.fu-avatar-placeholder {
  font-size: 0.9rem;
  font-weight: 600;
  color: #6b6b6b;
  line-height: 1;
}
</style>

<style lang="scss">
html[data-theme='dark'] {
  .fu-avatar {
    background: #3a3a3a;
  }
  .fu-avatar-placeholder {
    color: #cfcfcf;
  }
}
</style>
