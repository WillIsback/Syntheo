use std::{
    sync::{
        Arc,
        atomic::{AtomicU64, Ordering},
    },
    time::Instant,
};

use ractor::{ActorRef, MessagingErr, rpc::CallResult};

use crate::actors::{ChannelMode, ListenerAudioResult, ListenerMsg};
use syntheo_audio_utils::f32_to_i16_bytes;

use super::{
    BufferedAudio, LISTENER_AUDIO_ACK_TIMEOUT, LISTENER_BACKPRESSURE_RETRY_DELAY,
    LISTENER_BACKPRESSURE_TIMEOUT, LISTENER_DISPATCH_CAPACITY,
};

pub(super) struct ListenerDispatcher {
    tx: tokio::sync::mpsc::Sender<ListenerDispatch>,
    task: tokio::task::JoinHandle<()>,
    generation: Arc<AtomicU64>,
    /// Capture position up to which a listener accepted the audio.
    delivered: Arc<AtomicU64>,
}

struct ListenerDispatch {
    actor: ActorRef<ListenerMsg>,
    audio: ListenerAudio,
    generation: u64,
    end_position: u64,
}

#[derive(Clone)]
enum ListenerAudio {
    Single(bytes::Bytes),
    Dual(bytes::Bytes, bytes::Bytes),
}

impl ListenerDispatcher {
    pub(super) fn new() -> Self {
        let (tx, mut rx) =
            tokio::sync::mpsc::channel::<ListenerDispatch>(LISTENER_DISPATCH_CAPACITY);
        let generation = Arc::new(AtomicU64::new(0));
        let task_generation = generation.clone();
        let delivered = Arc::new(AtomicU64::new(0));
        let task_delivered = delivered.clone();
        let task = tokio::spawn(async move {
            // A stopping listener rejects messages while it finalizes its stream.
            let mut stopping_listener = None;
            while let Some(dispatch) = rx.recv().await {
                if stopping_listener == Some(dispatch.actor.get_id()) {
                    continue;
                }
                let started_at = Instant::now();
                loop {
                    if dispatch.generation != task_generation.load(Ordering::Acquire) {
                        break;
                    }

                    let actor = dispatch.actor.clone();
                    let result = match &dispatch.audio {
                        ListenerAudio::Single(audio) => {
                            let audio = audio.clone();
                            actor
                                .call(
                                    move |reply| ListenerMsg::AudioSingle(audio, reply),
                                    Some(LISTENER_AUDIO_ACK_TIMEOUT),
                                )
                                .await
                        }
                        ListenerAudio::Dual(mic, spk) => {
                            let mic = mic.clone();
                            let spk = spk.clone();
                            actor
                                .call(
                                    move |reply| ListenerMsg::AudioDual(mic, spk, reply),
                                    Some(LISTENER_AUDIO_ACK_TIMEOUT),
                                )
                                .await
                        }
                    };

                    match result {
                        Ok(CallResult::Success(ListenerAudioResult::Accepted)) => {
                            task_delivered.fetch_max(dispatch.end_position, Ordering::AcqRel);
                            break;
                        }
                        Ok(CallResult::Success(ListenerAudioResult::Backpressured)) => {
                            if started_at.elapsed() >= LISTENER_BACKPRESSURE_TIMEOUT {
                                stop_listener(&actor, "listener_audio_backpressure_timed_out");
                                break;
                            }
                            tokio::time::sleep(LISTENER_BACKPRESSURE_RETRY_DELAY).await;
                        }
                        Ok(CallResult::Success(ListenerAudioResult::Closed)) => {
                            stop_listener(&actor, "listener_audio_channel_closed");
                            break;
                        }
                        Ok(CallResult::Success(ListenerAudioResult::ModeMismatch)) => {
                            stop_listener(&actor, "listener_audio_mode_mismatch");
                            break;
                        }
                        Ok(CallResult::SenderError) => {
                            tracing::warn!("listener_stopped_before_acknowledging_audio");
                            break;
                        }
                        Ok(CallResult::Timeout) => {
                            kill_listener(&actor, "listener_audio_ack_timed_out");
                            break;
                        }
                        // The listener is stopping or stopped. Killing it would abort the
                        // `post_stop` that commits its provisional transcript; the audio it
                        // never accepted is replayed to the next listener instead.
                        Err(MessagingErr::SendErr(_) | MessagingErr::ChannelClosed) => {
                            tracing::info!("listener_stopping_audio_kept_for_replay");
                            stopping_listener = Some(actor.get_id());
                            break;
                        }
                        Err(error) => {
                            tracing::warn!(error.message = ?error, "listener_audio_send_failed");
                            actor.kill();
                            break;
                        }
                    }
                }
            }
        });

        Self {
            tx,
            task,
            generation,
            delivered,
        }
    }

    pub(super) fn reset(&self) {
        self.generation.fetch_add(1, Ordering::AcqRel);
    }

    pub(super) fn reset_delivery(&self) {
        self.delivered.store(0, Ordering::Release);
    }

    pub(super) fn delivered_through(&self) -> u64 {
        self.delivered.load(Ordering::Acquire)
    }

    pub(super) fn try_send(&self, actor: ActorRef<ListenerMsg>, item: &BufferedAudio) -> bool {
        let Ok(permit) = self.tx.try_reserve() else {
            return false;
        };
        let (mic, spk) = (&item.mic, &item.spk);

        let audio = match item.mode {
            ChannelMode::MicOnly => ListenerAudio::Single(f32_to_i16_bytes(mic.iter().copied())),
            ChannelMode::SpeakerOnly => {
                ListenerAudio::Single(f32_to_i16_bytes(spk.iter().copied()))
            }
            ChannelMode::MicAndSpeaker => ListenerAudio::Dual(
                f32_to_i16_bytes(mic.iter().copied()),
                f32_to_i16_bytes(spk.iter().copied()),
            ),
        };

        permit.send(ListenerDispatch {
            actor,
            audio,
            generation: self.generation.load(Ordering::Acquire),
            end_position: item.end_position,
        });
        true
    }
}

fn stop_listener(actor: &ActorRef<ListenerMsg>, reason: &'static str) {
    tracing::warn!(reason, "listener_audio_delivery_failed");
    actor.stop(Some(reason.to_string()));
}

fn kill_listener(actor: &ActorRef<ListenerMsg>, reason: &'static str) {
    tracing::warn!(reason, "listener_audio_delivery_failed");
    actor.kill();
}

impl Drop for ListenerDispatcher {
    fn drop(&mut self) {
        self.task.abort();
    }
}
