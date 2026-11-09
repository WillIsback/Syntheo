use std::sync::{
    Arc,
    atomic::{AtomicBool, Ordering},
};

use futures_util::StreamExt;
use tokio_util::sync::CancellationToken;

use super::super::recovery::ChannelItem;
use syntheo_audio::{CaptureChannel, CaptureEvent, CaptureFrame, Error};

use super::super::echo_gate::{EchoCanceller, GatedEchoCanceller};
use super::super::joiner::Joiner;

use super::aec::{build_aec, process_aec};
use super::aligner::{AecAlignedPair, AecReferenceAligner};
use super::{CaptureSide, ChunkStream};

pub(super) async fn run_dual_loop(
    tx: tokio::sync::mpsc::Sender<Result<CaptureEvent, Error>>,
    cancel_token: CancellationToken,
    sample_rate: u32,
    chunk_size: usize,
    aec_enabled: Arc<AtomicBool>,
    mut chunks: tokio::sync::mpsc::Receiver<ChannelItem>,
) {
    let mut joiner = Joiner::new();
    let mut enable_aec = aec_enabled.load(Ordering::Acquire);
    let mut aec_models = syntheo_aec::model_generation();
    let mut aec = if enable_aec {
        build_aec(sample_rate)
    } else {
        None
    };
    let mut linear_echo_gain = None;
    let mut aec_reference = if aec.is_some() {
        Some(AecReferenceAligner::new(sample_rate))
    } else {
        None
    };

    let mut mic_ready = false;
    let mut speaker_ready = false;
    let mut last_frame_at = None;
    let mut gap = None;
    let mut clock = tokio::time::interval(std::time::Duration::from_secs_f64(
        chunk_size as f64 / sample_rate as f64,
    ));
    clock.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
    loop {
        let item = tokio::select! {
            _ = cancel_token.cancelled() => return,
            _ = clock.tick(), if gap.is_some() => {
                if !emit_gap(&tx, &cancel_token, sample_rate, chunk_size, gap.as_mut().unwrap()).await {
                    return;
                }
                continue;
            },
            item = chunks.recv() => item,
        };
        let Some(item) = item else {
            return;
        };
        let updated_aec = aec_enabled.load(Ordering::Acquire);
        // Modèles arrivés en cours de capture (premier lancement) : l'annulation d'écho, voulue
        // mais indisponible jusque-là, démarre sans attendre la capture suivante.
        let models = syntheo_aec::model_generation();
        let models_arrived = enable_aec && aec.is_none() && models != aec_models;
        aec_models = models;
        if updated_aec != enable_aec || models_arrived {
            enable_aec = updated_aec;
            aec = if enable_aec {
                build_aec(sample_rate)
            } else {
                None
            };
            linear_echo_gain = None;
            aec_reference = aec.as_ref().map(|_| AecReferenceAligner::new(sample_rate));
        }
        match item {
            ChannelItem::Ready(channel, device) => {
                if let Some(mut gap) = gap.take()
                    && !emit_gap(&tx, &cancel_token, sample_rate, chunk_size, &mut gap).await
                {
                    return;
                }
                match channel {
                    CaptureChannel::Mic => mic_ready = true,
                    CaptureChannel::Speaker => speaker_ready = true,
                }
                if tx
                    .send(Ok(CaptureEvent::ChannelReady { channel, device }))
                    .await
                    .is_err()
                {
                    return;
                }
            }
            ChannelItem::Failed(channel, error) => {
                match channel {
                    CaptureChannel::Mic => {
                        mic_ready = false;
                        joiner.clear_mic();
                    }
                    CaptureChannel::Speaker => {
                        speaker_ready = false;
                        joiner.clear_speaker();
                    }
                }
                if !mic_ready && !speaker_ready && gap.is_none() {
                    gap = last_frame_at.map(|at| (at, 0));
                }
                reset_echo_cancellation(&mut aec, &mut linear_echo_gain);
                aec_reference = aec.as_ref().map(|_| AecReferenceAligner::new(sample_rate));
                if tx
                    .send(Ok(CaptureEvent::ChannelFailed { channel, error }))
                    .await
                    .is_err()
                {
                    return;
                }
            }
            ChannelItem::Chunk(channel, data) => match channel {
                CaptureChannel::Mic => joiner.push_mic(data),
                CaptureChannel::Speaker => joiner.push_speaker(data),
            },
        }
        while let Some((raw_mic, raw_speaker)) = joiner.pop_available_pair(mic_ready, speaker_ready)
        {
            last_frame_at = Some(tokio::time::Instant::now());
            let raw_mic = Arc::<[f32]>::from(raw_mic);
            let raw_speaker = Arc::<[f32]>::from(raw_speaker);
            let aec_mic = if mic_ready && speaker_ready {
                let aligned = aec_reference
                    .as_mut()
                    .map(|aligner| aligner.align(&raw_speaker, &raw_mic))
                    .unwrap_or_else(|| AecAlignedPair {
                        mic: Arc::clone(&raw_mic),
                        speaker: Arc::clone(&raw_speaker),
                        alignment_changed: false,
                    });
                if aligned.alignment_changed {
                    reset_echo_cancellation(&mut aec, &mut linear_echo_gain);
                }
                process_aec(
                    &mut aec,
                    &mut linear_echo_gain,
                    &aligned.mic,
                    &aligned.speaker,
                )
            } else {
                None
            };
            if tx
                .send(Ok(CaptureEvent::Frame(CaptureFrame {
                    raw_mic,
                    raw_speaker,
                    aec_mic,
                })))
                .await
                .is_err()
            {
                return;
            }
        }
    }
}

