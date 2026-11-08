#!/usr/bin/env bash
# Régénère les liaisons TypeScript produites par tauri-specta (plugins/*/js/bindings.gen.ts
# et apps/desktop/src/types/tauri.gen.ts) puis vérifie qu'elles sont identiques aux
# fichiers commités.
#
# Usage : scripts/check-bindings.sh            régénère et contrôle
#         scripts/check-bindings.sh --no-check régénère seulement
#
# Les liaisons sont écrites par le test `export_types` (ou `export`) de chaque crate exportateur.
# Sous Linux sans glib/alsa/dbus, lancer ce script dans l'image Docker de développement.
set -euo pipefail

cd "$(dirname "$0")/.."

check=1
if [[ "${1:-}" == "--no-check" ]]; then
  check=0
fi

packages=()
while IFS= read -r lib; do
  crate_dir="${lib%/src/lib.rs}"
  name="$(sed -n 's/^name = "\(.*\)"$/\1/p' "$crate_dir/Cargo.toml" | head -n 1)"
  packages+=("-p" "$name")
done < <(grep -l 'specta_typescript::Typescript::default' plugins/*/src/lib.rs apps/desktop/src-tauri/src/lib.rs)

if [[ ${#packages[@]} -eq 0 ]]; then
  echo "Aucun crate exportateur de liaisons trouvé." >&2
  exit 1
fi

echo "Régénération des liaisons ($((${#packages[@]} / 2)) crates)..."
cargo test --locked --no-fail-fast "${packages[@]}" --lib -- --exact test::export test::export_types tests::export_types

if [[ $check -eq 0 ]]; then
  exit 0
fi

generated=(':(glob)plugins/*/js/bindings.gen.ts' 'apps/desktop/src/types/tauri.gen.ts')

untracked="$(git ls-files --others --exclude-standard -- "${generated[@]}")"
if [[ -n "$untracked" ]]; then
  echo "Liaisons générées non suivies par git :" >&2
  echo "$untracked" >&2
  exit 1
fi

if ! git diff --exit-code --stat -- "${generated[@]}"; then
  echo "Les liaisons générées diffèrent des liaisons commitées : commitez la régénération." >&2
  exit 1
fi

echo "Liaisons générées identiques aux liaisons commitées."
