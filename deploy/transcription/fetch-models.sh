#!/bin/sh
# Télécharge les modèles du service dans /models s'ils manquent ou si leur
# empreinte ne correspond pas. Révisions Hugging Face figées.
set -eu

dir=/models

fetch() {
    name="$1" url="$2" sum="$3"
    target="$dir/$name"
    if [ -f "$target" ] && echo "$sum  $target" | sha256sum -c -s; then
        echo "$name : déjà présent"
        return 0
    fi
    echo "$name : téléchargement"
    curl -fL --retry 3 --progress-bar -o "$target.part" "$url"
    if ! echo "$sum  $target.part" | sha256sum -c -s; then
        rm -f "$target.part"
        echo "$name : empreinte SHA-256 inattendue" >&2
        exit 1
    fi
    mv "$target.part" "$target"
}

fetch nemotron-3.5-asr-streaming-0.6b.q8_0.gguf \
    https://huggingface.co/nvidia/nemotron-3.5-asr-streaming-0.6b/resolve/ea30d66debe3740a08b573244286791d423d6b3e/nemotron-3.5-asr-streaming-0.6b.q8_0.gguf \
    3fc991d3badad7277c11030a7519832cddaf2057aafed6d4b25147e953a070b1
fetch Nemotron-3-Diarization.q8_0.gguf \
    https://huggingface.co/nvidia/Nemotron-3-Diarization/resolve/52a432672732425e4c19765b9fec9b5810e6f4ba/Nemotron-3-Diarization.q8_0.gguf \
    08456d9e22cd9a323c0364d98375f3746d6e68507ebb705cd46438c534c7a3a1
