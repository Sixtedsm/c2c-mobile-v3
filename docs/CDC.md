# Cahier des charges consolidé — Application mobile Camptocamp

> Version 1.0, transmise par le CA (Ludovic / Kasper).
> Texte extrait du .docx original le 2026-09-02 et versionné ici pour deux raisons :
> le code cite ses sections (CDC §2.2, §3.2, Lot 5…) et doit rester vérifiable, et
> §3.2 exige que la documentation parte avec le dépôt lors de la reprise par C2C.
> En cas de doute, le .docx original fait foi.

---

1. Principes généraux
   L’application mobile Camptocamp a pour objectif de fournir un accès simple, fiable et efficace aux contenus Camptocamp en situation de terrain, y compris en conditions de réseau faible ou inexistant.
   Les principes directeurs sont les suivants :
   Keep it simple : accès prioritaire à la topothèque. Le premier objectif de l’application est de permettre aux utilisateur·rices d’accéder rapidement aux itinéraires, points de passage et informations essentielles pour préparer ou réaliser une sortie.
   Usage terrain prioritaire. L’application doit être pensée pour une utilisation en montagne ou en extérieur : consultation de topo, cartographie, trace GPS, photos, saisie de sortie, faible réseau, batterie limitée, lisibilité en extérieur.
   Fonctionnement connecté et déconnecté. Les contenus essentiels doivent pouvoir être consultés offline. La création d’une sortie doit également être possible offline, avec synchronisation différée lorsque la connexion revient.
   Complémentarité avec le site web Camptocamp. L’application ne doit pas chercher à reproduire immédiatement toute l’iso-fonctionnalité du site web. Elle doit d’abord couvrir les usages mobiles à forte valeur ajoutée. L’iso-fonctionnalité complète peut rester une cible long terme.
   Simplicité, robustesse et sobriété. L’application doit limiter la consommation de batterie, de données mobiles et d’espace de stockage.
   Compatibilité mobile. L’application doit cibler Android et iOS. La compatibilité Windows Phone doit être retirée du périmètre sauf justification spécifique, car elle n’est plus pertinente pour un nouveau développement mobile.
   Développement progressif : les fonctions avancées de contribution viennent après stabilisation du cœur terrain.
   Administration et support anticipés : Camptocamp doit pouvoir suivre, maintenir, corriger et faire évoluer l’application ceci incluant que la gestion de l’app sous App Store / Play Store soit sous contrôle Camptocamp
   Maintenabilité en prérequis : elle devient une exigence structurante, pas un sujet secondaire.
