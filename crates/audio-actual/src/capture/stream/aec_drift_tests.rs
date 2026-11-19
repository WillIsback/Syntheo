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
/// Avance laissée à la référence par l'aligneur (`AEC_REFERENCE_LEAD_MS`, #554).
const LEAD_SAMPLES: f64 = (RATE * super::AEC_REFERENCE_LEAD_MS / 1000) as f64;

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
    /// Retard initial du chemin d'écho ajouté au signal.
    pub base_lag: f64,
}

const JUMP_AT: usize = DURATION_SECS / 2 * RATE as usize;

fn true_lag(n: usize, scenario: Scenario) -> f64 {
    let jump = if n >= JUMP_AT {
        scenario.jump_samples
    } else {
        0.0
    };
    scenario.base_lag + n as f64 * scenario.drift_ppm * 1e-6 + jump
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
                // La référence garde son avance (#554) : la cible est le retard vrai moins
                // l'avance.
                let error = (applied - (true_lag(start, scenario) - LEAD_SAMPLES)).abs();
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
        base_lag: BASE_LAG,
    });
    report("sans dérive", &still);
    for drift_ppm in [200.0, -800.0] {
        report(
            &format!("{drift_ppm} ppm"),
            &run_drift(Scenario {
                drift_ppm,
                jump_samples: 0.0,
                base_lag: BASE_LAG,
            }),
        );
    }
    let jump = run_drift(Scenario {
        drift_ppm: DRIFT_PPM,
        jump_samples: 300.0,
        base_lag: BASE_LAG,
    });
    report("800 ppm + saut de 300 éch. à 90 s", &jump);
    let run = run_drift(Scenario {
        drift_ppm: DRIFT_PPM,
        jump_samples: 0.0,
        base_lag: BASE_LAG,
    });
    report("800 ppm", &run);
    // #554 : retard de départ juste sous l'avance ; la dérive le fait traverser l'avance
    // (cible signée qui passe de négative à positive) sans réinitialisation supplémentaire.
    let crossing = run_drift(Scenario {
        drift_ppm: DRIFT_PPM,
        jump_samples: 0.0,
        base_lag: LEAD_SAMPLES - 60.0,
    });
    report("800 ppm, traverse l'avance", &crossing);

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
    assert!(
        crossing.resets <= run.resets,
        "traversée de l'avance : {} réinitialisations",
        crossing.resets
    );
    assert!(
        crossing.unaligned_ratio < 0.01 && crossing.mean_error < 16.0,
        "traversée de l'avance : verrou {:.1} %, erreur {:.1}",
        crossing.unaligned_ratio * 100.0,
        crossing.mean_error
    );
    assert_eq!(still.resets, 1);
    // Un vrai changement du chemin d'écho est toujours détecté et réacquis.
    assert!(jump.resets >= 2 && jump.unaligned_ratio < 0.1);
}

/// Paire réelle (référence, micro avec l'écho de la pièce) de `crates/aec/data`, découpée selon
/// le même motif parole / silence que [`speaker_signal`] : les deux canaux restent dans leur
/// alignement d'origine, celui qu'attend DTLN.
fn recorded_pair() -> (Vec<f32>, Vec<f32>) {
    recorded_pair_named("theo_lpb.wav", "theo_mic.wav")
}

