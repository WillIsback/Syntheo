#!/usr/bin/env bash
# Construit le programme compagnon syntheo-speech (issue 683) et le pose là où
# `tauri build` l'attend : apps/desktop/src-tauri/binaries/syntheo-speech-<cible>.
# Prépare aussi ses licences (apps/desktop/src-tauri/speech-licenses/, livré
# dans l'installeur) : ONNX Runtime, accord OpenMDW et fiches des modèles,
# attribution de l'audio de mise en service, et liste des crates
# (THIRD-PARTY-RUST.html, par cargo-about 0.9.3 s'il est installé ; la CI de
# release l'installe).
# Appelé par build-alpha.sh et par le build Linux de release.yml, avant
# `tauri build` : le build.rs de l'application en épingle l'empreinte.
#
# Usage : bash scripts/build-speech.sh [cible]   (défaut : la cible de l'hôte)
# Variables : SPEECH_TARGET_DIR (dossier target du compagnon, défaut
# apps/speech/target), ORT_CACHE_DIR (cache d'ONNX Runtime, défaut
# <target>/ort-cache ; il ne doit contenir que l'archive épinglée).
#
# ONNX Runtime reste épinglé (apps/speech/supply-chain/ort.tsv) et contrôlé
# avant et après la compilation (check_ort.py). Workspace et lockfile du
# compagnon séparés de ceux de l'application (`--locked`).

# shellcheck source=scripts/bash-guard.sh
. "$(dirname "$0")/bash-guard.sh"

set -euo pipefail

ROOT=$(cd "$(dirname "$0")/.." && pwd)
TARGET=${1:-$(rustc -vV | sed -n 's/^host: //p')}
[ -n "$TARGET" ] || { echo "Erreur : cible introuvable." >&2; exit 1; }
SPEECH_TARGET_DIR=${SPEECH_TARGET_DIR:-"$ROOT/apps/speech/target"}
export ORT_CACHE_DIR=${ORT_CACHE_DIR:-"$SPEECH_TARGET_DIR/ort-cache"}
EXE=""
case "$TARGET" in *windows*) EXE=".exe" ;; esac

cd "$ROOT/apps/speech"
t0=$SECONDS
cargo fetch --locked
python3 -I "$ROOT/apps/speech/supply-chain/check_ort.py" before "$TARGET"
CARGO_TARGET_DIR=$SPEECH_TARGET_DIR cargo build --release --locked --target "$TARGET"
python3 -I "$ROOT/apps/speech/supply-chain/check_ort.py" after "$TARGET"

DEST="$ROOT/apps/desktop/src-tauri/binaries"
mkdir -p "$DEST"
install -m 0755 "$SPEECH_TARGET_DIR/$TARGET/release/syntheo-speech$EXE" "$DEST/syntheo-speech-$TARGET$EXE"
echo "-- syntheo-speech ($TARGET) : $DEST/syntheo-speech-$TARGET$EXE, $(stat -c %s "$DEST/syntheo-speech-$TARGET$EXE") octets, $((SECONDS - t0)) s"

LICENSES="$ROOT/apps/desktop/src-tauri/speech-licenses"
rm -rf "$LICENSES"
mkdir -p "$LICENSES"
cp -R "$ROOT/apps/speech/supply-chain/notices/." "$LICENSES/"
cp "$ROOT/apps/speech/commissioning/ATTRIBUTION.md" "$LICENSES/commissioning-audio-ATTRIBUTION.md"
if command -v cargo-about > /dev/null && cargo about --version 2> /dev/null | grep -q '0\.9\.3'; then
  cargo about generate --fail -m "$ROOT/apps/speech/Cargo.toml" -c "$ROOT/apps/speech/supply-chain/about.toml" \
    -o "$LICENSES/THIRD-PARTY-RUST.html" "$ROOT/apps/speech/supply-chain/about.hbs"
else
  echo "Attention : cargo-about 0.9.3 absent, liste des crates remplacée par un renvoi (build local)." >&2
  printf '%s\n' "Liste des crates Rust de syntheo-speech et de leurs licences : générée par la CI de release (cargo-about 0.9.3, apps/speech/supply-chain/about.toml)." > "$LICENSES/THIRD-PARTY-RUST.txt"
fi