2. Exigences fonctionnelles
   2.1 Accès à la topothèque
   L’accès à la topothèque constitue le cœur du MVP.
   L’application doit permettre :
   la recherche d’itinéraires ;
   la consultation des itinéraires ;
   la consultation des points de passage ;
   la consultation des informations associées utiles à la sortie ;
   l’accès rapide aux contenus depuis l’écran d’accueil ;
   une recherche géographique autour de l’utilisateur ou d’une zone choisie ;
   des filtres simples au premier lot : activité, distance, difficulté, disponibilité offline ;
   l’ouverture d’un contenu Camptocamp depuis un lien partagé ou depuis le site web.
   2.2 Consultation online et offline
   L’application doit permettre la consultation en mode connecté et déconnecté.
   Les contenus prioritaires à rendre disponibles offline sont :
   les itinéraires ;
   les points de passage ;
   les éléments associés nécessaires à une sortie terrain : carte minimale, trace GPX si disponible, photos ou schémas utiles.
   L’application doit prévoir une fonction d’enregistrement local :
   d’un document unique ;
   d’une sélection de documents ;
   d’un pack “sortie du jour” comprenant les contenus nécessaires à une sortie.
   L’utilisateur doit pouvoir voir clairement :
   si un contenu est disponible offline ;
   si le téléchargement est incomplet ;
   la date de dernière synchronisation ;
   si le contenu offline est potentiellement obsolète.
   Les autres documents Camptocamp, tels que sorties, livres, images, régions, Yéti, Sérac, CPS ou forum, pourront être intégrés progressivement dans des lots ultérieurs, selon leur utilité en mobilité.
   2.3 Recherche géographique
   Pour les éléments géoréférencés, les recherches doivent pouvoir être limitées à la zone géographique proche de l’utilisateur.
   L’utilisateur doit pouvoir :
   utiliser sa géolocalisation courante ;
   choisir manuellement une zone ;
   régler la distance de recherche via un curseur ;
   élargir progressivement la zone de recherche.
   Le besoin initial d’un curseur de 0 à 6000 km peut être conservé, mais il conviendra de le simplifier ergonomiquement pour éviter une interface trop complexe.
   2.4 Création offline d’une sortie
   La création ou modification d’une sortie est une fonctionnalité prioritaire et doit être placée juste après la consultation offline des itinéraires et points de passage dans la feuille de route.
   L’application doit permettre :
   de démarrer une sortie ;
   de reprendre une sortie en cours ;
   de mettre en pause une sortie ;
   de finaliser une sortie ;
   d’enregistrer un brouillon local ;
   de créer une sortie sans connexion réseau ;
   de synchroniser la sortie avec le site Camptocamp lorsque la connexion revient.
   La sortie doit pouvoir contenir :
   activité ;
   date ;
   itinéraire associé ;
   durée ;
   distance ;
   dénivelé ;
   trace GPS ;
   photos ;
   conditions ;
   commentaires ;
   champs principaux équivalents à ceux du site web.
   La synchronisation doit être robuste :
   statut visible pour l’utilisateur ;
   reprise après erreur ;
   file d’attente des éléments à synchroniser ;
   absence de perte silencieuse de données ;
   gestion des conflits si l’itinéraire ou un point de passage a été modifié entre la saisie offline et la synchronisation.
   2.5 Association d’une sortie à un itinéraire
   L’application doit faciliter l’association d’une sortie à un itinéraire Camptocamp.
   Elle doit pouvoir proposer automatiquement :
   des itinéraires proches ;
   des sommets proches ;
   des parkings proches ;
   des points de passage proches ;
   des itinéraires cohérents avec l’activité sélectionnée.
   À la fin d’une capture GPS, l’application doit vérifier les itinéraires à proximité et proposer une liste à l’utilisateur.
   Si l’itinéraire existe :
   création de la sortie ;
   association automatique ou semi-automatique à l’itinéraire.
   Si l’itinéraire n’existe pas :
   possibilité de créer un nouvel itinéraire ;
   puis création et association de la sortie.
   Cette création d’itinéraire depuis mobile peut cependant être traitée dans un lot ultérieur, afin de ne pas alourdir le MVP.
   2.6 Cartographie et trace GPS
   L’application doit intégrer une page cartographie permettant :
   de visualiser le trajet en cours ;
   d’afficher la trace GPS ;
   d’activer ou désactiver le GPS ;
   d’adapter la fréquence d’enregistrement GPS ;
   d’afficher les objets Camptocamp à proximité : refuge, parking, sommet, point de passage ;
   d’afficher un profil d’altitude optionnel ;
   d’utiliser un fond cartographique lorsque disponible.
   Le cahier des charges devra préciser ultérieurement :
   les fonds cartographiques utilisables ;
   les contraintes de licence ;
   les coûts éventuels ;
   les possibilités de téléchargement offline ;
   les limites par pays.
   2.7 Outils terrain
   L’application doit intégrer ou exploiter les outils suivants lorsque le terminal le permet :
   GPS ;
   appareil photo ;
   boussole ;
   inclinomètre ;
   import GPX ;
   export GPX ;
   corrélation des photos avec la trace GPS si les photos ne sont pas géoréférencées.
   Les permissions système doivent être demandées de manière claire et justifiée.
   2.8 Photos et médias
   L’application doit permettre :
   l’ajout de photos depuis l’appareil ;
   l’ajout de photos déjà présentes dans la galerie ;
   l’association des photos à une sortie ;
   la compression adaptée pour limiter les volumes de données ;
   la synchronisation différée ;
   la gestion des erreurs de transfert.
   2.9 Compte utilisateur et paramètres
   L’application doit permettre :
   la connexion au compte Camptocamp ;
   la gestion de la session utilisateur ;
   la synchronisation avec le site ;
   la configuration des unités : kilomètres, miles, mètres, pieds ;
   la configuration de la langue ;
   la configuration de la fréquence GPS ;
   l’activation éventuelle d’un seuil d’alerte batterie faible ;
   la suppression des données locales ;
   la visualisation de l’espace de stockage utilisé par les contenus offline.
   2.10 Partage
   L’application peut permettre le partage d’une sortie ou d’un contenu.
   Le partage vers Camptocamp doit être prioritaire par rapport au partage vers les réseaux sociaux.
   Le partage vers des plateformes externes, comme Instagram ou Facebook, peut être prévu mais ne doit pas être une priorité du MVP.
