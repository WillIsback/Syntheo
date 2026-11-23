#!/usr/bin/env bash
# Garde-fou des modèles de syntheo-speech sous un CPU sans VNNI (issue 683).
#
# Transcrit l'audio de mise en service (apps/speech/commissioning/mic.wav et
# sys.wav, 30 s chacun) avec le vrai moteur, diarisation comprise, sous
# `qemu-x86_64 -cpu Skylake-Client` (AVX2 sans VNNI ; l'émulation logicielle
# n'a pas d'AVX-512), et exige pour chaque fichier des mots proches de la
# transcription FP32 figée (mic.fp32.txt, sys.fp32.txt) et autant
# d'intervenants distincts que la diarisation FP32 figée (mic.fp32.json,
# sys.fp32.json). Des poids int8 sur 8 bits saturaient le noyau AVX2 d'ONNX
# Runtime : 0 mot sur ces CPU (modèles de la 0.8.0-3).
#
# Usage : bash apps/speech/models/cpu-check/run.sh <dossier des modèles> [--expect-empty]
#   dossier     arborescence de models.json (nemotron/…, diar/…)
#   --expect-empty  témoin négatif : réussit seulement si aucun mot n'est rendu
#                   (modèles défectueux, pour vérifier que le garde-fou les voit)
# Variables :
#   CPU_CHECK_BIN  exécutable cpu-check déjà construit (sinon : cargo build
#                  --release --locked --example cpu-check dans apps/speech),
#                  construit sur la même distribution que celle qui
#                  l'exécute : il est lié dynamiquement à la glibc (un
#                  binaire construit sur Arch exige une glibc plus récente
#                  qu'Ubuntu 24.04). La CI le construit sur son runner.
#   QEMU           émulateur (défaut : qemu-x86_64-static, sinon qemu-x86_64)
#   QEMU_CPU       modèle de CPU émulé (défaut : Skylake-Client)
#   THREADS        fils ONNX Runtime (défaut : 4)
set -euo pipefail

# Seuils, appliqués à chaque fichier : au moins 80 % des mots de sa référence
# FP32 normalisée et un WER d'au plus 5 %, un intervenant pour chaque mot, et
# le nombre d'intervenants distincts de la référence (un par fichier). Mesures
# des modèles int8 (en natif comme sous émulation) : environ 123 mots rendus
# pour 127 de référence (82 + 45), WER de 1,2 % (mic) et 2,2 % (sys) ; les
# modèles FP32 rendent 81 + 43 mots, à 0 % de WER.
MIN_WORD_RATIO=0.8
MAX_WER=5

HERE=$(cd "$(dirname "$0")" && pwd)
SPEECH=$(cd "$HERE/../.." && pwd)
MODELS=${1:-}
EXPECT_EMPTY=false
[ "${2:-}" = "--expect-empty" ] && EXPECT_EMPTY=true
[ -n "$MODELS" ] && [ -d "$MODELS" ] || { echo "Usage : $0 <dossier des modèles> [--expect-empty]" >&2; exit 2; }

if [ -z "${QEMU:-}" ]; then
  QEMU=$(command -v qemu-x86_64-static || command -v qemu-x86_64 || true)
fi
[ -n "$QEMU" ] || { echo "Erreur : qemu-x86_64(-static) introuvable." >&2; exit 2; }

BIN=${CPU_CHECK_BIN:-}
if [ -z "$BIN" ]; then
  (cd "$SPEECH" && cargo build --release --locked --example cpu-check)
  BIN="${CARGO_TARGET_DIR:-$SPEECH/target}/release/examples/cpu-check"
fi

COMMISSIONING="$SPEECH/commissioning"
OUT=$(mktemp)
ERR=$(mktemp)
trap 'rm -f "$OUT" "$ERR"' EXIT

run_once() {
  set +e
  "$QEMU" -cpu "${QEMU_CPU:-Skylake-Client}" "$BIN" --models "$MODELS" --threads "${THREADS:-4}" \
    --min-word-ratio "$MIN_WORD_RATIO" --max-wer "$MAX_WER" \
    "$COMMISSIONING/mic.wav=$HERE/mic.fp32.txt" "$COMMISSIONING/sys.wav=$HERE/sys.fp32.txt" > "$OUT" 2> "$ERR"
  code=$?
  set -e
  cat "$ERR" >&2
}

# Erreur interne de l'émulateur (QEMU internal SIGBUS, code 135), vue une fois
# sur trois par la QA pendant sys.wav, sans rapport avec les modèles : une
# seule relance, signalée. Un verdict (code 1 : muet, WER trop haut…) ou toute
# autre erreur n'est jamais relancé ; deux SIGBUS de suite : échec.
qemu_sigbus() {
  [ "$code" = 135 ] || grep -q "QEMU internal SIGBUS" "$ERR"
}

run_once
if qemu_sigbus; then
  echo "::warning::qemu : erreur interne (SIGBUS, code $code) pendant cpu-check, sans rapport avec les modèles ; une seule relance."
  run_once
  if qemu_sigbus; then
    echo "Erreur : qemu s'est de nouveau arrêté sur une erreur interne (SIGBUS, code $code) : contrôle non conclusif." >&2
    exit 2
  fi
fi
cat "$OUT"
[ "$code" -le 1 ] || { echo "Erreur : cpu-check a échoué (code $code)." >&2; exit 2; }
words=$(python3 -I -c 'import json,sys;print([json.loads(l) for l in open(sys.argv[1])][-1]["words"])' "$OUT")
if $EXPECT_EMPTY; then
  [ "$words" = 0 ] || { echo "Témoin négatif : $words mot(s) rendus, 0 attendu." >&2; exit 1; }
  echo "-- témoin négatif : 0 mot, comme attendu."
  exit 0
fi
[ "$code" = 0 ] || { echo "Erreur : modèles refusés sous ${QEMU_CPU:-Skylake-Client} ($words mot(s) ; seuils par fichier : au moins $MIN_WORD_RATIO fois les mots de la référence, WER d'au plus $MAX_WER %, intervenant pour chaque mot, autant d'intervenants que la référence FP32)." >&2; exit 1; }
echo "-- modèles acceptés sous ${QEMU_CPU:-Skylake-Client}."
