#!/usr/bin/env bash
# Construit en local une alpha devtools Linux (AppImage non signée), avec les
# étapes du job Linux de .github/workflows/release.yml (Ubuntu 24.04). Les
# alphas se construisent uniquement en local : il n'y a plus de workflow
# d'alpha sur GitHub.
#
# Usage : bash scripts/build-alpha.sh [options] X.Y.Z-N [dossier-de-sortie]
#   X.Y.Z-N            version injectée dans le bundle, suffixe numérique
#                      obligatoire (ex. 0.7.1-1) : l'installeur MSI de Windows
#                      refuse les autres, on garde la même règle partout.
#   dossier-de-sortie  par défaut ~/syntheo-alpha/X.Y.Z-N ; l'AppImage, sa
#                      somme et SOURCE vont dans <dossier>/syntheo-devtools-linux/,
#                      comme l'artefact du workflow.
#
# Options :
#   --docker        construit dans l'image Ubuntu 24.04 de scripts/alpha/Dockerfile,
#                   identique au runner de la CI. Mode par défaut, sauf sur un
#                   hôte Ubuntu 24.04 dont le WebKitGTK est antérieur à 2.54.
#   --native        construit sur l'hôte, avec ses bibliothèques.
#   --from <source> dossier à construire (worktree, checkout) ou branche / ref
#                   git. Par défaut : le checkout qui contient ce script. Une
#                   branche est extraite dans un worktree réservé aux alphas
#                   (<cache>/worktree), réutilisé d'un build à l'autre.
#   --fast          saute `pnpm install` et le build de packages/ui quand leurs
#                   entrées n'ont pas changé depuis le dernier build de ce
#                   dossier (empreintes du lockfile, des package.json et des
#                   sources de packages/ui).
#   --quick         boucle de debug : profil release allégé (sans LTO, 16 unités
#                   de génération, compilation incrémentale) dans un target/
#                   séparé. Plus rapide après une modification Rust, mais pas
#                   fidèle à la release : à réserver au debug, jamais pour une
#                   alpha à valider. SOURCE l'indique.
#
# Mode Docker : l'image est construite au premier usage, puis à chaque
# changement du Dockerfile, des scripts d'installation, de rust-toolchain.toml,
# du Node de la CI ou de packageManager. Le build tourne avec l'UID courant.
# Caches persistants dans ${SYNTHEO_ALPHA_CACHE:-~/.cache/syntheo-alpha} :
# home/ (registre et git cargo, cache ort, linuxdeploy de tauri), target/<clé>
# (un par dossier source, réservé aux alphas, jamais partagé avec un build de
# l'hôte), target-quick/<clé> et worktree/.
# Le store pnpm de l'hôte est réutilisé quand il existe.
#
# Aucune clé de signature n'est lue : les variables de signature éventuelles
# sont retirées de l'environnement avant le build. Une alpha n'est jamais signée.
#
# WebKitGTK (mode natif) : l'AppImage embarque les bibliothèques de l'hôte.
# Le WebKitGTK d'Arch (2.54 et plus) plante au démarrage sous Wayland avec un
# GPU NVIDIA (« Error 71 (Erreur de protocole) dispatching to Wayland display »,
# rendu dmabuf, issue 555) : c'est pourquoi Docker est le mode par défaut.
#
# Essai de démarrage : en fin de build, si une session Wayland est ouverte, le
# script lance l'AppImage une vingtaine de secondes dans un profil jetable
# (ALPHA_SMOKE_TEST=0 pour sauter cet essai) ; en cas d'échec, code de sortie 3.
#
# Sous Arch (mode natif), si linuxdeploy échoue au moment de « strip » (section
# .relr.dyn inconnue), relancer avec NO_STRIP=true.
#
# Pour Windows, voir scripts/build-alpha.ps1 (VM Windows).

# shellcheck source=scripts/bash-guard.sh
. "$(dirname "$0")/bash-guard.sh"

set -euo pipefail

die() {
  echo "Erreur : $*" >&2
  exit 1
}