3. Exigences non fonctionnelles
   3.1 Maintenabilité
   La maintenabilité doit être placée tout en haut des exigences du projet.
   L’application doit être conçue pour pouvoir évoluer dans le temps sans dépendance excessive à un prestataire ou à une technologie difficile à maintenir.
   Exigences attendues :
   architecture documentée ;
   code source remis à Camptocamp ;
   séparation claire entre interface mobile, logique métier, API, synchronisation et stockage offline ;
   documentation technique ;
   documentation d’installation ;
   documentation de build ;
   documentation de publication ;
   règles de revue de code ;
   gestion claire des dépendances ;
   suivi des versions ;
   tests automatisés ;
   capacité de reprise par un autre développeur ou prestataire.
   3.2 Réversibilité
   Camptocamp doit pouvoir reprendre la maîtrise technique de l’application.
   Le prestataire doit remettre :
   code source ;
   scripts de build ;
   documentation ;
   accès aux dépôts ;
   configuration CI/CD ;
   clés et certificats nécessaires, lorsque juridiquement et techniquement possible ;
   documentation de publication App Store et Play Store ;
   liste des dépendances et licences utilisées.
   Aucune dépendance bloquante à un prestataire ne doit empêcher Camptocamp de maintenir ou publier l’application.
   3.3 Sécurité et confidentialité
   L’application doit respecter les bonnes pratiques de sécurité mobile.
   Elle doit prévoir :
   authentification sécurisée ;
   gestion correcte des sessions ;
   absence de stockage non sécurisé des identifiants ;
   minimisation des données personnelles collectées ;
   information claire sur l’usage de la géolocalisation ;
   consentement explicite pour localisation, photo, notifications et partage ;
   suppression possible des données locales ;
   chiffrement des données sensibles lorsque nécessaire ;
   respect des paramètres de confidentialité du compte Camptocamp.
   3.4 Performance et résilience terrain
   L’application doit fonctionner correctement dans des conditions difficiles :
   faible réseau ;
   absence de réseau ;
   mode avion ;
   batterie faible ;
   interruption GPS ;
   fermeture puis réouverture de l’application ;
   synchronisation interrompue ;
   stockage presque plein.
   L’application doit avoir :
   un temps de démarrage court ;
   une navigation fluide ;
   une consommation batterie maîtrisée ;
   une gestion robuste des erreurs ;
   des messages utilisateurs compréhensibles ;
   aucune perte silencieuse de données.
   3.5 Accessibilité et ergonomie
   L’application doit être utilisable par un large public, y compris en conditions terrain.
   Exigences attendues :
   interface lisible en extérieur ;
   contrastes suffisants ;
   boutons suffisamment grands ;
   navigation simple ;
   menus peu profonds ;
   tailles de police adaptables ;
   labels accessibles pour les lecteurs d’écran lorsque pertinent ;
   parcours clés testés avec des utilisateur·rices réels.
   Les parcours prioritaires à tester sont :
   rechercher un itinéraire ;
   enregistrer un topo offline ;
   consulter un topo en mode avion ;
   créer une sortie offline ;
   synchroniser une sortie ;
   ajouter une photo ;
   retrouver un brouillon.
   3.6 Qualité logicielle et tests
   Le projet doit prévoir :
   tests unitaires ;
   tests d’intégration ;
   tests de synchronisation offline/online ;
   tests sur Android ;
   tests sur iOS ;
   tests sur plusieurs tailles d’écran ;
   tests en mode avion ;
   tests de reprise après crash ;
   tests de consommation batterie ;
   tests de stockage local ;
   tests de montée de version.
   Ces tests seront effectués avec une selection d’utilisateurs .rices camptocamp.
   3.7 Sobriété numérique
   L’application doit limiter :
   les téléchargements inutiles ;
   le stockage local excessif ;
   la consommation batterie ;
   la consommation de données mobiles ;
   la synchronisation automatique non maîtrisée.
   L’utilisateur doit pouvoir supprimer facilement les contenus offline.
