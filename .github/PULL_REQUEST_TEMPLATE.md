<!--
  Template de Pull Request — Syntheo Desktop
  Titre au format Conventional Commits ; au moins une issue référencée.
-->

# Pull Request

## Type de changement

- [ ] Bug fix (`fix:`)
- [ ] Nouvelle fonctionnalité (`feat:`)
- [ ] Refactoring (`refactor:`)
- [ ] Documentation (`docs:`)
- [ ] Maintenance / outillage (`chore:`)
- [ ] Performance (`perf:`)
- [ ] Tests (`test:`)
- [ ] CI (`ci:`)
- [ ] Build / dépendances (`build:`)
- [ ] Annulation d'un commit (`revert:`)
- [ ] **BREAKING CHANGE** (`<type>!:`)

## Issues liées

<!-- Obligatoire : au moins une ligne "Closes #..." ou "Related to #...". -->

- Closes #

## Impact semver attendu

<!--
  Garde-fou croisé : une divergence avec le titre émet une alerte (non bloquante) ;
  la release calcule la version depuis les commits de main.
-->

- [ ] **Patch** — `fix:` ou `perf:` (x.y.Z)
- [ ] **Minor** — `feat:` (x.Y.z)
- [ ] **Major** — breaking change, `<type>!:` (X.y.z)
- [ ] **Aucune release** — `docs:`, `chore:`, `refactor:`, `test:`, `ci:`, `build:`, `revert:`

## Preuves

```shell
# Tests
$ pnpm -F desktop test
$ cargo test --locked -p <crate>

# Lint
$ pnpm lint && cargo clippy -p <crate> -- -D warnings
```

## Réserves à lever (PR de lot)

<!--
  Obligatoire pour une PR de lot (fix/X.Y.Z, feat/X.Y.Z) : pas de merge sur main
  tant que chaque case n'est pas cochée ou reportée explicitement.
  Sans objet pour une PR hors application (CI, doc, outillage [skip release]).

  Alpha devtools du lot, suffixe de pré-version NUMÉRIQUE (MSI refuse 0.6.2-alpha.1) :
    gh workflow run build-devtools --ref <branche-de-lot> -f version=X.Y.Z-N
    gh run download <run> -R WillIsback/syntheo-desktop
  Traces : Linux ~/.local/share/fr.willisback.syntheo/logs/app.log
           Windows %LOCALAPPDATA%\fr.willisback.syntheo\logs\app.log
  Une case = plateforme (🐧 Linux, 🪟 Windows, 🍎 macOS), issue, signal attendu
  (ligne de log, mesure de la barre devtools, comportement visible).
  Un problème trouvé devient une issue ; un bloquant repart en sous-branche du
  lot, puis nouvelle alpha X.Y.Z-N+1. Report : laisser la case, ajouter
  « reporté : <raison> ».
-->

Alpha : `X.Y.Z-N` (run #)

**Lot**

- [ ] 🐧🪟 #N — signal attendu

**Reports des versions précédentes**

- [ ] 🪟 #N — signal attendu

## Règles Syntheo

- [ ] Aucun provider ni intégration cloud ajouté ; seuls les endpoints configurés par l'utilisateur sont contactés
- [ ] Aucune écriture d'audio sur disque
- [ ] Texte d'interface en français
- [ ] Code porté depuis Syntheo : révision citée ici et dans `NOTICE.md` (sinon : sans objet)

## Checklist

- [ ] Le titre de la PR suit **Conventional Commits**
- [ ] La documentation (`README.md`, `CONTRIBUTING.md`, `docs/`) est à jour
- [ ] Aucun secret, token ou information sensible n'est commité
- [ ] Migration SQLite : horodatée après la dernière migration existante, testée sur une base existante
- [ ] La procédure de rollback est décrite si nécessaire

## Notes pour le reviewer

- Périmètre de revue :
- Points de risque :
