---
license: other
license_name: openmdw-1.1
license_link: https://huggingface.co/WillisBack/syntheo-speech-models/blob/main/LICENSE.OpenMDW-1.1
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

| File                                                  | Source                                                                                                                                                       | Quantization                                    |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------- |
| `nemotron/encoder.onnx`, `nemotron/encoder.onnx.data` | [nvidia/nemotron-3.5-asr-streaming-0.6b](https://huggingface.co/nvidia/nemotron-3.5-asr-streaming-0.6b), revision `ea30d66debe3740a08b573244286791d423d6b3e` | int8, per channel (MatMul, Gemm), reduced range |
| `nemotron/decoder_joint.onnx`                         | same                                                                                                                                                         | int8, per channel (MatMul, Gemm), reduced range |
| `nemotron/tokenizer.model`, `nemotron/config.json`    | same                                                                                                                                                         | unchanged                                       |
| `diar/nemotron3_diar_v3.onnx`                         | [nvidia/Nemotron-3-Diarization](https://huggingface.co/nvidia/Nemotron-3-Diarization), revision `52a432672732425e4c19765b9fec9b5810e6f4ba`                   | int8, per tensor (MatMul, Gemm), reduced range  |

Weights are quantized to reduced-range int8 (`reduce_range`: values in
[-64, 64]) so that the models also work on CPUs without VNNI; see
[CPU compatibility](#cpu-compatibility).

The ONNX exports come from
[altunenes/parakeet-rs](https://huggingface.co/altunenes/parakeet-rs), revision
`26684938ff242cb4f7a65fad712476c6015a4477`, which converts the NVIDIA models
without changing them.

## Parameters

Elements of the ONNX initializers of these files, counted from the tensor
shapes (quantization scales and zero points included; they are negligible):

| File                          | Parameters  | int8               | float32            |
| ----------------------------- | ----------- | ------------------ | ------------------ |
| `nemotron/encoder.onnx`       | 624.6 M     | 537.8 M (86 %)     | 86.8 M (14 %)      |
| `nemotron/decoder_joint.onnx` | 24.4 M      | 9.5 M (39 %)       | 15.0 M (61 %)      |
| `diar/nemotron3_diar_v3.onnx` | 99.9 M      | 98.2 M (98 %)      | 1.7 M (2 %)        |
| **Total**                     | **748.9 M** | **645.4 M (86 %)** | **103.5 M (14 %)** |

Only the weights of matrix products (MatMul, Gemm) are quantized; the other
weights (convolutions, embeddings, normalization) stay in float32.

## Performance

Real-time factor (processing time divided by audio duration, lower is faster)
with ONNX Runtime on the CPU, for the two streams of a meeting (microphone and
system audio) with speaker diarization, as Syntheo runs them:

| Computer                                    | Speech recognition, 1 stream | Diarization, 1 stream | 2 streams with diarization |
| ------------------------------------------- | ---------------------------- | --------------------- | -------------------------- |
| AMD Ryzen 9 9950X, limited to 4 cores       | 0.086                        | 0.049                 | 0.19                       |
| Intel Core i7-10510U, 4 cores, performance  | to be measured               | to be measured        | to be measured             |
| Intel Core i7-10510U, 4 cores, power saving | to be measured               | to be measured        | to be measured             |

Syntheo measures each computer before using it (about 30 seconds per profile)
and keeps transcription on the computer only if final results arrive less than
2 seconds after the end-of-utterance wait, at the 95th percentile, without
drift.

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

Word error rate on French, measured by Syntheo on a computer with VNNI (AMD
Ryzen 9 9950X, 4 cores): **12.55 %** with these int8 weights (95 % bootstrap
interval 10.73 to 14.45), against **12.52 %** in FP32 (10.72 to 14.35). The
paired difference is +0.02 point (−0.39 to +0.44): no measurable degradation.

The sample holds 150 utterances (4,208 words, 29.9 minutes of read speech): 100
from FLEURS `fr_fr` (test split) and 50 from Multilingual LibriSpeech `french`
(test split), drawn at random with fixed seeds. The intervals come from 1,000
bootstrap resamples of the utterances. With this sample size, a degradation
smaller than about 0.5 point between int8 and FP32 cannot be detected, and
spontaneous, noisy or far-field speech is not measured.

## CPU compatibility

ONNX Runtime multiplies int8 weights by uint8 activations. On x86 CPUs without
VNNI (Intel up to most 10th-generation Core, AMD up to Zen 3), its AVX2 kernel
adds two such products in a 16-bit integer, which overflows with full-range
int8 weights: an earlier quantization of these models produced no words at all
on those CPUs. With reduced-range int8 weights ([-64, 64], 129 levels) the
worst case (255 × 64 × 2 = 32,640) fits in 16 bits (at most 32,767).

In a one-off measurement under emulation of a CPU without VNNI (QEMU
`Skylake-Client` and `Haswell`, AVX2), on 16 utterances of the sample above
(530 words), these weights gave a word error rate of 12.08 % against 11.32 % in
FP32 (paired difference +0.75 point, −0.19 to +1.87), and every utterance was
transcribed.

Each release is checked before publication under QEMU `Skylake-Client` (AVX2
without VNNI), on two 30-second clips (`apps/speech/models/cpu-check`). For
each clip, the output must hold at least 80 % of the words of the FP32
reference, have a word error rate of at most 5 % against the FP32 transcript,
give every word a speaker, and find the same number of distinct speakers as the
FP32 reference. This check guards against a failure on CPUs without VNNI; it
does not measure accuracy.

Verified natively on AVX-512 with VNNI and under emulation on AVX2 without
VNNI; AVX-512 without VNNI (for example first-generation Xeon Scalable) is not
verified.

## License

[OpenMDW License Agreement, version 1.1](LICENSE.OpenMDW-1.1), the license of
the original NVIDIA models. The original model cards, which hold NVIDIA's
notices, are kept unchanged under `NOTICES/`, with the notes of the ONNX export.

These quantized weights are provided as is, without warranty of any kind, as
stated in the agreement.
