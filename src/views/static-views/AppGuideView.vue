<template>
  <!-- French only for now: the place for translations is the wiki article
       this page is meant to become (docs/GUIDE-APPLICATION.md). -->
  <section class="section app-guide" lang="fr">
    <html-header title="Guide de l'application Camptocamp" />

    <div class="box">
      <div class="content">
        <h1 class="title is-3">Guide de l'application Camptocamp</h1>
        <p>
          L'application Camptocamp, c'est camptocamp.org installé sur votre téléphone : même compte, mêmes topos, même
          communauté. Rien à télécharger dans un magasin d'applications, et elle se met à jour toute seule.
        </p>

        <h2>Installer l'application</h2>
        <div class="app-guide-here">
          <p class="has-text-weight-bold">Sur cet appareil :</p>
          <app-install-steps />
        </div>
        <ul>
          <li>
            <strong>iPhone, iPad</strong> : dans Safari, touchez <em>Partager</em>, puis
            <em>Sur l'écran d'accueil</em> et <em>Ajouter</em>.
          </li>
          <li>
            <strong>Android</strong> : dans Chrome, touchez le menu ⋮, puis <em>Installer l'application</em> (ou
            <em>Ajouter à l'écran d'accueil</em>).
          </li>
          <li>
            <strong>Ordinateur</strong> : ouvrez camptocamp.org sur votre téléphone et suivez les étapes ci-dessus.
          </li>
        </ul>

        <h3>Pourquoi l'installer ?</h3>
        <ul>
          <li>Une icône sur l'écran d'accueil, et l'application occupe tout l'écran, sans la barre du navigateur.</li>
          <li>
            Vos topos hors ligne restent sur le téléphone. Sur iPhone, Safari efface les données d'un site non installé
            après 7 jours sans visite : installée, l'application les garde.
          </li>
          <li>Selon le téléphone, une pastille sur l'icône indique les sorties qui attendent d'être publiées.</li>
        </ul>

        <h2>Se repérer</h2>
        <p>Cinq onglets en bas de l'écran :</p>
        <ul>
          <li><strong>Recherche</strong> : itinéraires, sorties, points de passage… avec filtres, liste ou carte.</li>
          <li><strong>Récent</strong> : les dernières sorties et nouveautés de la communauté, avec leurs photos.</li>
          <li>
            <strong>Mes topos</strong> : vos topos enregistrés, en ligne et hors ligne, et vos sorties en attente.
          </li>
          <li><strong>Moi</strong> : votre compte, vos sorties, les paramètres de l'application et l'aide.</li>
          <li><strong>Plus</strong> : topoguide, articles, SERAC, Yeti, Itinévert, forum.</li>
        </ul>

        <h2>Mes topos, en ligne et hors ligne</h2>
        <ul>
          <li>
            Sur un topo, touchez le marque-page <em>Enregistrer dans Mes topos</em> : il est enregistré
            <strong>en ligne</strong>, dans votre liste, mais il faut du réseau pour l'ouvrir.
          </li>
          <li>
            Pour l'emporter en montagne, dans <em>Mes topos</em> → <em>En ligne</em>, touchez
            <em>Enregistrer hors ligne</em> : le texte, les photos et la carte autour de l'itinéraire sont téléchargés.
            Il passe dans l'onglet <em>Hors ligne</em>.
          </li>
          <li>
            Depuis une liste de résultats, <em>Enregistrer la page</em> enregistre tous les topos de la page d'un coup,
            dans le dossier de votre choix.
          </li>
          <li>Chaque onglet a ses propres dossiers pour ranger vos topos.</li>
          <li>
            <em>Incomplet</em> : le téléchargement a été interrompu (tunnel, réseau coupé). Touchez-le pour le terminer.
            Une copie <em>datée</em> se met à jour avec <em>Rafraîchir depuis Camptocamp</em>.
          </li>
          <li><em>Repasser en ligne</em> libère la place sur le téléphone, le topo reste dans votre liste.</li>
        </ul>

        <h2>Vos sorties</h2>
        <ul>
          <li>
            Sur un itinéraire, touchez <em>Ajouter ma sortie</em> ; ou le bouton <strong>+</strong> en haut à droite.
          </li>
          <li>
            <strong>Sans réseau</strong>, vous pouvez remplir et enregistrer votre sortie : elle attend dans
            <em>Mes topos</em>. Au retour du réseau, l'application vous prévient ; vous la relisez puis touchez
            <em>Publier maintenant</em>. Rien n'est publié sans votre accord.
          </li>
          <li>
            <strong>La trace</strong> : importez un fichier GPX, ou choisissez une activité Strava, Garmin, Suunto… si
            vos comptes sont reliés sur camptocamp.org (page Trackers). L'application n'enregistre pas elle-même le GPS
            : votre montre ou votre application de suivi le font mieux, écran éteint compris.
          </li>
        </ul>

        <h2>Paramètres</h2>
        <p>
          Onglet <em>Moi</em> → <em>Paramètres</em> : thème clair ou sombre, unités, taille du texte, et
          <em>Revoir l'introduction</em>. Ces réglages restent sur cet appareil.
        </p>

        <h2>Un souci ?</h2>
        <ul>
          <li>
            Une nouveauté n'apparaît pas : fermez complètement l'application puis rouvrez-la, elle charge alors sa
            dernière version.
          </li>
          <li>
            Pour signaler un problème : <em>Moi</em> → <em>Signaler un bug de l'app mobile</em> (le message part avec
            les informations utiles). Pour proposer une idée :
            <a href="https://forum.camptocamp.org" target="_blank" rel="noopener">le forum Camptocamp</a>.
          </li>
        </ul>
      </div>
    </div>
  </section>
</template>

<script>
import AppInstallSteps from '@/components/AppInstallSteps';

// The "page CTC" explaining the app in detail (Sixte, 2026-11-06). Linked
// from the welcome tour, the home banner and the "Plus" tab. C2C keeps its
// user guides as wiki articles under "AIDE : Accueil"; the same text, in
// wiki markdown, is in docs/GUIDE-APPLICATION.md, ready to publish there.
export default {
  name: 'AppGuideView',

  components: { AppInstallSteps },
};
</script>

<style scoped lang="scss">
.app-guide {
  max-width: 820px;
  margin: 0 auto;
}

.app-guide-here {
  margin-bottom: 1rem;
  padding: 0.8rem 1rem;
  border-left: 4px solid $color-base-c2c;
  border-radius: 6px;
  background: #fff5e6;

  p {
    margin-bottom: 0.4rem;
  }
}
</style>

<style lang="scss">
html[data-theme='dark'] .app-guide-here {
  background: #3a2f1a;
}
</style>
