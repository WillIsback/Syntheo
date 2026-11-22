# Licences et avis du module syntheo-speech

Le module livré contient ce dossier (sous `licenses/`), listé dans le manifeste signé.

| Composant                                                                          | Origine (révision figée)                                                                                                                          | Licence                                             | Fichiers                                                                             |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------ |
| syntheo-speech                                                                     | dépôt Syntheo, `apps/speech`                                                                                                                      | MIT                                                 | —                                                                                    |
| ONNX Runtime 1.31.0, liée statiquement (archive pyke, empreinte dans `../ort.tsv`) | wheel PyPI `onnxruntime-1.31.0-cp312-cp312-manylinux_2_28_x86_64.whl`, SHA-256 `5e129d6c56abd53e659cb70f00a108d6824086470ff99c2e47a82e5786563db3` | MIT ; composants tiers dans `ThirdPartyNotices.txt` | `onnxruntime/`                                                                       |
| Crates Rust du binaire                                                             | `apps/speech/Cargo.lock`                                                                                                                          | MIT, Apache-2.0 et autres licences permissives      | `THIRD-PARTY-RUST.html`, généré à la construction par `cargo about`                  |
| Nemotron 3.5 ASR Streaming 0.6B, int8                                              | https://huggingface.co/nvidia/nemotron-3.5-asr-streaming-0.6b, révision `ea30d66debe3740a08b573244286791d423d6b3e`                                | OpenMDW-1.1                                         | `models/nemotron-3.5-asr-streaming-0.6b.MODEL_CARD.md`, `models/LICENSE.OpenMDW-1.1` |
| Nemotron 3 Diarization, int8                                                       | https://huggingface.co/nvidia/Nemotron-3-Diarization, révision `52a432672732425e4c19765b9fec9b5810e6f4ba`                                         | OpenMDW-1.1                                         | `models/Nemotron-3-Diarization.MODEL_CARD.md`                                        |
| Audio de mise en service (`commissioning/mic.wav`, `sys.wav`) | Multilingual LibriSpeech, partie française, révision `2e83e61823b4c47dcbcb1980bb88601274127609` ; enregistrements LibriVox | CC BY 4.0 (MLS) ; enregistrements du domaine public | `commissioning-audio-ATTRIBUTION.md` |
| Export ONNX des deux modèles                                                       | https://huggingface.co/altunenes/parakeet-rs, révision `26684938ff242cb4f7a65fad712476c6015a4477`                                                 | celle des modèles NVIDIA (OpenMDW-1.1)              | `models/parakeet-rs-export*.README.md`                                               |

- Les fiches des modèles sont les `README.md` des dépôts ci-dessus, aux révisions indiquées, sans modification : ce sont les avis d'origine que l'accord OpenMDW-1.1 demande de conserver.
- Les poids livrés sont quantifiés en int8 par Syntheo (`../../models/quantize.py`), à partir de l'export ci-dessus.
- Sous Windows, ONNX Runtime est la variante DirectML. `DirectML.dll` n'est pas livrée : c'est celle de Windows (System32).
- Le runtime Visual C++ livré sous Windows (`vcruntime140*.dll`, `msvcp140*.dll`) est redistribuable selon la licence de Visual Studio.

---

The module bundles ONNX Runtime 1.31.0 (MIT, third-party notices in `onnxruntime/ThirdPartyNotices.txt`), Rust crates (notices in `THIRD-PARTY-RUST.html`), and the Nemotron 3.5 ASR Streaming and Nemotron 3 Diarization models quantized to int8 (OpenMDW-1.1, model cards and agreement text under `models/`). Sources and revisions are listed in the table above.
