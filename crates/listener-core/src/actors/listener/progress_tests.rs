//! Stall watchdog fed by the real NVIDIA NeMo-Speech.cpp adapter, as in a live
//! session: continuous speech, incremental hypotheses every half second and a
//! single interim final (issue #268).

use std::time::{Duration, Instant};

use owhisper_client::{NvidiaAdapter, RealtimeSttAdapter};
use owhisper_interface::stream::StreamResponse;

use super::stream::StreamProgress;
use crate::LiveTranscriptEngine;

/// 100 ms of 16 kHz PCM16, the cadence the source actor sends.
const CHUNK_BYTES: usize = 3200;
const CHUNK_SAMPLES: usize = crate::actors::SAMPLE_RATE as usize / 10;

fn delta(text: &str) -> String {
    serde_json::json!({
        "type": "conversation.item.input_audio_transcription.delta",
        "delta": text,
    })
    .to_string()
}

/// NeMo-Speech.cpp reports word times in seconds.
fn completed(text: &str, start: f64, end: f64) -> String {
    serde_json::json!({
        "type": "conversation.item.input_audio_transcription.completed",
        "transcript": text,
        "words": [{"word": text, "start": start, "end": end, "confidence": 0.9}],
    })
    .to_string()
}

struct Session {
    adapter: NvidiaAdapter,
    engine: LiveTranscriptEngine,
    progress: StreamProgress,
    start: Instant,
    partial_text: String,
}

impl Session {
    fn new() -> Self {
        let start = Instant::now();
        Self {
            adapter: NvidiaAdapter::default(),
            engine: LiveTranscriptEngine::new("nvidia", &[], None),
            progress: StreamProgress::new(start),
            start,
            partial_text: String::new(),
        }
    }

    fn time(&self, tick: u64) -> Instant {
        self.start + Duration::from_millis(tick * 100)
    }

    fn receive(&mut self, raw: &str, tick: u64) {
        let time = self.time(tick);
        for mut response in self.adapter.parse_response(raw) {
            response.set_channel_index(1, 2);
            self.observe(&response, time);
        }
    }

    fn observe(&mut self, response: &StreamResponse, time: Instant) {
        self.progress.observe_response(response, time);
        if let Some(update) = self.engine.process(response) {
            self.partial_text = update
                .transcript_delta
                .partials
                .iter()
                .map(|word| word.text.as_str())
                .collect::<Vec<_>>()
                .join(" ");
            self.progress.observe_delta(&update.transcript_delta, time);
        }
    }

    /// Sends one chunk of speech; returns whether the watchdog fired.
    fn send_audio(&mut self, tick: u64) -> bool {
        let _ = self
            .adapter
            .audio_to_message(bytes::Bytes::from(vec![0x10; CHUNK_BYTES]));
        let time = self.time(tick);
        self.progress.observe_audio(CHUNK_SAMPLES, time)
    }
}

#[test]
fn nvidia_continuous_speech_with_evolving_partials_is_not_a_stall() {
    let mut session = Session::new();
    let mut hypothesis = String::new();
    for tick in 1..=600 {
        assert!(
            !session.send_audio(tick),
            "watchdog fired at {:.1}s although the hypothesis kept growing: {:?}",
            tick as f64 / 10.0,
            session.progress.diagnostics(session.time(tick)),
        );
        if tick == 50 {
            session.receive(&completed("Bonjour à tous.", 0.3, 4.8), tick);
        } else if tick > 50 && tick % 5 == 0 {
            // Each delta carries only the words added to the open utterance.
            let added = if hypothesis.is_empty() { "et" } else { " et" };
            hypothesis.push_str(added);
            session.receive(&delta(added), tick);
            assert!(
                session.partial_text.contains(hypothesis.trim()),
                "the provisional text after the first final was dropped at {:.1}s",
                tick as f64 / 10.0,
            );
        }
    }
}

