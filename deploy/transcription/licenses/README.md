# Licences de l'image syntheo-transcription

Cette image assemble trois composants, chacun sous sa propre licence.

| Composant | Origine (révision figée) | Licence | Fichiers |
|---|---|---|---|
| NVIDIA NeMo-Speech.cpp 0.3.0 (serveur, bibliothèques, runtime CUDA) | https://github.com/NVIDIA/NeMo-Speech.cpp, commit `20999cc921d2b14aa58708f61756a8b2e787ba20` (tag v0.3.0) | Apache-2.0 ; composants tiers dans `THIRD_PARTY_NOTICES.md` (MIT, BSD, LGPL-2.1+ pour KenLM, accord NVIDIA pour le runtime CUDA…) | `nemo-speech.cpp/` (copie de `/opt/nemo-speech/share/licenses/nemo-speech/`) |
| Nemotron 3.5 ASR Streaming 0.6B, GGUF q8_0 | https://huggingface.co/nvidia/nemotron-3.5-asr-streaming-0.6b, révision `ea30d66debe3740a08b573244286791d423d6b3e` | OpenMDW-1.1 | `models/nemotron-3.5-asr-streaming-0.6b/` |
| Nemotron 3 Diarization, GGUF q8_0 | https://huggingface.co/nvidia/Nemotron-3-Diarization, révision `52a432672732425e4c19765b9fec9b5810e6f4ba` | OpenMDW-1.1 | `models/Nemotron-3-Diarization/` |

- Les poids sont redistribués sans modification. `MODEL_CARD.md` est la fiche
  du modèle à la même révision (avis d'origine) ; `LICENSE.OpenMDW-1.1` est le
  texte de l'accord (https://github.com/OpenMDW/OpenMDW, `1.1/LICENSE.OpenMDW-1.1`).
- Les sources de NeMo-Speech.cpp, y compris celles des bibliothèques sous LGPL
  (KenLM), sont celles du commit ci-dessus ; les labels OCI
  `org.opencontainers.image.source` et `org.opencontainers.image.revision` de
  l'image y renvoient.
- Le Dockerfile de cette image est dans le dépôt Syntheo :
  https://github.com/WillIsback/Syntheo/tree/main/deploy/transcription

---

This image combines NVIDIA NeMo-Speech.cpp 0.3.0 (Apache-2.0, third-party
notices in `nemo-speech.cpp/THIRD_PARTY_NOTICES.md`) with the unmodified
Nemotron 3.5 ASR Streaming and Nemotron 3 Diarization weights (OpenMDW-1.1,
model cards and agreement text under `models/`). Sources: see the table above.
