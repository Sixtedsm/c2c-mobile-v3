<template>
  <div id="camptocamp_htad" class="ams-ad is-flex is-justify-content-center is-clipped" />
</template>

<script>
import { loadAdScript } from '@/js/ads';

export default {
  mounted() {
    loadAdScript();
  },
};
</script>

<style lang="css" scoped>
#camptocamp_htad {
  min-width: 728px;
}
</style>