#[test]
fn nvidia_server_that_answers_without_text_still_stalls() {
    let mut session = Session::new();
    let mut stalled_at = None;
    for tick in 1..=400 {
        if session.send_audio(tick) {
            stalled_at = Some(tick);
            break;
        }
        // Alive but deaf: only empty interim finals while speech is sent.
        if tick % 5 == 0 {
            session.receive(
                r#"{"type":"conversation.item.input_audio_transcription.completed","transcript":""}"#,
                tick,
            );
        }
    }
    assert_eq!(stalled_at, Some(300));
}

fn provisional(text: &str, channel: i32) -> StreamResponse {
    use owhisper_interface::stream::{Alternatives, Channel, Metadata};

    StreamResponse::TranscriptResponse {
        start: 0.0,
        duration: 0.0,
        is_final: false,
        speech_final: false,
        from_finalize: false,
        channel: Channel {
            alternatives: vec![Alternatives {
                transcript: text.to_string(),
                words: vec![],
                confidence: 1.0,
                languages: vec![],
            }],
        },
        metadata: Metadata::default(),
        channel_index: vec![channel, 2],
    }
}

/// Returns the second at which the watchdog fired, feeding one response and
/// one second of speech per second and no transcript-engine delta at all.
fn first_stall(mut next_response: impl FnMut(u64) -> StreamResponse) -> Option<u64> {
    let start = Instant::now();
    let mut progress = StreamProgress::new(start);
    let second_of_speech = crate::actors::SAMPLE_RATE as usize;
    (1..=120).find(|&second| {
        let time = start + Duration::from_secs(second);
        progress.observe_response(&next_response(second), time);
        progress.observe_audio(second_of_speech, time)
    })
}

#[test]
fn evolving_provisional_text_counts_as_progress_on_its_own() {
    // Even when the transcript engine yields nothing usable (deduplicated or
    // mistimed words), a hypothesis that keeps changing proves the server is
    // transcribing. Only the unfinalized-audio cap may still recycle the stream.
    let stall = first_stall(|second| provisional(&"mot ".repeat(second as usize), 1));
    assert_eq!(stall, Some(90));
}

#[test]
fn frozen_or_empty_provisional_text_is_not_progress() {
    assert_eq!(first_stall(|_| provisional("Bonjour", 1)), Some(31));
    assert_eq!(first_stall(|_| provisional("  ", 1)), Some(30));
    // Two channels each repeating their own text must not look like a change.
    assert_eq!(
        first_stall(|second| {
            let channel = (second % 2) as i32;
            provisional(if channel == 0 { "oui" } else { "non" }, channel)
        }),
        Some(32)
    );
}

/// Issue #271 : sur une vidéo en parole continue, le serveur n'a rien finalisé
/// pendant 90 s et l'écoute s'est reconnectée (`UnfinalizedCap`). Le texte
/// provisoire de ces 90 s doit être validé dans la transcription avant la
/// reconnexion, ce que fait l'arrêt du flux (`post_stop` → `checkpoint`).
#[test]
fn nvidia_unfinalized_cap_commits_the_provisional_text_before_reconnecting() {
    let mut session = Session::new();
    let mut hypothesis = Vec::new();
    let mut stalled_at = None;
    for tick in 1..=1_200 {
        if session.send_audio(tick) {
            stalled_at = Some(tick);
            break;
        }
        if tick == 50 {
            session.receive(&completed("Bonjour à tous.", 0.3, 4.8), tick);
        } else if tick > 50 && tick % 5 == 0 {
            let separator = if hypothesis.is_empty() { "" } else { " " };
            hypothesis.push(format!("mot{tick}"));
            session.receive(&delta(&format!("{separator}mot{tick}")), tick);
        }
    }
    let stalled_at = stalled_at.expect("the unfinalized cap recycles the stream");
    let diagnostics = session.progress.diagnostics(session.time(stalled_at));
    assert_eq!(
        diagnostics.reason,
        super::stream::StallReason::UnfinalizedCap
    );
    assert!(diagnostics.active_audio_secs < 1.0);

    let checkpoint = session
        .engine
        .checkpoint()
        .expect("the provisional hypothesis is committed");
    // Hypotheses carry no word offsets: the committed text is the held
    // final followed by the whole provisional segment.
    let committed = checkpoint
        .transcript_delta
        .new_words
        .iter()
        .map(|word| word.text.trim())
        .collect::<Vec<_>>()
        .join(" ");
    assert_eq!(
        committed,
        format!("Bonjour à tous. {}", hypothesis.join(" ")),
        "provisional words lost at the reconnect"
    );
    assert!(checkpoint.transcript_delta.partials.is_empty());
    assert!(
        checkpoint
            .transcript_delta
            .new_words
            .windows(2)
            .all(|pair| pair[0].start_ms <= pair[1].start_ms)
    );
}

