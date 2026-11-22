# Agrégation des exports de mesure de la bêta

Outil local, sans réseau ni dépendance, qui agrège un dossier d'exports de
mesure (`crates/mesure/schema/export-v1.json`) en une synthèse lisible : reprise
de fond par testeur, verdict selon les seuils pré-enregistrés, taux d'abandon,
garde-fou des sections Décisions et Actions, effet du dictionnaire avec groupe
témoin.

## Usage

```sh
node scripts/beta/agregation.mjs <dossier-exports>                 # rapport Markdown sur la sortie standard
node scripts/beta/agregation.mjs <dossier-exports> --out <sortie>  # rapport.md, rapport.json, testeurs.csv
node --test scripts/beta/                                          # tests (exports synthétiques)
```

Seuls les fichiers `*.json` placés directement dans le dossier sont lus. Le code
de sortie vaut 0 même si des fichiers sont refusés ; 2 en cas d'usage incorrect.

## Seuils

Les seuils sont la constante `SEUILS` de `agregation.mjs` (version 1, du
2026-11-21), figée et reprise dans chaque rapport avec la version du schéma, de
la règle de calcul et de l'outil. Aucune option ni configuration ne les modifie
: tout changement passe par un commit qui incrémente `SEUILS.version` et date sa
raison.

## Ce que l'outil refuse

Chaque export est traité comme une donnée non fiable. Un fichier refusé est
listé avec une raison fixe, sans rien recopier de son contenu, et n'empêche pas
l'agrégation des autres :

- fichier qui n'est pas un fichier ordinaire (dossier, lien symbolique, tube
  nommé, périphérique, socket), écarté avant toute ouverture ;
- fichier de plus de 2 Mio (contrôlé avant lecture, puis pendant la lecture) ;
- UTF-8 ou JSON invalide ;
- export hors schéma : objet avec un champ en trop, chaîne hors motif ou hors
  liste fermée, nombre hors bornes, tableau trop long ; seul le mot-clé du
  schéma en cause est indiqué ;
- export incohérent : identifiant de réunion, de synthèse, de terme ou de
  section en double, référence à une réunion ou synthèse absente, synthèse
  mesurée deux fois ou réunion sur une synthèse non mesurée, jour postérieur à
  l'export ou antérieur à la génération, réunions hors ordre chronologique,
  titres retrouvés plus nombreux que les titres générés, total différent de la
  somme des sections, réunion sans mot généré qui aurait des mots supprimés ou
  remplacés, terme avec plus d'erreurs dans une réunion que celle-ci n'a de
  mots remplacés en correction lexicale (`replaced_lexical`) ;
- au-delà de 1 000 fichiers.

Un nom de fichier n'est recopié dans le rapport que s'il est fait de lettres
ASCII, chiffres, `.`, `_` et `-` (et commence par une lettre ou un chiffre) ;
sinon il est désigné par son rang. Le CSV préfixe d'une apostrophe toute
cellule qui commencerait par `=`, `+`, `-` ou `@`. Les valeurs comparées à
un seuil (médiane de fond, ajouts par section, abandon) sont affichées avec
assez de décimales pour que l'arrondi tombe du même côté du seuil que la
valeur exacte, sur laquelle le verdict est calculé. L'outil ne produit pas de
HTML.

## Choix d'interprétation (version 1)

- **Même pseudonyme dans plusieurs fichiers** : l'export au plus grand
  `enrolled_days` (le plus récent) est retenu, les autres sont refusés ; deux
  exports différents au même `enrolled_days` sont refusés tous les deux ; une
  copie identique compte pour un.
- **Réunion mesurée** : réunion de l'export avec au moins un mot généré (`G` >
  0) ; les autres sont ignorées.
- **Testeur non qualifié** (moins de 5 réunions mesurées) : « insuffisant »,
  sans aucun chiffre de reprise ni d'abandon, y compris dans le JSON.
- **Abandon** : synthèse sans `measured`, `exported` (export de fichier) ni
  `shared` (copie dans le presse-papiers ou webhook) au plus tard le 7e jour
  après `generated_day`. Une synthèse générée moins de 7 jours avant l'export
  (`generated_day + 7 > enrolled_days`) sort du dénominateur : sa fenêtre n'est
  pas close. Le critère de succès porte sur la médiane des taux d'abandon des
  testeurs qualifiés ; sans aucune synthèse éligible, il n'est pas rempli.
- **Succès** : médiane de fond ≤ 100 ‰ chez au moins deux tiers des testeurs
  qualifiés et abandon médian ≤ 20 %. **Échec net** : médiane > 250 ‰ chez plus
  de la moitié des testeurs qualifiés. **Zone grise** : le reste. Sous 5
  testeurs qualifiés, aucun verdict.
- **Garde-fou des sections** : pour chaque testeur qualifié et chaque rôle
  (`decisions`, `actions`), médiane sur ses réunions de `A / G × 1000` des
  sections de ce rôle ; signalé si l'un des deux dépasse 50 ‰ chez au moins un
  tiers des testeurs. Ce tiers se calcule sur les testeurs pour qui le
  garde-fou est calculable (au moins une section de ce rôle) ; le rapport
  affiche « garde-fou non calculable pour N testeurs ».
- **Effet du dictionnaire** : l'ordre des réunions est celui du tableau
  `meetings`, réunions sans mot généré exclues : elles ne comptent pas dans
  les fenêtres, et un ajout désigné par l'une d'elles se rapporte à la
  dernière réunion mesurée qui la précède. Un terme entre à la réunion où ses erreurs cumulées atteignent 2.
  Il est **traité** si `added_after` désigne la réunion d'entrée ou l'une des 2
  suivantes, **témoin** s'il n'est pas ajouté ou l'est plus tard, exclu s'il a
  été ajouté avant son entrée. La réunion d'entrée n'appartient à aucune
  fenêtre : avant = les 5 réunions qui la précèdent, après = les 5 qui la
  suivent, au moins 3 de chaque côté ; taux = erreurs / mots générés × 1000 sur
  la fenêtre. Tous les testeurs retenus contribuent, qualifiés ou non.
  Intervalle à 95 % par bootstrap des testeurs (2 000 tirages, graine
  20261121, percentiles). Sans 20 traités et 20 témoins : « insuffisant : il
  manque N termes » ; termes suffisants mais moins de 3 testeurs : «
  insuffisant : il manque N testeurs ».
