# Contribuer à Syntheo Desktop

## Règles du projet

1. **Inférence on-premise uniquement** : pas de provider cloud, pas
   d'intégration cloud (agenda, messagerie, CRM…), pas de télémétrie.
2. **Aucun audio sur disque**, même temporairement.
3. **Texte d'interface en français d'abord.**
4. Pas de code issu de `enterprise/` d'Syntheo (licence commerciale).
   Un correctif porté depuis Syntheo (MIT) est signalé dans la PR et dans
   [NOTICE.md](NOTICE.md).

## Flux de travail

- Une **issue** par changement (modèles dans `.github/ISSUE_TEMPLATE`).
- Une branche par issue, puis une PR vers `main` en suivant le
  [modèle de PR](.github/PULL_REQUEST_TEMPLATE.md).
- **Titre de PR et commits au format Conventional Commits** :
  `feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `perf`, `ci`, `build`,
  `revert`, avec `!` pour un breaking change.
- Le corps de la PR référence l'issue : `Closes #N` ou `Related to #N`.
- Seuls `feat` (minor), `fix`/`perf` (patch) et `!` (major) déclenchent une
  release.

## Gates de CI

Sur chaque PR (rapides, bloquantes) :

| Workflow          | Vérifie                                                                                                                                                                                                          |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ci-code-quality` | dprint (TS, Rust, YAML, TOML, Markdown), oxlint (desktop), ESLint (fichiers modifiés), `tsc`, `cargo clippy` (non bloquant, #3), titre de PR, actionlint, zizmor, lockfiles                                      |
| `ci-security`     | Dependency Review, `cargo deny`, Trivy, Gitleaks, registre d'exceptions                                                                                                                                          |
| `ci-codeql`       | CodeQL `security-extended` TypeScript, si la PR modifie du TS/JS                                                                                                                                                 |
| `ci-test`         | Vitest (desktop), `cargo test` des crates des chantiers, tests des scripts (`node --test`), compétence publiée à jour (`publish-syntheo-skill.mjs --check`), yamllint ; couverture différentielle ≥ 90 % à venir |
| `ci-traceability` | issue référencée, type de PR, cohérence semver                                                                                                                                                                   |

Gates lourdes, hors PR :

| Workflow                    | Quand                           | Vérifie                                                                                |
| --------------------------- | ------------------------------- | -------------------------------------------------------------------------------------- |
| `release`                   | push sur `main` (feat/fix/perf) | CodeQL Rust et TypeScript (gate), build des paquets, SBOM, attestation, GitHub Release |
| `ci-codeql`                 | hebdomadaire, à la demande      | analyse complète TypeScript + Rust                                                     |
| `ci-install`                | hebdomadaire, à la demande      | le bloc « Construire depuis les sources › Linux » rejoué sur un runner vierge          |
| `functional-gb10` (Forgejo) | push sur `main`, à la demande   | moteurs d'inférence réels du GB10                                                      |

### Dépendances (Dependabot)

Dependabot ouvre chaque semaine des PR groupées (npm, cargo, actions). Elles sont
fusionnées automatiquement (squash) dès que les gates de PR requises par la règle
de la branche `main` sont au vert ; une PR en échec reste ouverte et doit être
corrigée à la main. `ci-traceability` ne s'applique pas à Dependabot.

## Construire depuis les sources

Prérequis communs : Node.js ≥ 22.23 et [rustup](https://rustup.rs) (la version
de Rust est fixée par `rust-toolchain.toml`). Les dépendances système de Tauri
par OS sont décrites dans les
[prérequis Tauri](https://v2.tauri.app/start/prerequisites/).

### Linux

Ce bloc (Debian/Ubuntu), exécuté tel quel depuis un dossier vide, installe les
dépendances, construit le paquet `.deb` et vérifie que l'application démarre.
Il est rejoué à l'identique par `ci-install` (hebdomadaire et à la demande).

```bash
git clone https://github.com/WillIsback/Syntheo.git
cd Syntheo
bash scripts/setup-linux-tauri.sh
bash scripts/setup-linux-others.sh
sudo apt-get install -y xvfb
npm install -g pnpm@11.1.1
pnpm install --frozen-lockfile
pnpm -F ui build
VITE_API_URL=http://127.0.0.1:9 pnpm -F desktop tauri build --ci --bundles deb --config ./src-tauri/tauri.conf.syntheo.json
ls apps/desktop/src-tauri/target/release/bundle/deb/*.deb
# Vérification : l'application doit tenir 30 s sans planter (124 = arrêtée par timeout).
status=0; timeout 30 xvfb-run -a apps/desktop/src-tauri/target/release/syntheo || status=$?; [ "$status" -eq 124 ]
```

`VITE_API_URL` est une valeur factice exigée à la compilation par des
intégrations cloud héritées ; elle disparaît avec le chantier 04d du plan.

## Construire une alpha en local

Une alpha est la variante `devtools` d'un lot (inspecteur, barre de diagnostic,
logs détaillés), construite avant de fusionner la PR du lot pour tester en
conditions réelles. Elle est **toujours non signée** : la signature Windows
(quota Azure limité) est réservée à la release, et `build-windows.yml` la
refuse pour tout build avec `features` non vide.

La voie préférée est le build local ; le workflow `build-devtools` reste en
secours (`gh workflow run build-devtools --ref <branche-de-lot> -f version=X.Y.Z-N`).
La version a un suffixe **numérique** (`0.7.1-1`, pas `0.7.1-alpha.1`) :
l'installeur MSI de Windows refuse les autres, et les scripts le contrôlent.

### Linux (AppImage)

Depuis la branche du lot, sur une machine Linux x86_64 avec les dépendances de
Tauri (le script les vérifie et indique la commande d'installation pour
Debian/Ubuntu et Arch) :

```bash
bash scripts/build-alpha.sh 0.7.1-1            # sortie : ~/syntheo-alpha/0.7.1-1/
bash scripts/build-alpha.sh 0.7.1-1 /tmp/alpha # autre dossier de sortie
```

Le script reprend les étapes du job Linux de `build-devtools.yml` : version
injectée dans `tauri.conf.syntheo.json` (restauré ensuite), `pnpm -F ui build`,
`tauri build --bundles appimage --features devtools`, puis réempaquetage par
`scripts/repack-linux-appimage.mjs`. Il dépose
`syntheo-devtools-linux/Syntheo-X.Y.Z-N-devtools-linux-x86_64.AppImage`, sa
somme `SHA256SUMS-devtools-linux` et un fichier `SOURCE` (commit, branche, date).
Aucune clé de signature n'est lue.

L'AppImage embarque les bibliothèques de la machine de build : construite sur
une distribution récente (Arch), elle vise les distributions aussi récentes.
Pour vérifier la compatibilité avec les autres, passer par le workflow
(Ubuntu 24.04). Sous Arch, si linuxdeploy échoue sur `strip`, relancer avec
`NO_STRIP=true`.

### Windows (NSIS + MSI)

À faire dans une VM Windows 11. `scripts/build-alpha.ps1` reprend les étapes de
`build-windows.yml` sans la signature. **Il n'a pas encore été testé en
conditions réelles** : la première exécution sert de validation.

Toolchain, une fois, dans un PowerShell administrateur :

```powershell
winget install Microsoft.VisualStudio.2022.BuildTools --override "--wait --passive --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"
winget install Rustlang.Rustup LLVM.LLVM StrawberryPerl.StrawberryPerl Kitware.CMake Git.Git OpenJS.NodeJS.LTS
corepack enable
```

- Visual Studio Build Tools 2022, charge « Développement Desktop en C++ »
  (MSVC v143, SDK Windows) : compilateur, éditeur de liens, runtime Visual C++
  embarqué et `dumpbin`.
- Rust par rustup : la version de `rust-toolchain.toml` s'installe au premier build.
- Node.js 22 ou plus et pnpm (version de `packageManager`, via corepack).
- LLVM (libclang pour bindgen), Strawberry Perl (OpenSSL compilé depuis les
  sources), CMake.
- WebView2 : présent par défaut sous Windows 11, sinon
  `winget install Microsoft.EdgeWebView2Runtime`.

Puis, dans un nouveau terminal, depuis la racine du dépôt :

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\build-alpha.ps1 -Version 0.7.1-1
```

Les installeurs, `SHA256SUMS-windows` et `SOURCE` vont dans
`$HOME\syntheo-alpha\0.7.1-1\syntheo-devtools-windows\` (`-OutDir` pour changer).

## Lancer en développement

`pnpm dev` (alias `pnpm dev:desktop`) lance l'application en mode
développement. Il passe par `scripts/dev.mjs`, qui démarre
[process-compose](https://github.com/F1bonacc1/process-compose) avec
`process-compose.yaml` et deux processus :

1. `ui-build` construit les styles partagés de `@syntheo/ui`
   (`turbo run build --filter=@syntheo/ui`). Cette étape est indispensable :
   sans elle, l'interface démarre sans ses styles.
2. `desktop` lance `pnpm -F @syntheo/desktop tauri:dev` (Tauri avec la feature
   `dev` et le serveur Vite), une fois `ui-build` terminé avec succès.

process-compose doit être installé : `bash scripts/setup-devtools.sh` l'installe
sous Linux (version fixée, somme de contrôle vérifiée), sinon
`brew install process-compose` ou un binaire des
[releases](https://github.com/F1bonacc1/process-compose/releases).

- Les journaux de chaque processus vont dans `.process-compose/desktop/`
  (`PC_LOG_DIR` pour changer de dossier).
- L'API de process-compose écoute sur le port 18081 (`PC_PORT_NUM`).
- Sans terminal interactif, l'interface TUI est désactivée
  (`PC_DISABLE_TUI=1`).
- Les arguments après `--` sont transmis à process-compose, par exemple
  `pnpm dev -- --tui=false`.

Sans process-compose, l'équivalent manuel est :

```bash
pnpm exec turbo run build --filter=@syntheo/ui
pnpm -F @syntheo/desktop tauri:dev
```

## Vérifications locales

```bash
pnpm install --frozen-lockfile
pnpm fmt:check && pnpm lint && pnpm -F desktop typecheck
pnpm -F ui build && pnpm -F desktop test
pnpm exec dprint check $(git diff --name-only main)
cargo test --locked -p template-app -p db-app
```

## Exceptions de sécurité

Une alerte acceptée temporairement est inscrite dans
`.github/security-exceptions.yml` avec une justification, un auteur et une date
d'expiration. Une exception expirée fait échouer la CI.
