# Guide de l'application — à publier sur le wiki Camptocamp

Camptocamp range ses guides d'utilisation comme des articles du wiki, listés
dans **« AIDE : Accueil »** (article 106732). Le guide de l'application y a sa
place. En attendant, l'application affiche le même texte sur sa propre page
`/guide-application` (`src/views/static-views/AppGuideView.vue`), reliée depuis
le tutoriel de bienvenue, le bandeau de l'accueil et **Moi → Aide et support**.

## Publier

1. Créer un article : titre **« AIDE : Application mobile »**, type
   _collaboratif_, catégorie _Informations sur le site_ (comme « AIDE :
   Accueil »), toutes les activités. Coller le texte ci-dessous.
2. Dans « AIDE : Accueil », ajouter sous `## Consulter` :

   ```
   * [[articles/NNN|L'application mobile : installer, hors ligne, sorties]]
   ```

   (`NNN` = numéro de l'article créé.)

3. Pour que l'application mène désormais à l'article, une ligne dans
   `src/js/vue-plugins/router.js` :

   ```js
   { path: '/guide-application', name: 'app-guide', redirect: { name: 'article', params: { id: NNN } } },
   ```

   Les trois liens de l'application suivent. `AppGuideView.vue` peut alors
   être supprimé. L'article se traduit ensuite comme les autres, ce que la
   page intégrée (en français seulement) ne permet pas.

## Texte de l'article

---

L'application Camptocamp, c'est camptocamp.org installé sur votre téléphone : même compte, mêmes topos, même communauté. Rien à télécharger dans un magasin d'applications, et elle se met à jour toute seule.

## Installer l'application

- **iPhone, iPad** : dans Safari, touchez _Partager_, puis _Sur l'écran d'accueil_ et _Ajouter_.
- **Android** : dans Chrome, touchez le menu ⋮, puis _Installer l'application_ (ou _Ajouter à l'écran d'accueil_).
- **Ordinateur** : ouvrez camptocamp.org sur votre téléphone et suivez les étapes ci-dessus. Le bandeau de la page d'accueil affiche un QR code à scanner.

### Pourquoi l'installer ?

- Une icône sur l'écran d'accueil, et l'application occupe tout l'écran, sans la barre du navigateur.
- Vos topos hors ligne restent sur le téléphone. Sur iPhone, Safari efface les données d'un site non installé après 7 jours sans visite : installée, l'application les garde.
- Selon le téléphone, une pastille sur l'icône indique les sorties qui attendent d'être publiées.

## Se repérer

Cinq onglets en bas de l'écran :

- **Recherche** : itinéraires, sorties, points de passage… avec filtres, liste ou carte.
- **Récent** : les dernières sorties et nouveautés de la communauté, avec leurs photos.
- **Mes topos** : vos topos enregistrés, en ligne et hors ligne, et vos sorties en attente.
- **Moi** : votre compte, vos sorties, les paramètres de l'application et l'aide.
- **Plus** : topoguide, articles, SERAC, Yeti, Itinévert, forum.

## Mes topos, en ligne et hors ligne

- Sur un topo, touchez le marque-page _Enregistrer dans Mes topos_ : il est enregistré **en ligne**, dans votre liste, mais il faut du réseau pour l'ouvrir.
- Pour l'emporter en montagne, dans _Mes topos_ → _En ligne_, touchez _Enregistrer hors ligne_ : le texte, les photos et la carte autour de l'itinéraire sont téléchargés. Il passe dans l'onglet _Hors ligne_.
- Depuis une liste de résultats, _Enregistrer la page_ enregistre tous les topos de la page d'un coup, dans le dossier de votre choix.
- Chaque onglet a ses propres dossiers pour ranger vos topos.
- _Incomplet_ : le téléchargement a été interrompu (tunnel, réseau coupé). Touchez-le pour le terminer. Une copie _datée_ se met à jour avec _Rafraîchir depuis Camptocamp_.
- _Repasser en ligne_ libère la place sur le téléphone, le topo reste dans votre liste.

## Vos sorties

- Sur un itinéraire, touchez _Ajouter ma sortie_ ; ou le bouton **+** en haut à droite.
- **Sans réseau**, vous pouvez remplir et enregistrer votre sortie : elle attend dans _Mes topos_. Au retour du réseau, l'application vous prévient ; vous la relisez puis touchez _Publier maintenant_. Rien n'est publié sans votre accord.
- **La trace** : importez un fichier GPX, ou choisissez une activité Strava, Garmin, Suunto… si vos comptes sont reliés sur la page [Trackers](https://www.camptocamp.org/trackers). L'application n'enregistre pas elle-même le GPS : votre montre ou votre application de suivi le font mieux, écran éteint compris.

## Paramètres

Onglet _Moi_ → _Paramètres_ : thème clair ou sombre, unités, taille du texte, et _Revoir l'introduction_. Ces réglages restent sur cet appareil.

## Un souci ?

- Une nouveauté n'apparaît pas : fermez complètement l'application puis rouvrez-la, elle charge alors sa dernière version.
- Pour signaler un problème : _Moi_ → _Signaler un bug de l'app mobile_ (le message part avec les informations utiles). Pour proposer une idée : [le forum Camptocamp](https://forum.camptocamp.org).
