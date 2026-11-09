use std::sync::Mutex;
use std::time::{Duration, Instant};

use ractor::{Actor, ActorProcessingErr, ActorRef};

use super::*;
use crate::actors::{ListenerAudioResult, ListenerConfigUpdate};

struct ResponseProbe {
    delay: Duration,
    response_tx: tokio::sync::mpsc::UnboundedSender<()>,
}

struct StuckResponseProbe;

#[ractor::async_trait]
impl Actor for ResponseProbe {
    type Msg = ListenerMsg;
    type State = ();
    type Arguments = ();

    async fn pre_start(
        &self,
        _myself: ActorRef<Self::Msg>,
        _args: Self::Arguments,
    ) -> Result<Self::State, ActorProcessingErr> {
        Ok(())
    }

    async fn handle(
        &self,
        _myself: ActorRef<Self::Msg>,
        message: Self::Msg,
        _state: &mut Self::State,
    ) -> Result<(), ActorProcessingErr> {
        match message {
            ListenerMsg::StreamResponse(_, reply) => {
                tokio::time::sleep(self.delay).await;
                let _ = self.response_tx.send(());
                let _ = reply.send(());
            }
            ListenerMsg::AudioSingle(_, reply) | ListenerMsg::AudioDual(_, _, reply) => {
                let _ = reply.send(ListenerAudioResult::Accepted);
            }
            ListenerMsg::UpdateConfig(ListenerConfigUpdate { .. })
            | ListenerMsg::StreamError(_)
            | ListenerMsg::StreamEnded
            | ListenerMsg::StreamTimeout(_) => {}
        }
        Ok(())
    }
}

#[ractor::async_trait]
impl Actor for StuckResponseProbe {
    type Msg = ListenerMsg;
    type State = ();
    type Arguments = ();

    async fn pre_start(
        &self,
        _myself: ActorRef<Self::Msg>,
        _args: Self::Arguments,
    ) -> Result<Self::State, ActorProcessingErr> {
        Ok(())
    }

    async fn handle(
        &self,
        _myself: ActorRef<Self::Msg>,
        message: Self::Msg,
        _state: &mut Self::State,
    ) -> Result<(), ActorProcessingErr> {
        match message {
            ListenerMsg::StreamResponse(_, reply) => {
                let reply = reply;
                std::future::pending::<()>().await;
                drop(reply);
            }
            ListenerMsg::AudioSingle(_, reply) | ListenerMsg::AudioDual(_, _, reply) => {
                let _ = reply.send(ListenerAudioResult::Accepted);
            }
            ListenerMsg::UpdateConfig(ListenerConfigUpdate { .. })
            | ListenerMsg::StreamError(_)
            | ListenerMsg::StreamEnded
            | ListenerMsg::StreamTimeout(_) => {}
        }
        Ok(())
    }
}

struct NoopFinalizeHandle;

impl FinalizeHandle for NoopFinalizeHandle {
    async fn finalize(&self) {}

    fn expected_finalize_count(&self) -> usize {
        0
    }
}

struct StuckFinalizeHandle;

impl FinalizeHandle for StuckFinalizeHandle {
    async fn finalize(&self) {
        std::future::pending::<()>().await;
    }

    fn expected_finalize_count(&self) -> usize {
        0
    }
}

struct ResponseFinalizeHandle {
    response_tx: Mutex<Option<tokio::sync::mpsc::UnboundedSender<Result<StreamResponse, ()>>>>,
}

impl FinalizeHandle for ResponseFinalizeHandle {
    async fn finalize(&self) {
        if let Some(response_tx) = self.response_tx.lock().unwrap().take() {
            let _ = response_tx.send(Ok(terminal_response()));
        }
    }

    fn expected_finalize_count(&self) -> usize {
        0
    }
}

fn terminal_response() -> StreamResponse {
    StreamResponse::TerminalResponse {
        request_id: "request".to_string(),
        created: "now".to_string(),
        duration: 0.0,
        channels: 1,
    }
}

fn extra() -> Extra {
    Extra {
        started_unix_millis: 0,
    }
}