// Issue 571 : fond sonore au-dessus du seuil d'énergie, serveur muet. Chaque
// arrêt du chien de garde est suivi d'une reconnexion (connexion neuve, même
// état partagé, 1,1 s de nouvelle tentative) qui rejoue l'audio.

/// Instants (en secondes depuis le début) des arrêts du chien de garde sur
/// `secs` secondes de bruit, avec un progrès éventuel à `progress_at`.
fn noise_stalls(
    backoff: &super::SharedStallBackoff,
    secs: u64,
    mut response_at: impl FnMut(u64) -> Option<StreamResponse>,
) -> Vec<f64> {
    const RETRY_TICKS: u64 = 11;
    let start = Instant::now();
    let at = |tick: u64| start + Duration::from_millis(tick * 100);
    let mut progress = StreamProgress::with_backoff(start, backoff.clone());
    let mut stalls = Vec::new();
    let mut tick = 0;
    while tick < secs * 10 {
        tick += 1;
        if let Some(response) = response_at(tick) {
            progress.observe_response(&response, at(tick));
        }
        if progress.observe_audio(CHUNK_SAMPLES, at(tick)) {
            stalls.push(tick as f64 / 10.0);
            progress.record_stall();
            tick += RETRY_TICKS;
            progress = StreamProgress::with_backoff(at(tick), backoff.clone());
        }
    }
    stalls
}

fn gaps(stalls: &[f64]) -> Vec<f64> {
    std::iter::once(stalls[0])
        .chain(stalls.windows(2).map(|pair| pair[1] - pair[0]))
        .map(|gap| (gap * 10.0).round() / 10.0)
        .collect()
}

#[test]
fn continuous_noise_spaces_the_reconnections() {
    let backoff = super::SharedStallBackoff::default();

    let stalls = noise_stalls(&backoff, 10 * 60, |_| None);

    // 30 s, puis 60, 120, 240 s (plus la nouvelle tentative), puis au plus un
    // arrêt toutes les 300 s. Avant le correctif : un arrêt toutes les ~31 s.
    assert_eq!(gaps(&stalls), vec![30.0, 61.1, 121.1, 241.1], "{stalls:?}");
    let eleven_more_minutes = noise_stalls(&backoff, 11 * 60, |_| None);
    assert_eq!(
        gaps(&eleven_more_minutes),
        vec![300.0, 301.1],
        "{eleven_more_minutes:?}"
    );
}

#[test]
fn progress_after_spaced_stalls_brings_the_timeout_back_to_thirty_seconds() {
    let backoff = super::SharedStallBackoff::default();
    let stalls = noise_stalls(&backoff, 4 * 60, |_| None);
    assert_eq!(stalls.len(), 3, "{stalls:?}");
    assert_eq!(
        backoff.lock().unwrap().progress_timeout(),
        Duration::from_secs(240)
    );

    // La parole reprend : une hypothèse arrive à 2 s, puis le serveur se fige
    // en pleine parole. Le blocage est vu 30 s après le dernier progrès.
    let wedged = noise_stalls(&backoff, 60, |tick| {
        (tick == 20).then(|| provisional("Reprenons", 1))
    });
    assert_eq!(wedged.first().copied(), Some(32.0), "{wedged:?}");
    assert_eq!(
        backoff.lock().unwrap().progress_timeout(),
        Duration::from_secs(30)
    );
}