4. Administration et gouvernance Camptocamp
   4.1 Gouvernance des stores
   La gestion de l’application via le Play Store et l’App Store doit revenir à Camptocamp.
   Cela signifie que Camptocamp doit être propriétaire ou administrateur principal :
   des comptes développeurs ;
   des fiches App Store et Play Store ;
   des certificats ;
   des clés de signature ;
   des droits d’administration ;
   des captures d’écran ;
   des textes de présentation ;
   des mentions légales ;
   de la politique de confidentialité ;
   des procédures de publication.
   Le prestataire peut préparer les builds et accompagner la publication, mais Camptocamp doit conserver la maîtrise des accès et de la publication.
   4.2 Administration technique
   Camptocamp doit disposer d’une visibilité minimale sur l’exploitation de l’application.
   À prévoir :
   suivi des versions déployées ;
   suivi des erreurs critiques ;
   suivi des crashs ;
   suivi des synchronisations échouées ;
   suivi des volumes de téléchargement offline ;
   suivi sobre et agrégé des usages principaux ;
   canal de remontée d’anomalies.
   4.3 Support utilisateur
   L’application doit permettre aux utilisateur·rices de signaler :
   un bug ;
   une erreur de topo ;
   un problème de synchronisation ;
   un contenu problématique ;
   une suggestion d’amélioration.
   Ces signalements doivent être orientés vers les processus existants de Camptocamp lorsque possible. Cette fonctionnalité est importante mais pas prioritaire; ainsi elle peut dans une première phase etre simplifiée au maximum en faisant appel au système actuel du site de support/ retours utilisateurs.
   4.4 Modération et qualité communautaire
   L’application doit respecter les règles communautaires existantes de Camptocamp.
   Elle doit prévoir :
   la prévisualisation avant publication d’une sortie ;
   la possibilité de corriger un brouillon ;
   la gestion des contenus signalés ;
   le respect des règles de publication des photos ;
   la cohérence avec les processus de modération du site web.
   Les actions avancées de modération depuis mobile peuvent être exclues du MVP et traitées ultérieurement.
   4.5 Interopérabilité avec le site Camptocamp
   L’application doit réutiliser :
   les API existantes ;
   les modèles de données existants ;
   les règles de contribution existantes ;
   la charte graphique existante ;
   les comptes utilisateurs existants.
   L’application ne doit pas créer un système parallèle au site Camptocamp.
   Elle doit permettre :
   liens profonds vers les pages web ;
   ouverture d’un contenu web dans l’application lorsque pertinent ;
   cohérence entre données web et données mobiles ;
   synchronisation fiable ;
   gestion des conflits.
5. Développement par lots
   Compte tenu de la taille du projet, le développement doit être réalisé par étapes.
   Lot 0 : socle technique et gouvernance
   Objectif : sécuriser la base du projet avant de développer les fonctionnalités visibles.
   Contenu :
   choix technologique : PWA, hybride ou natif ;
   architecture ;
   maintenabilité ;
   sécurité ;
   CI/CD ;
   tests ;
   gestion des stores ;
   modèle offline ;
   règles de synchronisation ;
   documentation ;
   réversibilité.
   Compromis : ce lot ne produit pas forcément beaucoup de fonctionnalités utilisateur visibles, mais il évite de créer une dette technique difficile à corriger plus tard.
   Lot 1 : accès topothèque online/offline
   Objectif : permettre l’accès simple aux contenus essentiels.
   Contenu :
   recherche d’itinéraires ;
   consultation des itinéraires ;
   consultation des points de passage ;
   sauvegarde offline ;
   pack “sortie du jour” ;
   recherche géographique simple ;
   statut de synchronisation ;
   consultation en mode avion.
   Compromis : ce lot se concentre sur les itinéraires et points de passage. Les autres documents sont repoussés pour préserver la simplicité du MVP.
   Lot 2 : création offline d’une sortie
   Objectif : permettre la saisie terrain d’une sortie, même sans réseau.
   Contenu :
   brouillon local ;
   démarrer / reprendre / mettre en pause / terminer une sortie ;
   trace GPS ;
   photos ;
   association à un itinéraire ;
   champs essentiels ;
   synchronisation différée ;
   gestion des erreurs ;
   gestion des conflits.
   Compromis : cette fonctionnalité est remontée avant la consultation offline de tous les autres documents, car elle apporte une forte valeur terrain, notamment en refuge ou sans connexion.
   Lot 3 : consultation progressive des autres documents
   Objectif : enrichir l’expérience offline après stabilisation du cœur terrain.
   Contenu possible :
   sorties ;
   livres ;
   images ;
   régions ;
   Yéti ;
   Sérac ;
   CPS ;
   éléments du forum si pertinent.
   Compromis : l’intégration se fait selon la valeur d’usage mobile, et non par recherche d’iso-fonctionnalité automatique avec le site.
   Lot 4 : création et modification avancées
   Objectif : permettre davantage de contribution depuis mobile.
   Contenu possible :
   création / modification d’itinéraires ;
   création / modification de points de passage ;
   ajout ou modification d’images ;
   contribution à Sérac ;
   modification de livres ou autres documents si pertinent.
   Compromis : ces fonctions sont importantes pour la communauté, mais elles peuvent complexifier fortement l’interface mobile. Elles doivent donc venir après les usages terrain principaux.
   Lot 5 : amélioration continue
   Objectif : améliorer l’application à partir des retours utilisateurs et des données d’usage.
   Contenu :
   amélioration UX ;
   performance ;
   accessibilité ;
   réduction consommation batterie ;
   support ;
   analytics sobres ;
   nouvelles fonctionnalités ;
   éventuelles fonctions IA si leur utilité, coût et confidentialité sont maîtrisés.
