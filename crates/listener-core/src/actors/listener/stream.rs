use std::hash::{DefaultHasher, Hash, Hasher};

use futures_util::StreamExt;
use owhisper_client::FinalizeHandle;
use owhisper_interface::stream::{Extra, StreamResponse};
use ractor::{ActorRef, rpc::CallResult};

use super::{FINALIZE_STREAM_TIMEOUT, ListenerMsg};

const PROVIDER_RESPONSE_ACK_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(1);
const FINALIZE_HANDLE_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(1);
const MAX_FINAL_RESPONSES: usize = 64;
const TRANSCRIPT_PROGRESS_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(30);
const MIN_ACTIVE_AUDIO_SAMPLES: usize = crate::actors::SAMPLE_RATE as usize * 5;
const MAX_TRACKED_CHANNELS: usize = 16;
const MAX_UNFINALIZED_AUDIO_SAMPLES: usize = crate::actors::SAMPLE_RATE as usize * 90;

pub(super) struct StreamProgress {
    last_progress_at: std::time::Instant,
    last_response_at: std::time::Instant,
    last_partials_hash: Option<u64>,
    /// Last provisional hypothesis seen per provider channel, as a text hash.
    provisional_hashes: Vec<(i32, u64)>,
    active_samples: usize,
    unfinalized_samples: usize,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(super) enum StallReason {
    NoProgress,
    UnfinalizedCap,
}

/// What tripped the watchdog. A provider that kept answering (`secs_since_response` near zero)
/// while `secs_since_progress` grew was alive but hearing nothing; a large `secs_since_response`
/// is a wedged stream.
#[derive(Clone, Copy, Debug)]
pub(super) struct StallDiagnostics {
    pub(super) reason: StallReason,
    pub(super) active_audio_secs: f64,
    pub(super) unfinalized_audio_secs: f64,
    pub(super) secs_since_progress: f64,
    pub(super) secs_since_response: f64,
}

impl StreamProgress {
    pub(super) fn new(now: std::time::Instant) -> Self {
        Self {
            last_progress_at: now,
            last_response_at: now,
            last_partials_hash: None,
            provisional_hashes: Vec::new(),
            active_samples: 0,
            unfinalized_samples: 0,
        }
    }

    pub(super) fn observe_audio(&mut self, samples: usize, now: std::time::Instant) -> bool {
        self.active_samples = self.active_samples.saturating_add(samples);
        self.unfinalized_samples = self.unfinalized_samples.saturating_add(samples);
        self.no_progress(now) || self.unfinalized_samples >= MAX_UNFINALIZED_AUDIO_SAMPLES
    }

    /// Any provider message, including ones carrying no transcript progress.
    ///
    /// A provisional hypothesis whose text changed on its channel is progress in itself: on
    /// continuous speech a server may go 30 s without finalizing while its hypothesis keeps
    /// growing, and that must not be mistaken for a stall even when the transcript engine
    /// discards the words (issue #268). Empty or repeated hypotheses prove nothing, so a server
    /// that answers without new text still trips the watchdog.
    pub(super) fn observe_response(&mut self, response: &StreamResponse, now: std::time::Instant) {
        self.last_response_at = now;
        let StreamResponse::TranscriptResponse {
            is_final: false,
            channel,
            channel_index,
            ..
        } = response
        else {
            return;
        };
        let text = channel
            .alternatives
            .first()
            .map_or("", |alternative| alternative.transcript.trim());
        if text.is_empty() {
            return;
        }
        let mut hasher = DefaultHasher::new();
        text.hash(&mut hasher);
        let hash = hasher.finish();
        let channel = channel_index.first().copied().unwrap_or_default();
        let known = self
            .provisional_hashes
            .iter()
            .position(|(known, _)| *known == channel);
        match known {
            Some(index) if self.provisional_hashes[index].1 == hash => {}
            Some(index) => {
                self.provisional_hashes[index].1 = hash;
                self.mark_progress(now);
            }
            None if self.provisional_hashes.len() < MAX_TRACKED_CHANNELS => {
                self.provisional_hashes.push((channel, hash));
                self.mark_progress(now);
            }
            None => {}
        }
    }

