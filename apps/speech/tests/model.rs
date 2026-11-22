//! Essai avec le vrai modèle, seulement si `SYNTHEO_SPEECH_MODELS` (dossier
//! des modèles) et `SYNTHEO_SPEECH_AUDIO` (WAV 16 kHz mono PCM16) sont
//! définis : la CI ordinaire n'a pas les modèles. Vérifie que le découpage en
//! énoncés et en mots du module rend exactement le texte de parakeet-rs.
#![cfg(feature = "parakeet")]

use syntheo_speech::engine::Engine;
use syntheo_speech::parakeet::ParakeetEngine;
use syntheo_speech::protocol::{Event, SessionConfig, pcm16_to_f32};

fn words(text: &str) -> Vec<String> {
    text.split_whitespace().map(str::to_owned).collect()
}

/// Mots sans ponctuation : une ponctuation émise après la fermeture d'un
/// énoncé est écartée par le module (elle ne peut plus rejoindre son mot).
fn bare(words: &[String]) -> Vec<String> {
    words
        .iter()
        .map(|w| {
            w.chars()
                .filter(|c| c.is_alphanumeric() || *c == '\'' || *c == '-')
                .collect::<String>()
        })
        .filter(|w| !w.is_empty())
        .collect()
}

#[test]
fn utterances_carry_exactly_the_model_text() {
    let (Ok(models), Ok(audio)) = (
        std::env::var("SYNTHEO_SPEECH_MODELS"),
        std::env::var("SYNTHEO_SPEECH_AUDIO"),
    ) else {
        eprintln!("SYNTHEO_SPEECH_MODELS ou SYNTHEO_SPEECH_AUDIO absent : essai sauté");
        return;
    };
    let bytes = std::fs::read(&audio).unwrap();
    // En-tête WAV canonique de 44 octets.
    let samples = pcm16_to_f32(&bytes[44..]);

    // Référence : parakeet-rs seul, tranches de 560 ms, puis une tranche de
    // silence comme le commit du module.
    let engine = ParakeetEngine::load(std::path::Path::new(&models), 4).unwrap();
    let reference = {
        let handle = parakeet_rs::NemotronHandle::from_pretrained(
            std::path::Path::new(&models).join("nemotron"),
            Some(engine.execution_config()),
        )
        .unwrap();
        let mut asr = parakeet_rs::Nemotron::from_shared(&handle);
        asr.set_target_lang("fr-FR").unwrap();
        let mut text = String::new();
        let mut padded = samples.clone();
        padded.resize(samples.len().div_ceil(8960) * 8960 + 8960, 0.0);
        for chunk in padded.chunks(8960) {
            text.push_str(&asr.transcribe_chunk(chunk).unwrap());
        }
        words(&text)
    };

    let mut recognizer = engine
        .open(&SessionConfig {
            language: "fr-FR".into(),
            diarization: true,
            endpointing_ms: 1000,
        })
        .unwrap();
    let mut events = Vec::new();
    for frame in samples.chunks(320) {
        events.extend(recognizer.push(frame).unwrap());
    }
    events.extend(recognizer.finish().unwrap());
    let mut completed = Vec::new();
    let mut utterances = 0usize;
    let mut deltas = Vec::new();
    // Les deltas d'un énoncé, recollés comme l'adaptateur, puis remis à zéro.
    let mut open = String::new();
    for event in &events {
        match event {
            Event::Delta(delta) => open.push_str(delta),
            Event::Completed {
                transcript,
                words: w,
            } => {
                assert_eq!(words(&open), words(transcript), "deltas de l'énoncé");
                deltas.extend(words(&std::mem::take(&mut open)));
                assert!(
                    transcript.chars().next().is_some_and(char::is_alphanumeric),
                    "un énoncé ne commence pas par une ponctuation"
                );
                assert_eq!(
                    words(transcript),
                    w.iter().map(|w| w.word.clone()).collect::<Vec<_>>()
                );
                for pair in w.windows(2) {
                    assert!(pair[0].start <= pair[1].start, "mots dans l'ordre");
                }
                assert!(
                    w.iter().all(|w| w.speaker.is_some()),
                    "intervenant pour chaque mot"
                );
                let duration = samples.len() as f64 / 16_000.0;
                for word in w {
                    assert!(
                        word.start <= word.end && word.end <= duration + 1e-9,
                        "horodatage dans l'audio reçu"
                    );
                }
                utterances += 1;
                completed.extend(words(transcript));
            }
        }
    }
    assert_eq!(bare(&completed), bare(&reference), "énoncés fermés");
    assert_eq!(deltas, completed, "deltas");
    assert!(utterances >= 2, "plusieurs énoncés : {utterances}");
}