fn transcript_response(is_final: bool) -> StreamResponse {
    use owhisper_interface::stream::{Alternatives, Channel, Metadata, Word};

    StreamResponse::TranscriptResponse {
        start: 0.0,
        duration: 1.0,
        is_final,
        speech_final: false,
        from_finalize: false,
        channel: Channel {
            alternatives: vec![Alternatives {
                transcript: "hello world".to_string(),
                words: ["hello", "world"]
                    .into_iter()
                    .enumerate()
                    .map(|(index, text)| Word {
                        word: text.to_string(),
                        start: index as f64 * 0.5,
                        end: (index + 1) as f64 * 0.5,
                        confidence: 1.0,
                        speaker: None,
                        punctuated_word: None,
                        language: None,
                    })
                    .collect(),
                confidence: 1.0,
                languages: vec![],
            }],
        },
        metadata: Metadata::default(),
        channel_index: vec![0, 1],
    }
}

fn transcript_delta(is_final: bool, second: i64) -> crate::LiveTranscriptDelta {
    let mut delta = crate::LiveTranscriptDelta {
        new_words: vec![],
        replaced_ids: vec![],
        partials: vec![],
    };
    if is_final {
        delta.new_words.push(syntheo_transcript::FinalizedWord {
            id: second.to_string(),
            text: "hello".to_string(),
            start_ms: second * 1000,
            end_ms: second * 1000 + 500,
            channel: 0,
            speaker_index: None,
            state: syntheo_transcript::WordState::Final,
        });
    } else {
        delta.partials.push(syntheo_transcript::PartialWord {
            text: "hello".to_string(),
            start_ms: second * 1000,
            end_ms: second * 1000 + 500,
            channel: 0,
            speaker_index: None,
        });
    }
    delta
}

#[test]
fn stalled_transcript_is_detected_while_audio_continues() {
    let now = Instant::now();
    let mut progress = StreamProgress::new(now);
    let audio = 1000_i16
        .to_le_bytes()
        .repeat(crate::actors::SAMPLE_RATE as usize);

    for second in 1..30 {
        assert!(!progress.observe_audio(
            active_audio_samples(&audio),
            now + Duration::from_secs(second),
        ));
    }
    assert!(progress.observe_audio(active_audio_samples(&audio), now + Duration::from_secs(30)));
}

#[test]
fn silence_and_low_background_noise_do_not_trigger_reconnection() {
    let now = Instant::now();
    let mut progress = StreamProgress::new(now);
    for sample in [0_i16, 16, -16] {
        let audio = sample
            .to_le_bytes()
            .repeat(crate::actors::SAMPLE_RATE as usize);
        assert!(
            !progress.observe_audio(active_audio_samples(&audio), now + Duration::from_secs(600))
        );
    }
    assert_eq!(active_audio_samples(&[]), 0);
    assert!(!progress.observe_audio(
        crate::actors::SAMPLE_RATE as usize,
        now + Duration::from_secs(601)
    ));
}

// Issue 447 : un canal coupé envoie du silence. Coupé longtemps, il ne compte jamais comme
// de l'audio actif : seul l'autre canal peut faire partir le chien de garde.
#[test]
fn a_channel_muted_for_a_long_time_does_not_trigger_reconnection() {
    let now = Instant::now();
    let second = crate::actors::SAMPLE_RATE as usize;
    let muted = syntheo_audio_utils::f32_to_i16_bytes(std::iter::repeat_n(0.0_f32, second));
    let quiet_room = 16_i16.to_le_bytes().repeat(second);

    let mut progress = StreamProgress::new(now);
    for elapsed in 1..=900 {
        let active = active_audio_samples(&muted).max(active_audio_samples(&quiet_room));
        assert!(
            !progress.observe_audio(active, now + Duration::from_secs(elapsed)),
            "watchdog fired after {elapsed} s with a muted channel",
        );
    }

    // L'autre canal parle et le STT transcrit : pas de reconnexion non plus.
    let speech = 1000_i16.to_le_bytes().repeat(second);
    let mut talking = StreamProgress::new(now);
    for elapsed in 1..=900 {
        let time = now + Duration::from_secs(elapsed);
        let active = active_audio_samples(&muted).max(active_audio_samples(&speech));
        assert!(!talking.observe_audio(active, time), "fired at {elapsed} s");
        if elapsed % 10 == 0 {
            talking.observe_delta(&transcript_delta(true, elapsed as i64), time);
        }
    }
}

