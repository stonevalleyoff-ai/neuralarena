# Neural Arena

Dresse un cerveau de neurones, puis lâche-le dans l'arène : des duels d'automates au lance-traits.

Le jeu : https://stonevalleyoff-ai.github.io/neuralarena/ (une fois GitHub Pages activé sur ce dépôt). Il est au catalogue du portail StoneValley.

Des pages statiques, sans dépendance ni étape de construction : ce qui est dans le dépôt est ce qui est servi. Une reprise, à neuf, du jeu de `shinjiebi.github.io/neuralarena/` : l'idée est gardée (des duels en plateformes dans des arènes qui rebouclent, des cerveaux qu'on entraîne, un classement), tout le reste est refait.

**Le jeu.** Deux à quatre automates, un lance-traits chacun, trois touches et c'est fini. On court, on saute (contre un mur aussi), on traverse les passerelles, et la **ruée** est un bond bref qui traverse les traits. Le carquois tient trois traits et se recharge seul. Quatre arènes symétriques, et quatre aléas à cocher : vent, mines, lune (pesanteur de moitié), mort subite.

**Les cerveaux.** Un petit réseau (31 entrées → 20 → 14 → 10 sorties, 1 084 poids), dont quatre sorties reviennent en entrée : sa mémoire. Il voit le monde « face à sa cible », donc ce qu'il apprend d'un côté vaut de l'autre, et il ne règle pas un angle absolu mais un écart à la ligne droite vers la cible : il n'a qu'à apprendre à compenser la chute du trait et le mouvement de l'autre.

**Le dressage.** Une stratégie d'évolution, dans un worker : à chaque génération, vingt variantes du cerveau (par paires opposées) jouent les mêmes huit manches contre un automate d'atelier, et le cerveau se déplace vers la moyenne pondérée des cinq meilleures. Quatre automates, de Rouille à Zénith ; en « Auto », le cerveau monte d'un niveau dès qu'il gagne sept manches sur dix. Quatre accents (équilibré, précision, esquive, assaut) déplacent ce qui est récompensé. Une génération prend environ une seconde.

**La ligue.** Au choix, une manche sur deux se joue contre d'autres cerveaux : les versions passées de l'élève (une toutes les huit générations, les six dernières), les autres cerveaux du joueur, ses invités et les cinq meilleurs publiés. C'est environ deux fois plus lent. Sur un essai de 240 générations parti du même cerveau, celui dressé en ligue a battu celui dressé contre les seuls automates 172 à 96 en face à face (32 nuls), en restant un peu en retrait contre l'automate de niveau 3 (0,35 contre 0,47). Un seul essai : une tendance, pas une mesure.

| fichier | rôle |
| --- | --- |
| `sim.js` | **le cœur** : arènes, physique, traits, aléas, réseau, pilotes, dresseur. Sans DOM : il tourne dans la page, dans le worker et sous Node |
| `train-worker.js` | le worker qui couve et qui dresse |
| `rendu.js` | le dessin d'une manche dans un canevas |
| `compte.js` | le compte StoneValley (la session commune du site) et les appels à la base |
| `app.js` | les écrans, le combat, le stockage local, la synchronisation |
| `supabase.sql` | la table des cerveaux et ses cinq fonctions (déjà passé sur « Vallée de pierre ») |
| `manifest.webmanifest`, `sw.js`, `icones/` | l'application installable : son nom, ses icônes, et le service worker qui garde le jeu pour l'ouvrir sans réseau |

### Le compte et les cerveaux en ligne

Le compte est celui du portail : le projet Supabase « Vallée de pierre ». La session suit la règle commune (`stonevalley:session`, relue avant tout renouvellement) : servi à la même adresse que le portail, le jeu partage sa connexion. On se connecte dans le jeu ; créer un compte ou changer de mot de passe se fait sur le portail.

Sans compte, tout marche : les cerveaux restent dans le navigateur (`neuralarena:v1`). Connecté, ils sont aussi gardés en ligne, douze au plus par compte, et suivent d'un appareil à l'autre. Un cerveau **publié** paraît au classement de la communauté ; n'importe qui peut alors l'affronter ou l'adopter.

Côté base, tout est dans `supabase.sql`, préfixé `na_` : une table fermée (`na_cerveaux`) et cinq fonctions (`na_mes_cerveaux`, `na_garder`, `na_oublier`, `na_classement`, `na_prendre`). Un compte supprimé emporte ses cerveaux.

À savoir :
- le dressage se fait dans le navigateur, donc le classement est celui que le jeu déclare. Pour un prototype, c'est assez ; pour un vrai classement, il faudrait rejouer les manches côté serveur.
- le portail rend les cerveaux dans le téléchargement des données du compte (par `na_mes_cerveaux`, et par `sv_mes_donnees` quand son `supabase.sql` sera passé).

### Travailler sur sa machine

```
node outils/essai.js            # les essais du cœur : cartes, automates, rejouabilité, et un dressage court
python3 -m http.server 8000     # le jeu, sur http://127.0.0.1:8000/
node outils/faux-service.js     # un faux service de comptes (essai@exemple.fr / motdepasse)
python3 outils/page-unique.py sortie.html   # tout le jeu en un seul fichier, pour le partager sans hébergement
```

Avec le faux service : `http://127.0.0.1:8000/?service=http://127.0.0.1:8787` (l'adresse du service n'est acceptée que sur sa propre machine).

### L'application

Le jeu est une application web installable (PWA) :
- **sur Android** (Chrome) : le menu ⋮ › « Installer l'application », ou le bouton ⤓ de l'en-tête quand le navigateur le propose ;
- **sur iPhone et iPad** (Safari) : le bouton Partager › « Sur l'écran d'accueil » ;
- **sur un ordinateur** (Chrome, Edge) : l'icône d'installation dans la barre d'adresse, ou le bouton ⤓.

Installée, elle s'ouvre en plein écran et se joue **sans réseau** : le combat, le dressage, les cerveaux. Le compte et le classement demandent le réseau.

- Le service worker sert le réseau d'abord, la copie gardée sinon : une nouvelle version se voit dès qu'on est en ligne. Si la liste des fichiers du jeu change, la mettre à jour dans `sw.js` (`SOCLE`) et changer le nom du `CACHE`.
- **L'icône** (`icones/icone.svg`) : l'automate corail du jeu. Les fichiers PNG en sont tirés (192, 512, une version plein cadre qu'Android découpe lui-même, et celle de l'iPhone) : si le dessin change, il faut les refaire aux mêmes tailles.

### Ce qui n'y est pas encore

Pas de deuxième joueur humain sur le même écran, pas de manette.