#[test]
fn the_unfinalized_cap_does_not_bypass_the_spacing() {
    // Délai porté à 240 s : 90 s d'audio actif sans final ni progrès ne
    // doivent pas recycler le flux plus tôt.
    let backoff = super::SharedStallBackoff::default();
    for _ in 0..3 {
        backoff.lock().unwrap().record_stall();
    }
    let start = Instant::now();
    let mut progress = StreamProgress::with_backoff(start, backoff.clone());
    let fired = (1..=2_399).find(|&tick| {
        progress.observe_audio(CHUNK_SAMPLES, start + Duration::from_millis(tick * 100))
    });
    assert_eq!(fired, None, "stopped before the 240 s timeout");
    assert!(progress.observe_audio(CHUNK_SAMPLES, start + Duration::from_secs(240)));
    assert_eq!(
        progress
            .diagnostics(start + Duration::from_secs(240))
            .reason,
        super::stream::StallReason::NoProgress
    );
}

// Reprise de #571 (QA, alpha 0.7.4-1) : après des minutes de bruit sans parole,
// le plafond d'audio non finalisé tombait au premier texte provisoire, en plein
// début de phrase. L'audio d'avant le premier progrès ne compte plus.

/// Connexion dont le délai sans progrès est déjà espacé à 240 s.
fn spaced_progress(start: Instant) -> StreamProgress {
    let backoff = super::SharedStallBackoff::default();
    for _ in 0..3 {
        backoff.lock().unwrap().record_stall();
    }
    StreamProgress::with_backoff(start, backoff)
}

#[test]
fn speech_after_long_noise_does_not_trip_the_unfinalized_cap() {
    let start = Instant::now();
    let mut progress = spaced_progress(start);
    let at = |tick: u64| start + Duration::from_millis(tick * 100);
    // 100 s de bruit actif, sans aucun texte : la connexion reste ouverte.
    for tick in 1..=1_000 {
        assert!(!progress.observe_audio(CHUNK_SAMPLES, at(tick)), "{tick}");
    }
    // La parole commence : premier texte provisoire, puis l'audio continue.
    progress.observe_response(&provisional("Et la", 1), at(1_000));
    for tick in 1_001..=1_050 {
        assert!(
            !progress.observe_audio(CHUNK_SAMPLES, at(tick)),
            "plafond déclenché à {:.1} s : {:?}",
            tick as f64 / 10.0,
            progress.diagnostics(at(tick)),
        );
    }
}

#[test]
fn the_unfinalized_cap_still_counts_from_the_first_progress() {
    let start = Instant::now();
    let mut progress = spaced_progress(start);
    let at = |tick: u64| start + Duration::from_millis(tick * 100);
    for tick in 1..=1_000 {
        progress.observe_audio(CHUNK_SAMPLES, at(tick));
    }
    // Parole continue : l'hypothèse change chaque seconde, aucun final.
    let mut stalled_at = None;
    for tick in 1_000..=2_000 {
        if tick % 10 == 0 {
            let words = "mot ".repeat(((tick - 1_000) / 10 + 1) as usize);
            progress.observe_response(&provisional(&words, 1), at(tick));
        }
        if progress.observe_audio(CHUNK_SAMPLES, at(tick)) {
            stalled_at = Some(tick);
            break;
        }
    }
    let stalled_at = stalled_at.expect("le plafond recycle toujours le flux");
    // 90 s d'audio comptées à partir du premier progrès (le bloc 1 000, reçu
    // juste après le premier texte, compte déjà) : 900 blocs.
    assert_eq!(stalled_at, 1_899);
    assert_eq!(
        progress.diagnostics(at(stalled_at)).reason,
        super::stream::StallReason::UnfinalizedCap
    );
}