#[test]
fn partial_transcripts_reset_the_stall_watchdog() {
    let now = Instant::now();
    let mut progress = StreamProgress::new(now);
    assert!(!progress.observe_audio(MIN_ACTIVE_AUDIO_SAMPLES, now + Duration::from_secs(29)));
    progress.observe_delta(&transcript_delta(false, 29), now + Duration::from_secs(29));
    assert!(!progress.observe_audio(MIN_ACTIVE_AUDIO_SAMPLES, now + Duration::from_secs(30)));
    assert!(progress.observe_audio(0, now + Duration::from_secs(59)));
}

#[test]
fn stall_diagnostics_tell_a_silent_provider_from_a_wedged_stream() {
    let now = Instant::now();
    let sample_rate = crate::actors::SAMPLE_RATE as usize;

    // Empty provider messages keep the stream alive but are not transcript progress.
    let mut quiet = StreamProgress::new(now);
    quiet.observe_response(&terminal_response(), now + Duration::from_secs(29));
    assert!(quiet.observe_audio(MIN_ACTIVE_AUDIO_SAMPLES, now + Duration::from_secs(30)));
    let diagnostics = quiet.diagnostics(now + Duration::from_secs(30));
    assert_eq!(diagnostics.reason, StallReason::NoProgress);
    assert_eq!(diagnostics.secs_since_progress, 30.0);
    assert_eq!(diagnostics.secs_since_response, 1.0);
    assert_eq!(diagnostics.active_audio_secs, 5.0);

    // Recent partials rule out NoProgress, so the unfinalized cap is what tripped.
    let mut capped = StreamProgress::new(now);
    capped.observe_delta(&transcript_delta(false, 89), now + Duration::from_secs(89));
    assert!(capped.observe_audio(sample_rate * 90, now + Duration::from_secs(90)));
    let diagnostics = capped.diagnostics(now + Duration::from_secs(90));
    assert_eq!(diagnostics.reason, StallReason::UnfinalizedCap);
    assert_eq!(diagnostics.unfinalized_audio_secs, 90.0);
    assert_eq!(diagnostics.secs_since_response, 90.0);
}

#[test]
fn non_advancing_updates_do_not_reset_the_stall_watchdog() {
    let now = Instant::now();

    let mut empty = StreamProgress::new(now);
    assert!(!empty.observe_audio(MIN_ACTIVE_AUDIO_SAMPLES, now + Duration::from_secs(29)));
    empty.observe_delta(
        &crate::LiveTranscriptDelta {
            new_words: vec![],
            replaced_ids: vec![],
            partials: vec![],
        },
        now + Duration::from_secs(29),
    );
    assert!(empty.observe_audio(0, now + Duration::from_secs(30)));

    let mut repeated = StreamProgress::new(now);
    let delta = transcript_delta(false, 0);
    repeated.observe_delta(&delta, now);
    for second in 1..=30 {
        let time = now + Duration::from_secs(second);
        repeated.observe_delta(&delta, time);
        assert_eq!(
            repeated.observe_audio(crate::actors::SAMPLE_RATE as usize, time),
            second == 30
        );
    }
}

#[test]
fn partial_words_that_never_finalize_trigger_reconnection() {
    let now = Instant::now();
    let mut progress = StreamProgress::new(now);
    for second in 1..90 {
        let time = now + Duration::from_secs(second);
        progress.observe_delta(&transcript_delta(false, second as i64), time);
        assert!(!progress.observe_audio(crate::actors::SAMPLE_RATE as usize, time));
    }
    progress.observe_delta(&transcript_delta(false, 90), now + Duration::from_secs(90));
    assert!(progress.observe_audio(
        crate::actors::SAMPLE_RATE as usize,
        now + Duration::from_secs(90)
    ));
}

