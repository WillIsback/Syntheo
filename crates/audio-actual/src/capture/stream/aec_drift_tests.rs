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
    /// Le retard appliqué a changé de signe pendant le verrou (#554), avec l'instant du
    /// premier passage d'un signe à l'autre.
    pub crossed_while_locked_secs: Option<f64>,
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
    let mut first_sign: Option<bool> = None;
    let mut crossed = None;

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
                if applied != 0.0 {
                    let positive = applied > 0.0;
                    match first_sign {
                        None => first_sign = Some(positive),
                        Some(first) if first != positive && crossed.is_none() => {
                            crossed = Some(start as f64 / RATE as f64);
                        }
                        Some(_) => {}
                    }
                }
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
        crossed_while_locked_secs: crossed,
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
    // #554 : retard de départ 400 échantillons au-dessus de l'avance ; la dérive négative
    // (−12,8 échantillons par seconde) le fait passer sous l'avance vers 31 s, bien après le
    // verrou : la cible signée passe de positive à négative en glissant (la ligne de la
    // référence redescend à 0 pendant que celle du micro monte), sans réinitialisation
    // supplémentaire. (Un départ sous l'avance à +800 ppm, vers 280 échantillons, fait perdre
    // le verrou à la sonde vers 9 s, avance ou non : c'est la sonde, pas l'avance.)
    let crossing = run_drift(Scenario {
        drift_ppm: -DRIFT_PPM,
        jump_samples: 0.0,
        base_lag: LEAD_SAMPLES + 400.0,
    });
    report("−800 ppm, traverse l'avance", &crossing);
    // #623 : départ à 280 échantillons à +800 ppm. Le verrou se prend sous dérive avant que la
    // droite existe ; une mesure faible juste après le faisait perdre (3 réinitialisations,
    // 4,1 % sans alignement avant le correctif de la sonde).
    let short_lag = run_drift(Scenario {
        drift_ppm: DRIFT_PPM,
        jump_samples: 0.0,
        base_lag: 280.0,
    });
    report("800 ppm, départ à 280 éch.", &short_lag);
    println!(
        "traversée de l'avance pendant le verrou : {:?} s (1er verrou {:?} s)",
        crossing.crossed_while_locked_secs, crossing.first_lock_secs
    );

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
    assert_eq!(
        short_lag.resets, 1,
        "départ à 280 : {} réinitialisations",
        short_lag.resets
    );
    assert!(
        short_lag.unaligned_ratio < 0.01,
        "départ à 280 : verrou perdu {:.1} % du temps",
        short_lag.unaligned_ratio * 100.0
    );
    let (Some(locked_at), Some(crossed_at)) =
        (crossing.first_lock_secs, crossing.crossed_while_locked_secs)
    else {
        panic!("le retard appliqué n'a pas changé de signe pendant le verrou");
    };
    assert!(crossed_at > locked_at);
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
/// d'acquisition), sortie recalée de la latence du modèle.
fn run_drift_erle(scenario: Scenario, mode: ErleMode) -> f64 {
    use super::aligner::SampleDelayLine;

    let (speaker, echo) = recorded_pair();
    let mic = drifted(&echo, scenario);
    let mut aec = Some(build_aec(RATE).expect("modèles DTLN embarqués"));
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
        )
        .expect("aec_failed");
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
    10.0 * (mic_energy / out_energy.max(1e-12)).log10()
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
        let ideal = run_drift_erle(scenario, ErleMode::Ideal);
        let raw = run_drift_erle(scenario, ErleMode::Raw);
        let aligned = run_drift_erle(scenario, ErleMode::Aligner);
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

