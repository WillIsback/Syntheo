# syntax=docker/dockerfile:1.10
#
# Image du service de transcription local pour Syntheo, prête à l'emploi :
# NVIDIA NeMo-Speech.cpp 0.3.0 (Apache-2.0) avec les modèles Nemotron 3.5 ASR
# Streaming et Nemotron 3 Diarization (OpenMDW-1.1) intégrés.
#
# Le runtime vient du Dockerfile officiel de NeMo-Speech.cpp, cible `runtime`
# (FROM scratch, utilisateur 1000:1000), construit au commit épinglé et passé
# ici comme contexte nommé `nemo-speech-runtime`. docker-bake.hcl s'en charge :
#
# docker buildx bake -f deploy/transcription/docker-bake.hcl cpu --load
# docker buildx bake -f deploy/transcription/docker-bake.hcl cuda --load
#
# Contextes nommés attendus : nemo-speech-runtime (cible runtime) et
# nemo-speech-rootfs (cible rootfs du même build).

ARG NEMO_SPEECH_VERSION=0.3.0
ARG NEMO_SPEECH_COMMIT=20999cc921d2b14aa58708f61756a8b2e787ba20
# Image épinglée par empreinte (en ARG : le formateur ne lit pas `@sha256`
# dans un FROM).
ARG ALPINE_IMAGE=alpine:3.22@sha256:49340b346798875b5592e5d420241f2f9cfba5f47e62ebb1446a1b34734e898f

# --- Modèles GGUF et fiches des modèles, aux révisions figées, vérifiés -----
FROM ${ALPINE_IMAGE} AS models
ADD --checksum=sha256:3fc991d3badad7277c11030a7519832cddaf2057aafed6d4b25147e953a070b1 \
    https://huggingface.co/nvidia/nemotron-3.5-asr-streaming-0.6b/resolve/ea30d66debe3740a08b573244286791d423d6b3e/nemotron-3.5-asr-streaming-0.6b.q8_0.gguf \
    /out/models/nemotron-3.5-asr-streaming-0.6b.q8_0.gguf
ADD --checksum=sha256:08456d9e22cd9a323c0364d98375f3746d6e68507ebb705cd46438c534c7a3a1 \
    https://huggingface.co/nvidia/Nemotron-3-Diarization/resolve/52a432672732425e4c19765b9fec9b5810e6f4ba/Nemotron-3-Diarization.q8_0.gguf \
    /out/models/Nemotron-3-Diarization.q8_0.gguf
# Fiches des modèles : avis d'origine exigés par OpenMDW-1.1.
ADD --checksum=sha256:a3344caadf796c084c6b90a9fa5978068fd45e3a019790bebe50489bb3c0f7b7 \
    https://huggingface.co/nvidia/nemotron-3.5-asr-streaming-0.6b/resolve/ea30d66debe3740a08b573244286791d423d6b3e/README.md \
    /out/licenses/models/nemotron-3.5-asr-streaming-0.6b/MODEL_CARD.md
ADD --checksum=sha256:111370508eeeb0f397b13cef6c0d5c6cfa55a0f7089c8df7dd54dd2e8e597e86 \
    https://huggingface.co/nvidia/Nemotron-3-Diarization/resolve/52a432672732425e4c19765b9fec9b5810e6f4ba/README.md \
    /out/licenses/models/Nemotron-3-Diarization/MODEL_CARD.md
COPY licenses/OpenMDW-1.1.txt /out/licenses/models/nemotron-3.5-asr-streaming-0.6b/LICENSE.OpenMDW-1.1
COPY licenses/OpenMDW-1.1.txt /out/licenses/models/Nemotron-3-Diarization/LICENSE.OpenMDW-1.1
COPY licenses/README.md /out/licenses/README.md
# Fichiers en lecture seule, dossiers en 0755 : `docker cp` vers l'hôte
# reste possible (des dossiers r-x y bloquent la copie des fichiers).
RUN find /out -type d -exec chmod 0755 {} + && find /out -type f -exec chmod 0444 {} +

