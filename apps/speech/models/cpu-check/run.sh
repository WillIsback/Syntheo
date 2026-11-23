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
#   FILES          fichiers de mise en service à transcrire, parmi mic et sys
#                  (défaut : "mic sys") ; la CI les répartit sur deux jobs
#   HEARTBEAT      secondes entre deux battements (défaut : 120)
#   STALL_LIMIT    battements sans CPU avant d'arrêter un qemu figé (défaut : 3)
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
AUDIO=()
for f in ${FILES:-mic sys}; do
  case "$f" in
    mic | sys) AUDIO+=("$COMMISSIONING/$f.wav=$HERE/$f.fp32.txt") ;;
    *) echo "Erreur : FILES=$FILES ; valeurs admises : mic, sys." >&2; exit 2 ;;
  esac
done
[ ${#AUDIO[@]} -gt 0 ] || { echo "Erreur : FILES est vide." >&2; exit 2; }
OUT=$(mktemp)
ERR=$(mktemp)
trap 'rm -f "$OUT" "$ERR"' EXIT

# Hôte, émulateur et réglages en tête du journal : la durée sous TCG dépend
# surtout du processeur hôte (runner GitHub variable).
host_cpu=$(grep -m1 '^model name' /proc/cpuinfo | cut -d: -f2- | sed 's/^ *//' || true)
echo "-- hôte : ${host_cpu:-inconnu}, $(nproc) CPU ; $("$QEMU" --version | head -n1) -cpu ${QEMU_CPU:-Skylake-Client} ; THREADS=${THREADS:-4} ; fichiers : ${FILES:-mic sys}"

# Battement toutes les HEARTBEAT secondes (défaut 120) : durée écoulée et temps
# CPU cumulé de qemu, pour distinguer un runner lent d'un émulateur figé. Si
# qemu consomme moins d'une seconde de CPU sur STALL_LIMIT battements de suite
# (défaut 3, soit 6 min ; en marche il en consomme plusieurs par seconde), il
# est arrêté et traité comme une erreur interne de l'émulateur.
HEARTBEAT=${HEARTBEAT:-120}
STALL_LIMIT=${STALL_LIMIT:-3}
HZ=$(getconf CLK_TCK)

alive() { # un processus terminé reste zombie (kill -0 réussit) jusqu'au wait
  local state
  state=$(sed 's/.*) //' "/proc/$1/stat" 2> /dev/null | cut -d' ' -f1) || return 1
  [ -n "$state" ] && [ "$state" != Z ]
}
cpu_seconds() { sed 's/.*) //' "/proc/$1/stat" 2> /dev/null | awk -v hz="$HZ" '{print int(($12+$13)/hz)}'; }
flush_out() { # lignes JSON de cpu-check au fil de l'eau
  local n
  n=$(wc -l < "$OUT")
  [ "$n" -gt "$shown" ] && sed -n "$((shown + 1)),${n}p" "$OUT"
  shown=$n
}

run_once() {
  : > "$OUT"
  : > "$ERR"
  shown=0
  stalled=false
  set +e
  "$QEMU" -cpu "${QEMU_CPU:-Skylake-Client}" "$BIN" --models "$MODELS" --threads "${THREADS:-4}" \
    --min-word-ratio "$MIN_WORD_RATIO" --max-wer "$MAX_WER" \
    "${AUDIO[@]}" > "$OUT" 2> "$ERR" &
  local pid=$! tick=0 last=0 stalls=0 cpu
  while alive "$pid"; do
    sleep 1
    tick=$((tick + 1))
    flush_out
    if [ $((tick % HEARTBEAT)) = 0 ]; then
      cpu=$(cpu_seconds "$pid")
      [ -n "$cpu" ] || continue
      echo "-- cpu-check : $((tick / 60)) min $((tick % 60)) s écoulées, temps CPU de qemu ${cpu} s."
      if [ $((cpu - last)) -lt 1 ]; then stalls=$((stalls + 1)); else stalls=0; fi
      last=$cpu
      if [ "$stalls" -ge "$STALL_LIMIT" ]; then
        stalled=true
        kill -KILL "$pid" 2> /dev/null
        break
      fi
    fi
  done
  wait "$pid"
  code=$?
  set -e
  flush_out
  # Avertissements « TCG doesn't support requested feature », un trio par fil
  # créé : comptés, pas recopiés.
  grep -v "TCG doesn't support requested feature" "$ERR" >&2 || true
  local tcg
  tcg=$(grep -c "TCG doesn't support requested feature" "$ERR" || true)
  [ "${tcg:-0}" = 0 ] || echo "-- qemu : $tcg avertissement(s) « TCG doesn't support requested feature » (hle, rtm, xsavec) masqués." >&2
}

# Erreur interne de l'émulateur, sans rapport avec les modèles : QEMU internal
# SIGBUS (code 135, vue une fois sur trois par la QA pendant sys.wav) ou qemu
# figé (plus de CPU consommé). Une seule relance, signalée. Un verdict (code 1 :
# muet, WER trop haut…) ou toute autre erreur n'est jamais relancé ; deux
# erreurs internes de suite : échec non conclusif.
qemu_internal() {
  $stalled || [ "$code" = 135 ] || grep -q "QEMU internal SIGBUS" "$ERR"
}
qemu_reason() {
  if $stalled; then echo "figé : moins d'une seconde de CPU en $((HEARTBEAT * STALL_LIMIT)) s"; else echo "SIGBUS, code $code"; fi
}

run_once
if qemu_internal; then
  echo "::warning::qemu : erreur interne ($(qemu_reason)) pendant cpu-check, sans rapport avec les modèles ; une seule relance."
  run_once
  if qemu_internal; then
    echo "Erreur : qemu s'est de nouveau arrêté sur une erreur interne ($(qemu_reason)) : contrôle non conclusif." >&2
    exit 2
  fi
fi
[ "$code" -le 1 ] || { echo "Erreur : cpu-check a échoué (code $code)." >&2; exit 2; }
words=$(python3 -I -c 'import json,sys;print([json.loads(l) for l in open(sys.argv[1])][-1]["words"])' "$OUT")
if $EXPECT_EMPTY; then
  [ "$words" = 0 ] || { echo "Témoin négatif : $words mot(s) rendus, 0 attendu." >&2; exit 1; }
  echo "-- témoin négatif : 0 mot, comme attendu."
  exit 0
fi
[ "$code" = 0 ] || { echo "Erreur : modèles refusés sous ${QEMU_CPU:-Skylake-Client} ($words mot(s) ; seuils par fichier : au moins $MIN_WORD_RATIO fois les mots de la référence, WER d'au plus $MAX_WER %, intervenant pour chaque mot, autant d'intervenants que la référence FP32)." >&2; exit 1; }
echo "-- modèles acceptés sous ${QEMU_CPU:-Skylake-Client}."
