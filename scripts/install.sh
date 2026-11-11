#!/usr/bin/env bash
# Installe Syntheo Desktop depuis les GitHub Releases.
#
#   # Dernière release (AppImage, ~/.local/bin)
#   curl -fsSL https://raw.githubusercontent.com/WillIsback/Syntheo/main/scripts/install.sh | bash
#
#   # Une release précise (pour tester une version donnée)
#   curl -fsSL https://raw.githubusercontent.com/WillIsback/Syntheo/main/scripts/install.sh | bash -s -- --version v0.1.1
#
# Options :
#   --version <tag>   Release à installer (défaut : latest). accepte vX.Y.Z.
#   --deb             Installe le paquet .deb (Debian/Ubuntu) au lieu de l'AppImage.
#   --appimage        Force l'AppImage (défaut).
#   --to <dir>        Répertoire d'installation (défaut : $XDG_BIN_HOME ou ~/.local/bin).
#   --dir <dir>       Répertoire de téléchargement (défaut : $TMPDIR ou /tmp).
#   -h, --help        Affiche cette aide.
#
# L'AppImage est enregistrée sous Syntheo-<version>.AppImage et un lien
# `syntheo` pointe vers elle : plusieurs versions peuvent coexister.
set -euo pipefail

REPO="WillIsback/Syntheo"
VERSION="latest"
FORMAT="appimage"
INSTALL_DIR="${XDG_BIN_HOME:-$HOME/.local/bin}"
DOWNLOAD_DIR="${TMPDIR:-/tmp}"

die() { printf 'erreur: %s\n' "$1" >&2; exit 1; }

usage() {
  cat <<'EOF'
Installe Syntheo Desktop depuis les GitHub Releases.

  --version <tag>   Release à installer (défaut : latest), par ex. v0.1.1
  --deb             Installe le paquet .deb (Debian/Ubuntu) au lieu de l'AppImage
  --appimage        Force l'AppImage (défaut)
  --to <dir>        Répertoire d'installation (défaut : ~/.local/bin)
  --dir <dir>       Répertoire de téléchargement (défaut : /tmp)
  -h, --help        Affiche cette aide
EOF
}

while [[ "$#" -gt 0 ]]; do
  case "$1" in
    --version)
      [[ "$#" -ge 2 ]] || die "--version attend une valeur"
      VERSION="$2"
      shift 2
      ;;
    --deb) FORMAT="deb"; shift ;;
    --appimage) FORMAT="appimage"; shift ;;
    --to)
      [[ "$#" -ge 2 ]] || die "--to attend une valeur"
      INSTALL_DIR="$2"
      shift 2
      ;;
    --dir)
      [[ "$#" -ge 2 ]] || die "--dir attend une valeur"
      DOWNLOAD_DIR="$2"
      shift 2
      ;;
    -h|--help) usage; exit 0 ;;
    *) die "option inconnue: $1" ;;
  esac
done

command -v curl >/dev/null 2>&1 || die "curl est requis"

case "$(uname -s)" in
  Linux) ;;
  *) die "ce script ne gère que Linux (utilisez les paquets/installateurs de votre OS)" ;;
esac

case "$(uname -m)" in
  x86_64|amd64) ARCH="amd64" ;;
  aarch64|arm64) ARCH="arm64" ;;
  *) die "architecture non prise en charge: $(uname -m)" ;;
esac

if [[ "$FORMAT" = "deb" ]]; then
  EXT="deb"
else
  EXT="AppImage"
fi

if [[ "$VERSION" = "latest" ]]; then
  resolved="$(curl --proto '=https' --proto-redir '=https' --tlsv1.2 -fsSLI -o /dev/null -w '%{url_effective}' "https://github.com/${REPO}/releases/latest" || true)"
  case "$resolved" in
    */tag/*) TAG="${resolved##*/tag/}" ;;
    *) die "aucune release publiée (ou accès GitHub impossible)" ;;
  esac
else
  TAG="$VERSION"
fi
TAG="${TAG%%\?*}"
VERSION_NUMBER="${TAG#v}"

ASSET="Syntheo_${VERSION_NUMBER}_${ARCH}.${EXT}"
BASE_URL="https://github.com/${REPO}/releases/download/${TAG}"
ASSET_URL="${BASE_URL}/${ASSET}"
SUMS_URL="${BASE_URL}/SHA256SUMS"

printf 'Syntheo Desktop %s (%s, %s)\n' "$TAG" "$EXT" "$ARCH"

mkdir -p "$DOWNLOAD_DIR" "$INSTALL_DIR"
target="$DOWNLOAD_DIR/$ASSET"

printf 'Téléchargement de %s...\n' "$ASSET"
if ! curl --proto '=https' --proto-redir '=https' --tlsv1.2 -fL --retry 3 --progress-bar "$ASSET_URL" -o "$target"; then
  die "téléchargement impossible: $ASSET_URL (cette release publie-t-elle bien un ${EXT} pour ${ARCH} ?)"
fi

# Vérifie la somme si le manifeste de la release est disponible.
if sums="$(curl --proto '=https' --proto-redir '=https' --tlsv1.2 -fsSL "$SUMS_URL" 2>/dev/null)"; then
  expected="$(printf '%s\n' "$sums" | awk -v a="$ASSET" '$2 == a || $2 == "./"a { print $1 }')"
  if [[ -n "$expected" ]]; then
    if command -v sha256sum >/dev/null 2>&1; then
      actual="$(sha256sum "$target" | awk '{ print $1 }')"
    elif command -v shasum >/dev/null 2>&1; then
      actual="$(shasum -a 256 "$target" | awk '{ print $1 }')"
    fi
    if [[ -n "${actual:-}" ]]; then
      [[ "$actual" = "$expected" ]] || die "somme SHA256 invalide pour $ASSET"
      printf 'SHA256 vérifié.\n'
    fi
  fi
