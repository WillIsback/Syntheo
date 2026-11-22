---
license: other
license_name: openmdw-1.1
license_link: LICENSE.OpenMDW-1.1
base_model:
  - nvidia/nemotron-3.5-asr-streaming-0.6b
  - nvidia/Nemotron-3-Diarization
tags:
  - onnx
  - int8
  - speech-recognition
  - speaker-diarization
  - french
language:
  - fr
pipeline_tag: automatic-speech-recognition
---

# syntheo-speech models (int8)

Int8 ONNX weights used by `syntheo-speech`, the on-device transcription program
shipped with [Syntheo Desktop](https://github.com/WillIsback/Syntheo): streaming
speech recognition and speaker diarization, run locally with ONNX Runtime.

The models, their weights and their license are NVIDIA's. Syntheo only
quantized them to int8; nothing else was trained or changed.

| File                                                  | Source                                                                                                                                                       | Quantization                     |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------- |
| `nemotron/encoder.onnx`, `nemotron/encoder.onnx.data` | [nvidia/nemotron-3.5-asr-streaming-0.6b](https://huggingface.co/nvidia/nemotron-3.5-asr-streaming-0.6b), revision `ea30d66debe3740a08b573244286791d423d6b3e` | int8, per channel (MatMul, Gemm) |
| `nemotron/decoder_joint.onnx`                         | same                                                                                                                                                         | int8, per channel (MatMul, Gemm) |
| `nemotron/tokenizer.model`, `nemotron/config.json`    | same                                                                                                                                                         | unchanged                        |
| `diar/nemotron3_diar_v3.onnx`                         | [nvidia/Nemotron-3-Diarization](https://huggingface.co/nvidia/Nemotron-3-Diarization), revision `52a432672732425e4c19765b9fec9b5810e6f4ba`                   | int8, per tensor (MatMul, Gemm)  |

The ONNX exports come from
[altunenes/parakeet-rs](https://huggingface.co/altunenes/parakeet-rs), revision
`26684938ff242cb4f7a65fad712476c6015a4477`, which converts the NVIDIA models
without changing them.

## Reproduce

Quantization is reproducible byte for byte. From a checkout of the Syntheo
repository:

```sh
uv run --locked --script apps/speech/models/quantize.py <new empty folder>
python3 -I apps/speech/models/verify.py <that folder>
```

`quantize.py` downloads each source at the revision pinned in
`apps/speech/models/models.json`, checks its SHA-256, quantizes with
`onnxruntime.quantization.quantize_dynamic` (onnxruntime 1.32.0, onnx 1.23.2,
all dependencies locked by `quantize.py.lock`), then checks every produced file.
`verify.py` checks any copy of these files (this repository, the GitHub release
`speech-models-1`, a mirror) against the sizes and SHA-256 of `models.json`,
which Syntheo also compiles in and checks before every launch.

## Accuracy

Word error rate on French, measured by Syntheo: **10.73 %** with these int8
weights (95 % bootstrap interval 9.20 to 12.25), against **10.64 %** in FP32
(9.16 to 12.12).

The sample holds 150 utterances (4,475 words, 29.8 minutes of read speech): 100
from FLEURS `fr_fr` (test split) and 50 from Multilingual LibriSpeech `french`
(test split), drawn at random with fixed seeds. The intervals come from 1,000
bootstrap resamples of the utterances. With this sample size, a degradation
smaller than about 0.5 point between int8 and FP32 cannot be detected, and
spontaneous, noisy or far-field speech is not measured.

## License

[OpenMDW License Agreement, version 1.1](LICENSE.OpenMDW-1.1), the license of
the original NVIDIA models. The original model cards, which hold NVIDIA's
notices, are kept unchanged under `NOTICES/`, with the notes of the ONNX export.

These quantized weights are provided as is, without warranty of any kind, as
stated in the agreement.