usage() {
  echo "Usage : bash scripts/build-alpha.sh [--docker|--native] [--from <dossier|branche>] [--fast] [--quick] X.Y.Z-N [dossier-de-sortie]" >&2
  exit 2
}

SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
MODE=""
FROM=""
FAST=false
QUICK=false
IN_CONTAINER=false
positional=()
while [ "$#" -gt 0 ]; do
  case "$1" in
    --docker) MODE=docker ;;
    --native) MODE=native ;;
    --from)
      [ "$#" -ge 2 ] || usage
      FROM=$2
      shift
      ;;
    --from=*) FROM=${1#--from=} ;;
    --fast) FAST=true ;;
    --quick) QUICK=true ;;
    --in-container) IN_CONTAINER=true ;;
    -h | --help) sed -n 2,50p "$0" >&2 && exit 0 ;;
    -*) usage ;;
    *) positional+=("$1") ;;
  esac
  shift
done
[ "${#positional[@]}" -ge 1 ] && [ "${#positional[@]}" -le 2 ] || usage

VERSION=${positional[0]#v}
if ! [[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+-[0-9]+$ ]]; then
  die "version « ${positional[0]} » invalide. Format attendu : X.Y.Z-N avec un suffixe numérique (ex. 0.7.1-1, pas 0.7.1-alpha.1)."
fi
OUT_BASE=${positional[1]:-"$HOME/syntheo-alpha/$VERSION"}
OUT="$OUT_BASE/syntheo-devtools-linux"
CACHE=${SYNTHEO_ALPHA_CACHE:-"$HOME/.cache/syntheo-alpha"}

# --- Étapes de build (hôte en mode natif, conteneur en mode Docker) ------------

# Empreinte d'un ensemble de fichiers, sans git (le conteneur n'a pas le dépôt
# git d'un worktree, seulement son arborescence).
fingerprint() {
  {
    find "$@" \( -name node_modules -o -name dist -o -name target \) -prune -o -type f -print0 2> /dev/null || true
  } | LC_ALL=C sort -z | xargs -0 -r sha256sum | sha256sum | cut -d' ' -f1
}

build_steps() {
  local root=$1 target_dir=$2
  local src_tauri="$root/apps/desktop/src-tauri"
  local conf="$src_tauri/tauri.conf.syntheo.json"
  cd "$root"

  unset TAURI_SIGNING_PRIVATE_KEY TAURI_SIGNING_PRIVATE_KEY_PASSWORD \
    AZURE_TENANT_ID AZURE_CLIENT_ID AZURE_CLIENT_SECRET \
    APPLE_CERTIFICATE APPLE_CERTIFICATE_PASSWORD APPLE_SIGNING_IDENTITY

  # Empreintes de --fast, rangées dans node_modules : un `pnpm install` neuf
  # les efface, ce qui force le build de packages/ui suivant.
  local install_key ui_key install_stamp="node_modules/.syntheo-alpha-install" ui_stamp="node_modules/.syntheo-alpha-ui"
  install_key=$(
    {
      node --version
      pnpm --version
      fingerprint pnpm-lock.yaml pnpm-workspace.yaml package.json apps/*/package.json packages/*/package.json plugins/*/package.json
    } | sha256sum | cut -d' ' -f1
  )
  local t0=$SECONDS
  if $FAST && [ -f "$install_stamp" ] && [ "$(cat "$install_stamp")" = "$install_key" ]; then
    echo "-- pnpm install sauté (--fast : lockfile et package.json inchangés)"
  else
    pnpm install --frozen-lockfile --config.confirmModulesPurge=false
    echo "$install_key" > "$install_stamp"
  fi
  echo "-- pnpm install : $((SECONDS - t0)) s"

  # Version injectée comme dans le workflow, puis configuration restaurée à
  # l'identique (y compris d'éventuelles modifications locales non commitées).
  CONF_BACKUP=$(mktemp)
  CONF_PATH=$conf
  cp "$conf" "$CONF_BACKUP"
  restore_conf() {
    cp "$CONF_BACKUP" "$CONF_PATH"
    rm -f "$CONF_BACKUP"
  }
  trap restore_conf EXIT
  jq --arg v "$VERSION" '.version = $v' "$CONF_BACKUP" > "$conf"

  local bundle_dir="$target_dir/release/bundle/appimage"
  # Une AppImage d'un build précédent ne doit pas être prise pour celle-ci.
  rm -rf "$bundle_dir"

  # linuxdeploy est une AppImage : sans FUSE 2, elle doit s'extraire pour tourner.
  export APPIMAGE_EXTRACT_AND_RUN=${APPIMAGE_EXTRACT_AND_RUN:-1}
  # Valeur factice exigée par des intégrations cloud héritées (chantier 04d).
  export VITE_API_URL=http://127.0.0.1:9
  export CARGO_TARGET_DIR=$target_dir
  if $QUICK; then
    export CARGO_PROFILE_RELEASE_LTO=false CARGO_PROFILE_RELEASE_CODEGEN_UNITS=16 CARGO_PROFILE_RELEASE_INCREMENTAL=true
    echo "-- profil rapide (--quick) : sans LTO, 16 unités de génération, incrémental"
  fi

  ui_key=$({
    echo "$install_key"
    fingerprint packages/ui
  } | sha256sum | cut -d' ' -f1)
  t0=$SECONDS
  if $FAST && [ -f "$ui_stamp" ] && [ "$(cat "$ui_stamp")" = "$ui_key" ] && [ -d packages/ui/dist ]; then
    echo "-- build de packages/ui sauté (--fast : sources inchangées)"
  else
    pnpm -F ui build
    echo "$ui_key" > "$ui_stamp"
  fi
  echo "-- packages/ui : $((SECONDS - t0)) s"

  t0=$SECONDS
  pnpm -F desktop tauri build --ci --bundles appimage --features devtools \
    --config ./src-tauri/tauri.conf.syntheo.json
  echo "-- tauri build : $((SECONDS - t0)) s"

  # Même réempaquetage que release.yml (bibliothèques hôte,
  # zstd 19, blocs de 1 Mio), pour que l'alpha soit fidèle à la release.
  t0=$SECONDS
  ARCH=x86_64 node scripts/repack-linux-appimage.mjs "$bundle_dir"
  echo "-- réempaquetage : $((SECONDS - t0)) s"
}

if $IN_CONTAINER; then
  # Appelé par le mode Docker : le dossier courant est la source, la cible et
  # les caches sont montés par l'hôte.
  build_steps "$PWD" "${CARGO_TARGET_DIR:?}"
  exit 0
fi

START=$SECONDS
[ "$(uname -s)" = "Linux" ] || die "ce script construit l'AppImage Linux ; sous Windows, utiliser scripts/build-alpha.ps1."
[ "$(uname -m)" = "x86_64" ] || die "architecture $(uname -m) non prise en charge (x86_64 uniquement, comme le workflow)."
command -v git > /dev/null || die "git introuvable."

# --- Source à construire --------------------------------------------------------

REPO=$(cd "$SCRIPT_DIR/.." && pwd)
SOURCE_LABEL=""
if [ -z "$FROM" ]; then
  ROOT=$REPO
elif [ -d "$FROM" ]; then
  ROOT=$(cd "$FROM" && pwd)
  [ -f "$ROOT/apps/desktop/src-tauri/tauri.conf.syntheo.json" ] || die "$ROOT n'est pas un checkout de Syntheo."
else
  # Branche ou ref : worktree réservé aux alphas, réutilisé pour garder
  # node_modules et les dates des fichiers (builds incrémentaux).
  git -C "$REPO" fetch -q origin 2> /dev/null || echo "Attention : fetch origin impossible, refs locales utilisées." >&2
  commit=$(git -C "$REPO" rev-parse -q --verify "origin/$FROM^{commit}" 2> /dev/null ||
    git -C "$REPO" rev-parse -q --verify "$FROM^{commit}" 2> /dev/null) || die "branche ou ref « $FROM » introuvable."
  ROOT="$CACHE/worktree"
  if [ -e "$ROOT/.git" ]; then
    git -C "$ROOT" checkout -q --detach --force "$commit"
  else
    mkdir -p "$CACHE"
    git -C "$REPO" worktree add -q --detach "$ROOT" "$commit"
  fi
  SOURCE_LABEL=$FROM
fi
cd "$ROOT"
if [ -z "$SOURCE_LABEL" ]; then
  SOURCE_LABEL=$(git rev-parse --abbrev-ref HEAD 2> /dev/null || echo "?")
  [ "$SOURCE_LABEL" = HEAD ] && SOURCE_LABEL="HEAD détachée"
fi

# --- Choix du mode ----------------------------------------------------------------

host_webkit=$(pkg-config --modversion webkit2gtk-4.1 2> /dev/null || echo 0)
webkit_at_least_254() { [ "$(printf '%s\n2.54\n' "$1" | sort -V | head -1)" = "2.54" ]; }
host_ubuntu_2404=false
if [ -r /etc/os-release ] && grep -qx 'ID=ubuntu' /etc/os-release && grep -qx 'VERSION_ID="24.04"' /etc/os-release; then
  host_ubuntu_2404=true
fi
if [ -z "$MODE" ]; then
  if $host_ubuntu_2404 && ! webkit_at_least_254 "$host_webkit"; then MODE=native; else MODE=docker; fi
fi

# --- Mode natif : vérifications de l'hôte ----------------------------------------

check_native_host() {
  local missing=() cmd mod
  for cmd in node pnpm cargo rustup jq pkg-config clang cmake patchelf file curl sha256sum; do
    command -v "$cmd" > /dev/null 2>&1 || missing+=("$cmd")
  done
  for mod in webkit2gtk-4.1 gtk+-3.0 libpipewire-0.3 libpulse alsa libudev openssl librsvg-2.0 ayatana-appindicator3-0.1; do
    pkg-config --exists "$mod" 2> /dev/null || missing+=("$mod (pkg-config)")
  done
  if [ "${#missing[@]}" -gt 0 ]; then
    echo "Dépendances manquantes :" >&2
    printf '  - %s\n' "${missing[@]}" >&2
    cat >&2 << 'EOF'

Installation :
  Debian/Ubuntu : bash scripts/setup-linux-tauri.sh && bash scripts/setup-linux-others.sh
  Arch/Omarchy  : sudo pacman -S --needed base-devel webkit2gtk-4.1 gtk3 libpipewire libpulse \
                    alsa-lib systemd-libs openssl librsvg libayatana-appindicator clang cmake \
                    patchelf file jq curl
  Rust          : https://rustup.rs (version fixée par rust-toolchain.toml)
  pnpm          : corepack enable (version fixée par packageManager dans package.json)
Ou, sans rien installer : bash scripts/build-alpha.sh --docker …
EOF
    exit 1
  fi

  # Node : même plage que `engines.node` de package.json (formes « ^X.Y.Z » et
  # « >=X.Y.Z » séparées par « || »). Sous la plus petite version majeure de la
  # plage, le build échoue ; ailleurs hors plage, simple avertissement, comme pnpm.
  local node_range node_check
  node_range=$(jq -r '.engines.node // ""' package.json)
  node_check=$(
    NODE_RANGE="$node_range" node -e '
      const range = process.env.NODE_RANGE;
      const parse = (v) => v.replace(/^v/, "").split(".").map(Number);
      const cmp = (a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
      const current = parse(process.version);
      const clauses = range.split("||").map((c) => c.trim()).filter(Boolean);
      const ok = clauses.some((clause) => {
        const m = clause.match(/^(\^|>=)\s*(\d+\.\d+\.\d+)$/);
        if (!m) return true; // forme inconnue : on ne bloque pas
        const min = parse(m[2]);
        if (cmp(current, min) < 0) return false;
        return m[1] === ">=" || current[0] === min[0];
      });
      const lowestMajor = Math.min(...clauses.map((c) => Number((c.match(/\d+/) || [Infinity])[0])));
      console.log(ok ? "ok" : current[0] < lowestMajor ? "too-old" : "outside");
    '
  )
  case "$node_check" in
    ok | "") ;;
    too-old) die "Node.js $(node -v) trop ancien : package.json demande « $node_range »." ;;
    *) echo "Attention : Node.js $(node -v) hors de la plage de package.json (« $node_range »)." >&2 ;;
  esac

  if webkit_at_least_254 "$host_webkit"; then
    echo "Attention : WebKitGTK $host_webkit sera embarqué. Sous Wayland avec un GPU NVIDIA, il plante" >&2
    echo "  au démarrage (Error 71, issue 555) : préférer --docker (Ubuntu 24.04, comme la CI)." >&2
  fi

  local expected_pnpm actual_pnpm
  expected_pnpm=$(jq -r '.packageManager // "" | sub("^pnpm@"; "")' package.json)
  actual_pnpm=$(pnpm --version)
  if [ -n "$expected_pnpm" ] && [ "$actual_pnpm" != "$expected_pnpm" ]; then
    echo "Attention : pnpm $actual_pnpm, le dépôt fixe pnpm $expected_pnpm (corepack enable)." >&2
  fi

  # Installe au besoin la toolchain de rust-toolchain.toml (rustup la lit dans le dépôt).
  rustup show active-toolchain > /dev/null || die "toolchain Rust de rust-toolchain.toml indisponible (rustup)."
}

# --- Mode Docker -------------------------------------------------------------------

# Image : versions lues dans la source construite, étiquette qui en dérive.
docker_image() {
  local rust_toolchain rust_components node_version pnpm_version context tag
  rust_toolchain=$(sed -n 's/^channel *= *"\(.*\)"/\1/p' rust-toolchain.toml)
  rust_components=$(sed -n 's/^components *= *\[\(.*\)\]/\1/p' rust-toolchain.toml | tr -d '" ')
  node_version=$(sed -n 's/.*node-version: *"\{0,1\}\([0-9.]*\)"\{0,1\}.*/\1/p' .github/actions/pnpm_install/action.yaml | head -1)
  node_version=${node_version:-22.23.4}
  pnpm_version=$(jq -r '.packageManager // "pnpm@11.1.1" | sub("^pnpm@"; "")' package.json)
  [ -n "$rust_toolchain" ] || die "canal Rust introuvable dans rust-toolchain.toml."
  context=$(mktemp -d)
  mkdir -p "$context/scripts"
  cp "$SCRIPT_DIR/alpha/Dockerfile" "$context/Dockerfile"
  cp scripts/bash-guard.sh scripts/setup-linux-tauri.sh scripts/setup-linux-others.sh "$context/scripts/"
  tag=$({
    cat "$context/Dockerfile" "$context"/scripts/*
    echo "$rust_toolchain $rust_components $node_version $pnpm_version"
  } | sha256sum | cut -c1-12)
  IMAGE="syntheo-alpha:$tag"
  if ! docker image inspect "$IMAGE" > /dev/null 2>&1; then
    echo "== Image $IMAGE (Rust $rust_toolchain, Node $node_version, pnpm $pnpm_version) : construction…"
    docker build -q -t "$IMAGE" \
      --build-arg RUST_TOOLCHAIN="$rust_toolchain" \
      --build-arg RUST_COMPONENTS="${rust_components:-clippy,rustfmt}" \
      --build-arg NODE_VERSION="$node_version" \
      --build-arg PNPM_VERSION="$pnpm_version" \
      "$context" > /dev/null
  fi
  rm -rf "$context"
}

run_in_docker() {
  command -v docker > /dev/null || die "docker introuvable (ou relancer avec --native)."
  docker info > /dev/null 2>&1 || die "le démon docker ne répond pas (groupe docker ? service lancé ?)."
  docker_image
  # Un target/ par dossier source : tauri-build garde des chemins absolus vers les
  # permissions des plugins, qu'un autre worktree ne doit pas réutiliser.
  local target_name source_key
  source_key=$(printf '%s' "$ROOT" | sha256sum | cut -c1-12)
  target_name="target/$source_key"
  $QUICK && target_name="target-quick/$source_key"
  mkdir -p "$CACHE/home" "$CACHE/$target_name"
  local store_args=() host_store tty_args=()
  # Store pnpm de l'hôte, au même chemin : pnpm ne purge pas node_modules en
  # changeant de store, et les paquets déjà téléchargés servent aux deux.
  host_store=$(pnpm store path 2> /dev/null || true)
  if [ -n "$host_store" ] && [ -d "$host_store" ]; then
    store_args=(-v "$host_store:$host_store" -e "npm_config_store_dir=$host_store")
  fi
  [ -t 1 ] && tty_args=(-t)
  # vergen (plugins/misc) lit le commit à la compilation : un worktree pointe vers
  # le dépôt git principal, monté lui aussi au même chemin.
  local git_args=() git_common
  git_common=$(git -C "$ROOT" rev-parse --path-format=absolute --git-common-dir 2> /dev/null || true)
  if [ -n "$git_common" ] && [[ "$git_common/" != "$ROOT/"* ]]; then
    git_args=(-v "$git_common:$git_common")
  fi
  local fast_arg=()
  $FAST && fast_arg+=(--fast)
  $QUICK && fast_arg+=(--quick)
  docker run --rm --init "${tty_args[@]}" \
    --user "$(id -u):$(id -g)" \
    -v "$ROOT:$ROOT" \
    -v "$SCRIPT_DIR:/opt/syntheo-alpha:ro" \
    -v "$CACHE/home:/cache/home" \
    -v "$CACHE/$target_name:/cache/target" \
    "${store_args[@]}" \
    "${git_args[@]}" \
    -e HOME=/cache/home \
    -e CARGO_HOME=/cache/home/.cargo \
    -e CARGO_TARGET_DIR=/cache/target \
    -e NO_STRIP="${NO_STRIP:-}" \
    -w "$ROOT" \
    "$IMAGE" \
    bash /opt/syntheo-alpha/build-alpha.sh --in-container "${fast_arg[@]}" "$VERSION"
  BUNDLE_DIR="$CACHE/$target_name/release/bundle/appimage"
  EMBEDDED_WEBKIT=$(docker run --rm "$IMAGE" pkg-config --modversion webkit2gtk-4.1 2> /dev/null || echo "?")
}

# --- Build ---------------------------------------------------------------------------

echo "== Alpha devtools Linux $VERSION ($(git rev-parse --short HEAD), $SOURCE_LABEL), mode $MODE, source $ROOT"

if [ "$MODE" = docker ]; then
  run_in_docker
else
  check_native_host
  # Dossier de bundle : CARGO_TARGET_DIR s'il est défini, sinon le target-dir de
  # apps/desktop/src-tauri/.cargo/config.toml.
  TARGET_DIR=${CARGO_TARGET_DIR:-"$ROOT/apps/desktop/src-tauri/target"}
  $QUICK && TARGET_DIR="$TARGET_DIR-quick"
  case "$TARGET_DIR" in
    /*) ;;
    *) TARGET_DIR="$ROOT/$TARGET_DIR" ;;
  esac
  (build_steps "$ROOT" "$TARGET_DIR")
  BUNDLE_DIR="$TARGET_DIR/release/bundle/appimage"
  EMBEDDED_WEBKIT=$host_webkit
fi

# --- Sortie ------------------------------------------------------------------------

shopt -s nullglob
found=("$BUNDLE_DIR"/*.AppImage)
shopt -u nullglob
[ "${#found[@]}" -eq 1 ] || die "${#found[@]} AppImage trouvée(s) dans $BUNDLE_DIR (une seule attendue)."

mkdir -p "$OUT"
NAME="Syntheo-$VERSION-devtools-linux-x86_64.AppImage"
cp "${found[0]}" "$OUT/$NAME"
chmod +x "$OUT/$NAME"
(cd "$OUT" && sha256sum "./$NAME" > SHA256SUMS-devtools-linux)
dirty=""
git diff --quiet HEAD 2> /dev/null || dirty=" (modifications locales non commitées)"
profile_label="profil release"
$QUICK && profile_label="profil rapide --quick, non fidèle à la release"
printf 'build local (%s, WebKitGTK %s, %s)\ncommit %s%s\nbranche %s\ndate %s\n' \
  "$MODE" "$EMBEDDED_WEBKIT" "$profile_label" "$(git rev-parse HEAD)" "$dirty" "$SOURCE_LABEL" "$(date -Iseconds)" > "$OUT/SOURCE"

echo
echo "Alpha devtools Linux $VERSION (non signée, $MODE, $((SECONDS - START)) s) : $OUT/$NAME"
cat "$OUT/SHA256SUMS-devtools-linux"

# --- Essai de démarrage sous Wayland (issue 555) ------------------------------
# Profil jetable (HOME et XDG temporaires) et bus D-Bus de session séparé : ni
# le profil, ni la base, ni l'instance en cours de l'utilisateur ne sont
# touchés. La fenêtre de l'app s'affiche une vingtaine de secondes.

smoke_test_wayland() {
  local appimage=$1 profile log session_pid elapsed=0 verdict=""
  profile=$(mktemp -d)
  log="$profile/app.log"
  mkdir -p "$profile"/{.config,.local/share,.cache}
  (
    export HOME="$profile" XDG_CONFIG_HOME="$profile/.config" \
      XDG_DATA_HOME="$profile/.local/share" XDG_CACHE_HOME="$profile/.cache" GDK_BACKEND=wayland
    exec dbus-run-session -- "$appimage"
  ) > "$log" 2>&1 &
  session_pid=$!
  while [ "$elapsed" -lt 20 ]; do
    sleep 1
    elapsed=$((elapsed + 1))
    if grep -q "Error 71" "$log"; then
      verdict="error71"
      break
    fi
    kill -0 "$session_pid" 2> /dev/null || {
      verdict="exited"
      break
    }
  done
  # Arrêt de toute l'arborescence lancée par l'essai, par PID.
  descendants() {
    local pid=$1 child
    for child in $(pgrep -P "$pid" 2> /dev/null); do
      descendants "$child"
      echo "$child"
    done
  }
  local pids
  pids="$(descendants "$session_pid") $session_pid"
  # shellcheck disable=SC2086
  kill -TERM $pids 2> /dev/null || true
  sleep 2
  # shellcheck disable=SC2086
  kill -KILL $pids 2> /dev/null || true
  wait "$session_pid" 2> /dev/null || true
  case "$verdict" in
    "")
      echo "Essai Wayland : l'AppImage a tenu 20 s sans erreur."
      rm -rf "$profile"
      ;;
    error71)
      echo "Essai Wayland : ÉCHEC, « Error 71 » au démarrage (WebKitGTK $EMBEDDED_WEBKIT embarqué, issue 555)." >&2
      echo "  Cette AppImage ne démarre pas sous Wayland sur cette machine : construire avec --docker." >&2
      echo "  Journal : $log" >&2
      return 1
      ;;
    exited)
      echo "Essai Wayland : ÉCHEC, l'AppImage s'est arrêtée au démarrage. Journal : $log" >&2
      return 1
      ;;
  esac
}

if [ -n "${WAYLAND_DISPLAY:-}" ] && [ "${ALPHA_SMOKE_TEST:-1}" != 0 ]; then
  echo
  echo "Essai de démarrage sous Wayland (profil jetable, 20 s ; ALPHA_SMOKE_TEST=0 pour sauter)…"
  smoke_test_wayland "$OUT/$NAME" || exit 3
fi