#[test]
fn repeated_final_responses_do_not_hide_stalled_transcripts() {
    let now = Instant::now();
    let mut progress = StreamProgress::new(now);
    let mut engine = crate::LiveTranscriptEngine::new("syntheo", &[], None);
    let response = transcript_response(true);
    let initial = engine
        .process(&response)
        .expect("initial response should produce words");
    progress.observe_delta(&initial.transcript_delta, now);
    for second in 1..=30 {
        let time = now + Duration::from_secs(second);
        assert!(
            engine.process(&response).is_none(),
            "duplicate provider words must not count as app progress"
        );
        assert_eq!(
            progress.observe_audio(crate::actors::SAMPLE_RATE as usize, time),
            second == 30,
        );
    }
}

#[test]
fn advancing_single_word_finals_keep_an_active_stream_healthy() {
    let now = Instant::now();
    let mut progress = StreamProgress::new(now);
    let mut engine = crate::LiveTranscriptEngine::new("syntheo", &[], None);
    let mut response = transcript_response(true);
    if let StreamResponse::TranscriptResponse { channel, .. } = &mut response {
        channel.alternatives[0].words.truncate(1);
        channel.alternatives[0].transcript = "hello".to_string();
    }
    assert!(engine.process(&response).is_none());

    for second in 1..300 {
        let time = now + Duration::from_secs(second);
        if second % 20 == 0 {
            let mut next = response.clone();
            next.apply_offset(second as f64);
            let update = engine
                .process(&next)
                .expect("the next single-word final must release the held word");
            assert!(!update.transcript_delta.new_words.is_empty());
            progress.observe_delta(&update.transcript_delta, time);
        }
        assert!(!progress.observe_audio(crate::actors::SAMPLE_RATE as usize, time));
    }
}

#[test]
fn finalized_words_keep_an_active_stream_healthy() {
    let now = Instant::now();
    let mut progress = StreamProgress::new(now);
    for second in 1..300 {
        let time = now + Duration::from_secs(second);
        progress.observe_delta(&transcript_delta(second % 20 == 0, second as i64), time);
        assert!(!progress.observe_audio(crate::actors::SAMPLE_RATE as usize, time));
    }
}

#[tokio::test(start_paused = true)]
async fn silent_local_stream_survives_the_remote_response_timeout() {
    let (response_tx, mut response_rx) = tokio::sync::mpsc::unbounded_channel();
    let (actor, actor_handle) = Actor::spawn(
        None,
        ResponseProbe {
            delay: Duration::ZERO,
            response_tx,
        },
        (),
    )
    .await
    .unwrap();
    let (input_tx, input_rx) = tokio::sync::mpsc::unbounded_channel();
    let (_shutdown_tx, shutdown_rx) = tokio::sync::oneshot::channel();
    let stream_actor = actor.clone();
    let task = tokio::spawn(async move {
        let responses = tokio_stream::wrappers::UnboundedReceiverStream::new(input_rx);
        futures_util::pin_mut!(responses);
        process_stream(
            responses,
            NoopFinalizeHandle,
            stream_actor,
            shutdown_rx,
            0.0,
            extra(),
            None,
        )
        .await
    });
    tokio::task::yield_now().await;
    tokio::time::advance(super::super::LISTEN_STREAM_TIMEOUT + Duration::from_secs(1)).await;
    tokio::task::yield_now().await;
    assert!(
        !task.is_finished(),
        "silence must not end a local recording"
    );
    input_tx
        .send(Ok::<_, ()>(transcript_response(true)))
        .unwrap();
    response_rx
        .recv()
        .await
        .expect("speech after silence should still be delivered");
    drop(input_tx);
    task.await.unwrap();
    actor.stop(None);
    actor_handle.await.unwrap();
}

#[tokio::test]
async fn provider_responses_wait_for_actor_acknowledgement() {
    let (response_tx, mut response_rx) = tokio::sync::mpsc::unbounded_channel();
    let (actor, actor_handle) = Actor::spawn(
        None,
        ResponseProbe {
            delay: Duration::from_millis(20),
            response_tx,
        },
        (),
    )
    .await
    .unwrap();
    let responses =
        futures_util::stream::iter((0..5).map(|_| Ok::<StreamResponse, ()>(terminal_response())));
    futures_util::pin_mut!(responses);
    let (_shutdown_tx, shutdown_rx) = tokio::sync::oneshot::channel();
    let started_at = Instant::now();

    let final_responses = process_stream(
        responses,
        NoopFinalizeHandle,
        actor.clone(),
        shutdown_rx,
        0.0,
        extra(),
        Some(super::super::LISTEN_STREAM_TIMEOUT),
    )
    .await;

    assert!(final_responses.is_empty());
    assert!(started_at.elapsed() >= Duration::from_millis(100));
    for _ in 0..5 {
        response_rx.recv().await.unwrap();
    }

    actor.stop(None);
    let _ = actor_handle.await;
}

