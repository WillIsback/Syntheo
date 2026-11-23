#!/usr/bin/env bash
# Banc de l'issue 680 (Syntheo) sur un portable CPU : NeMo-Speech.cpp (B), deux
# flux comme l'application (micro et son système), avec l'image publiée
# ghcr.io/willisback/syntheo-transcription:0.3.0-cpu. Aucun texte transcrit
# n'est enregistré : seulement des nombres, dans ./resultats/.
#
# Usage : ./run-banc.sh, depuis un dossier qui contient audio/mic45.wav et
# audio/sys45.wav (16 kHz, mono, PCM16) à côté de ce script.
#
# Options (variables d'environnement) :
#   PERF=1      mesurer en mode performance. Le script affiche la commande à
#               lancer vous-même et ne la lance jamais ; il vérifie ensuite le
#               profil d'énergie et s'arrête s'il n'est pas « performance ».
#   BATTERIE=1  marque la série comme mesurée sur batterie.
#   DOCKER=...  podman au lieu de docker.
#
# Durée estimée : 10 à 15 min (téléchargement de l'image ~0,9 Go la première
# fois, puis environ 12 min de mesures). Secteur branché de préférence.
# Prérequis : docker (ou podman). Facultatif : uv, pour les essais temps réel
# (sinon ils sont sautés).
# Nettoyage : conteneurs lancés avec --rm (aucun reste) ; l'image est gardée,
# à retirer avec « docker rmi ghcr.io/willisback/syntheo-transcription:0.3.0-cpu ».
set -euo pipefail
cd "$(dirname "$0")"
DOCKER=${DOCKER:-docker}
IMG=ghcr.io/willisback/syntheo-transcription:0.3.0-cpu
ASR=/models/nemotron-3.5-asr-streaming-0.6b.q8_0.gguf
DIAR=/models/Nemotron-3-Diarization.q8_0.gguf

# Profil d'énergie actif : power-profiles-daemon, sinon le profil ACPI.
energy_profile() {
  if command -v powerprofilesctl >/dev/null; then
    powerprofilesctl get 2>/dev/null && return
  fi
  cat /sys/firmware/acpi/platform_profile 2>/dev/null || echo inconnu
}

PROFILE=$(energy_profile)
if [ "${PERF:-}" = 1 ]; then
  echo "Mode performance demandé. Si ce n'est pas déjà fait, lancez vous-même :"
  echo
  echo "    powerprofilesctl set performance"
  echo
  echo "puis relancez « PERF=1 ./run-banc.sh ». Ce script ne change jamais le profil."
  if [ "$PROFILE" != performance ]; then
    echo "Profil actuel : $PROFILE. Arrêt sans mesure." >&2
    exit 2
  fi
  echo "Profil actuel : performance. Mesures lancées."
fi

OUT=resultats/$(date +%Y%m%d-%H%M%S)-${PROFILE}${BATTERIE:+-batterie}
mkdir -p "$OUT"

{
  echo "date $(date -Is)"
  echo "profil_energie $PROFILE"
  lscpu | grep -E "Model name|Nom de modèle|^CPU\(s\)|Thread|Core|Flags" | sed 's/Flags:.*avx2.*/Flags: avx2 present/'
  free -g | sed -n 2p
  for s in /sys/class/power_supply/*/online /sys/class/power_supply/*/status; do [ -r "$s" ] && echo "$s $(cat "$s")"; done
  cat /sys/devices/system/cpu/cpu0/cpufreq/scaling_governor 2>/dev/null || true
  cat /sys/firmware/acpi/platform_profile 2>/dev/null || true
} > "$OUT/machine.txt"

"$DOCKER" image inspect "$IMG" >/dev/null 2>&1 || "$DOCKER" pull "$IMG"

run() { "$DOCKER" run --rm --name syntheo-banc -v "$PWD/audio:/audio:ro" "$IMG" "$@"; }
for chunk in 560 1120; do
  echo "ASR en flux, tranches de $chunk ms..."
  run bench asr /audio --model "$ASR" --mode stream --chunk-ms "$chunk" -l fr-FR -c 1,2 -n 1 --json > "$OUT/asr-$chunk.json" 2>/dev/null
done
echo "Diarisation en flux..."
run bench diarize /audio --model "$DIAR" --preset streaming -c 1,2 -n 1 --json > "$OUT/diar.json" 2>/dev/null

if command -v uv >/dev/null; then
  echo "Essais temps réel (serveur, flux de 45 s)..."
  "$DOCKER" run -d --rm --name syntheo-banc-serve -p 127.0.0.1:9011:8080 "$IMG" >/dev/null
  trap '"$DOCKER" stop syntheo-banc-serve >/dev/null 2>&1 || true' EXIT
  for i in $(seq 1 120); do curl -sf http://127.0.0.1:9011/ready >/dev/null 2>&1 && break; sleep 1; done
  URL=ws://127.0.0.1:9011/v1/audio/transcriptions/realtime
  stream() { uv run -q --no-project --with websockets python stream2.py "$URL" "$@"; }
  # Profil complet, puis profils dégradés pour la sonde (issue 682).
  stream audio/mic45.wav audio/sys45.wav > "$OUT/temps-reel-diar.json" || true
  stream audio/mic45.wav audio/sys45.wav --nodiar > "$OUT/temps-reel-sans-diar.json" || true
  stream audio/mic45.wav > "$OUT/temps-reel-micro-diar.json" || true
  stream audio/mic45.wav --nodiar > "$OUT/temps-reel-micro-sans-diar.json" || true
fi

python3 - "$OUT" <<'PY'
import json, sys, pathlib
out = pathlib.Path(sys.argv[1])
def wall(name):
    d = json.loads((out / name).read_text())
    return {r["concurrency"]: round(r["wall_seconds"] / 45, 3) for r in d["runs"]}
lines = []
for name in ("asr-560.json", "asr-1120.json", "diar.json"):
    try:
        lines.append(f"{name}\tRTF (temps / 45 s) par nombre de flux : {wall(name)}")
    except Exception as e:
        lines.append(f"{name}\tindisponible ({e})")
for flux, asr in ((2, "asr-560.json"), (2, "asr-1120.json"), (1, "asr-560.json")):
    try:
        diar = wall("diar.json")[flux]
        a = wall(asr)[flux]
        lines.append(f"RTF cumulé, {flux} flux ({asr} + diarisation) : {a + diar:.3f} ; sans diarisation : {a:.3f} (budget : 0,5)")
    except Exception:
        pass
(out / "resume.txt").write_text("\n".join(lines) + "\n")
print("\n".join(lines))
PY
echo "Résultats : $OUT (à renvoyer tels quels, ils ne contiennent aucun texte)"