// Issue 686 : sous charge, la diarisation passe en espacée puis coupée, et
// revient ; la session continue, et les intervenants reviennent avec elle.
#[test]
fn diarization_levels_change_mid_session() {
    use syntheo_speech::engine::DiarizationLevel;
    let (Ok(models), Ok(audio)) = (
        std::env::var("SYNTHEO_SPEECH_MODELS"),
        std::env::var("SYNTHEO_SPEECH_AUDIO"),
    ) else {
        eprintln!("SYNTHEO_SPEECH_MODELS ou SYNTHEO_SPEECH_AUDIO absent : essai sauté");
        return;
    };
    let bytes = std::fs::read(&audio).unwrap();
    let samples = pcm16_to_f32(&bytes[44..]);
    let engine = ParakeetEngine::load(std::path::Path::new(&models), 4).unwrap();
    let mut recognizer = engine
        .open(&SessionConfig {
            language: "fr-FR".into(),
            diarization: true,
            endpointing_ms: 1000,
        })
        .unwrap();
    assert_eq!(recognizer.diarization(), DiarizationLevel::Full);
    let quarter = samples.len() / 4;
    let levels = [
        DiarizationLevel::Full,
        DiarizationLevel::Spaced,
        DiarizationLevel::Off,
        DiarizationLevel::Full,
    ];
    let mut with_speaker = [0usize; 4];
    let mut words = [0usize; 4];
    let mut labels: [Vec<u32>; 4] = Default::default();
    for (part, level) in levels.iter().enumerate() {
        recognizer.set_diarization(*level);
        assert_eq!(recognizer.diarization(), *level);
        let slice = &samples[part * quarter..((part + 1) * quarter).min(samples.len())];
        let mut events = Vec::new();
        for frame in slice.chunks(320) {
            events.extend(recognizer.push(frame).unwrap());
        }
        if part == 3 {
            events.extend(recognizer.finish().unwrap());
        }
        for event in events {
            if let Event::Completed { words: w, .. } = event {
                words[part] += w.len();
                with_speaker[part] += w.iter().filter(|w| w.speaker.is_some()).count();
                labels[part].extend(w.iter().filter_map(|w| w.speaker));
            }
        }
    }
    eprintln!("mots {words:?}, avec intervenant {with_speaker:?}");
    assert!(words.iter().sum::<usize>() > 0, "transcription continue");
    assert_eq!(with_speaker[2], 0, "coupée : aucun intervenant");
    assert!(with_speaker[3] > 0, "retour : intervenants de nouveau");
    // Revue de l'issue 686 : chaque génération du diarizer a ses propres
    // étiquettes, jamais celles d'avant (pas de fusion de deux personnes).
    // Complète : 1–4 ; espacée (génération 1) : 5–8 ; retour après coupée
    // (génération 2) : 9–12.
    assert!(labels[0].iter().all(|l| (1..=4).contains(l)), "{labels:?}");
    assert!(labels[1].iter().all(|l| (5..=8).contains(l)), "{labels:?}");
    assert!(labels[3].iter().all(|l| (9..=12).contains(l)), "{labels:?}");
}

/// Coût de calcul de chaque niveau de diarisation sur le même audio (mesure
/// d'appoint, issue 686) : `cargo test --release --test model cost -- --ignored --nocapture`.
#[test]
#[ignore = "mesure, avec le vrai modèle"]
fn diarization_level_cost() {
    use syntheo_speech::engine::DiarizationLevel;
    let (Ok(models), Ok(audio)) = (
        std::env::var("SYNTHEO_SPEECH_MODELS"),
        std::env::var("SYNTHEO_SPEECH_AUDIO"),
    ) else {
        return;
    };
    let bytes = std::fs::read(&audio).unwrap();
    let samples = pcm16_to_f32(&bytes[44..]);
    let engine = ParakeetEngine::load(std::path::Path::new(&models), 4).unwrap();
    for level in [
        DiarizationLevel::Full,
        DiarizationLevel::Spaced,
        DiarizationLevel::Off,
    ] {
        let mut recognizer = engine
            .open(&SessionConfig {
                language: "fr-FR".into(),
                diarization: true,
                endpointing_ms: 1000,
            })
            .unwrap();
        recognizer.set_diarization(level);
        let started = std::time::Instant::now();
        for frame in samples.chunks(320) {
            recognizer.push(frame).unwrap();
        }
        recognizer.finish().unwrap();
        let rtf = started.elapsed().as_secs_f64() / (samples.len() as f64 / 16_000.0);
        eprintln!("{level:?}: RTF {rtf:.3}");
    }
}
