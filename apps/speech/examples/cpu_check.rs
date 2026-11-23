//! Garde-fou des modèles : transcrit des WAV avec le vrai moteur (diarisation
//! comprise) et vérifie qu'il rend des mots, proches d'une transcription de
//! référence. Lancé sous `qemu-x86_64 -cpu Skylake-Client` (AVX2 sans VNNI)
//! par `apps/speech/models/cpu-check/run.sh` : des poids int8 sur 8 bits y
//! saturaient le noyau AVX2 d'ONNX Runtime et l'ASR ne rendait que des
//! sorties vides (issue 683).
//!
//! Usage : cpu-check --models <dossier> [--threads N] [--min-word-ratio R]
//!         [--max-wer P] <audio.wav>=<référence.txt> [...]
//!   audio : WAV 16 kHz mono PCM16, en-tête canonique de 44 octets.
//!   référence.txt : transcription FP32 figée ; à côté, la même avec `.json`
//!   au lieu de `.txt` (mic.fp32.txt -> mic.fp32.json) donne la diarisation
//!   FP32 figée : `{"speakers": N}`, nombre d'intervenants distincts.
//!   Les seuils valent pour chaque fichier : il doit rendre au moins R fois
//!   les mots de sa référence normalisée (défaut 0.8), à un WER d'au plus P %
//!   (défaut 5), avec un intervenant pour chaque mot et autant d'intervenants
//!   distincts que la référence. Une ligne JSON par fichier, puis une ligne de
//!   total (`ok` si tous les fichiers le sont ; `words` total, que le témoin
//!   négatif de run.sh veut à 0). Code 0 si tout est accepté, 1 si un fichier
//!   est refusé, 2 pour une erreur d'usage ou de chargement.

use std::collections::BTreeSet;
use std::path::{Path, PathBuf};

use syntheo_speech::engine::Engine;
use syntheo_speech::parakeet::ParakeetEngine;
use syntheo_speech::protocol::{Event, SessionConfig, pcm16_to_f32};

struct Args {
    models: PathBuf,
    threads: usize,
    min_word_ratio: f64,
    max_wer: f64,
    files: Vec<(PathBuf, PathBuf)>,
}

fn parse_args() -> Result<Args, String> {
    let mut args = std::env::args().skip(1);
    let mut models = None;
    let mut threads = 4;
    let mut min_word_ratio = 0.8;
    let mut max_wer = 5.0;
    let mut files = Vec::new();
    while let Some(arg) = args.next() {
        let mut value = || {
            args.next()
                .ok_or_else(|| format!("missing value for {arg}"))
        };
        match arg.as_str() {
            "--models" => models = Some(PathBuf::from(value()?)),
            "--threads" => threads = value()?.parse().map_err(|_| "invalid --threads")?,
            "--min-word-ratio" => {
                min_word_ratio = value()?.parse().map_err(|_| "invalid --min-word-ratio")?
            }
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
        min_word_ratio,
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
    speakers: BTreeSet<u32>,
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
        speakers: BTreeSet::new(),
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
            for speaker in words.iter().filter_map(|w| w.speaker) {
                transcript.with_speaker += 1;
                transcript.speakers.insert(speaker);
            }
        }
    }
    Ok(transcript)
}

/// Mesures d'un fichier face à sa référence FP32 figée.
struct FileCheck {
    words: usize,
    reference_words: usize,
    wer: f64,
    with_speaker: usize,
    speakers: usize,
    reference_speakers: usize,
}

impl FileCheck {
    /// Décision par fichier : assez de mots, WER sous le seuil, un intervenant
    /// pour chaque mot et autant d'intervenants distincts que la référence.
    fn ok(&self, min_word_ratio: f64, max_wer: f64) -> bool {
        self.words as f64 >= min_word_ratio * self.reference_words as f64
            && self.wer <= max_wer
            && self.with_speaker == self.words
            && self.speakers == self.reference_speakers
    }
}