fn run_lead(pair: SweepPair, scenario: Scenario, mode: LeadMode) -> LeadMeasure {
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
    let mut aec = Some(build_aec(RATE).expect("modèles DTLN embarqués"));
    let latency = syntheo_aec::BLOCK_SIZE - syntheo_aec::BLOCK_SHIFT;
    let mut linear_echo_gain = None;
    let mut aligner = AecReferenceAligner::new(RATE);
    let mut speaker_line = SampleDelayLine::new(4_000);
    let mut output = Vec::with_capacity(mic.len());
    let mut resets = 0;
    // Retard de la ligne du micro à la fin de chaque bloc : la sortie suit le micro retardé
    // (branche `DelayMic` de l'aligneur corrigé), à recaler pour la comparer à la voix locale
    // propre. Le retard réel, pas la cible : entre deux mesures, la ligne suit la dérive.
    let mut mic_delays = Vec::with_capacity(mic.len() / CHUNK + 1);
    for (speaker_chunk, mic_chunk) in speaker.chunks(CHUNK).zip(mic.chunks(CHUNK)) {
        let pair = aligner.align(speaker_chunk, mic_chunk);
        if pair.alignment_changed {
            resets += 1;
            reset_echo_cancellation(&mut aec, &mut linear_echo_gain);
        }
        mic_delays.push(match mode {
            LeadMode::Corrected => aligner.mic_line_delay_samples(),
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
        output.extend_from_slice(
            &process_aec(&mut aec, &mut linear_echo_gain, &aligned_mic, &reference)
                .expect("aec_failed"),
        );
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
    LeadMeasure {
        resets,
        erle_echo_only: db(echo_mic, echo_out),
        reduction_doubletalk: db(dt_mic, dt_out),
        near_kept_db: near.as_ref().map(|_| db(projected, near_energy)),
        near_correlation: near
            .as_ref()
            .map(|_| cross / (near_energy * out_dt).sqrt().max(1e-12)),
    }
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
                let measure = run_lead(pair, scenario, LeadMode::Emulated(lead));
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
        for (base_lag, drifts) in [
            (
                BASE_LAG,
                &[("sans dérive", 0.0), ("800 ppm", DRIFT_PPM)][..],
            ),
            (0.0, &[("sans dérive", 0.0), ("800 ppm", DRIFT_PPM)][..]),
            // Retard mesuré ≈ 673 qui redescend sous l'avance vers 15 s, après les 6 s
            // exclues et après le verrou : traversée verrouillée (DelaySpeaker → DelayMic).
            (200.0, &[("−800 ppm", -DRIFT_PPM)][..]),
        ] {
            for &(drift_label, drift_ppm) in drifts {
                let scenario = Scenario {
                    drift_ppm,
                    jump_samples: 0.0,
                    base_lag,
                };
                let measure = run_lead(pair, scenario, LeadMode::Corrected);
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

/// #623 : diagnostic de la sonde (`crates/audio-sync`) sur le scénario qui décroche, retard de
/// départ 280 et +800 ppm. Instantané de chaque intervalle : état, retard candidat, pic et
/// netteté de la corrélation, retard stable, retard vrai à la fin de la fenêtre.
#[test]
#[ignore = "diagnostic de la sonde, sortie à lire"]
fn aec_probe_snapshots_280_at_800_ppm() {
    use syntheo_audio_sync::{SyncProbe, SyncProbeConfig, SyncProbeEvent};

    let scenario = Scenario {
        drift_ppm: DRIFT_PPM,
        jump_samples: 0.0,
        base_lag: 280.0,
    };
    let speaker = speaker_signal(&load("theo_lpb.wav"));
    let mic = mic_signal(&speaker, scenario);
    // Même configuration que `AecReferenceAligner::new`.
    let max_lag = RATE as usize * super::AEC_MAX_REFERENCE_LAG_MS as usize / 1000;
    let min_overlap = RATE as usize * super::AEC_MIN_REFERENCE_OVERLAP_MS as usize / 1000;
    let mut config = SyncProbeConfig::new(RATE);
    config.window_samples = config
        .window_samples
        .max((max_lag + min_overlap).next_power_of_two());
    config.max_lag_samples = max_lag.max(config.max_lag_samples);
    let mut probe = SyncProbe::new(config);
    println!(
        "fenêtre {} éch., intervalle {} éch.",
        config.window_samples, config.interval_samples
    );
    println!("| t (s) | événement | candidat | pic | netteté | état | stable | vrai |");
    println!("|---|---|---|---|---|---|---|---|");
    for (index, (speaker_chunk, mic_chunk)) in
        speaker.chunks(CHUNK).zip(mic.chunks(CHUNK)).enumerate()
    {
        let Some(event) = probe.observe(speaker_chunk, mic_chunk) else {
            continue;
        };
        let end = (index + 1) * CHUNK;
        let snapshot = event.snapshot();
        let (kind, candidate, peak, distinct) = match &event {
            SyncProbeEvent::Measured(m) => (
                "mesure",
                Some(m.estimate.lag_samples),
                m.estimate.peak_ratio,
                m.estimate.distinctiveness,
            ),
            SyncProbeEvent::SkippedLowConfidence(c) => (
                match c.reason {
                    syntheo_audio_sync::SyncProbeLowConfidenceReason::WeakCorrelation => {
                        "rejet corrélation"
                    }
                    syntheo_audio_sync::SyncProbeLowConfidenceReason::LagOutlier { .. } => {
                        "rejet aberrant"
                    }
                },
                Some(c.estimate.lag_samples),
                c.estimate.peak_ratio,
                c.estimate.distinctiveness,
            ),
            SyncProbeEvent::SkippedLowEnergy(_) => ("silence", None, 0.0, 0.0),
        };
        let t = event.capture_time_sec();
        if !(3.0..=20.0).contains(&t) {
            continue;
        }
        println!(
            "| {t:.2} | {kind} | {} | {peak:.1} | {distinct:.2} | {:?} | {} | {:.1} |",
            candidate.map_or("—".to_string(), |lag| lag.to_string()),
            snapshot.state,
            snapshot
                .stable_lag_samples
                .map_or("—".to_string(), |lag| lag.to_string()),
            true_lag(end, scenario),
        );
    }
}

/// #623 : retard appliqué par l'aligneur pendant les premières secondes du verrou, sur la paire
/// réelle theo (retard ajouté 904, puis sans retard ajouté), sans dérive. Sert à comparer la
/// médiane (avant) et le dernier retard accepté (après) tant que la droite de dérive manque.
#[test]
#[ignore = "mesure à lire"]
fn aec_probe_first_lock_seconds_on_theo() {
    for base_lag in [BASE_LAG, 0.0] {
        let scenario = Scenario {
            drift_ppm: 0.0,
            jump_samples: 0.0,
            base_lag,
        };
        let (speaker, echo) = recorded_pair();
        let mic = drifted(&echo, scenario);
        let mut aligner = AecReferenceAligner::new(RATE);
        let mut resets = 0;
        let mut first_lock: Option<f64> = None;
        let mut last_printed: Option<(super::aligner::AecAlignment, super::aligner::AecAlignment)> =
            None;
        println!("retard ajouté {base_lag} :");
        for (index, (speaker_chunk, mic_chunk)) in
            speaker.chunks(CHUNK).zip(mic.chunks(CHUNK)).enumerate()
        {
            let pair = aligner.align(speaker_chunk, mic_chunk);
            if pair.alignment_changed {
                resets += 1;
            }
            let t = (index + 1) as f64 * CHUNK as f64 / RATE as f64;
            if first_lock.is_none() && aligner.applied_alignment.signed_delay().is_some() {
                first_lock = Some(t);
            }
            let Some(locked_at) = first_lock else {
                continue;
            };
            if t > locked_at + 4.0 {
                continue;
            }
            let state = (aligner.last_alignment, aligner.applied_alignment);
            if last_printed != Some(state) {
                println!(
                    "  t={t:.2} s  mesure brute {:?}  appliqué {:?}",
                    state.0, state.1
                );
                last_printed = Some(state);
            }
        }
        println!("  1er verrou {first_lock:?} s, réinitialisations sur 180 s : {resets}");
    }
}

// Issue 633 : mesurer avant de toucher l'algorithme.
// 1. Dérive d'horloge réelle des paires enregistrées (micro / boucle du haut-parleur).
// 2. Coût des pas entiers : référence idéale retardée du retard vrai moins l'avance, lue au
//    retard arrondi (pas entiers aux bons instants) ou interpolée (retard fractionnaire),
//    comparée à la chaîne réelle (aligneur corrigé).

/// Dérive (ppm) d'une paire brute : retard GCC-PHAT sur des fenêtres de 1 s toutes les 0,5 s
/// où la référence joue, puis droite des moindres carrés. Rend aussi le nombre de fenêtres
/// retenues, la durée et l'écart des retards (min, max).
fn measured_drift(lpb_name: &str, mic_name: &str) -> (f64, usize, f64, isize, isize) {
    let (lpb, mic) = (load(lpb_name), load(mic_name));
    let len = lpb.len().min(mic.len());
    let window = RATE as usize;
    let mut estimator = syntheo_audio_sync::GccPhatLagEstimator::new(window, 4_000);
    let mut points = Vec::new();
    let mut start = 0;
    while start + window <= len {
        let reference = &lpb[start..start + window];
        if energy(reference) / window as f64 > 1e-5
            && let Some(estimate) = estimator.estimate(reference, &mic[start..start + window])
            && estimate.distinctiveness > 0.0
        {
            points.push((start as f64 / RATE as f64, estimate.lag_samples));
        }
        start += window / 2;
    }
    // Médiane glissante grossière : écarte les fenêtres dont le retard s'éloigne de plus de
    // 32 échantillons de la médiane globale (pics parasites).
    let mut lags: Vec<isize> = points.iter().map(|&(_, lag)| lag).collect();
    lags.sort_unstable();
    let median = lags.get(lags.len() / 2).copied().unwrap_or(0);
    let kept: Vec<(f64, f64)> = points
        .iter()
        .filter(|&&(_, lag)| (lag - median).abs() <= 32)
        .map(|&(t, lag)| (t, lag as f64))
        .collect();
    let n = kept.len() as f64;
    let (mt, ml) = (
        kept.iter().map(|p| p.0).sum::<f64>() / n,
        kept.iter().map(|p| p.1).sum::<f64>() / n,
    );
    let slope = kept.iter().map(|p| (p.0 - mt) * (p.1 - ml)).sum::<f64>()
        / kept
            .iter()
            .map(|p| (p.0 - mt).powi(2))
            .sum::<f64>()
            .max(1e-12);
    let min = kept.iter().map(|p| p.1 as isize).min().unwrap_or(0);
    let max = kept.iter().map(|p| p.1 as isize).max().unwrap_or(0);
    (
        slope / RATE as f64 * 1e6,
        kept.len(),
        len as f64 / RATE as f64,
        min,
        max,
    )
}

/// Retard médian (échantillons) d'une paire brute.
fn measured_lag(lpb_name: &str, mic_name: &str) -> f64 {
    let (_, _, _, min, max) = measured_drift(lpb_name, mic_name);
    (min + max) as f64 / 2.0
}

#[test]
#[ignore = "mesure à lire"]
fn aec_recorded_pairs_real_drift() {
    println!("| Paire | Durée | Fenêtres | Retard min / max (éch.) | Dérive |");
    println!("|---|---|---|---|---|");
    for (label, lpb, mic) in [
        ("theo", "theo_lpb.wav", "theo_mic.wav"),
        ("syntheo", "syntheo_lpb.wav", "syntheo_mic.wav"),
        (
            "doubletalk",
            "doubletalk_lpb_sample.wav",
            "doubletalk_mic_sample.wav",
        ),
    ] {
        let (ppm, windows, secs, min, max) = measured_drift(lpb, mic);
        println!("| {label} | {secs:.1} s | {windows} | {min} / {max} | {ppm:.1} ppm |");
    }
}

#[derive(Clone, Copy)]
enum IdealRead {
    /// Retard arrondi à l'échantillon, recalculé à chaque échantillon.
    Integer,
    /// Retard fractionnaire, interpolation linéaire.
    Fractional,
}

/// Mesure de la chaîne DTLN avec une référence idéale (retard vrai moins l'avance), lue en pas
/// entiers ou en retard fractionnaire. Mêmes passages et mêmes grandeurs que `run_lead`.
fn run_ideal(pair: SweepPair, scenario: Scenario, read: IdealRead) -> LeadMeasure {
    let (speaker, echo) = match pair {
        SweepPair::Theo | SweepPair::TheoWithNearEnd => recorded_pair(),
        SweepPair::Doubletalk => {
            recorded_pair_named("doubletalk_lpb_sample.wav", "doubletalk_mic_sample.wav")
        }
    };
    // Retard propre de la paire enregistrée (chemin d'écho de la pièce), mesuré sur les
    // fichiers bruts : il s'ajoute au retard simulé.
    let inherent = match pair {
        SweepPair::Theo | SweepPair::TheoWithNearEnd => {
            measured_lag("theo_lpb.wav", "theo_mic.wav")
        }
        SweepPair::Doubletalk => {
            measured_lag("doubletalk_lpb_sample.wav", "doubletalk_mic_sample.wav")
        }
    };
    let near = matches!(pair, SweepPair::TheoWithNearEnd).then(|| near_end_signal(echo.len()));
    let mut mic = drifted(&echo, scenario);
    if let Some(near) = &near {
        for (sample, voice) in mic.iter_mut().zip(near) {
            *sample += voice;
        }
    }
    let reference: Vec<f32> = (0..speaker.len())
        .map(|n| {
            let delay = (true_lag(n, scenario) + inherent - LEAD_SAMPLES).max(0.0);
            let t = n as f64 - delay;
            if t < 0.0 {
                return 0.0;
            }
            match read {
                IdealRead::Integer => speaker.get(t.round() as usize).copied().unwrap_or(0.0),
                IdealRead::Fractional => {
                    let i = t.floor() as usize;
                    let frac = (t - t.floor()) as f32;
                    let a = speaker.get(i).copied().unwrap_or(0.0);
                    let b = speaker.get(i + 1).copied().unwrap_or(0.0);
                    a + (b - a) * frac
                }
            }
        })
        .collect();
    let mut aec = Some(build_aec(RATE).expect("modèles DTLN embarqués"));
    let latency = syntheo_aec::BLOCK_SIZE - syntheo_aec::BLOCK_SHIFT;
    let mut linear_echo_gain = None;
    let mut output = Vec::with_capacity(mic.len());
    for (reference_chunk, mic_chunk) in reference.chunks(CHUNK).zip(mic.chunks(CHUNK)) {
        output.extend_from_slice(
            &process_aec(&mut aec, &mut linear_echo_gain, mic_chunk, reference_chunk)
                .expect("aec_failed"),
        );
    }

    let skip = 6 * RATE as usize;
    let end_all = mic.len().saturating_sub(latency);
    let (mut echo_mic, mut echo_out, mut dt_mic, mut dt_out) = (0.0, 0.0, 0.0, 0.0);
    let (mut near_energy, mut projected, mut cross, mut out_dt) = (0.0, 0.0, 0.0, 0.0);
    for start in (skip..end_all).step_by(CHUNK) {
        let end = (start + CHUNK).min(end_all);
        let out = &output[start + latency..end + latency];
        if !active(&speaker[start..end]) {
            continue;
        }
        let near_on = near.as_ref().is_some_and(|near| active(&near[start..end]));
        let (mic_e, out_e) = (energy(&mic[start..end]), energy(out));
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
            dt_mic += mic_e;
            dt_out += out_e;
        } else {
            echo_mic += mic_e;
            echo_out += out_e;
        }
    }
    let db = |num: f64, den: f64| 10.0 * (num / den.max(1e-12)).log10();
    LeadMeasure {
        resets: 0,
        erle_echo_only: db(echo_mic, echo_out),
        reduction_doubletalk: db(dt_mic, dt_out),
        near_kept_db: near.as_ref().map(|_| db(projected, near_energy)),
        near_correlation: near
            .as_ref()
            .map(|_| cross / (near_energy * out_dt).sqrt().max(1e-12)),
    }
}

type MeasureGetter = fn(&LeadMeasure) -> Option<f64>;

#[test]
#[ignore = "mesure longue avec le modèle DTLN réel"]
fn aec_fractional_delay_gain_with_dtln() {
    println!(
        "| Paire | Dérive | Mesure | Idéal fractionnaire | Idéal pas entiers | Aligneur réel | Réinit. |"
    );
    println!("|---|---|---|---|---|---|---|");
    for (pair, pair_label) in [
        (SweepPair::Theo, "theo"),
        (SweepPair::Doubletalk, "doubletalk"),
        (SweepPair::TheoWithNearEnd, "theo + voix locale"),
    ] {
        for drift_ppm in [0.0, 200.0, DRIFT_PPM] {
            let scenario = Scenario {
                drift_ppm,
                jump_samples: 0.0,
                base_lag: BASE_LAG,
            };
            let fractional = run_ideal(pair, scenario, IdealRead::Fractional);
            let integer = run_ideal(pair, scenario, IdealRead::Integer);
            let real = run_lead(pair, scenario, LeadMode::Corrected);
            let rows: Vec<(&str, MeasureGetter)> = match pair {
                SweepPair::Theo => vec![("ERLE écho seul", |m| Some(m.erle_echo_only))],
                SweepPair::Doubletalk => {
                    vec![("Réduction double parole", |m| Some(m.reduction_doubletalk))]
                }
                SweepPair::TheoWithNearEnd => vec![
                    ("ERLE écho seul", |m| Some(m.erle_echo_only)),
                    ("Voix locale conservée", |m| m.near_kept_db),
                ],
            };
            for (label, get) in rows {
                let cell = |m: &LeadMeasure| get(m).map_or("—".into(), |v| format!("{v:.2} dB"));
                println!(
                    "| {pair_label} | {drift_ppm} ppm | {label} | {} | {} | {} | {} |",
                    cell(&fractional),
                    cell(&integer),
                    cell(&real),
                    real.resets,
                );
            }
        }
    }
}
