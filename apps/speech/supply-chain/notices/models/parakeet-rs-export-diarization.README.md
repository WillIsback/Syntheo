---
  license: openmdw-1.1
  base_model: nvidia/Nemotron-3-Diarization
  pipeline_tag: voice-activity-detection
  tags:
    - onnx
    - parakeet-rs
    - speaker-diarization
    - streaming-sortformer
---

# Nemotron 3 Diarization — ONNX for parakeet-rs

ONNX export of NVIDIA's [Nemotron 3 Diarization](https://huggingface.co/nvidia/Nemotron-3-Diarization)
(Streaming Sortformer v3): streaming speaker diarization, up to 8 speakers.

The model, its weights and its license are NVIDIA's. This folder only converts the original
checkpoint to ONNX; it is not an official NVIDIA release. See NVIDIA's model card for the model
description, training data, evaluation, and the bias, safety and privacy notes.

## Files

- `nemotron3_diar_v3.onnx` — fp32, dynamic time axes. Outputs speaker activity at both 80 ms
  (drives the speaker cache) and 10 ms (the results). The streaming defaults and the learned
  silence embedding are stored in the ONNX metadata.
- `LICENSE` — OpenMDW-1.1, the license the original model is released under.

## Usage (Rust, [parakeet-rs](https://github.com/altunenes/parakeet-rs))

```bash
hf download altunenes/parakeet-rs nemotron-3-diarization/nemotron3_diar_v3.onnx --local-dir .
```

```toml
parakeet-rs = { version = "0.3.8", features = ["sortformer"] }
```

```rust
use parakeet_rs::sortformer::{Sortformer, StreamingProfile};

let mut diarizer = Sortformer::new("nemotron-3-diarization/nemotron3_diar_v3.onnx")?;
let segments = diarizer.diarize(audio, 16000, 1)?; // 16 kHz f32 samples
for seg in segments {
    // start/end are sample offsets at 16 kHz
    println!("speaker_{} {:.2}s - {:.2}s", seg.speaker_id,
        seg.start as f64 / 16000.0, seg.end as f64 / 16000.0);
}

// Real time: pick a latency preset, then push audio as it arrives.
diarizer.set_profile(StreamingProfile::low_latency())?;
let segments = diarizer.feed(&chunk_16k_mono)?;
```

The same file runs every latency preset from NVIDIA's model card. They are selected at runtime:

| preset                | latency | chunk | right context | fifo | update | speaker cache |
|-----------------------|---------|-------|---------------|------|--------|---------------|
| `offline()` (default) | 30.4 s  | 340   | 40            | 40   | 300    | 264           |
| `low_latency()`       | 1.04 s  | 9     | 4             | 264  | 222    | 264           |
| `very_low_latency()`  | 0.64 s  | 6     | 2             | 264  | 222    | 264           |
| `ultra_low_latency()` | 0.32 s  | 3     | 1             | 264  | 222    | 264           |

Latency is the input buffer, `(chunk + right context) × 80 ms`, and excludes compute. Lower
presets run more model steps per second of audio. On an Apple M3 CPU, `offline()` runs about 30×
faster than real time and `low_latency()` about 2.8×; `ultra_low_latency()` needs a GPU or other
accelerator to keep up.

## Validation against NeMo

Compared with NVIDIA NeMo's own `diarize()` output (NeMo 3.1.0, CPU, fp32):

- **ONNX graph:** matches NeMo's PyTorch forward pass on 751 real streaming steps across all four
  presets, max difference ≈ 7e-6.
- **Full pipeline (parakeet-rs):** at 1.04 s, 0.64 s and 0.32 s latency, every speaker segment on
  the test files is identical to NeMo's. In `offline()`, every segment is within 10 ms of NeMo's.
  The remaining differences come from ties in the speaker-cache selection, broken in a different
  order by PyTorch.

## Export

Exported with [`scripts/export_diar_sortformer.py`](https://github.com/altunenes/parakeet-rs/blob/master/scripts/export_diar_sortformer.py).
The encoder's FlexAttention cannot be traced by `torch.onnx.export`, so the script replaces it with
the equivalent `scaled_dot_product_attention` during export only.

## License

[OpenMDW License Agreement, version 1.1](https://openmdw.ai/license/1-1/), the same as the original
model. A copy is in `LICENSE`.
