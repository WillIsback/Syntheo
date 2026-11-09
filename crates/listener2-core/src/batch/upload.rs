use std::sync::Arc;
use std::time::Duration;

use owhisper_client::BatchUploadLimit;
use syntheo_audio_utils::Source;

pub(in crate::batch) fn decode_base64(data_base64: &str) -> Result<Vec<u8>, String> {
    use base64::Engine as _;

    base64::engine::general_purpose::STANDARD
        .decode(data_base64)
        .map_err(|error| format!("invalid in-memory audio: {error}"))
}

/// Source d'un envoi batch, empruntée : un fichier lu à son emplacement
/// d'origine, ou un tampon en mémoire (dictée, fichier déposé, segment). Dans
/// les deux cas l'audio n'est jamais copié sur le disque.
#[derive(Debug, Clone, Copy)]
pub(in crate::batch) enum AudioInputRef<'a> {
    Path(&'a str),
    Bytes {
        data: &'a Arc<[u8]>,
        file_name: &'a str,
    },
}

impl AudioInputRef<'_> {
    pub(in crate::batch) fn into_owned(self) -> AudioInput {
        match self {
            AudioInputRef::Path(path) => AudioInput::Path(path.to_string()),
            AudioInputRef::Bytes { data, .. } => AudioInput::Bytes(Arc::clone(data)),
        }
    }

    fn byte_len(&self) -> Option<u64> {
        match self {
            AudioInputRef::Path(path) => std::fs::metadata(path).ok().map(|meta| meta.len()),
            AudioInputRef::Bytes { data, .. } => Some(data.len() as u64),
        }
    }
}

/// Source possédée, pour le découpage en tâche bloquante. Le tampon est
/// partagé : le cloner ne recopie pas l'audio.
#[derive(Debug, Clone)]
pub(in crate::batch) enum AudioInput {
    Path(String),
    Bytes(Arc<[u8]>),
}

impl AudioInput {
    pub(in crate::batch) fn metadata(&self) -> Result<syntheo_audio_utils::AudioMetadata, String> {
        match self {
            AudioInput::Path(path) => {
                syntheo_audio_utils::audio_file_metadata(path).map_err(|error| error.to_string())
            }
            AudioInput::Bytes(data) => syntheo_audio_utils::audio_bytes_metadata(Arc::clone(data))
                .map_err(|error| error.to_string()),
        }
    }

    fn duration(&self) -> Option<Duration> {
        match self {
            AudioInput::Path(path) => syntheo_audio_utils::source_from_path(path)
                .ok()
                .and_then(|source| source.total_duration()),
            AudioInput::Bytes(data) => syntheo_audio_utils::source_from_bytes(Arc::clone(data))
                .ok()
                .and_then(|source| source.total_duration()),
        }
    }

    /// Décode en PCM 16 bits mono à `sample_rate`, **en mémoire**, pour le
    /// flux temps réel (issue 463) : même décodeur que l'import par lot.
    pub(in crate::batch) fn decode_pcm16_mono(&self, sample_rate: u32) -> Result<Vec<i16>, String> {
        match self {
            AudioInput::Path(path) => {
                let source = syntheo_audio_utils::source_from_path(path)
                    .map_err(|error| error.to_string())?;
                decode_source_pcm16_mono(source, sample_rate)
            }
            AudioInput::Bytes(data) => {
                let source = syntheo_audio_utils::source_from_bytes(Arc::clone(data))
                    .map_err(|error| error.to_string())?;
                decode_source_pcm16_mono(source, sample_rate)
            }
        }
    }

    /// Décode et découpe en segments MP3 mono, **en mémoire**.
    fn encode_segments(&self, segment_duration: Duration) -> Result<Vec<Vec<u8>>, String> {
        match self {
            AudioInput::Path(path) => {
                let source = syntheo_audio_utils::source_from_path(path)
                    .map_err(|error| error.to_string())?;
                syntheo_mp3::encode_mono_segments_in_memory(source, segment_duration)
                    .map_err(|error| error.to_string())
            }
            AudioInput::Bytes(data) => {
                let source = syntheo_audio_utils::source_from_bytes(Arc::clone(data))
                    .map_err(|error| error.to_string())?;
                syntheo_mp3::encode_mono_segments_in_memory(source, segment_duration)
                    .map_err(|error| error.to_string())
            }
        }
    }
}

/// Les canaux sont mêlés en un seul flux : toutes les voix du fichier.
fn decode_source_pcm16_mono<S: Source>(source: S, sample_rate: u32) -> Result<Vec<i16>, String> {
    let mut samples = Vec::new();
    syntheo_audio_utils::for_each_resampled_channel_block::<_, syntheo_audio_utils::Error>(
        source,
        sample_rate,
        |channels| {
            let Some(first) = channels.first() else {
                return Ok(());
            };
            let count = channels.len() as f32;
            samples.reserve(first.len());
            for frame in 0..first.len() {
                let mixed = channels
                    .iter()
                    .map(|channel| channel.get(frame).copied().unwrap_or(0.0))
                    .sum::<f32>()
                    / count;
                samples.push(syntheo_audio_utils::f32_to_i16(mixed));
            }
            Ok(())
        },
    )
    .map_err(|error| error.to_string())?;
    Ok(samples)
}

pub(super) fn audio_duration(input: &AudioInputRef<'_>) -> Option<Duration> {
    input.into_owned().duration()
}

