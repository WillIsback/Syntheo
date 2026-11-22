//! Prédiction du RTF par moteur à partir du micro-banc, et décision
//! « proposer, proposer en profil dégradé, ne pas proposer » (banc de
//! l'issue 680, seuils de sa conclusion).
//!
//! Le RTF d'un moteur ne suit pas le débit de façon proportionnelle (A passe
//! de 0,189 à 0,277 quand le débit est divisé par deux). La prédiction
//! interpole donc entre des points mesurés, en échelle log-log, et prolonge
//! la pente du segment extrême au-delà. Chaque point vient d'un poste de
//! référence où le banc du moteur et le micro-banc ont tourné.

use serde::Serialize;

use crate::bench::BenchResult;
use crate::hardware::{Hardware, PowerPlan};

/// Moteur de transcription sur le poste ; la décision entre les deux tombera
/// après le banc du ThinkPad et le WER (issue 680).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, serde::Deserialize)]
#[cfg_attr(feature = "specta", derive(specta::Type))]
#[serde(rename_all = "snake_case")]
pub enum Engine {
    /// A : parakeet-rs (ONNX Runtime), int8.
    ParakeetOnnx,
    /// B : NeMo-Speech.cpp (ggml), q8_0.
    NemoGgml,
}

/// Profils, du plus complet au plus réduit : l'ordre de choix de la mise en
/// service (issue 686).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[cfg_attr(feature = "specta", derive(specta::Type))]
#[serde(rename_all = "snake_case")]
pub enum Profile {
    TwoStreamsDiarized,
    TwoStreams,
    OneStreamDiarized,
    OneStream,
}

impl Profile {
    pub const ALL: [Profile; 4] = [
        Profile::TwoStreamsDiarized,
        Profile::TwoStreams,
        Profile::OneStreamDiarized,
        Profile::OneStream,
    ];

    fn index(self) -> usize {
        self as usize
    }
}

/// RTF cumulé prédit (ou mesuré) pour chaque profil, dans l'ordre de
/// `Profile::ALL`.
#[derive(Debug, Clone, Copy, PartialEq, Serialize)]
#[cfg_attr(feature = "specta", derive(specta::Type))]
pub struct ProfileRtfs(pub [f64; 4]);

impl ProfileRtfs {
    pub fn get(&self, profile: Profile) -> f64 {
        self.0[profile.index()]
    }
}

/// Point d'étalonnage : débit du micro-banc et RTF mesurés sur un même poste.
struct Point {
    gmacs: f64,
    rtfs: [f64; 4],
}

/// Banc de l'issue 680 sur l'Omarchy du builder (Ryzen 9 9950X), cœurs
/// limités par cpuset, un fil par cœur ; micro-banc mesuré dans les mêmes
/// conditions (208 GMAC/s à 4 cœurs, 105 à 2 cœurs).
const PARAKEET_POINTS: &[Point] = &[
    Point {
        gmacs: 105.0,
        rtfs: [0.277, 0.199, 0.141, 0.068],
    },
    Point {
        gmacs: 208.0,
        rtfs: [0.189, 0.133, 0.102, 0.057],
    },
];

const NEMO_POINTS: &[Point] = &[
    Point {
        gmacs: 105.0,
        rtfs: [0.82, 0.559, 0.509, 0.371],
    },
    Point {
        gmacs: 208.0,
        rtfs: [0.49, 0.359, 0.325, 0.256],
    },
];

fn points(engine: Engine) -> &'static [Point] {
    match engine {
        Engine::ParakeetOnnx => PARAKEET_POINTS,
        Engine::NemoGgml => NEMO_POINTS,
    }
}

/// Interpolation log-log entre les points (triés par débit), pente du
/// segment extrême au-delà.
fn interpolate(points: &[Point], profile: usize, gmacs: f64) -> f64 {
    let gmacs = gmacs.max(1e-3);
    let segment = points
        .windows(2)
        .position(|w| gmacs <= w[1].gmacs)
        .unwrap_or(points.len() - 2);
    let (a, b) = (&points[segment], &points[segment + 1]);
    let slope = (b.rtfs[profile].ln() - a.rtfs[profile].ln()) / (b.gmacs.ln() - a.gmacs.ln());
    (a.rtfs[profile].ln() + slope * (gmacs.ln() - a.gmacs.ln())).exp()
}

/// RTF prédits pour chaque profil, d'après le débit du micro-banc.
pub fn predict(engine: Engine, gmacs: f64) -> ProfileRtfs {
    let points = points(engine);
    ProfileRtfs(std::array::from_fn(|profile| {
        interpolate(points, profile, gmacs)
    }))
}

