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
QPID=
# qemu tourne en arrière-plan : arrêté avec le script (Ctrl-C, docker stop,
# délai de l'étape), sinon il continuerait seul.
trap '[ -z "$QPID" ] || kill -KILL "$QPID" 2> /dev/null; rm -f "$OUT" "$ERR"' EXIT
trap 'dump_threads "interruption"; exit 130' INT TERM

# Battement toutes les HEARTBEAT secondes (défaut 120) : durée écoulée et temps
# CPU cumulé de qemu, pour distinguer un runner lent d'un émulateur figé. Si
# qemu consomme moins d'une seconde de CPU sur STALL_LIMIT battements de suite
# (défaut 3, soit 6 min ; en marche il en consomme plusieurs par seconde), il
# est arrêté et traité comme une erreur interne de l'émulateur.
HEARTBEAT=${HEARTBEAT:-120}
STALL_LIMIT=${STALL_LIMIT:-3}
for v in "$HEARTBEAT" "$STALL_LIMIT"; do
  case "$v" in
    '' | *[!0-9]* | 0*) echo "Erreur : HEARTBEAT et STALL_LIMIT sont des entiers positifs (reçu : HEARTBEAT=$HEARTBEAT, STALL_LIMIT=$STALL_LIMIT)." >&2; exit 2 ;;
  esac
done
HZ=$(getconf CLK_TCK)

# Hôte, émulateur et réglages en tête du journal : la durée sous TCG dépend
# surtout du processeur hôte (runner GitHub variable).
host_cpu=$(grep -m1 '^model name' /proc/cpuinfo | cut -d: -f2- | sed 's/^ *//' || true)
# Extensions de l'hôte que le générateur de code de TCG peut employer.
host_isa=$(grep -m1 '^flags' /proc/cpuinfo | tr ' ' '\n' | grep -xE 'avx2|avx512f|avx512vl|avx512_vnni|avx_vnni' | paste -sd' ' || true)
mem_gb() { awk -v k="$1" '$1 == k":" {printf "%.1f", $2 / 1048576}' /proc/meminfo; }
echo "-- hôte : ${host_cpu:-inconnu}, $(nproc) CPU, extensions ${host_isa:-aucune}, mémoire $(mem_gb MemTotal) Go, swap $(mem_gb SwapTotal) Go ; $("$QEMU" --version | head -n1) -cpu ${QEMU_CPU:-Skylake-Client} ; THREADS=${THREADS:-4} ; fichiers : ${FILES:-mic sys}"

