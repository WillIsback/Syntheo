#!/usr/bin/env bash
# Construit en local une alpha devtools Linux (AppImage non signée), comme le
# job « linux » de .github/workflows/build-devtools.yml, qui reste en secours.
#
# Usage : bash scripts/build-alpha.sh X.Y.Z-N [dossier-de-sortie]
#   X.Y.Z-N            version injectée dans le bundle, suffixe numérique
#                      obligatoire (ex. 0.7.1-1) : l'installeur MSI de Windows
#                      refuse les autres, on garde la même règle partout.
#   dossier-de-sortie  par défaut ~/syntheo-alpha/X.Y.Z-N ; l'AppImage et sa
#                      somme vont dans <dossier>/syntheo-devtools-linux/, comme
#                      l'artefact du workflow.
#
# Aucune clé de signature n'est lue : les variables de signature éventuelles
# sont retirées de l'environnement avant le build. Une alpha n'est jamais signée.
#
# L'AppImage embarque les bibliothèques de la machine de build : construite sur
# une distribution récente (Arch/Omarchy), elle vise cette machine et les
# distributions aussi récentes. Pour tester la compatibilité avec les autres
# distributions, utiliser le workflow build-devtools (Ubuntu 24.04).
#
# WebKitGTK : l'AppImage locale embarque le WebKitGTK de la machine. Celui
# d'Arch (2.54 et plus) plante au démarrage sous Wayland avec un GPU NVIDIA
# (« Error 71 (Erreur de protocole) dispatching to Wayland display », rendu
# dmabuf, issue 555). Pour une alpha à tester sous Wayland, passer par le
# workflow build-devtools (Ubuntu 24.04, WebKitGTK plus ancien). En fin de
# build, si une session Wayland est ouverte, le script lance l'AppImage une
# vingtaine de secondes dans un profil jetable pour le vérifier
# (ALPHA_SMOKE_TEST=0 pour sauter cet essai).
#
# Sous Arch, si linuxdeploy échoue au moment de « strip » (section .relr.dyn
# inconnue), relancer avec NO_STRIP=true.
#
# Pour Windows, voir scripts/build-alpha.ps1 (VM Windows).

# shellcheck source=scripts/bash-guard.sh
. "$(dirname "$0")/bash-guard.sh"

set -euo pipefail

die() {
  echo "Erreur : $*" >&2
  exit 1
}

if [ "$#" -lt 1 ] || [ "$#" -gt 2 ]; then
  echo "Usage : bash scripts/build-alpha.sh X.Y.Z-N [dossier-de-sortie]" >&2
  exit 2
fi