fn recorded_pair_named(lpb_name: &str, mic_name: &str) -> (Vec<f32>, Vec<f32>) {
    let (lpb, mic) = (load(lpb_name), load(mic_name));
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
            base_lag: BASE_LAG,
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

// Issue 554 : balayage de l'avance laissée à la référence. L'aligneur réel mesure le retard ;
// la référence est ensuite retardée de ce retard moins l'avance (émulation du correctif, sans
// changer l'aligneur). Trois cas :
// - theo : paire enregistrée, écho seul ;
// - doubletalk : paire enregistrée de double parole, sans piste propre de la voix locale ;
// - theo + voix locale : écho de theo plus la voix propre de `syntheo_mic.wav` (sa référence
//   est un silence), pour mesurer ce que devient la voix locale.

const LEADS: [usize; 5] = [0, 160, 320, 480, 640];

#[derive(Clone, Copy)]
enum SweepPair {
    Theo,
    Doubletalk,
    TheoWithNearEnd,
}

/// Voix locale propre, par segments de 2 à 5 s séparés de silences de 2 à 7 s (décalés du
/// motif de la référence pour couvrir double parole, voix seule et écho seul).
fn near_end_signal(total: usize) -> Vec<f32> {
    let voice = load("syntheo_mic.wav");
    let rate = RATE as usize;
    let mut out = Vec::with_capacity(total);
    let (mut cursor, mut step) = (0usize, 0usize);
    out.extend(std::iter::repeat_n(0.0, 2 * rate));
    while out.len() < total {
        let talk = (2 + (step * 3) % 4) * rate;
        let pause = (2 + (step * 5) % 6) * rate;
        for _ in 0..talk {
            out.push(voice[cursor % voice.len()]);
            cursor += 1;
        }
        out.extend(std::iter::repeat_n(0.0, pause));
        step += 1;
    }
    out.truncate(total);
    out
}

#[derive(Clone, Copy)]
enum LeadMode {
    /// Avance émulée : référence retardée du retard mesuré brut moins cette avance.
    Emulated(usize),
    /// Aligneur corrigé tel quel (avance `AEC_REFERENCE_LEAD_MS`), sorties utilisées directement.
    Corrected,
}

struct LeadMeasure {
    /// Réinitialisations de l'annulation d'écho demandées par l'aligneur.
    resets: usize,
    /// ERLE (dB) sur les passages où seule la référence joue.
    erle_echo_only: f64,
    /// Réduction micro → sortie (dB) sur les passages de double parole.
    reduction_doubletalk: f64,
    /// Voix locale conservée en double parole (dB, 0 = intacte) : énergie de la projection de
    /// la sortie sur la voix locale propre, rapportée à celle de la voix locale.
    near_kept_db: Option<f64>,
    /// Corrélation sortie / voix locale propre en double parole.
    near_correlation: Option<f64>,
}

fn energy(signal: &[f32]) -> f64 {
    signal.iter().map(|&x| f64::from(x).powi(2)).sum()
}

fn active(signal: &[f32]) -> bool {
    signal.iter().any(|sample| sample.abs() > 1e-3)
}

fn run_lead(pair: SweepPair, scenario: Scenario, mode: LeadMode) -> Option<LeadMeasure> {
    use super::aligner::SampleDelayLine;

    let (speaker, echo) = match pair {
        SweepPair::Theo | SweepPair::TheoWithNearEnd => recorded_pair(),
        SweepPair::Doubletalk => {
            recorded_pair_named("doubletalk_lpb_sample.wav", "doubletalk_mic_sample.wav")
        }
    };
    let near = matches!(pair, SweepPair::TheoWithNearEnd).then(|| near_end_signal(echo.len()));
    let mut mic = drifted(&echo, scenario);
    if let Some(near) = &near {
        for (sample, voice) in mic.iter_mut().zip(near) {
            *sample += voice;
        }
    }
    crate::capture::use_source_aec_models();
    let mut aec = build_aec(RATE);
    aec.as_ref()?;
    let latency = syntheo_aec::BLOCK_SIZE - syntheo_aec::BLOCK_SHIFT;
    let mut linear_echo_gain = None;
    let mut aligner = AecReferenceAligner::new(RATE);
    let mut speaker_line = SampleDelayLine::new(4_000);
    let mut output = Vec::with_capacity(mic.len());
    let mut resets = 0;
    // Retard visé de la ligne du micro, par bloc : la sortie suit le micro retardé (branche
    // `DelayMic` de l'aligneur corrigé), à recaler pour la comparer à la voix locale propre.
    let mut mic_delays = Vec::with_capacity(mic.len() / CHUNK + 1);
    for (speaker_chunk, mic_chunk) in speaker.chunks(CHUNK).zip(mic.chunks(CHUNK)) {
        let pair = aligner.align(speaker_chunk, mic_chunk);
        if pair.alignment_changed {
            resets += 1;
            reset_echo_cancellation(&mut aec, &mut linear_echo_gain);
        }
        mic_delays.push(match mode {
            LeadMode::Corrected => aligner.applied_alignment.mic_delay_samples(),
            LeadMode::Emulated(_) => 0,
        });
        let (aligned_mic, reference) = match mode {
            LeadMode::Corrected => (pair.mic.to_vec(), pair.speaker.to_vec()),
            // Retard brut (appliqué plus l'avance de l'aligneur) moins l'avance émulée ; sans
            // verrou, la référence brute.
            LeadMode::Emulated(lead) => {
                let delay = aligner.applied_delay_samples().map_or(0, |applied| {
                    (applied + LEAD_SAMPLES - lead as f64).round().max(0.0) as usize
                });
                (
                    mic_chunk.to_vec(),
                    speaker_line.process(speaker_chunk, delay),
                )
            }
        };
        output.extend_from_slice(&process_aec(
            &mut aec,
            &mut linear_echo_gain,
            &aligned_mic,
            &reference,
        )?);
    }

    let skip = 6 * RATE as usize;
    let end_all = mic.len().saturating_sub(latency);
    let (mut echo_mic, mut echo_out) = (0.0, 0.0);
    let (mut dt_mic, mut dt_out) = (0.0, 0.0);
    let (mut near_energy, mut projected, mut cross, mut out_dt) = (0.0, 0.0, 0.0, 0.0);
    let max_mic_delay = mic_delays.iter().copied().max().unwrap_or(0);
    let end_all = end_all.saturating_sub(max_mic_delay);
    for start in (skip..end_all).step_by(CHUNK) {
        let end = (start + CHUNK).min(end_all);
        let shift = latency + mic_delays.get(start / CHUNK).copied().unwrap_or(0);
        let out = &output[start + shift..end + shift];
        let ref_on = active(&speaker[start..end]);
        let near_on = near.as_ref().is_some_and(|near| active(&near[start..end]));
        if !ref_on {
            continue;
        }
        let mic_e = energy(&mic[start..end]);
        let out_e = energy(out);
        if near_on {
            dt_mic += mic_e;
            dt_out += out_e;
            let voice = &near.as_ref().unwrap()[start..end];
            let voice_e = energy(voice);
            let dot: f64 = voice
                .iter()
                .zip(out)
                .map(|(&v, &o)| f64::from(v) * f64::from(o))
                .sum();
            near_energy += voice_e;
            if voice_e > 0.0 {
                projected += dot * dot / voice_e;
            }
            cross += dot;
            out_dt += out_e;
        } else if near.is_none() && matches!(pair, SweepPair::Doubletalk) {
            // Double parole enregistrée : la voix locale est partout, sans piste propre.
            dt_mic += mic_e;
            dt_out += out_e;
        } else {
            echo_mic += mic_e;
            echo_out += out_e;
        }
    }
    let db = |num: f64, den: f64| 10.0 * (num / den.max(1e-12)).log10();
    Some(LeadMeasure {
        resets,
        erle_echo_only: db(echo_mic, echo_out),
        reduction_doubletalk: db(dt_mic, dt_out),
        near_kept_db: near.as_ref().map(|_| db(projected, near_energy)),
        near_correlation: near
            .as_ref()
            .map(|_| cross / (near_energy * out_dt).sqrt().max(1e-12)),
    })
}

#[test]
#[ignore = "mesure longue avec le modèle DTLN réel"]
fn aec_drift_lead_sweep_with_dtln() {
    println!(
        "| Paire | Dérive | Avance (éch.) | ERLE écho seul | Réduction double parole \
         | Voix locale conservée | Corrélation voix locale |"
    );
    println!("|---|---|---|---|---|---|---|");
    for (pair, pair_label) in [
        (SweepPair::Theo, "theo"),
        (SweepPair::Doubletalk, "doubletalk"),
        (SweepPair::TheoWithNearEnd, "theo + voix locale"),
    ] {
        for (drift_label, drift_ppm) in [("sans dérive", 0.0), ("800 ppm", DRIFT_PPM)] {
            let scenario = Scenario {
                drift_ppm,
                jump_samples: 0.0,
                base_lag: BASE_LAG,
            };
            for lead in LEADS {
                let Some(measure) = run_lead(pair, scenario, LeadMode::Emulated(lead)) else {
                    println!("modèle indisponible, mesure ignorée");
                    return;
                };
                let optional = |value: Option<f64>, unit: &str| {
                    value.map_or("—".to_string(), |value| format!("{value:.2}{unit}"))
                };
                let erle = if matches!(pair, SweepPair::Doubletalk) {
                    "—".to_string()
                } else {
                    format!("{:.2} dB", measure.erle_echo_only)
                };
                let reduction = if matches!(pair, SweepPair::Theo) {
                    "—".to_string()
                } else {
                    format!("{:.2} dB", measure.reduction_doubletalk)
                };
                println!(
                    "| {pair_label} | {drift_label} | {lead} | {erle} | {reduction} | {} | {} |",
                    optional(measure.near_kept_db, " dB"),
                    optional(measure.near_correlation, ""),
                );
            }
        }
    }
}

/// #554, aligneur corrigé : avance réelle de `AEC_REFERENCE_LEAD_MS`, avec le retard ajouté du
/// banc (904, branche `DelaySpeaker`) et sans retard ajouté (retard naturel de theo, ≈ 473
/// échantillons, sous l'avance : branche `DelayMic`, autour de zéro).
#[test]
#[ignore = "mesure longue avec le modèle DTLN réel"]
fn aec_drift_corrected_lead_with_dtln() {
    println!(
        "| Paire | Retard ajouté | Dérive | ERLE écho seul | Voix locale conservée | Réinit. |"
    );
    println!("|---|---|---|---|---|---|");
    for (pair, pair_label) in [
        (SweepPair::Theo, "theo"),
        (SweepPair::TheoWithNearEnd, "theo + voix locale"),
    ] {
        for base_lag in [BASE_LAG, 0.0] {
            for (drift_label, drift_ppm) in [("sans dérive", 0.0), ("800 ppm", DRIFT_PPM)] {
                let scenario = Scenario {
                    drift_ppm,
                    jump_samples: 0.0,
                    base_lag,
                };
                let Some(measure) = run_lead(pair, scenario, LeadMode::Corrected) else {
                    println!("modèle indisponible, mesure ignorée");
                    return;
                };
                println!(
                    "| {pair_label} | {base_lag} | {drift_label} | {:.2} dB | {} | {} |",
                    measure.erle_echo_only,
                    measure
                        .near_kept_db
                        .map_or("—".to_string(), |value| format!("{value:.2} dB")),
                    measure.resets,
                );
            }
        }
    }
}
