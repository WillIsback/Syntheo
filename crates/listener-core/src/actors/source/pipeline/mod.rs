use std::{sync::Arc, time::Duration};

use ractor::ActorRef;

use crate::{
    ListenerRuntime,
    actors::{ChannelMode, ListenerMsg, SAMPLE_RATE},
};
use syntheo_vad_masking::VadMask;

use super::{ListenerRefreshReplay, ListenerRouting, SourceFrame};

mod buffers;
mod dispatcher;
mod monitors;

use buffers::{AudioBuffer, ReplayHistory};
use dispatcher::ListenerDispatcher;
use monitors::{AmplitudeEmitter, DropoutMonitor};

const AUDIO_AMPLITUDE_THROTTLE: Duration = Duration::from_millis(100);
// In-memory only (never written to disk): 300 chunks of 120 ms hold 36 s of
// audio, enough for a full replay plus the time a reconnection takes.
const MAX_BUFFER_CHUNKS: usize = 300;
// Audio the previous stream accepted but may not have transcribed yet.
const REPLAY_CONTEXT_SECS: usize = 5;
// Upper bound of a replay: the context plus everything the previous listener
// never accepted (sent while it was stopping, or while the session waited to
// reconnect). A stream that stops on the unfinalized cap spends up to 7 s
// finalizing, then the first retry comes ~1 s later.
const MAX_REPLAY_SECS: usize = 15;
const LISTENER_DISPATCH_CAPACITY: usize = 32;
const LISTENER_AUDIO_ACK_TIMEOUT: Duration = Duration::from_secs(1);
const LISTENER_BACKPRESSURE_TIMEOUT: Duration = Duration::from_secs(1);
const LISTENER_BACKPRESSURE_RETRY_DELAY: Duration = Duration::from_millis(10);
const MAX_BACKLOG_DISPATCH_PER_FRAME: usize = 2;
const DROPOUT_WINDOW_SAMPLES: usize = SAMPLE_RATE as usize * 5;
const DROPOUT_RATIO_THRESHOLD: f32 = 0.15;

#[derive(Clone)]
struct BufferedAudio {
    mic: Arc<[f32]>,
    spk: Arc<[f32]>,
    mode: ChannelMode,
    /// Captured samples up to the end of this item, counted from the start of capture.
    end_position: u64,
}

impl BufferedAudio {
    fn new(mic: Arc<[f32]>, spk: Arc<[f32]>, mode: ChannelMode, end_position: u64) -> Self {
        Self {
            mic,
            spk,
            mode,
            end_position,
        }
    }

