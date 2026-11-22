//! Garde-fou des modèles : transcrit des WAV avec le vrai moteur (diarisation
//! comprise) et vérifie qu'il rend des mots, proches d'une transcription de
//! référence. Lancé sous `qemu-x86_64 -cpu Skylake-Client` (AVX2 sans VNNI)
//! par `apps/speech/models/cpu-check/run.sh` : des poids int8 sur 8 bits y
//! saturaient le noyau AVX2 d'ONNX Runtime et l'ASR ne rendait que des
//! sorties vides (issue 683).
//!
//! Usage : cpu-check --models <dossier> [--threads N] [--min-words N]
//!         [--max-wer P] <audio.wav>=<référence.txt> [...]
//!   audio : WAV 16 kHz mono PCM16, en-tête canonique de 44 octets.
//!   Une ligne JSON par fichier, puis une ligne de total ; code 1 si le total
//!   des mots est sous --min-words, si le WER total (en %) dépasse --max-wer,
//!   ou si un mot n'a pas d'intervenant ; code 2 pour une erreur d'usage ou de
//!   chargement.

use std::path::{Path, PathBuf};

use syntheo_speech::engine::Engine;
use syntheo_speech::parakeet::ParakeetEngine;
use syntheo_speech::protocol::{Event, SessionConfig, pcm16_to_f32};

struct Args {
    models: PathBuf,
    threads: usize,
    min_words: usize,
    max_wer: f64,
    files: Vec<(PathBuf, PathBuf)>,
}

fn parse_args() -> Result<Args, String> {
    let mut args = std::env::args().skip(1);
    let mut models = None;
    let mut threads = 4;
    let mut min_words = 1;
    let mut max_wer = 100.0;
    let mut files = Vec::new();
    while let Some(arg) = args.next() {
        let mut value = || {
            args.next()
                .ok_or_else(|| format!("missing value for {arg}"))
        };
        match arg.as_str() {
            "--models" => models = Some(PathBuf::from(value()?)),
            "--threads" => threads = value()?.parse().map_err(|_| "invalid --threads")?,
            "--min-words" => min_words = value()?.parse().map_err(|_| "invalid --min-words")?,
            "--max-wer" => max_wer = value()?.parse().map_err(|_| "invalid --max-wer")?,
            _ => {
                let (audio, reference) = arg
                    .split_once('=')
                    .ok_or_else(|| format!("expected <audio.wav>=<reference.txt>, got {arg}"))?;
                files.push((PathBuf::from(audio), PathBuf::from(reference)));
            }
        }
    }
    if files.is_empty() {
        return Err("no <audio.wav>=<reference.txt>".into());
    }
    Ok(Args {
        models: models.ok_or("missing --models")?,
        threads,
        min_words,
        max_wer,
        files,
    })
}

/// Normalisation du WER des mesures de l'issue 680 (score.py) : minuscules,
/// apostrophes unifiées, ponctuation retirée, apostrophe gardée seulement
/// entre deux caractères de mot. (Sans normalisation NFC : le modèle et les
/// références écrivent déjà en NFC.)
fn normalize(text: &str) -> Vec<String> {
    let is_word = |c: char| c.is_alphanumeric() || c == '_';
    let chars: Vec<char> = text
        .to_lowercase()
        .chars()
        .map(|c| match c {
            '’' | '‘' | '`' => '\'',
            c if is_word(c) || c.is_whitespace() || c == '\'' => c,
            _ => ' ',
        })
        .collect();
    let kept: String = chars
        .iter()
        .enumerate()
        .map(|(i, &c)| {
            let inner =
                i > 0 && i + 1 < chars.len() && is_word(chars[i - 1]) && is_word(chars[i + 1]);
            if c == '\'' && !inner { ' ' } else { c }
        })
        .collect();
    kept.split_whitespace().map(str::to_owned).collect()
}

/// Distance d'édition en mots (substitutions, insertions, suppressions).
fn edits(reference: &[String], hypothesis: &[String]) -> usize {
    let mut previous: Vec<usize> = (0..=hypothesis.len()).collect();
    for (i, r) in reference.iter().enumerate() {
        let mut current = vec![i + 1];
        for (j, h) in hypothesis.iter().enumerate() {
            current.push(
                (previous[j + 1] + 1)
                    .min(current[j] + 1)
                    .min(previous[j] + usize::from(r != h)),
            );
        }
        previous = current;
    }
    previous[hypothesis.len()]
}

