//! Mesure de la dérive d'horloge (#437) : le micro entend la référence avec un retard qui
//! croît de 800 ppm (horloges micro et haut-parleur différentes, ≈ 13 échantillons par seconde à
//! 16 kHz), sur 3 minutes de parole entrecoupée de silences. Le vrai `AecReferenceAligner`
//! (sonde GCC-PHAT, hystérésis, lignes de retard) suit ou non ce retard.
//!
//! `cargo test -p audio-actual --lib aec_drift -- --nocapture`

use dasp::sample::Sample;

use super::aec::{build_aec, process_aec};
use super::aligner::AecReferenceAligner;
use super::loops::reset_echo_cancellation;

const RATE: u32 = 16_000;
const CHUNK: usize = 512;
/// Retard initial du chemin d'écho (celui du journal de #322).
const BASE_LAG: f64 = 904.0;
const DRIFT_PPM: f64 = 800.0;
const DURATION_SECS: usize = 180;
/// Écho atténué et bruit de fond du micro.
const ECHO_GAIN: f32 = 0.5;
const MIC_NOISE: f32 = 0.002;

pub(super) struct DriftRun {
    /// Part du temps, après le premier verrouillage, sans alignement appliqué.
    pub unaligned_ratio: f64,
    /// Erreur moyenne et maximale de l'alignement appliqué, en échantillons, quand il existe.
    pub mean_error: f64,
    pub max_error: f64,
    /// Réinitialisations de l'annulation d'écho demandées par l'aligneur.
    pub resets: usize,
    pub first_lock_secs: Option<f64>,
}

fn load(name: &str) -> Vec<f32> {
    let path = format!("{}/../aec/data/inputs/{name}", env!("CARGO_MANIFEST_DIR"));
    let file = std::fs::File::open(&path).unwrap_or_else(|error| panic!("{path}: {error}"));
    rodio::Decoder::new(std::io::BufReader::new(file))
        .unwrap()
        .map(|sample| sample.to_sample::<f32>())
        .collect()
}

/// Référence : la parole de `theo_lpb.wav` en boucle, par segments de 3 à 8 s séparés de
/// silences de 1 à 6 s (suite déterministe), comme une visio où l'on se tait par moments.
fn speaker_signal(speech: &[f32]) -> Vec<f32> {
    let total = DURATION_SECS * RATE as usize;
    let rate = RATE as usize;
    let mut out = Vec::with_capacity(total);
    let mut cursor = 0;
    let mut step = 0usize;
    while out.len() < total {
        let talk = (3 + (step * 5) % 6) * rate;
        let pause = (1 + (step * 7) % 6) * rate;
        for _ in 0..talk {
            out.push(speech[cursor % speech.len()]);
            cursor += 1;
        }
        out.extend(std::iter::repeat_n(0.0, pause));
        step += 1;
    }
    out.truncate(total);
    out
}

/// Retard vrai, en échantillons, à l'instant `n` du micro.
/// Scénario : dérive d'horloge et, en option, saut du chemin d'écho à mi-parcours (casque
/// débranché, changement de sortie…).
#[derive(Clone, Copy)]
pub(super) struct Scenario {
    pub drift_ppm: f64,
    pub jump_samples: f64,
}

const JUMP_AT: usize = DURATION_SECS / 2 * RATE as usize;

fn true_lag(n: usize, scenario: Scenario) -> f64 {
    let jump = if n >= JUMP_AT {
        scenario.jump_samples
    } else {
        0.0
    };
    BASE_LAG + n as f64 * scenario.drift_ppm * 1e-6 + jump
}

/// Micro : écho de la référence lue au temps `n - retard(n)` (interpolation linéaire), plus un
/// bruit de fond pseudo-aléatoire.
fn mic_signal(speaker: &[f32], scenario: Scenario) -> Vec<f32> {
    let mut seed = 0x2545_f491_u32;
    (0..speaker.len())
        .map(|n| {
            let t = n as f64 - true_lag(n, scenario);
            let echo = if t < 0.0 {
                0.0
            } else {
                let i = t.floor() as usize;
                let frac = (t - t.floor()) as f32;
                let a = speaker.get(i).copied().unwrap_or(0.0);
                let b = speaker.get(i + 1).copied().unwrap_or(0.0);
                a + (b - a) * frac
            };
            seed ^= seed << 13;
            seed ^= seed >> 17;
            seed ^= seed << 5;
            let noise = (seed as f32 / u32::MAX as f32 - 0.5) * 2.0 * MIC_NOISE;
            echo * ECHO_GAIN + noise
        })
        .collect()
}