/// Recordings past a provider's upload cap or per-request duration cap are
/// re-encoded as mono MP3 segments and sent one request at a time.
pub(super) fn segment_plan(
    input: &AudioInputRef<'_>,
    audio_duration: Option<Duration>,
    limit: Option<BatchUploadLimit>,
) -> Option<Duration> {
    let limit = limit?;
    let size = input.byte_len()?;
    let too_long = audio_duration.is_some_and(|duration| duration > limit.max_duration);

    (size > limit.max_bytes || too_long).then_some(limit.max_duration)
}

/// Segments are materialized in memory: nothing derived from the audio may be
/// written to disk.
pub(super) async fn split_batch_upload(
    input: &AudioInputRef<'_>,
    segment_duration: Duration,
    provider: &str,
) -> crate::Result<Vec<Vec<u8>>> {
    let failure = |message: &str| crate::BatchFailure::DirectRequestFailed {
        provider: provider.to_string(),
        message: message.to_string(),
    };

    let owned = input.into_owned();
    let segments = tokio::task::spawn_blocking(move || owned.encode_segments(segment_duration))
        .await
        .map_err(|_error| {
            tracing::error!(
                error.type = "local_task_join_failed",
                "batch_audio_segment_task_failed"
            );
            failure("Syntheo couldn't prepare this recording for transcription.")
        })?
        .map_err(|_error| {
            tracing::error!(
                error.type = "audio_encode_failed",
                "batch_audio_segment_failed"
            );
            failure("Syntheo couldn't split this recording for transcription.")
        })?;

    if segments.is_empty() {
        return Err(failure("This recording has no audio to transcribe.").into());
    }

    tracing::info!(
        segments = segments.len(),
        segment_seconds = segment_duration.as_secs(),
        "batch audio split for provider upload limits"
    );

    Ok(segments)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Minimal 16-bit mono PCM WAV, so the in-memory path is exercised without
    /// writing an audio file to disk.
    fn sine_wav(seconds: u32, sample_rate: u32) -> Vec<u8> {
        let frames = sample_rate * seconds;
        let data_len = frames * 2;
        let mut wav = Vec::with_capacity(44 + data_len as usize);
        wav.extend_from_slice(b"RIFF");
        wav.extend_from_slice(&(36 + data_len).to_le_bytes());
        wav.extend_from_slice(b"WAVEfmt ");
        wav.extend_from_slice(&16u32.to_le_bytes());
        wav.extend_from_slice(&1u16.to_le_bytes());
        wav.extend_from_slice(&1u16.to_le_bytes());
        wav.extend_from_slice(&sample_rate.to_le_bytes());
        wav.extend_from_slice(&(sample_rate * 2).to_le_bytes());
        wav.extend_from_slice(&2u16.to_le_bytes());
        wav.extend_from_slice(&16u16.to_le_bytes());
        wav.extend_from_slice(b"data");
        wav.extend_from_slice(&data_len.to_le_bytes());
        for index in 0..frames {
            let phase = (index as f32 / sample_rate as f32) * 440.0 * std::f32::consts::TAU;
            let sample = (phase.sin() * 0.5 * i16::MAX as f32) as i16;
            wav.extend_from_slice(&sample.to_le_bytes());
        }
        wav
    }

    fn assert_first_is_mp3(segment: &[u8]) {
        assert!(!segment.is_empty());
        assert_eq!(segment[0], 0xFF);
        assert_eq!(segment[1] & 0xE0, 0xE0);
    }

    #[tokio::test]
    async fn in_memory_input_segments_without_touching_the_disk() {
        let data: Arc<[u8]> = Arc::from(sine_wav(3, 16_000).into_boxed_slice());
        let input = AudioInputRef::Bytes {
            data: &data,
            file_name: "dictation.wav",
        };

        let segments = split_batch_upload(&input, Duration::from_secs(1), "openai")
            .await
            .unwrap();

        assert!(segments.len() >= 3, "got {} segments", segments.len());
        assert_first_is_mp3(&segments[0]);
    }

    #[test]
    fn in_memory_input_reports_duration_and_size() {
        let wav = sine_wav(2, 16_000);
        let data: Arc<[u8]> = Arc::from(wav.clone().into_boxed_slice());
        let input = AudioInputRef::Bytes {
            data: &data,
            file_name: "dictation.wav",
        };

        let duration = audio_duration(&input).expect("decoded duration");
        assert!(duration.as_secs() >= 1, "{duration:?}");
        assert_eq!(input.byte_len(), Some(wav.len() as u64));
    }

    #[test]
    fn in_memory_input_decodes_to_mono_pcm_at_the_stream_rate() {
        let data: Arc<[u8]> = Arc::from(sine_wav(2, 8_000).into_boxed_slice());
        let samples = AudioInput::Bytes(data).decode_pcm16_mono(16_000).unwrap();

        let seconds = samples.len() as f64 / 16_000.0;
        assert!((seconds - 2.0).abs() < 0.05, "{seconds} s");
        assert!(samples.iter().any(|sample| sample.unsigned_abs() > 8_000));
    }

    #[test]
    fn path_source_without_a_file_has_no_duration_or_size() {
        let input = AudioInputRef::Path("/nonexistent/audio.mp3");
        assert!(audio_duration(&input).is_none());
        assert_eq!(input.byte_len(), None);
    }
}