/// Budget du profil complet (epic 631) : RTF cumulé deux flux ≤ 0,5.
pub const BUDGET: f64 = 0.5;
/// Au-delà, pas de profil dégradé non plus.
pub const DEGRADED_LIMIT: f64 = 1.0;
/// Marge de mémoire libre : A occupe 1,4 Go en deux flux diarisés.
pub const MIN_AVAILABLE_MEMORY: u64 = 1_500 * 1024 * 1024;
/// Modèles (environ 1,1 Go) et marge d'installation.
pub const MIN_FREE_DISK: u64 = 2 * 1024 * 1024 * 1024;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[cfg_attr(feature = "specta", derive(specta::Type))]
#[serde(rename_all = "snake_case")]
pub enum Refusal {
    NoAvx2,
    NotEnoughMemory,
    NotEnoughDisk,
    TooSlow,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[cfg_attr(feature = "specta", derive(specta::Type))]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum Verdict {
    /// Profil complet dans le budget.
    Propose { profile: Profile },
    /// Profil complet entre le budget et la limite : le premier profil
    /// réduit qui tient le budget.
    ProposeDegraded { profile: Profile },
    /// Pas de proposition, ni de téléchargement.
    Refuse { reasons: Vec<Refusal> },
}

/// Résultat complet de la sonde.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[cfg_attr(feature = "specta", derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub struct Probe {
    pub engine: Engine,
    pub hardware: Hardware,
    /// Absent quand les contrôles statiques refusent déjà le poste.
    pub bench: Option<BenchResult>,
    pub predicted: Option<ProfileRtfs>,
    pub verdict: Verdict,
    /// Économie d'énergie ou batterie : conseiller le secteur ou le mode
    /// performance, puis refaire la sonde.
    pub power_advice: bool,
}

/// Contrôles statiques, avant tout calcul.
pub fn static_refusals(hardware: &Hardware) -> Vec<Refusal> {
    let mut reasons = Vec::new();
    if !hardware.avx2 {
        reasons.push(Refusal::NoAvx2);
    }
    if hardware.available_memory_bytes < MIN_AVAILABLE_MEMORY {
        reasons.push(Refusal::NotEnoughMemory);
    }
    if hardware
        .free_disk_bytes
        .is_some_and(|free| free < MIN_FREE_DISK)
    {
        reasons.push(Refusal::NotEnoughDisk);
    }
    reasons
}

/// Décision à partir des RTF (prédits par la sonde, ou fixés par un test).
pub fn decide(rtfs: &ProfileRtfs) -> Verdict {
    let full = rtfs.get(Profile::TwoStreamsDiarized);
    if full <= BUDGET {
        return Verdict::Propose {
            profile: Profile::TwoStreamsDiarized,
        };
    }
    if full <= DEGRADED_LIMIT
        && let Some(profile) = Profile::ALL[1..]
            .iter()
            .copied()
            .find(|p| rtfs.get(*p) <= BUDGET)
    {
        return Verdict::ProposeDegraded { profile };
    }
    Verdict::Refuse {
        reasons: vec![Refusal::TooSlow],
    }
}

pub fn power_advice(hardware: &Hardware) -> bool {
    hardware.power_plan == PowerPlan::PowerSaver || hardware.on_battery == Some(true)
}

/// Le plan d'alimentation ou le secteur ont changé depuis la sonde : la
/// mesure est refaite, jamais extrapolée.
pub fn needs_new_probe(previous: &Probe, now: &Hardware) -> bool {
    previous.hardware.power_plan != now.power_plan
        || previous.hardware.on_battery != now.on_battery
        || previous.hardware.physical_cores != now.physical_cores
}

