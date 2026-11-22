#!/usr/bin/env bash
# Garde-fou des modèles de syntheo-speech sous un CPU sans VNNI (issue 683).
#
# Transcrit l'audio de mise en service (apps/speech/commissioning/mic.wav et
# sys.wav, 30 s chacun) avec le vrai moteur, diarisation comprise, sous
# `qemu-x86_64 -cpu Skylake-Client` (AVX2 sans VNNI ; l'émulation logicielle
# n'a pas d'AVX-512), et exige des mots proches de la transcription FP32 de
# référence (mic.fp32.txt, sys.fp32.txt). Des poids int8 sur 8 bits saturaient
# le noyau AVX2 d'ONNX Runtime : 0 mot sur ces CPU (modèles de la 0.8.0-3).
#
# Usage : bash apps/speech/models/cpu-check/run.sh <dossier des modèles> [--expect-empty]
#   dossier     arborescence de models.json (nemotron/…, diar/…)
#   --expect-empty  témoin négatif : réussit seulement si aucun mot n'est rendu
#                   (modèles défectueux, pour vérifier que le garde-fou les voit)
# Variables :
#   CPU_CHECK_BIN  exécutable cpu-check déjà construit (sinon : cargo build
#                  --release --locked --example cpu-check dans apps/speech)
#   QEMU           émulateur (défaut : qemu-x86_64-static, sinon qemu-x86_64)
#   QEMU_CPU       modèle de CPU émulé (défaut : Skylake-Client)
#   THREADS        fils ONNX Runtime (défaut : 4)
set -euo pipefail

# Seuils : 127 mots dans la référence FP32 ; en natif comme sous émulation, les
# modèles int8 en rendent environ 123, à 1,6 % de WER de la référence.
MIN_WORDS=100
MAX_WER=10

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
trap 'rm -f "$OUT"' EXIT
set +e
"$QEMU" -cpu "${QEMU_CPU:-Skylake-Client}" "$BIN" --models "$MODELS" --threads "${THREADS:-4}" \
  --min-words "$MIN_WORDS" --max-wer "$MAX_WER" \
  "$COMMISSIONING/mic.wav=$HERE/mic.fp32.txt" "$COMMISSIONING/sys.wav=$HERE/sys.fp32.txt" > "$OUT"
code=$?
set -e
cat "$OUT"
[ "$code" -le 1 ] || { echo "Erreur : cpu-check a échoué (code $code)." >&2; exit 2; }
words=$(python3 -I -c 'import json,sys;print([json.loads(l) for l in open(sys.argv[1])][-1]["words"])' "$OUT")
if $EXPECT_EMPTY; then
  [ "$words" = 0 ] || { echo "Témoin négatif : $words mot(s) rendus, 0 attendu." >&2; exit 1; }
  echo "-- témoin négatif : 0 mot, comme attendu."
  exit 0
fi
[ "$code" = 0 ] || { echo "Erreur : modèles refusés sous ${QEMU_CPU:-Skylake-Client} ($words mot(s), seuils : au moins $MIN_WORDS mots, WER d'au plus $MAX_WER %, intervenant pour chaque mot)." >&2; exit 1; }
echo "-- modèles acceptés sous ${QEMU_CPU:-Skylake-Client}."