/// Diarisation FP32 figée : `{"speakers": N}` à côté de la référence texte.
fn reference_speakers(reference: &Path) -> Result<usize, String> {
    let path = reference.with_extension("json");
    let raw = std::fs::read_to_string(&path).map_err(|e| format!("{}: {e}", path.display()))?;
    let value: serde_json::Value =
        serde_json::from_str(&raw).map_err(|e| format!("{}: {e}", path.display()))?;
    value["speakers"]
        .as_u64()
        .map(|n| n as usize)
        .ok_or_else(|| format!("{}: expected {{\"speakers\": N}}", path.display()))
}

fn run(args: &Args) -> Result<bool, String> {
    let engine = ParakeetEngine::load(&args.models, args.threads).map_err(|e| e.to_string())?;
    let (mut words, mut all_ok) = (0, true);
    for (audio, reference_path) in &args.files {
        let reference = std::fs::read_to_string(reference_path)
            .map_err(|e| format!("{}: {e}", reference_path.display()))?;
        let reference = normalize(&reference);
        let reference_speakers = reference_speakers(reference_path)?;
        let transcript = transcribe(&engine, audio)?;
        let hypothesis = normalize(&transcript.text);
        let check = FileCheck {
            words: transcript.words,
            reference_words: reference.len(),
            wer: percent(edits(&reference, &hypothesis), reference.len()),
            with_speaker: transcript.with_speaker,
            speakers: transcript.speakers.len(),
            reference_speakers,
        };
        let ok = check.ok(args.min_word_ratio, args.max_wer);
        println!(
            "{}",
            serde_json::json!({
                "file": audio.display().to_string(),
                "words": check.words,
                "reference_words": check.reference_words,
                "wer": check.wer,
                "with_speaker": check.with_speaker,
                "speakers": check.speakers,
                "reference_speakers": check.reference_speakers,
                "ok": ok,
                "text": transcript.text,
            })
        );
        words += check.words;
        all_ok &= ok;
    }
    println!(
        "{}",
        serde_json::json!({
            "total": true,
            "words": words,
            "min_word_ratio": args.min_word_ratio,
            "max_wer": args.max_wer,
            "ok": all_ok,
        })
    );
    Ok(all_ok)
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

    #[test]
    fn each_file_is_judged_on_its_own() {
        // Mesures FP32 de mic.wav : 82 mots de référence, un intervenant.
        let good = FileCheck {
            words: 81,
            reference_words: 82,
            wer: 1.2,
            with_speaker: 81,
            speakers: 1,
            reference_speakers: 1,
        };
        assert!(good.ok(0.8, 5.0));
        // Un fichier dégradé est refusé même si l'autre est parfait.
        let wer = FileCheck { wer: 27.0, ..good };
        assert!(!wer.ok(0.8, 5.0));
        let few = FileCheck {
            words: 65,
            with_speaker: 65,
            ..good
        };
        assert!(!few.ok(0.8, 5.0));
        let unlabelled = FileCheck {
            with_speaker: 80,
            ..good
        };
        assert!(!unlabelled.ok(0.8, 5.0));
        let speakers = FileCheck {
            speakers: 2,
            ..good
        };
        assert!(!speakers.ok(0.8, 5.0));
        // Le témoin négatif (aucun mot) n'est jamais accepté.
        let empty = FileCheck {
            words: 0,
            wer: 100.0,
            with_speaker: 0,
            speakers: 0,
            ..good
        };
        assert!(!empty.ok(0.8, 5.0));
    }

    #[test]
    fn diarization_reference_sits_next_to_the_text() {
        let dir = std::env::temp_dir().join(format!("cpu-check-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let text = dir.join("mic.fp32.txt");
        std::fs::write(dir.join("mic.fp32.json"), r#"{"speakers": 2}"#).unwrap();
        assert_eq!(reference_speakers(&text), Ok(2));
        std::fs::write(dir.join("mic.fp32.json"), r#"{"speaker": 2}"#).unwrap();
        assert!(reference_speakers(&text).is_err());
        std::fs::remove_dir_all(&dir).unwrap();
    }
}