# --- Paquets Ubuntu des bibliothèques copiées dans le runtime ---------------
# Le runtime NVIDIA est FROM scratch : il copie les bibliothèques système
# (glibc, libstdc++, zlib, protobuf, abseil…) sans base de paquets, et ses
# avis de licence système restent vides (dpkg connaît /usr/lib/… et
# /usr/local/cuda-13.0/…, le runtime copie /lib/… et /usr/local/cuda/…).
# Depuis l'étape `rootfs` du même build, on retrouve le paquet de chaque fichier copié pour joindre son
# fichier copyright et une entrée dpkg par paquet (status.d, comme les images
# distroless) : Trivy et les SBOM voient alors ce que l'image contient.
FROM nemo-speech-rootfs AS system
RUN set -eu; \
    root=/opt/nemo-speech-scratch-rootfs; \
    mkdir -p /out/licenses /out/status.d /out/etc; \
    find "$root" -path "$root/opt" -prune -o \( -type f -o -type l \) -print \
      | while read -r file; do \
          path=${file#"$root"}; \
          dpkg-query -S "$path" 2>/dev/null || dpkg-query -S "/usr$path" 2>/dev/null \
            || dpkg-query -S "$(readlink -f "$path")" 2>/dev/null || true; \
        done \
      | sed -n 's/^\([a-z0-9][a-z0-9+.-]*\)[:,].*/\1/p' | sort -u > /out/packages; \
    while read -r package; do \
      dpkg-query -s "$package" > "/out/status.d/$package"; \
      if [ -f "/usr/share/doc/$package/copyright" ]; then \
        install -Dm0644 "/usr/share/doc/$package/copyright" "/out/licenses/$package/copyright"; \
      fi; \
    done < /out/packages; \
    dpkg-query -W -f '${Package} ${Version}\n' $(cat /out/packages) > /out/licenses/packages.txt; \
    cp /etc/os-release /etc/lsb-release /out/etc/; \
    find /out -type d -exec chmod 0755 {} +; \
    find /out -type f -exec chmod 0444 {} +; \
    test -s /out/packages

# --- Image finale -----------------------------------------------------------
FROM nemo-speech-runtime AS image
ARG NEMO_SPEECH_VERSION
ARG NEMO_SPEECH_COMMIT
ARG VARIANT=cuda

COPY --from=models /out/models/ /models/
COPY --from=models /out/licenses/ /licenses/
# Jeu de licences de NeMo-Speech.cpp, conservé tel quel dans
# /opt/nemo-speech/share/licenses/nemo-speech/, avec une copie ici.
COPY --from=nemo-speech-runtime /opt/nemo-speech/share/licenses/nemo-speech/ /licenses/nemo-speech.cpp/
COPY --from=system /out/licenses/ /licenses/system/
COPY --from=system /out/status.d/ /var/lib/dpkg/status.d/
COPY --from=system /out/etc/ /etc/

LABEL org.opencontainers.image.title="Syntheo transcription (NeMo-Speech.cpp ${NEMO_SPEECH_VERSION}, ${VARIANT})" \
      org.opencontainers.image.description="NVIDIA NeMo-Speech.cpp with Nemotron 3.5 ASR Streaming and Nemotron 3 Diarization, ready for Syntheo (FROM scratch runtime, no package manager)" \
      org.opencontainers.image.source="https://github.com/NVIDIA/NeMo-Speech.cpp/tree/${NEMO_SPEECH_COMMIT}" \
      org.opencontainers.image.revision="${NEMO_SPEECH_COMMIT}" \
      org.opencontainers.image.version="${NEMO_SPEECH_VERSION}-${VARIANT}" \
      org.opencontainers.image.licenses="Apache-2.0 AND LicenseRef-OpenMDW-1.1" \
      org.opencontainers.image.documentation="https://docs.syntheo.studio/en/local-transcription-service" \
      org.opencontainers.image.vendor="Syntheo"

# /ready répond sans clé, même avec NEMO_SPEECH_HTTP_API_KEY ; les modèles
# se chargent en quelques secondes.
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
    CMD ["/opt/nemo-speech/bin/nemo-speech", "health", "--quiet", "--timeout", "3"]

# Clé d'API facultative : variable NEMO_SPEECH_HTTP_API_KEY (vide : sans clé).
# `--endpointing` : un résultat définitif par phrase, au fil des silences
# (seuil réglé par Syntheo dans chaque session).
CMD ["--json", "serve", "--access-log", "--host", "0.0.0.0", "--port", "8080", "--asr-model", "/models/nemotron-3.5-asr-streaming-0.6b.q8_0.gguf", "--diar-model", "/models/Nemotron-3-Diarization.q8_0.gguf", "--endpointing"]
