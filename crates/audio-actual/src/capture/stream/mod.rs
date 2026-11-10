use std::pin::Pin;
use std::sync::{
    Arc,
    atomic::{AtomicBool, Ordering},
};
use std::task::{Context, Poll};

use futures_util::Stream;
use syntheo_resampler::ResampleExtDynamicNew;
use tokio::task::JoinHandle;
use tokio_stream::wrappers::ReceiverStream;
use tokio_util::sync::CancellationToken;

use super::recovery::{OpenedChannel, run_channel};
use syntheo_audio::{CaptureChannel, CaptureConfig, CaptureEvent, CaptureStream, Error};

use crate::mic::MicInput;
use crate::speaker::SpeakerInput;

mod aec;
mod aligner;
mod loops;

use loops::{run_dual_loop, run_single_loop};

pub(crate) type ChunkStream =
    Pin<Box<dyn Stream<Item = Result<Vec<f32>, syntheo_resampler::Error>> + Send>>;

const AUDIO_SYNC_PROBE_ENV: &str = "AUDIO_SYNC_PROBE";
/// Écart d'alignement en deçà duquel un réalignement n'est journalisé qu'en DEBUG et n'est pas
/// appliqué : l'annulation d'écho garde son alignement et son état (#322).
///
/// La sonde recalcule la médiane des derniers retards toutes les quelques secondes : elle
/// oscille de quelques échantillons (bruit de mesure, dérive des horloges) sous sa tolérance de
/// regroupement (24 échantillons, 1,5 ms à 16 kHz). Une milliseconde (16 échantillons à
/// 16 kHz) sépare ce bruit d'un vrai déplacement du chemin d'écho.
const AEC_ALIGNMENT_SIGNIFICANT_SHIFT_MS: u32 = 1;
/// Déplacement de l'alignement, même sens, au-delà duquel l'annulation d'écho repart de zéro.
/// En deçà, les lignes de retard glissent vers le nouvel alignement sans réinitialisation : la
/// dérive d'horloge entre micro et haut-parleur (≈ 13 échantillons par seconde à 800 ppm) est
/// suivie en continu (#437). Même valeur que la tolérance d'aberration de la sonde (48
/// échantillons à 16 kHz).
const AEC_ALIGNMENT_RESET_SHIFT_MS: u32 = 3;
/// Une ligne de retard rejoint son nouvel alignement d'un échantillon tous les
/// `AEC_DELAY_SLEW_INTERVAL_SAMPLES` (250 échantillons par seconde à 16 kHz, bien au-delà
/// d'une dérive d'horloge réelle) : chaque pas répète ou saute un seul échantillon.
const AEC_DELAY_SLEW_INTERVAL_SAMPLES: usize = 64;
const AEC_MAX_REFERENCE_LAG_MS: u32 = 600;
const AEC_MIN_REFERENCE_OVERLAP_MS: u32 = 400;
const AEC_MIN_REFERENCE_RMS: f32 = 1e-4;
const AEC_MIN_MIC_RMS: f32 = 1e-4;
const AEC_MIN_REFERENCE_CORRELATION: f32 = 0.12;
const AEC_MAX_LINEAR_GAIN: f32 = 1.25;
const AEC_LINEAR_GAIN_SMOOTHING: f32 = 0.12;
const AEC_DOUBLE_TALK_RESIDUAL_RATIO: f32 = 0.08;
const AEC_ROBUST_GAIN_SEGMENTS: usize = 8;
const AEC_ROBUST_GAIN_MIN_SEGMENTS: usize = 3;

struct CaptureStreamInner {
    inner: ReceiverStream<Result<CaptureEvent, Error>>,
    cancel_token: CancellationToken,
    task: JoinHandle<()>,
}

impl Stream for CaptureStreamInner {
    type Item = Result<CaptureEvent, Error>;