    fn mark_progress(&mut self, now: std::time::Instant) {
        self.last_progress_at = now;
        self.active_samples = 0;
    }

    pub(super) fn diagnostics(&self, now: std::time::Instant) -> StallDiagnostics {
        let sample_rate = crate::actors::SAMPLE_RATE as f64;
        StallDiagnostics {
            reason: if self.no_progress(now) {
                StallReason::NoProgress
            } else {
                StallReason::UnfinalizedCap
            },
            active_audio_secs: self.active_samples as f64 / sample_rate,
            unfinalized_audio_secs: self.unfinalized_samples as f64 / sample_rate,
            secs_since_progress: now.duration_since(self.last_progress_at).as_secs_f64(),
            secs_since_response: now.duration_since(self.last_response_at).as_secs_f64(),
        }
    }

    fn no_progress(&self, now: std::time::Instant) -> bool {
        self.active_samples >= MIN_ACTIVE_AUDIO_SAMPLES
            && now.duration_since(self.last_progress_at) >= TRANSCRIPT_PROGRESS_TIMEOUT
    }

    pub(super) fn observe_delta(
        &mut self,
        delta: &crate::LiveTranscriptDelta,
        now: std::time::Instant,
    ) {
        let finalized = delta
            .new_words
            .iter()
            .any(|word| !word.text.trim().is_empty());
        let mut partials_hash = None;
        let mut hasher = DefaultHasher::new();
        for word in delta
            .partials
            .iter()
            .filter(|word| !word.text.trim().is_empty())
        {
            (&word.text, word.start_ms, word.end_ms, word.channel).hash(&mut hasher);
            partials_hash = Some(hasher.finish());
        }
        if finalized || (partials_hash.is_some() && partials_hash != self.last_partials_hash) {
            self.mark_progress(now);
        }
        self.last_partials_hash = partials_hash;
        if finalized {
            self.unfinalized_samples = 0;
        }
    }
}

pub(super) fn active_audio_samples(audio: &[u8]) -> usize {
    let samples = audio.len() / 2;
    if samples == 0 {
        return 0;
    }
    let energy = audio
        .chunks_exact(2)
        .map(|bytes| {
            let sample = f64::from(i16::from_le_bytes([bytes[0], bytes[1]])) / 32768.0;
            sample * sample
        })
        .sum::<f64>();

    // Quiet meetings must not reconnect just because there is no transcript.
    if energy / samples as f64 >= 0.005_f64.powi(2) {
        samples
    } else {
        0
    }
}

pub(super) async fn process_stream<S, E, H>(
    mut listen_stream: std::pin::Pin<&mut S>,
    handle: H,
    myself: ActorRef<ListenerMsg>,
    mut shutdown_rx: tokio::sync::oneshot::Receiver<()>,
    offset_secs: f64,
    extra: Extra,
    response_timeout: Option<std::time::Duration>,
) -> Vec<StreamResponse>
where
    S: futures_util::Stream<Item = Result<StreamResponse, E>>,
    E: std::fmt::Debug,
    H: FinalizeHandle,
{
    loop {
        tokio::select! {
            _ = &mut shutdown_rx => {
                return collect_final_responses(
                    listen_stream.as_mut(),
                    &handle,
                    offset_secs,
                    &extra,
                    None,
                ).await;
            }
            result = async {
                // Local recognizers emit only speech, so silence is not a connection failure.
                match response_timeout {
                    Some(timeout) => tokio::time::timeout(timeout, listen_stream.next()).await,
                    None => Ok(listen_stream.next().await),
                }
            } => {
                match result {
                    Ok(Some(Ok(mut response))) => {
                        response.apply_offset(offset_secs);
                        response.set_extra(&extra);

                        let response_for_shutdown = response.clone();
                        let delivery = myself.call(
                            move |reply| ListenerMsg::StreamResponse(response, reply),
                            Some(PROVIDER_RESPONSE_ACK_TIMEOUT),
                        );
                        tokio::pin!(delivery);

                        tokio::select! {
                            biased;
                            result = &mut delivery => {
                                match result {
                                    Ok(CallResult::Success(())) => {}
                                    Ok(CallResult::Timeout) => {
                                        tracing::warn!("provider_response_ack_timed_out");
                                        myself.kill();
                                        return Vec::new();
                                    }
                                    Ok(CallResult::SenderError) | Err(_) => {
                                        tracing::warn!("actor_gone_breaking_stream_loop");
                                        return Vec::new();
                                    }
                                }
                            }
                            _ = &mut shutdown_rx => {
                                return collect_final_responses(
                                    listen_stream.as_mut(),
                                    &handle,
                                    offset_secs,
                                    &extra,
                                    Some(response_for_shutdown),
                                ).await;
                            }
                        }
                    }
                    Ok(Some(Err(error))) => {
                        let _ = myself.send_message(ListenerMsg::StreamError(format!("{error:?}")));
                        return Vec::new();
                    }
                    Ok(None) => {
                        let _ = myself.send_message(ListenerMsg::StreamEnded);
                        return Vec::new();
                    }
                    Err(elapsed) => {
                        let _ = myself.send_message(ListenerMsg::StreamTimeout(elapsed));
                        return Vec::new();
                    }
                }
            }
        }
    }
}

async fn collect_final_responses<S, E, H>(
    mut listen_stream: std::pin::Pin<&mut S>,
    handle: &H,
    offset_secs: f64,
    extra: &Extra,
    initial_response: Option<StreamResponse>,
) -> Vec<StreamResponse>
where
    S: futures_util::Stream<Item = Result<StreamResponse, E>>,
    E: std::fmt::Debug,
    H: FinalizeHandle,
{
    if tokio::time::timeout(FINALIZE_HANDLE_TIMEOUT, handle.finalize())
        .await
        .is_err()
    {
        tracing::warn!("provider_finalize_timed_out");
    }

    let expected_count = handle.expected_finalize_count();
    let mut responses = initial_response.into_iter().collect::<Vec<_>>();
    let mut finalize_count = responses
        .iter()
        .filter(|response| is_from_finalize(response))
        .count();

    if expected_count > 0 && finalize_count >= expected_count {
        return responses;
    }

    let finalize_timeout = tokio::time::sleep(FINALIZE_STREAM_TIMEOUT);
    tokio::pin!(finalize_timeout);

    loop {
        tokio::select! {
            _ = &mut finalize_timeout => {
                tracing::warn!(syntheo.timeout.reached = true, "break_timeout");
                break;
            }
            result = listen_stream.next() => {
                match result {
                    Some(Ok(mut response)) => {
                        if is_from_finalize(&response) {
                            finalize_count += 1;
                        }
                        response.apply_offset(offset_secs);
                        response.set_extra(extra);
                        responses.push(response);

                        if expected_count > 0 && finalize_count >= expected_count {
                            tracing::info!(finalize_count, expected_count, "break_from_finalize");
                            break;
                        }
                        if responses.len() >= MAX_FINAL_RESPONSES {
                            tracing::warn!(
                                collected = responses.len(),
                                expected_count,
                                "final_response_limit_reached"
                            );
                            break;
                        }
                    }
                    Some(Err(error)) => {
                        tracing::warn!(error.message = ?error, "break_from_finalize");
                        break;
                    }
                    None => {
                        tracing::info!(syntheo.stream.ended = true, "break_from_finalize");
                        break;
                    }
                }
            }
        }
    }

    responses
}

fn is_from_finalize(response: &StreamResponse) -> bool {
    matches!(
        response,
        StreamResponse::TranscriptResponse {
            from_finalize: true,
            ..
        }
    )
}

#[cfg(test)]
mod tests;