VERSION=${1#v}
if ! [[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+-[0-9]+$ ]]; then
  die "version « $1 » invalide. Format attendu : X.Y.Z-N avec un suffixe numérique (ex. 0.7.1-1, pas 0.7.1-alpha.1)."
fi

ROOT=$(cd "$(dirname "$0")/.." && pwd)
OUT_BASE=${2:-"$HOME/syntheo-alpha/$VERSION"}
OUT="$OUT_BASE/syntheo-devtools-linux"
SRC_TAURI="$ROOT/apps/desktop/src-tauri"
CONF="$SRC_TAURI/tauri.conf.syntheo.json"
cd "$ROOT"

# --- Vérifications préalables -------------------------------------------------

[ "$(uname -s)" = "Linux" ] || die "ce script construit l'AppImage Linux ; sous Windows, utiliser scripts/build-alpha.ps1."
[ "$(uname -m)" = "x86_64" ] || die "architecture $(uname -m) non prise en charge (x86_64 uniquement, comme le workflow)."

missing=()
for cmd in git node pnpm cargo rustup jq pkg-config clang cmake patchelf file curl sha256sum; do
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
EOF
  exit 1
fi

# Node : même plage que `engines.node` de package.json (formes « ^X.Y.Z » et
# « >=X.Y.Z » séparées par « || »). Sous la plus petite version majeure de la
# plage, le build échoue ; ailleurs hors plage, simple avertissement, comme pnpm.
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

# WebKitGTK embarqué : avertir avant de lancer un build de plusieurs minutes.
webkit_version=$(pkg-config --modversion webkit2gtk-4.1 2> /dev/null || echo 0)
if [ "$(printf '%s\n2.54\n' "$webkit_version" | sort -V | head -1)" = "2.54" ]; then
  echo "Attention : WebKitGTK $webkit_version sera embarqué. Sous Wayland avec un GPU NVIDIA, il plante" >&2
  echo "  au démarrage (Error 71, issue 555) : pour tester sous Wayland, utiliser le workflow build-devtools." >&2
fi

expected_pnpm=$(jq -r '.packageManager // "" | sub("^pnpm@"; "")' package.json)
actual_pnpm=$(pnpm --version)
if [ -n "$expected_pnpm" ] && [ "$actual_pnpm" != "$expected_pnpm" ]; then
  echo "Attention : pnpm $actual_pnpm, le dépôt fixe pnpm $expected_pnpm (corepack enable)." >&2
fi

# Installe au besoin la toolchain de rust-toolchain.toml (rustup la lit dans le dépôt).
rustup show active-toolchain > /dev/null || die "toolchain Rust de rust-toolchain.toml indisponible (rustup)."

# --- Aucune signature ---------------------------------------------------------

unset TAURI_SIGNING_PRIVATE_KEY TAURI_SIGNING_PRIVATE_KEY_PASSWORD \
  AZURE_TENANT_ID AZURE_CLIENT_ID AZURE_CLIENT_SECRET \
  APPLE_CERTIFICATE APPLE_CERTIFICATE_PASSWORD APPLE_SIGNING_IDENTITY

# --- Build ---------------------------------------------------------------------

echo "== Alpha devtools Linux $VERSION ($(git rev-parse --short HEAD), $(git rev-parse --abbrev-ref HEAD))"

pnpm install --frozen-lockfile

# Version injectée comme dans le workflow, puis configuration restaurée à
# l'identique (y compris d'éventuelles modifications locales non commitées).
CONF_BACKUP=$(mktemp)
cp "$CONF" "$CONF_BACKUP"
restore_conf() {
  cp "$CONF_BACKUP" "$CONF"
  rm -f "$CONF_BACKUP"
}
trap restore_conf EXIT
jq --arg v "$VERSION" '.version = $v' "$CONF_BACKUP" > "$CONF"

# Dossier de bundle : CARGO_TARGET_DIR s'il est défini, sinon le target-dir de
# apps/desktop/src-tauri/.cargo/config.toml.
TARGET_DIR=${CARGO_TARGET_DIR:-"$SRC_TAURI/target"}
case "$TARGET_DIR" in
  /*) ;;
  *) TARGET_DIR="$ROOT/$TARGET_DIR" ;;
esac
BUNDLE_DIR="$TARGET_DIR/release/bundle/appimage"

# Une AppImage d'un build précédent ne doit pas être prise pour celle-ci.
rm -rf "$BUNDLE_DIR"

# linuxdeploy est une AppImage : sans FUSE 2, elle doit s'extraire pour tourner.
export APPIMAGE_EXTRACT_AND_RUN=${APPIMAGE_EXTRACT_AND_RUN:-1}
# Valeur factice exigée par des intégrations cloud héritées (chantier 04d).
export VITE_API_URL=http://127.0.0.1:9
pnpm -F ui build
pnpm -F desktop tauri build --ci --bundles appimage --features devtools \
  --config ./src-tauri/tauri.conf.syntheo.json

# Même réempaquetage que release.yml et build-devtools.yml (bibliothèques hôte,
# zstd 19, blocs de 1 Mio), pour que l'alpha soit fidèle à la release.
ARCH=x86_64 node scripts/repack-linux-appimage.mjs "$BUNDLE_DIR"

# --- Sortie --------------------------------------------------------------------

shopt -s nullglob
found=("$BUNDLE_DIR"/*.AppImage)
shopt -u nullglob
[ "${#found[@]}" -eq 1 ] || die "${#found[@]} AppImage trouvée(s) dans $BUNDLE_DIR (une seule attendue)."

mkdir -p "$OUT"
NAME="Syntheo-$VERSION-devtools-linux-x86_64.AppImage"
cp "${found[0]}" "$OUT/$NAME"
chmod +x "$OUT/$NAME"
(cd "$OUT" && sha256sum "./$NAME" > SHA256SUMS-devtools-linux)
printf 'build local\ncommit %s\nbranche %s\ndate %s\n' \
  "$(git rev-parse HEAD)" "$(git rev-parse --abbrev-ref HEAD)" "$(date -Iseconds)" > "$OUT/SOURCE"

echo
echo "Alpha devtools Linux $VERSION (non signée) : $OUT/$NAME"
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
      echo "Essai Wayland : ÉCHEC, « Error 71 » au démarrage (WebKitGTK $webkit_version embarqué, issue 555)." >&2
      echo "  Cette AppImage ne démarre pas sous Wayland sur cette machine : utiliser le workflow build-devtools." >&2
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