/// Sonde complète : contrôles statiques, puis micro-banc (environ
/// `duration`) sur autant de fils que de cœurs physiques.
pub fn probe(engine: Engine, data_dir: &std::path::Path, duration: std::time::Duration) -> Probe {
    let hardware = crate::hardware::read(data_dir);
    let advice = power_advice(&hardware);
    let refusals = static_refusals(&hardware);
    if !refusals.is_empty() {
        return Probe {
            engine,
            hardware,
            bench: None,
            predicted: None,
            verdict: Verdict::Refuse { reasons: refusals },
            power_advice: advice,
        };
    }
    let bench = crate::bench::run(hardware.physical_cores, duration);
    let predicted = predict(engine, bench.gmacs);
    Probe {
        engine,
        hardware,
        bench: Some(bench),
        predicted: Some(predicted),
        verdict: decide(&predicted),
        power_advice: advice,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn close(a: f64, b: f64) -> bool {
        (a - b).abs() < 1e-9
    }

    #[test]
    fn prediction_goes_through_the_measured_points() {
        for (engine, points) in [
            (Engine::ParakeetOnnx, PARAKEET_POINTS),
            (Engine::NemoGgml, NEMO_POINTS),
        ] {
            for point in points {
                let rtfs = predict(engine, point.gmacs);
                for profile in 0..4 {
                    assert!(
                        close(rtfs.0[profile], point.rtfs[profile]),
                        "{engine:?} {profile}"
                    );
                }
            }
        }
    }

    #[test]
    fn a_slower_machine_is_predicted_slower() {
        for engine in [Engine::ParakeetOnnx, Engine::NemoGgml] {
            let fast = predict(engine, 208.0).get(Profile::TwoStreamsDiarized);
            let slow = predict(engine, 50.0).get(Profile::TwoStreamsDiarized);
            assert!(slow > fast, "{engine:?}");
        }
    }

    // Banc 680 : le ThinkPad i7-10510U doit être refusé en deux flux diarisés
    // avec B, en performance (1,49) comme en low-power (3,73). Mesurés : le
    // profil complet et les deux flux sans diarisation ; en performance, les
    // profils à un flux sont déduits du banc à un flux. Les deux derniers en
    // low-power ne sont pas mesurés : sans effet, le profil complet dépassant
    // déjà la limite de 1,0.
    #[test]
    fn the_thinkpad_is_refused_with_b() {
        let performance = ProfileRtfs([1.49, 0.76, 0.95, 0.59]);
        let low_power = ProfileRtfs([3.73, 2.53, 2.4, 1.6]);
        for rtfs in [performance, low_power] {
            assert_eq!(
                decide(&rtfs),
                Verdict::Refuse {
                    reasons: vec![Refusal::TooSlow]
                }
            );
        }
    }

    #[test]
    fn thresholds_follow_the_bench_conclusion() {
        assert_eq!(
            decide(&ProfileRtfs([0.5, 0.3, 0.2, 0.1])),
            Verdict::Propose {
                profile: Profile::TwoStreamsDiarized
            }
        );
        assert_eq!(
            decide(&ProfileRtfs([0.8, 0.6, 0.45, 0.2])),
            Verdict::ProposeDegraded {
                profile: Profile::OneStreamDiarized
            }
        );
        assert_eq!(
            decide(&ProfileRtfs([0.9, 0.45, 0.3, 0.2])),
            Verdict::ProposeDegraded {
                profile: Profile::TwoStreams
            }
        );
        // Entre 0,5 et 1,0 sans aucun profil réduit dans le budget : refusé.
        assert_eq!(
            decide(&ProfileRtfs([0.95, 0.9, 0.8, 0.6])),
            Verdict::Refuse {
                reasons: vec![Refusal::TooSlow]
            }
        );
        assert_eq!(
            decide(&ProfileRtfs([1.2, 0.4, 0.3, 0.1])),
            Verdict::Refuse {
                reasons: vec![Refusal::TooSlow]
            }
        );
    }

    fn hardware() -> Hardware {
        Hardware {
            avx2: true,
            physical_cores: 4,
            logical_cores: 8,
            total_memory_bytes: 8 << 30,
            available_memory_bytes: 3 << 30,
            free_disk_bytes: Some(20 << 30),
            power_plan: PowerPlan::Balanced,
            on_battery: Some(false),
            gpus: Vec::new(),
        }
    }

    #[test]
    fn static_checks_refuse_before_any_bench() {
        assert!(static_refusals(&hardware()).is_empty());
        let weak = Hardware {
            avx2: false,
            available_memory_bytes: 1 << 30,
            free_disk_bytes: Some(1 << 30),
            ..hardware()
        };
        assert_eq!(
            static_refusals(&weak),
            [
                Refusal::NoAvx2,
                Refusal::NotEnoughMemory,
                Refusal::NotEnoughDisk
            ]
        );
    }

    #[test]
    fn power_saving_is_advised_and_triggers_a_new_probe() {
        let saving = Hardware {
            power_plan: PowerPlan::PowerSaver,
            ..hardware()
        };
        assert!(power_advice(&saving));
        assert!(power_advice(&Hardware {
            on_battery: Some(true),
            ..hardware()
        }));
        assert!(!power_advice(&hardware()));
        let previous = Probe {
            engine: Engine::ParakeetOnnx,
            hardware: saving,
            bench: None,
            predicted: None,
            verdict: Verdict::Refuse {
                reasons: vec![Refusal::TooSlow],
            },
            power_advice: true,
        };
        assert!(needs_new_probe(&previous, &hardware()));
        assert!(!needs_new_probe(&previous, &previous.hardware.clone()));
    }
}