alive() { # un processus terminé reste zombie (kill -0 réussit) jusqu'au wait
  local state
  state=$(sed 's/.*) //' "/proc/$1/stat" 2> /dev/null | cut -d' ' -f1) || return 1
  [ -n "$state" ] && [ "$state" != Z ]
}
# Battement détaillé : fils de qemu par état (R en calcul, S en attente, D en
# E/S), mémoire résidente et pic, mémoire disponible et swap utilisé de l'hôte.
# Un gel montre des fils tous en S et un temps CPU figé ; un manque de mémoire,
# du swap et des fils en D.
qemu_state() {
  local states rss hwm
  states=$(sed 's/.*) //' /proc/"$1"/task/*/stat 2> /dev/null | awk '{n[$1]++; t++} END {printf "fils %d (R %d, S %d, D %d)", t, n["R"], n["S"], n["D"]}')
  rss=$(awk '$1 == "VmRSS:" {printf "%.1f", $2 / 1048576}' /proc/"$1"/status 2> /dev/null)
  hwm=$(awk '$1 == "VmHWM:" {printf "%.1f", $2 / 1048576}' /proc/"$1"/status 2> /dev/null)
  echo "$states ; RSS ${rss:-?} Go (pic ${hwm:-?}) ; hôte : $(mem_gb MemAvailable) Go disponibles, swap utilisé $(awk '$1 == "SwapTotal:" {t = $2} $1 == "SwapFree:" {f = $2} END {printf "%.1f", (t - f) / 1048576}' /proc/meminfo) Go"
}
# Relevé fil par fil (état, temps CPU, fonction noyau en attente, appel
# système en cours) au moment d'un gel ou d'une interruption (délai de
# l'étape dépassé) : la trace qui manquait aux runs annulés.
dump_threads() {
  [ -n "${QPID:-}" ] && [ -d "/proc/$QPID" ] || return 0
  echo "-- qemu ($1) : $(qemu_state "$QPID")" >&2
  local t
  for t in /proc/"$QPID"/task/*; do
    echo "   fil ${t##*/} : $(sed 's/.*) //' "$t/stat" 2> /dev/null | awk -v hz="$HZ" '{printf "%s, CPU %d s", $1, ($12 + $13) / hz}'), attente $(cat "$t/wchan" 2> /dev/null || echo ?), appel $(cut -d' ' -f1 "$t/syscall" 2> /dev/null || echo ?)" >&2
  done
}
cpu_seconds() { sed 's/.*) //' "/proc/$1/stat" 2> /dev/null | awk -v hz="$HZ" '{print int(($12+$13)/hz)}'; }
# Lignes complètes de cpu-check (stdout) et de son stderr, au fil de l'eau ;
# les avertissements « TCG doesn't support requested feature » (un trio par
# fil créé) sont comptés à la fin, pas recopiés.
TCG="TCG doesn't support requested feature"
flush() {
  local n
  n=$(wc -l < "$OUT")
  if [ "$n" -gt "$shown_out" ]; then sed -n "$((shown_out + 1)),${n}p" "$OUT"; fi
  shown_out=$n
  n=$(wc -l < "$ERR")
  if [ "$n" -gt "$shown_err" ]; then sed -n "$((shown_err + 1)),${n}p" "$ERR" | { grep -v "$TCG" || true; } >&2; fi
  shown_err=$n
}
flush_rest() { # après la fin de qemu : reste, dernière ligne sans saut compris
  local rest
  rest=$(tail -n +"$((shown_out + 1))" "$OUT")
  if [ -n "$rest" ]; then printf '%s\n' "$rest"; fi
  rest=$(tail -n +"$((shown_err + 1))" "$ERR" | { grep -v "$TCG" || true; })
  if [ -n "$rest" ]; then printf '%s\n' "$rest" >&2; fi
  local tcg
  tcg=$(grep -c "$TCG" "$ERR" || true)
  if [ "${tcg:-0}" != 0 ]; then echo "-- qemu : $tcg avertissement(s) « $TCG » (hle, rtm, xsavec) masqués." >&2; fi
}

run_once() {
  : > "$OUT"
  : > "$ERR"
  shown_out=0
  shown_err=0
  stalled=false
  set +e
  "$QEMU" -cpu "${QEMU_CPU:-Skylake-Client}" "$BIN" --models "$MODELS" --threads "${THREADS:-4}" \
    --min-word-ratio "$MIN_WORD_RATIO" --max-wer "$MAX_WER" \
    "${AUDIO[@]}" > "$OUT" 2> "$ERR" &
  QPID=$!
  local start=$SECONDS next=$HEARTBEAT last=0 stalls=0 elapsed cpu
  while alive "$QPID"; do
    sleep 1
    flush
    elapsed=$((SECONDS - start))
    if [ "$elapsed" -ge "$next" ]; then
      next=$((next + HEARTBEAT))
      cpu=$(cpu_seconds "$QPID")
      [ -n "$cpu" ] || continue
      echo "-- cpu-check : $((elapsed / 60)) min $((elapsed % 60)) s écoulées, temps CPU de qemu ${cpu} s ; $(qemu_state "$QPID")."
      if [ $((cpu - last)) -lt 1 ]; then stalls=$((stalls + 1)); else stalls=0; fi
      last=$cpu
      if [ "$stalls" -ge "$STALL_LIMIT" ]; then
        dump_threads "figé"
        kill -KILL "$QPID" 2> /dev/null && stalled=true
        break
      fi
    fi
  done
  wait "$QPID"
  code=$?
  QPID=
  set -e
  flush_rest
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
