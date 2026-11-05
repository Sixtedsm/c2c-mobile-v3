<template>
  <div class="install-steps">
    <p v-if="install.installed" class="install-done">
      <fa-icon icon="check" />
      {{ $gettext("L'application est installée sur cet appareil.") }}
    </p>

    <button v-else-if="install.deferredPrompt" type="button" class="install-button" @click="promptInstall">
      <fa-icon icon="download" />
      {{ $gettext("Installer l'application") }}
    </button>

    <ol v-else-if="platform === 'ios'">
      <li>
        {{ $gettext('Touchez') }}
        <span class="install-key"><fa-icon icon="arrow-up-from-bracket" /> {{ $gettext('Partager') }}</span>
        {{ $gettext("(en bas de Safari, ou à côté de l'adresse).") }}
      </li>
      <li>
        {{ $gettext('Choisissez') }}
        <span class="install-key"><fa-icon icon="square-plus" /> {{ $gettext("Sur l'écran d'accueil") }}</span>
        {{ $gettext('puis Ajouter.') }}
      </li>
    </ol>

    <ol v-else-if="platform === 'android'">
      <li>
        {{ $gettext('Touchez le menu') }}
        <span class="install-key"><fa-icon icon="ellipsis-vertical" /></span>
        {{ $gettext('du navigateur.') }}
      </li>
      <li>
        {{ $gettext('Choisissez') }}
        <span class="install-key">{{ $gettext("Installer l'application") }}</span>
        {{ $gettext('ou') }}
        <span class="install-key">{{ $gettext("Ajouter à l'écran d'accueil") }}</span
        >.
      </li>
    </ol>

    <p v-else>
      {{
        $gettext(
          "Sur votre téléphone, ouvrez ce site dans le navigateur, puis ajoutez-le à l'écran d'accueil depuis le menu Partager (iPhone) ou le menu ⋮ (Android)."
        )
      }}
    </p>
  </div>
</template>

<script>
import install, { devicePlatform, promptInstall } from '@/pwa/install';

export default {
  name: 'AppInstallSteps',

  data() {
    return { install, platform: devicePlatform() };
  },

  methods: { promptInstall },
};
</script>

<style scoped lang="scss">
.install-steps {
  text-align: left;
  font-size: 0.9rem;
  line-height: 1.5;

  ol {
    margin: 0 0 0 1.2rem;
    padding: 0;
  }

  li + li {
    margin-top: 0.35rem;
  }

  p {
    margin: 0;
  }
}

.install-key {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0 0.35rem;
  border: 1px solid rgba(0, 0, 0, 0.15);
  border-radius: 4px;
  font-weight: 600;
  white-space: nowrap;
}

.install-button {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.55rem 1rem;
  border: none;
  border-radius: 6px;
  background: $color-base-c2c;
  color: white;
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;

  &:hover {
    background: #e6791f;
  }
}

.install-done {
  color: $green;
  font-weight: 600;
}
</style>

<style lang="scss">
html[data-theme='dark'] .install-key {
  border-color: rgba(255, 255, 255, 0.2);
}
</style>
