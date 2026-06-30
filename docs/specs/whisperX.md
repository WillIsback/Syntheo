# whisperx-gb10

[![Docker Hub](https://img.shields.io/badge/Docker%20Hub-willisback%2Fwhisperx--gb10-2496ED?style=flat-square&logo=docker&logoColor=white)](https://hub.docker.com/r/willisback/whisperx-gb10)
[![GHCR](https://img.shields.io/badge/GHCR-ghcr.io%2Fwillisback%2Fwhisperx--gb10-24292e?style=flat-square&logo=github&logoColor=white)](https://ghcr.io/willisback/whisperx-gb10)
[![Architecture](https://img.shields.io/badge/arch-aarch64%20%7C%20sm__121-76b900?style=flat-square&logo=nvidia&logoColor=white)](https://www.nvidia.com/en-us/products/workstations/dgx-spark/)

**WhisperX ASR + Speaker Diarization API** — Docker image built for **NVIDIA GB10 (DGX Spark)**, ARM64 / aarch64, CUDA sm_121.

> **Architecture note:** This image is purpose-built for the NVIDIA Grace Blackwell GB10 SoC (aarch64 + CUDA compute capability 12.1). It will not run on x86_64 hosts or GPUs older than sm_121.

## What's inside

| Component | Version | Notes |
|-----------|---------|-------|
| Base image | `nvcr.io/nvidia/pytorch:25.05-py3` | NVIDIA's torch 2.8.0 pre-compiled for sm_121 |
| [WhisperX](https://github.com/m-bain/whisperX) | latest (git) | `large-v3` model, word-level alignment |
| [CTranslate2](https://github.com/OpenNMT/CTranslate2) | 4.8.0 | Built from source with CUDA support |
| [pyannote.audio](https://github.com/pyannote/pyannote-audio) | ≥3.3.0 | Speaker diarization |
| FastAPI | ≥0.111 | Async REST API, Bearer-token auth |
| OpenTelemetry | — | Optional OTLP tracing to Phoenix/Arize |

## Requirements

- NVIDIA GB10 / DGX Spark (aarch64, sm_121)
- Docker with `--runtime=nvidia` or `runtime: nvidia`
- A [Hugging Face token](https://huggingface.co/settings/tokens) with access to:
  - [`pyannote/speaker-diarization-3.1`](https://huggingface.co/pyannote/speaker-diarization-3.1)
  - [`pyannote/segmentation-3.0`](https://huggingface.co/pyannote/segmentation-3.0)

## Quick start

### 1. Pull

```bash
docker pull willisback/whisperx-gb10:latest
# or from GitHub Container Registry:
docker pull ghcr.io/willisback/whisperx-gb10:latest
```

### 2. Run

```bash
docker run -d \
  --name whisperx \
  --runtime=nvidia \
  --network=host \
  -e WHISPERX_API_KEY=your-secret-key \
  -e HF_TOKEN=hf_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx \
  -v $HOME/.cache/huggingface:/root/.cache/huggingface \
  -v whisperx_jobs:/data \
  willisback/whisperx-gb10:latest
```

Or with Docker Compose (see [`compose` section](#docker-compose)).

### 3. Verify

```bash
curl http://localhost:30050/health
# → {"status":"ok"}
```

## Environment variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `WHISPERX_API_KEY` | **yes** | — | Bearer token for all API endpoints |
| `HF_TOKEN` | **yes** | — | Hugging Face token — needed to download pyannote diarization models |
| `CUDA_VISIBLE_DEVICES` | no | `0` | GPU index (default: first GPU) |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | no | — | OTLP HTTP endpoint for tracing (e.g. `http://phoenix:4318`) |
| `OTEL_SERVICE_NAME` | no | `whisperx` | Service name in traces |
| `PHOENIX_PROJECT_NAME` | no | — | Project name in Arize Phoenix |

## API

All endpoints require `Authorization: Bearer <WHISPERX_API_KEY>`.

### Submit a transcription job

```bash
curl -X POST http://localhost:30050/asr/v1/transcribe \
  -H "Authorization: Bearer $KEY" \
  -F "audio_file=@speech.wav" \
  -F "language=fr"
```

**Form fields:**

| Field | Default | Description |
|-------|---------|-------------|
| `audio_file` | required | Audio file (wav, mp3, flac, m4a…) — max 500 MB |
| `language` | `fr` | BCP-47 language code (`en`, `fr`, `de`, `es`, …) |
| `initial_prompt` | — | Hint text to guide transcription style/vocabulary |
| `hotwords` | — | Comma-separated words to boost (e.g. `"Claude,Anthropic"`) |
| `num_speakers` | — | Force exact speaker count for diarization |

**Response (202):**
```json
{ "job_id": "153fcffd-...", "status": "pending" }
```

### Poll for results

```bash
curl http://localhost:30050/asr/v1/jobs/153fcffd-... \
  -H "Authorization: Bearer $KEY"
```

**Response when completed:**
```json
{
  "job_id": "153fcffd-...",
  "status": "completed",
  "duration_s": 24.5,
  "num_speakers": 2,
  "segments": [
    {
      "start": 0.15,
      "end": 3.93,
      "speaker": "SPEAKER_00",
      "text": " Bonjour, je suis un assistant vocal."
    }
  ]
}
```

**Status values:** `pending` → `processing` → `completed` / `failed`

### Download subtitles

```bash
# SRT
curl http://localhost:30050/asr/v1/jobs/<job_id>/srt \
  -H "Authorization: Bearer $KEY" -o output.srt

# WebVTT
curl http://localhost:30050/asr/v1/jobs/<job_id>/vtt \
  -H "Authorization: Bearer $KEY" -o output.vtt

# Plain text
curl http://localhost:30050/asr/v1/jobs/<job_id>/txt \
  -H "Authorization: Bearer $KEY" -o output.txt
```

## Docker Compose

```yaml
services:
  whisperx:
    image: willisback/whisperx-gb10:latest
    container_name: whisperx
    runtime: nvidia
    network_mode: host
    environment:
      WHISPERX_API_KEY: ${WHISPERX_API_KEY}
      HF_TOKEN: ${HF_TOKEN}
      CUDA_VISIBLE_DEVICES: "0"
      # Optional — OpenTelemetry tracing
      # OTEL_EXPORTER_OTLP_ENDPOINT: "http://phoenix:4318"
      # OTEL_SERVICE_NAME: "whisperx"
    volumes:
      - ~/.cache/huggingface:/root/.cache/huggingface
      - whisperx_jobs:/data
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-sf", "http://localhost:30050/health"]
      interval: 30s
      timeout: 10s
      retries: 10
      start_period: 120s

volumes:
  whisperx_jobs:
```

Put secrets in a `.env` file next to your `compose.yml`:
```
WHISPERX_API_KEY=your-secret-key
HF_TOKEN=hf_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

## First-run model download

On first startup the container downloads:
- `openai/whisper-large-v3` via faster-whisper (~3 GB)
- `pyannote/speaker-diarization-3.1` and segmentation model (~500 MB)

Models are cached in `/root/.cache/huggingface` (mounted volume). Subsequent starts skip downloads.
The first request after a cold start will take **2–5 minutes** while models load into GPU memory.

## Build from source

```bash
git clone https://github.com/WillIsback/whisperx-gb10.git
cd whisperx-gb10
docker build -t whisperx-gb10:local .
```

Build time: ~20 minutes (CTranslate2 compiles from source).

## Tested on

| Hardware | OS | CUDA |
|----------|----|------|
| NVIDIA DGX Spark (GB10, 128 GB unified) | Ubuntu 24.04 aarch64 | 12.9 / sm_121 |