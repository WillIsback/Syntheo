#!/usr/bin/env bash
# Construit l'émulateur du garde-fou : qemu-x86_64 8.2.2 (mode utilisateur,
# lié statiquement) depuis l'archive officielle, compilé pour x86-64-v3.
#
# Pourquoi ne pas prendre qemu-user-static d'Ubuntu : ce paquet est compilé
# pour x86-64 de base, et ses fonctions d'aide flottantes (softfloat) sont en
# SSE classique. Le code généré par TCG emploie les registres ymm de l'hôte et
# qemu n'exécute vzeroupper qu'en sortie de bloc, pas avant d'appeler ces
# fonctions : elles tournent avec la moitié haute des ymm non nulle. Sur les
# Xeon récents de certains runners GitHub (Xeon 6975P-C), chaque instruction
# SSE classique y paie une pénalité de transition SSE/AVX (×236 mesuré sur la
# séquence FMA, andps, ucomiss) : un fichier de 30 s dépassait alors 50 min.
# Compilé pour x86-64-v3, le même code est encodé en VEX et ne paie plus cette
# pénalité (le même fichier en 12 min sur ce Xeon ; sans écart notable sur un
# processeur AMD, mesuré en local). Le binaire exige un hôte x86-64-v3 (AVX2,
# FMA, BMI2), ce qu'ont tous les runners ubuntu-24.04.
#
# L'archive est vérifiée par son empreinte SHA-256, épinglée ci-dessous, avant
# toute extraction : un écart arrête le script. L'empreinte est celle de
# l'archive dont la signature GPG du mainteneur de la version (Michael Roth,
# CEACC9E15534EBABB82D3FA03353C9CEF108B584) a été vérifiée à l'épinglage.
#
# Dépendances de construction (installées par le workflow) : gcc, ninja-build,
# python3-venv, pkg-config, libglib2.0-dev, flex, bison.
#
# Usage : build-qemu.sh [sortie]   (défaut : $RUNNER_TEMP/qemu-x86_64)
set -euo pipefail

VERSION=8.2.2
URL="https://download.qemu.org/qemu-$VERSION.tar.xz"
SHA256=847346c1b82c1a54b2c38f6edbd85549edeb17430b7d4d3da12620e2962bc4f3

OUT=${1:-${RUNNER_TEMP:?RUNNER_TEMP non défini : donner le chemin de sortie}/qemu-x86_64}
WORK=$(mktemp -d "${RUNNER_TEMP:-${TMPDIR:-/tmp}}/qemu-build.XXXXXX")
trap 'rm -rf "$WORK"' EXIT

curl -sSfL --proto '=https' --retry 3 -o "$WORK/qemu.tar.xz" "$URL"
echo "$SHA256  $WORK/qemu.tar.xz" | sha256sum --check --strict --quiet - \
  || { echo "Erreur : empreinte SHA-256 de qemu-$VERSION.tar.xz inattendue ; archive rejetée." >&2; exit 1; }
tar -xJf "$WORK/qemu.tar.xz" -C "$WORK"

mkdir "$WORK/build"
cd "$WORK/build"
"$WORK/qemu-$VERSION/configure" --target-list=x86_64-linux-user --static \
  --disable-system --disable-tools --disable-docs --disable-plugins --disable-werror \
  --extra-cflags="-O2 -march=x86-64-v3" > configure.log 2>&1 \
  || { tail -n 30 configure.log >&2; exit 1; }
ninja -j"$(nproc)" qemu-x86_64 > build.log 2>&1 || { tail -n 40 build.log >&2; exit 1; }
install -m 0755 qemu-x86_64 "$OUT"
"$OUT" --version | head -n1
