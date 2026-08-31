<template>
  <span>
    <icon-moderator v-if="contributor.moderator" />
    <icon-blocked v-if="contributor.blocked" />
    <icon-robot v-if="contributor.robot" />
    <router-link :to="{ name: 'profile', params: { id: contributor.user_id } }">
      {{ contributor.name }}
    </router-link>
    <span>
      <span>(</span>
      <router-link :to="{ name: 'whatsnew', query: { u: contributor.user_id } }" rel="nofollow">c</router-link>
      <span v-if="contributor.forum_username">
        <span>|</span>
        <!-- V3: the discourse activity page now lives in-app as the
             ForumUserView (/forum/u/:username) so a tap on "d" stays
             inside the PWA instead of kicking the user out to Safari. -->
        <router-link :to="{ name: 'forum-user', params: { username: contributor.forum_username } }">d</router-link>
      </span>
      <span>)</span>
    </span>
  </span>
</template>

<script>
export default {
  props: {
    contributor: {
      type: Object,
      required: true,
    },
  },
};
</script>