6. Critères d’acceptation
   Le MVP pourra être considéré comme acceptable si les critères suivants sont remplis.
   Consultation offline
   Un utilisateur peut rechercher un itinéraire.
   Il peut l’enregistrer offline.
   Il peut fermer l’application.
   Il peut passer en mode avion.
   Il peut consulter l’itinéraire et les points de passage essentiels sans perte d’information critique.
   Création offline d’une sortie
   Un utilisateur peut démarrer une sortie sans réseau.
   Il peut enregistrer une trace GPS.
   Il peut ajouter des photos.
   Il peut renseigner les champs principaux.
   Il peut fermer puis rouvrir l’application sans perdre son brouillon.
   Il peut synchroniser la sortie lorsque le réseau revient.
   Synchronisation
   Les erreurs de synchronisation sont visibles.
   Les erreurs sont compréhensibles.
   L’utilisateur peut relancer une synchronisation.
   Les conflits sont signalés.
   Aucune donnée n’est perdue silencieusement.
   Maintenabilité
   Le code source est remis.
   L’architecture est documentée.
   Les dépendances sont listées.
   Les procédures de build sont documentées.
   Les procédures de publication sont documentées.
   Des tests automatisés existent.
   Camptocamp peut reprendre ou faire reprendre le développement.
   Gouvernance stores
   Les comptes App Store et Play Store sont sous contrôle Camptocamp.
   Les clés, certificats et accès sont documentés.
   Camptocamp peut publier une nouvelle version.
   Camptocamp peut mettre à jour la fiche de l’application.
   Camptocamp peut gérer les droits d’accès.
   Qualité terrain
   L’application fonctionne en réseau faible.
   L’application fonctionne en mode avion pour les contenus téléchargés.
   La consommation batterie est maîtrisée.
   La fréquence GPS est configurable.
   Les contenus offline peuvent être supprimés facilement.
   L’interface est lisible en extérieur.
7. Points complémentaires
   Certains sujets doivent être décidés avant lancement du développement ou pendant la phase de cadrage selon les couts /efforts vs potentiels bénéfices utilisateur/alignement aux pratiques c2c
   Choix technologique
   À arbitrer :
   Progressive Web App ;
   application native ;
   application hybride.
   Le choix doit être justifié au regard :
   du fonctionnement offline ;
   de la capture GPS ;
   de l’usage photo ;
   de la performance ;
   de la publication sur stores ;
   de la maintenabilité ;
   de la capacité de reprise par Camptocamp.
   Cartographie
   À préciser :
   coûts ;
   pays couverts ;
   téléchargement offline ;
   limites de stockage ;
   responsabilité sur les données affichées.
   Périmètre exact du MVP
   Alignement le plus possible avec interface Web actuelle,faisabilité à confirmer :
   documents inclus dans le premier lot ;
   niveau de détail des packs offline ;
   champs obligatoires d’une sortie ;
   niveau de synchronisation attendu ;
   place exacte des photos ;
   rôle des notifications.
   Modération
   Proposition à confirmer : limiter le MVP au signalement et à la cohérence avec les processus de modération existants.
   IA
   Les fonctions IA ne doivent pas être intégrées par défaut.
   Elles peuvent être étudiées ultérieurement si elles apportent une valeur claire, par exemple :
   aide à la saisie ;
   résumé de sortie ;
   suggestion de classement ;
   détection d’incohérences.
   Elles devront alors être cadrées en matière de coût, confidentialité, qualité et responsabilité.