struct Transcript {
    text: String,
    words: usize,
    with_speaker: usize,
}

fn transcribe(engine: &ParakeetEngine, audio: &Path) -> Result<Transcript, String> {
    let bytes = std::fs::read(audio).map_err(|e| format!("{}: {e}", audio.display()))?;
    if bytes.len() < 44 || &bytes[..4] != b"RIFF" || &bytes[8..12] != b"WAVE" {
        return Err(format!("{}: not a WAV file", audio.display()));
    }
    let samples = pcm16_to_f32(&bytes[44..]);
    let mut recognizer = engine
        .open(&SessionConfig {
            language: "fr-FR".into(),
            diarization: true,
            endpointing_ms: 1000,
        })
        .map_err(|e| e.to_string())?;
    let mut events = Vec::new();
    for frame in samples.chunks(320) {
        events.extend(recognizer.push(frame).map_err(|e| e.to_string())?);
    }
    events.extend(recognizer.finish().map_err(|e| e.to_string())?);
    let mut transcript = Transcript {
        text: String::new(),
        words: 0,
        with_speaker: 0,
    };
    for event in events {
        if let Event::Completed {
            transcript: t,
            words,
        } = event
        {
            if !transcript.text.is_empty() {
                transcript.text.push(' ');
            }
            transcript.text.push_str(&t);
            transcript.words += words.len();
            transcript.with_speaker += words.iter().filter(|w| w.speaker.is_some()).count();
        }
    }
    Ok(transcript)
}

fn run(args: &Args) -> Result<bool, String> {
    let engine = ParakeetEngine::load(&args.models, args.threads).map_err(|e| e.to_string())?;
    let (mut words, mut with_speaker, mut errors, mut reference_words) = (0, 0, 0, 0);
    for (audio, reference) in &args.files {
        let reference = std::fs::read_to_string(reference)
            .map_err(|e| format!("{}: {e}", reference.display()))?;
        let reference = normalize(&reference);
        let transcript = transcribe(&engine, audio)?;
        let hypothesis = normalize(&transcript.text);
        let wrong = edits(&reference, &hypothesis);
        println!(
            "{}",
            serde_json::json!({
                "file": audio.display().to_string(),
                "words": transcript.words,
                "with_speaker": transcript.with_speaker,
                "reference_words": reference.len(),
                "wer": percent(wrong, reference.len()),
                "text": transcript.text,
            })
        );
        words += transcript.words;
        with_speaker += transcript.with_speaker;
        errors += wrong;
        reference_words += reference.len();
    }
    let wer = percent(errors, reference_words);
    let ok = words >= args.min_words && wer <= args.max_wer && with_speaker == words;
    println!(
        "{}",
        serde_json::json!({
            "total": true,
            "words": words,
            "with_speaker": with_speaker,
            "reference_words": reference_words,
            "wer": wer,
            "min_words": args.min_words,
            "max_wer": args.max_wer,
            "ok": ok,
        })
    );
    Ok(ok)
}

fn percent(errors: usize, total: usize) -> f64 {
    if total == 0 {
        return 100.0;
    }
    (10_000.0 * errors as f64 / total as f64).round() / 100.0
}

fn main() {
    let code = match parse_args().and_then(|args| run(&args)) {
        Ok(true) => 0,
        Ok(false) => 1,
        Err(error) => {
            eprintln!("cpu-check: {error}");
            2
        }
    };
    std::process::exit(code);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalize_matches_score_py() {
        assert_eq!(
            normalize("Et savez-vous, l’âme ‘dit’ : « J'élève » mes vues."),
            [
                "et",
                "savez",
                "vous",
                "l'âme",
                "dit",
                "j'élève",
                "mes",
                "vues"
            ]
        );
    }

    #[test]
    fn edits_counts_word_operations() {
        let words = |s: &str| normalize(s);
        assert_eq!(edits(&words("a b c"), &words("a b c")), 0);
        assert_eq!(edits(&words("a b c"), &words("a x c d")), 2);
        assert_eq!(edits(&words("a b c"), &[]), 3);
    }
}