pub(super) fn run_drift(scenario: Scenario) -> DriftRun {
    let speaker = speaker_signal(&load("theo_lpb.wav"));
    let mic = mic_signal(&speaker, scenario);
    let mut aligner = AecReferenceAligner::new(RATE);
    let mut resets = 0;
    let mut first_lock = None;
    let (mut unaligned, mut counted) = (0usize, 0usize);
    let (mut error_sum, mut error_max, mut error_count) = (0.0f64, 0.0f64, 0usize);

    for (index, (speaker_chunk, mic_chunk)) in
        speaker.chunks(CHUNK).zip(mic.chunks(CHUNK)).enumerate()
    {
        let pair = aligner.align(speaker_chunk, mic_chunk);
        if pair.alignment_changed {
            resets += 1;
        }
        let start = index * CHUNK;
        let applied = aligner.applied_delay_samples();
        if first_lock.is_none() && applied.is_some() {
            first_lock = Some(start as f64 / RATE as f64);
        }
        if first_lock.is_none() {
            continue;
        }
        counted += 1;
        match applied {
            None => unaligned += 1,
            Some(applied) => {
                let error = (applied - true_lag(start, scenario)).abs();
                error_sum += error;
                error_max = error_max.max(error);
                error_count += 1;
            }
        }
    }

    DriftRun {
        unaligned_ratio: unaligned as f64 / counted.max(1) as f64,
        mean_error: error_sum / error_count.max(1) as f64,
        max_error: error_max,
        resets,
        first_lock_secs: first_lock,
    }
}

fn report(label: &str, run: &DriftRun) {
    println!(
        "| {label} | {:.1} | {:.1} % | {:.1} ({:.2} ms) | {:.0} | {} |",
        run.first_lock_secs.unwrap_or(f64::NAN),
        run.unaligned_ratio * 100.0,
        run.mean_error,
        run.mean_error / RATE as f64 * 1000.0,
        run.max_error,
        run.resets,
    );
}

/// Critère de #437 : un signal avec une dérive synthétique d'environ 800 ppm reste aligné, sans
/// perte de verrou dans les silences ni réinitialisations répétées de l'annulation d'écho.
#[test]
fn aec_drift_800_ppm_stays_aligned() {
    println!(
        "| Scénario ({DURATION_SECS} s) | 1er verrou (s) | Sans alignement | Erreur moy. (éch.) \
         | Erreur max (éch.) | Réinit. |"
    );
    println!("|---|---|---|---|---|---|");
    let still = run_drift(Scenario {
        drift_ppm: 0.0,
        jump_samples: 0.0,
    });
    report("sans dérive", &still);
    for drift_ppm in [200.0, -800.0] {
        report(
            &format!("{drift_ppm} ppm"),
            &run_drift(Scenario {
                drift_ppm,
                jump_samples: 0.0,
            }),
        );
    }
    let jump = run_drift(Scenario {
        drift_ppm: DRIFT_PPM,
        jump_samples: 300.0,
    });
    report("800 ppm + saut de 300 éch. à 90 s", &jump);
    let run = run_drift(Scenario {
        drift_ppm: DRIFT_PPM,
        jump_samples: 0.0,
    });
    report("800 ppm", &run);

    assert!(
        run.unaligned_ratio < 0.01,
        "verrou perdu {:.1} % du temps",
        run.unaligned_ratio * 100.0
    );
    assert!(
        run.mean_error < 16.0,
        "erreur moyenne {:.1} échantillons",
        run.mean_error
    );
    assert!(run.resets <= 2, "{} réinitialisations", run.resets);
    assert_eq!(still.resets, 1);
    // Un vrai changement du chemin d'écho est toujours détecté et réacquis.
    assert!(jump.resets >= 2 && jump.unaligned_ratio < 0.1);
}

/// Paire réelle (référence, micro avec l'écho de la pièce) de `crates/aec/data`, découpée selon
/// le même motif parole / silence que [`speaker_signal`] : les deux canaux restent dans leur
/// alignement d'origine, celui qu'attend DTLN.
fn recorded_pair() -> (Vec<f32>, Vec<f32>) {
    let (lpb, mic) = (load("theo_lpb.wav"), load("theo_mic.wav"));
    let len = lpb.len().min(mic.len());
    let total = DURATION_SECS * RATE as usize;
    let rate = RATE as usize;
    let (mut speaker, mut echo) = (Vec::with_capacity(total), Vec::with_capacity(total));
    let (mut cursor, mut step) = (0usize, 0usize);
    while speaker.len() < total {
        let talk = (3 + (step * 5) % 6) * rate;
        let pause = (1 + (step * 7) % 6) * rate;
        for _ in 0..talk {
            speaker.push(lpb[cursor % len]);
            echo.push(mic[cursor % len]);
            cursor += 1;
        }
        speaker.extend(std::iter::repeat_n(0.0, pause));
        echo.extend(std::iter::repeat_n(0.0, pause));
        step += 1;
    }
    speaker.truncate(total);
    echo.truncate(total);
    (speaker, echo)
}