#[tokio::test]
async fn provider_response_ack_timeout_terminates_stuck_actor() {
    let (actor, actor_handle) = Actor::spawn(None, StuckResponseProbe, ()).await.unwrap();
    let responses = futures_util::stream::iter([Ok::<StreamResponse, ()>(terminal_response())]);
    futures_util::pin_mut!(responses);
    let (_shutdown_tx, shutdown_rx) = tokio::sync::oneshot::channel();

    let final_responses = tokio::time::timeout(
        PROVIDER_RESPONSE_ACK_TIMEOUT + Duration::from_secs(1),
        process_stream(
            responses,
            NoopFinalizeHandle,
            actor,
            shutdown_rx,
            0.0,
            extra(),
            Some(super::super::LISTEN_STREAM_TIMEOUT),
        ),
    )
    .await
    .expect("stuck provider response should reach its acknowledgement timeout");

    assert!(final_responses.is_empty());
    tokio::time::timeout(Duration::from_secs(1), actor_handle)
        .await
        .expect("stuck listener should be terminated after the response timeout")
        .unwrap();
}

#[tokio::test]
async fn finalize_responses_are_returned_without_reentering_stopped_actor() {
    let (probe_tx, mut probe_rx) = tokio::sync::mpsc::unbounded_channel();
    let (actor, actor_handle) = Actor::spawn(
        None,
        ResponseProbe {
            delay: Duration::ZERO,
            response_tx: probe_tx,
        },
        (),
    )
    .await
    .unwrap();
    let (response_tx, response_rx) = tokio::sync::mpsc::unbounded_channel();
    let responses = tokio_stream::wrappers::UnboundedReceiverStream::new(response_rx);
    futures_util::pin_mut!(responses);
    let (shutdown_tx, shutdown_rx) = tokio::sync::oneshot::channel();
    shutdown_tx.send(()).unwrap();

    let final_responses = process_stream(
        responses,
        ResponseFinalizeHandle {
            response_tx: Mutex::new(Some(response_tx)),
        },
        actor.clone(),
        shutdown_rx,
        0.0,
        extra(),
        Some(super::super::LISTEN_STREAM_TIMEOUT),
    )
    .await;

    assert_eq!(final_responses, vec![terminal_response()]);
    assert!(
        tokio::time::timeout(Duration::from_millis(50), probe_rx.recv())
            .await
            .is_err()
    );

    actor.stop(None);
    let _ = actor_handle.await;
}

#[tokio::test]
async fn hung_provider_finalize_has_a_deadline() {
    let responses = futures_util::stream::empty::<Result<StreamResponse, ()>>();
    futures_util::pin_mut!(responses);
    let started_at = Instant::now();

    let final_responses = tokio::time::timeout(
        FINALIZE_HANDLE_TIMEOUT + Duration::from_secs(1),
        collect_final_responses(responses, &StuckFinalizeHandle, 0.0, &extra(), None),
    )
    .await
    .expect("provider finalize should be cancelled at its deadline");

    assert!(final_responses.is_empty());
    assert!(started_at.elapsed() >= FINALIZE_HANDLE_TIMEOUT);
}

#[tokio::test]
async fn final_response_collection_is_bounded() {
    let responses = futures_util::stream::iter(
        (0..MAX_FINAL_RESPONSES + 10).map(|_| Ok::<StreamResponse, ()>(terminal_response())),
    );
    futures_util::pin_mut!(responses);

    let final_responses =
        collect_final_responses(responses, &NoopFinalizeHandle, 0.0, &extra(), None).await;

    assert_eq!(final_responses.len(), MAX_FINAL_RESPONSES);
}