    fn poll_next(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Option<Self::Item>> {
        Pin::new(&mut self.inner).poll_next(cx)
    }
}

impl Drop for CaptureStreamInner {
    fn drop(&mut self) {
        self.cancel_token.cancel();
        self.task.abort();
    }
}

pub(crate) fn setup_mic_stream(
    sample_rate: u32,
    chunk_size: usize,
    mic_device: Option<String>,
) -> Result<ChunkStream, Error> {
    let mic = MicInput::new(mic_device).map_err(|_| Error::MicOpenFailed)?;
    mic.stream()?
        .resampled_chunks(sample_rate, chunk_size)
        .map(|stream| Box::pin(stream) as ChunkStream)
        .map_err(|_| Error::MicStreamSetupFailed)
}

pub(crate) fn setup_speaker_stream(
    sample_rate: u32,
    chunk_size: usize,
) -> Result<ChunkStream, Error> {
    let speaker = SpeakerInput::new()
        .map_err(|error| Error::SpeakerStreamInitializationFailed(error.to_string()))?;
    speaker
        .stream()
        .map_err(|error| Error::SpeakerStreamInitializationFailed(error.to_string()))?
        .resampled_chunks(sample_rate, chunk_size)
        .map(|stream| Box::pin(stream) as ChunkStream)
        .map_err(|_| Error::SpeakerStreamSetupFailed)
}

pub(crate) fn open_recovering(config: CaptureConfig) -> CaptureStream {
    let cancel_token = CancellationToken::new();
    let (tx, rx) = tokio::sync::mpsc::channel(32);
    let (mic_retry, mic_rx) = tokio::sync::mpsc::unbounded_channel();
    let (speaker_retry, speaker_rx) = tokio::sync::mpsc::unbounded_channel();
    let cancel = cancel_token.clone();
    let aec_enabled = Arc::new(AtomicBool::new(config.enable_aec));
    let aec_config = aec_enabled.clone();
    let speaker_output_retry = speaker_retry.clone();
    let task = tokio::spawn(async move {
        let (chunks_tx, chunks_rx) = tokio::sync::mpsc::channel(32);
        let rate = config.sample_rate;
        let size = config.chunk_size;
        let mic = run_channel(
            CaptureChannel::Mic,
            Arc::new(move |device, excluded| {
                if crate::mic::startup_pending() {
                    return Err(Error::MicStreamInitializationFailed(
                        "previous microphone startup is still pending".into(),
                    ));
                }
                let mut excluded = excluded.to_vec();
                let first = MicInput::new_excluding(device.clone(), &excluded).or_else(|error| {
                    if excluded.is_empty() {
                        Err(error)
                    } else {
                        excluded.clear();
                        MicInput::new_excluding(device.clone(), &excluded)
                    }
                });
                let mut input = Some(first?);
                loop {
                    let input = match input.take() {
                        Some(input) => input,
                        None => MicInput::new_excluding(device.clone(), &excluded)?,
                    };
                    let name = input.device_name();
                    match input.stream() {
                        Ok(stream) => {
                            return Ok(OpenedChannel {
                                stream: Box::pin(
                                    stream
                                        .resampled_chunks(rate, size)
                                        .map_err(|_| Error::MicStreamSetupFailed)?,
                                ),
                                device: Some(name),
                            });
                        }
                        Err(error) => {
                            excluded.push(name);
                            if crate::mic::startup_pending() {
                                return Err(error);
                            }
                        }
                    }
                }
            }),
            config.mic_device,
            mic_rx,
            chunks_tx.clone(),
            cancel.clone(),
        );
        let speaker = run_channel(
            CaptureChannel::Speaker,
            Arc::new(move |_, _| {
                Ok(OpenedChannel {
                    stream: setup_speaker_stream(rate, size)?,
                    device: None,
                })
            }),
            None,
            speaker_rx,
            chunks_tx,
            cancel.clone(),
        );
        let output = run_dual_loop(tx, cancel.clone(), rate, size, aec_config, chunks_rx);
        tokio::join!(mic, speaker, output);
    });
    CaptureStream::with_events(CaptureStreamInner {
        inner: ReceiverStream::new(rx),
        cancel_token,
        task,
    })
    .with_retry(move |device, force_mic| {
        let _ = mic_retry.send((device.clone(), force_mic));
        let _ = speaker_retry.send((device, false));
    })
    .with_output_change(move |enable_aec| {
        aec_enabled.store(enable_aec, Ordering::Release);
        let _ = speaker_output_retry.send((None, true));
    })
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum CaptureSide {
    Mic,
    Speaker,
}

pub(crate) fn open_single(chunk_stream: ChunkStream, side: CaptureSide) -> CaptureStream {
    let cancel_token = CancellationToken::new();
    let (tx, rx) = tokio::sync::mpsc::channel(32);
    let task = tokio::spawn(run_single_loop(
        tx,
        cancel_token.clone(),
        chunk_stream,
        side,
    ));

    CaptureStream::with_events(CaptureStreamInner {
        inner: ReceiverStream::new(rx),
        cancel_token,
        task,
    })
}

#[cfg(test)]
mod aec_drift_tests;
#[cfg(test)]
mod aec_jitter_tests;

#[cfg(test)]
mod tests;