/// Micro de la paire réelle, retardé de `true_lag(n)` (interpolation linéaire) : le chemin
/// d'écho garde la réponse de la pièce et s'allonge avec la dérive.
fn drifted(echo: &[f32], scenario: Scenario) -> Vec<f32> {
    (0..echo.len())
        .map(|n| {
            let t = n as f64 - true_lag(n, scenario);
            if t < 0.0 {
                return 0.0;
            }
            let i = t.floor() as usize;
            let frac = (t - t.floor()) as f32;
            let a = echo.get(i).copied().unwrap_or(0.0);
            let b = echo.get(i + 1).copied().unwrap_or(0.0);
            a + (b - a) * frac
        })
        .collect()
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum ErleMode {
    /// Témoin : référence retardée exactement du retard vrai, sans aligneur.
    Ideal,
    /// Référence et micro bruts, sans alignement.
    Raw,
    /// Chaîne réelle : `AecReferenceAligner` et réinitialisations qu'il demande.
    Aligner,
}

/// ERLE (dB) du vrai modèle DTLN, sur les passages où la référence joue après 6 s (temps
/// d'acquisition), sortie recalée de la latence du modèle. `None` si le modèle est absent.
fn run_drift_erle(scenario: Scenario, mode: ErleMode) -> Option<f64> {
    use super::aligner::SampleDelayLine;

    let (speaker, echo) = recorded_pair();
    let mic = drifted(&echo, scenario);
    crate::capture::use_source_aec_models();
    let mut aec = build_aec(RATE);
    aec.as_ref()?;
    let latency = syntheo_aec::BLOCK_SIZE - syntheo_aec::BLOCK_SHIFT;
    let mut linear_echo_gain = None;
    let mut aligner = AecReferenceAligner::new(RATE);
    let mut ideal_line = SampleDelayLine::new(4_000);
    let mut output = Vec::with_capacity(mic.len());
    for (index, (speaker_chunk, mic_chunk)) in
        speaker.chunks(CHUNK).zip(mic.chunks(CHUNK)).enumerate()
    {
        let start = index * CHUNK;
        let (aligned_mic, aligned_speaker): (Vec<f32>, Vec<f32>) = match mode {
            ErleMode::Raw => (mic_chunk.to_vec(), speaker_chunk.to_vec()),
            ErleMode::Ideal => (
                mic_chunk.to_vec(),
                ideal_line.process(speaker_chunk, true_lag(start, scenario).round() as usize),
            ),
            ErleMode::Aligner => {
                let pair = aligner.align(speaker_chunk, mic_chunk);
                if pair.alignment_changed {
                    reset_echo_cancellation(&mut aec, &mut linear_echo_gain);
                }
                (pair.mic.to_vec(), pair.speaker.to_vec())
            }
        };
        let processed = process_aec(
            &mut aec,
            &mut linear_echo_gain,
            &aligned_mic,
            &aligned_speaker,
        )?;
        output.extend_from_slice(&processed);
    }
    // La sortie suit le micro aligné : retard de la ligne du micro (nul ici, la référence étant
    // en retard) plus la latence du modèle.
    let (mut mic_energy, mut out_energy) = (0.0f64, 0.0f64);
    let skip = 6 * RATE as usize;
    for start in (skip..mic.len().saturating_sub(latency)).step_by(CHUNK) {
        let end = (start + CHUNK).min(mic.len() - latency);
        if !speaker[start..end].iter().any(|sample| sample.abs() > 1e-3) {
            continue;
        }
        mic_energy += mic[start..end]
            .iter()
            .map(|&x| f64::from(x).powi(2))
            .sum::<f64>();
        out_energy += output[start + latency..end + latency]
            .iter()
            .map(|&x| f64::from(x).powi(2))
            .sum::<f64>();
    }
    Some(10.0 * (mic_energy / out_energy.max(1e-12)).log10())
}

#[test]
#[ignore = "mesure longue avec le modèle DTLN réel"]
fn aec_drift_erle_with_dtln() {
    println!("| Scénario ({DURATION_SECS} s, theo) | Témoin idéal | Sans alignement | Aligneur |");
    println!("|---|---|---|---|");
    for (label, drift_ppm) in [("sans dérive", 0.0), ("800 ppm", DRIFT_PPM)] {
        let scenario = Scenario {
            drift_ppm,
            jump_samples: 0.0,
        };
        let Some(ideal) = run_drift_erle(scenario, ErleMode::Ideal) else {
            println!("modèle indisponible, mesure ignorée");
            return;
        };
        let raw = run_drift_erle(scenario, ErleMode::Raw).unwrap();
        let aligned = run_drift_erle(scenario, ErleMode::Aligner).unwrap();
        println!("| {label} | {ideal:.2} dB | {raw:.2} dB | {aligned:.2} dB |");
    }
}