    fn sample_count(&self) -> usize {
        self.mic.len().max(self.spk.len())
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(super) enum DispatchFrameResult {
    Complete,
}

pub(in crate::actors) struct Pipeline {
    vad_mask: VadMask,
    amplitude: AmplitudeEmitter,
    dropouts: DropoutMonitor,
    audio_buffer: AudioBuffer,
    replay_history: ReplayHistory,
    listener_dispatcher: ListenerDispatcher,
    captured_samples: u64,
}

impl Pipeline {
    pub(super) fn new(runtime: Arc<dyn ListenerRuntime>, session_id: String) -> Self {
        Self {
            amplitude: AmplitudeEmitter::new(runtime.clone(), session_id.clone()),
            dropouts: DropoutMonitor::new(runtime, session_id),
            audio_buffer: AudioBuffer::new(MAX_BUFFER_CHUNKS),
            replay_history: ReplayHistory::new(SAMPLE_RATE as usize * MAX_REPLAY_SECS),
            listener_dispatcher: ListenerDispatcher::new(),
            vad_mask: VadMask::default(),
            captured_samples: 0,
        }
    }

    pub(super) fn reset(&mut self) {
        self.amplitude.reset();
        self.dropouts.reset();
        self.audio_buffer.clear();
        self.replay_history.clear();
        self.listener_dispatcher.reset();
        self.listener_dispatcher.reset_delivery();
        self.vad_mask = VadMask::default();
        self.captured_samples = 0;
    }

    pub(super) async fn dispatch_frame(
        &mut self,
        frame: SourceFrame,
        mode: ChannelMode,
        listener_routing: &ListenerRouting,
    ) -> Result<DispatchFrameResult, String> {
        self.dispatch(frame, mode, listener_routing).await
    }

    pub(super) fn on_listener_routing_changed(&mut self, listener_routing: &ListenerRouting) {
        match listener_routing {
            ListenerRouting::Buffering => {}
            ListenerRouting::Attached(actor) => {
                self.flush_buffer_to_listener(actor, usize::MAX);
            }
            ListenerRouting::Dropped => {
                self.listener_dispatcher.reset();
                self.audio_buffer.clear();
            }
        }
    }

    /// Queues the audio the next listener must hear before live audio: what the
    /// previous listener never accepted, plus a few seconds it accepted but may
    /// not have transcribed. Everything stays in memory and is bounded.
    pub(super) fn prepare_listener_refresh(&mut self) -> ListenerRefreshReplay {
        self.listener_dispatcher.reset();
        self.audio_buffer.clear();

        let undelivered = self
            .captured_samples
            .saturating_sub(self.listener_dispatcher.delivered_through());
        let wanted = usize::try_from(undelivered)
            .unwrap_or(usize::MAX)
            .saturating_add(SAMPLE_RATE as usize * REPLAY_CONTEXT_SECS)
            .min(SAMPLE_RATE as usize * MAX_REPLAY_SECS);
        let mut replayed: usize = 0;
        for item in self.replay_history.tail(wanted) {
            replayed += item.sample_count();
            self.audio_buffer.push_item(item);
        }

        ListenerRefreshReplay {
            duration_secs: replayed as f64 / SAMPLE_RATE as f64,
            // The replay is the most recent audio: the context shrinks first,
            // so every undelivered sample is in it unless they alone outgrew
            // `MAX_REPLAY_SECS`. Only then did the outage lose audio.
            complete: u64::try_from(replayed).unwrap_or(u64::MAX) >= undelivered,
        }
    }

    async fn dispatch(
        &mut self,
        frame: SourceFrame,
        mode: ChannelMode,
        listener_routing: &ListenerRouting,
    ) -> Result<DispatchFrameResult, String> {
        if mode != ChannelMode::SpeakerOnly {
            self.dropouts.observe(&frame.capture.raw_mic);
        }

        let (mut processed_mic, processed_spk) = Self::select_tracks(frame, mode);
        self.vad_mask.process(&mut processed_mic);
        let processed_mic = Arc::<[f32]>::from(processed_mic);
        let samples = processed_mic.len().max(processed_spk.len()) as u64;
        self.captured_samples = self.captured_samples.saturating_add(samples);
        let item = BufferedAudio::new(processed_mic, processed_spk, mode, self.captured_samples);

        self.complete_item(item, listener_routing);
        Ok(DispatchFrameResult::Complete)
    }

    fn complete_item(&mut self, item: BufferedAudio, listener_routing: &ListenerRouting) {
        self.replay_history.push(item.clone());
        self.amplitude.observe_mic(&item.mic);
        self.amplitude.observe_spk(&item.spk);

        match listener_routing {
            ListenerRouting::Buffering => {
                self.audio_buffer.push_item(item);
                tracing::debug!(
                    buffered = self.audio_buffer.len(),
                    "listener_unavailable_buffering"
                );
            }
            ListenerRouting::Attached(actor) => {
                if self.audio_buffer.is_empty() {
                    if !self.send_to_listener(actor, &item) {
                        self.audio_buffer.push_item(item);
                    }
                } else {
                    self.audio_buffer.push_item(item);
                    self.flush_buffer_to_listener(actor, MAX_BACKLOG_DISPATCH_PER_FRAME);
                }
            }
            ListenerRouting::Dropped => {}
        }
    }

    fn flush_buffer_to_listener(&mut self, actor: &ActorRef<ListenerMsg>, max_items: usize) {
        for _ in 0..max_items {
            let Some(item) = self.audio_buffer.pop() else {
                break;
            };

            if !self.send_to_listener(actor, &item) {
                self.audio_buffer.push_front(item);
                break;
            }
        }
    }

    fn send_to_listener(&self, actor: &ActorRef<ListenerMsg>, item: &BufferedAudio) -> bool {
        self.listener_dispatcher.try_send(actor.clone(), item)
    }

    fn select_tracks(frame: SourceFrame, mode: ChannelMode) -> (Vec<f32>, Arc<[f32]>) {
        let raw_speaker = Arc::clone(&frame.capture.raw_speaker);
        // Son système coupé (issue 447) : du silence de même longueur, pour que le STT garde sa
        // connexion et sa cadence. L'annulation d'écho a déjà eu lieu à la capture, avec la
        // vraie référence : le son coupé ne revient pas par le micro.
        let speaker = if frame.speaker_muted {
            Arc::<[f32]>::from(vec![0.0; raw_speaker.len()])
        } else {
            Arc::clone(&raw_speaker)
        };

        let mic_source = match mode {
            ChannelMode::SpeakerOnly => Arc::<[f32]>::from(vec![0.0; raw_speaker.len()]),
            ChannelMode::MicOnly | ChannelMode::MicAndSpeaker => frame.capture.preferred_mic(),
        };

        let mic = if frame.mic_muted {
            vec![0.0; mic_source.len()]
        } else {
            mic_source.to_vec()
        };

        (mic, speaker)
    }
}

#[cfg(test)]
mod tests;