/// Oublie l'état de l'annulation d'écho : modèle et gain d'écho linéaire.
pub(super) fn reset_echo_cancellation<P: EchoCanceller>(
    aec: &mut Option<GatedEchoCanceller<P>>,
    linear_echo_gain: &mut Option<f32>,
) {
    if let Some(processor) = aec.as_mut() {
        processor.reset();
    }
    *linear_echo_gain = None;
}

async fn emit_gap(
    tx: &tokio::sync::mpsc::Sender<Result<CaptureEvent, Error>>,
    cancel: &CancellationToken,
    sample_rate: u32,
    chunk_size: usize,
    gap: &mut (tokio::time::Instant, usize),
) -> bool {
    let elapsed_samples = (gap.0.elapsed().as_secs_f64() * sample_rate as f64) as usize;
    while gap.1 < elapsed_samples {
        let count = (elapsed_samples - gap.1).min(chunk_size);
        let silence = Arc::<[f32]>::from(vec![0.0; count]);
        let frame = CaptureFrame {
            raw_mic: silence.clone(),
            raw_speaker: silence,
            aec_mic: None,
        };
        tokio::select! {
            _ = cancel.cancelled() => return false,
            result = tx.send(Ok(CaptureEvent::Gap(frame))) => {
                if result.is_err() { return false; }
            }
        }
        gap.1 += count;
    }
    true
}

pub(super) async fn run_single_loop(
    tx: tokio::sync::mpsc::Sender<Result<CaptureEvent, Error>>,
    cancel_token: CancellationToken,
    mut chunk_stream: ChunkStream,
    side: CaptureSide,
) {
    loop {
        tokio::select! {
            _ = cancel_token.cancelled() => return,
            item = chunk_stream.next() => {
                match item {
                    Some(Ok(data)) => {
                        let data = Arc::<[f32]>::from(data);
                        let silence = Arc::<[f32]>::from(vec![0.0f32; data.len()]);
                        let frame = match side {
                            CaptureSide::Mic => CaptureFrame {
                                raw_mic: data,
                                raw_speaker: silence,
                                aec_mic: None,
                            },
                            CaptureSide::Speaker => CaptureFrame {
                                raw_mic: silence,
                                raw_speaker: data,
                                aec_mic: None,
                            },
                        };
                        if tx.send(Ok(CaptureEvent::Frame(frame))).await.is_err() {
                            return;
                        }
                    }
                    Some(Err(_)) => {
                        let err = match side {
                            CaptureSide::Mic => Error::MicResampleFailed,
                            CaptureSide::Speaker => Error::SpeakerResampleFailed,
                        };
                        let _ = tx.send(Err(err)).await;
                        return;
                    }
                    None => {
                        let err = match side {
                            CaptureSide::Mic => Error::MicStreamEnded,
                            CaptureSide::Speaker => Error::SpeakerStreamEnded,
                        };
                        let _ = tx.send(Err(err)).await;
                        return;
                    }
                }
            }
        }
    }
}