fi

if [[ "$FORMAT" = "deb" ]]; then
  installed="$INSTALL_DIR/$ASSET"
  mv "$target" "$installed"
  printf 'Paquet téléchargé : %s\n' "$installed"
  printf 'Installez-le avec : sudo apt install %s\n' "$installed"
  exit 0
fi

installed="$INSTALL_DIR/Syntheo-${VERSION_NUMBER}.AppImage"
mv "$target" "$installed"
chmod +x "$installed"
ln -sf "$installed" "$INSTALL_DIR/syntheo"

printf 'Installé : %s\n' "$installed"
printf 'Lien     : %s/syntheo\n' "$INSTALL_DIR"

# Une AppImage ne s'enregistre pas d'elle-même dans le lanceur d'applications,
# quelle que soit la distribution. On extrait l'entrée .desktop et l'icône
# qu'elle embarque pour les installer dans ~/.local/share.
#
# - Exec pointe vers le lien `syntheo` en chemin absolu : les lanceurs n'ont
#   pas toujours ~/.local/bin dans leur PATH, et le lien suit la dernière
#   version installée.
# - MimeType est retiré : l'application enregistre elle-même le schéma
#   syntheo:// au démarrage (syntheo-handler.desktop), on évite deux
#   gestionnaires concurrents.
# - L'extraction n'a pas besoin de FUSE. Un échec n'annule pas l'installation.
DATA_HOME="${XDG_DATA_HOME:-$HOME/.local/share}"
APPS_DIR="$DATA_HOME/applications"
ICONS_DIR="$DATA_HOME/icons/hicolor"
desktop_file="$APPS_DIR/Syntheo.desktop"

desktop_exec_path() {
  # Argument entre guillemets (Desktop Entry Specification) : \ " ` $ sont
  # préfixés d'une barre oblique inverse, puis chaque barre oblique inverse
  # est doublée par la règle d'échappement des chaînes.
  printf '"%s"' "$(printf '%s' "$1" | sed -e 's/\\/\\\\\\\\/g' -e 's/["`$]/\\\\&/g')"
}

integrate_desktop() {
  local work embedded exec_line icon size
  work="$1"

  (
    cd "$work" || exit 1
    "$installed" --appimage-extract 'usr/share/applications/*.desktop' >/dev/null 2>&1 || true
    "$installed" --appimage-extract 'usr/share/icons/hicolor/*/apps/syntheo.png' >/dev/null 2>&1 || true
    "$installed" --appimage-extract '*.desktop' >/dev/null 2>&1 || true
  )

  embedded="$(find "$work/squashfs-root" -name '*.desktop' -type f 2>/dev/null | sort | head -n 1)"
  exec_line="Exec=$(desktop_exec_path "$INSTALL_DIR/syntheo")"

  mkdir -p "$APPS_DIR" || return 1
  if [[ -n "$embedded" ]]; then
    EXEC_LINE="$exec_line" awk '
      BEGIN { exec_line = ENVIRON["EXEC_LINE"] }
      /^\[/ { in_entry = ($0 == "[Desktop Entry]") }
      in_entry && /^Exec=/ { print exec_line; next }
      in_entry && /^(TryExec|MimeType|X-AppImage-[^=]*)=/ { next }
      { print }
    ' "$embedded" >"$desktop_file.tmp" || return 1
  else
    cat >"$desktop_file.tmp" <<EOF || return 1
[Desktop Entry]
Type=Application
Name=Syntheo
Comment=Syntheo Desktop App
$exec_line
Icon=syntheo
StartupWMClass=syntheo
Terminal=false
Categories=Office;
EOF
  fi
  mv "$desktop_file.tmp" "$desktop_file" || return 1

  while IFS= read -r icon; do
    size="$(basename "$(dirname "$(dirname "$icon")")")"
    mkdir -p "$ICONS_DIR/$size/apps" && cp "$icon" "$ICONS_DIR/$size/apps/syntheo.png"
  done < <(find "$work/squashfs-root/usr/share/icons/hicolor" -path '*/apps/syntheo.png' 2>/dev/null)

  command -v update-desktop-database >/dev/null 2>&1 \
    && update-desktop-database "$APPS_DIR" >/dev/null 2>&1
  # Ne rafraîchit un cache existant que si le thème est complet : créer un
  # cache dans un hicolor utilisateur sans index.theme le laisserait périmer.
  [[ -f "$ICONS_DIR/index.theme" ]] && command -v gtk-update-icon-cache >/dev/null 2>&1 \
    && gtk-update-icon-cache -q -t "$ICONS_DIR" >/dev/null 2>&1
  return 0
}

desktop_work="$(mktemp -d "${DOWNLOAD_DIR%/}/syntheo-desktop.XXXXXX")"
if integrate_desktop "$desktop_work"; then
  rm -rf "$desktop_work"
  printf 'Lanceur  : %s\n' "$desktop_file"
else
  rm -rf "$desktop_work"
  rm -f "$desktop_file.tmp"
  printf "Avertissement : impossible d'ajouter Syntheo au lanceur d'applications.\n" >&2
fi

case ":${PATH}:" in
  *":${INSTALL_DIR}:"*) ;;
  *) printf '\nAjoutez %s au PATH : export PATH="%s:$PATH"\n' "$INSTALL_DIR" "$INSTALL_DIR" ;;
esac

printf '\nLancez : syntheo\n'
printf "Sur Arch/Omarchy, l'AppImage a besoin de FUSE 2 : sudo pacman -S fuse2\n"
