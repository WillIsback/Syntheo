use std::collections::VecDeque;
use std::sync::Arc;
use std::{panic::AssertUnwindSafe, panic::catch_unwind};

use syntheo_audio_sync::{SyncProbe, SyncProbeConfig, SyncProbeEvent, SyncProbeState};

use super::{
    AEC_ALIGNMENT_RESET_SHIFT_MS, AEC_ALIGNMENT_SIGNIFICANT_SHIFT_MS,
    AEC_DELAY_SLEW_INTERVAL_SAMPLES, AEC_MAX_REFERENCE_LAG_MS, AEC_MIN_REFERENCE_OVERLAP_MS,
    AUDIO_SYNC_PROBE_ENV,
};

pub(super) struct AecReferenceAligner {
    probe: SyncProbe,
    mic_delay_line: SampleDelayLine,
    speaker_delay_line: SampleDelayLine,
    /// Dernier alignement mesuré par la sonde, pour le journal.
    pub(super) last_alignment: AecAlignment,
    /// Alignement visé par les lignes de retard. Un petit déplacement (dérive d'horloge, #437)
    /// y est rejoint en glissant, sans réinitialiser l'annulation d'écho ; seul un changement
    /// structurel la réinitialise (#322).
    pub(super) applied_alignment: AecAlignment,
    /// Dérive d'horloge estimée par la sonde (échantillons par seconde) et échantillons écoulés
    /// depuis sa dernière mesure : entre deux mesures, la cible des lignes de retard avance
    /// d'autant (#437).
    drift_samples_per_sec: Option<f64>,
    samples_since_measure: usize,
    last_logged_state: Option<SyncProbeState>,
    last_logged_stable_lag_samples: Option<isize>,
    log_probe_events: bool,
}

pub(super) struct AecAlignedPair {
    pub(super) mic: Arc<[f32]>,
    pub(super) speaker: Arc<[f32]>,
    pub(super) alignment_changed: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) enum AecAlignment {
    None,
    DelayMic(usize),
    DelaySpeaker(usize),
}

impl AecAlignment {
    pub(super) fn from_lag_samples(lag_samples: Option<isize>) -> Self {
        match lag_samples {
            Some(lag) if lag > 0 => Self::DelaySpeaker(lag as usize),
            Some(lag) if lag < 0 => Self::DelayMic(lag.unsigned_abs()),
            _ => Self::None,
        }
    }

    pub(super) fn mic_delay_samples(self) -> usize {
        match self {
            Self::DelayMic(samples) => samples,
            Self::None | Self::DelaySpeaker(_) => 0,
        }
    }

    pub(super) fn speaker_delay_samples(self) -> usize {
        match self {
            Self::DelaySpeaker(samples) => samples,
            Self::None | Self::DelayMic(_) => 0,
        }
    }
}

/// Dit si un changement d'alignement est significatif : verrouillage, perte, changement de sens
/// (haut-parleur ↔ micro) ou déplacement d'au moins [`AEC_ALIGNMENT_SIGNIFICANT_SHIFT_MS`].
/// Décide du niveau du journal (INFO ou DEBUG, d'une mesure à la suivante) et, contre
/// l'alignement appliqué, du réalignement avec réinitialisation de l'annulation d'écho (#322).
pub(super) fn is_significant_alignment_change(
    previous: AecAlignment,
    next: AecAlignment,
    sample_rate: u32,
) -> bool {
    let threshold_samples =
        (sample_rate as usize * AEC_ALIGNMENT_SIGNIFICANT_SHIFT_MS as usize) / 1000;
    match (previous, next) {
        (AecAlignment::DelaySpeaker(before), AecAlignment::DelaySpeaker(after))
        | (AecAlignment::DelayMic(before), AecAlignment::DelayMic(after)) => {
            before.abs_diff(after) >= threshold_samples
        }
        _ => previous != next,
    }
}

impl AecReferenceAligner {
    pub(super) fn new(sample_rate: u32) -> Self {
        let max_lag_samples = ((sample_rate as usize) * (AEC_MAX_REFERENCE_LAG_MS as usize)) / 1000;
        let min_overlap_samples =
            ((sample_rate as usize) * (AEC_MIN_REFERENCE_OVERLAP_MS as usize)) / 1000;
        let mut config = SyncProbeConfig::new(sample_rate);
        config.window_samples = config
            .window_samples
            .max((max_lag_samples + min_overlap_samples).next_power_of_two());
        config.max_lag_samples = max_lag_samples.max(config.max_lag_samples);
        let probe = SyncProbe::new(config);
        let max_delay_samples = probe.config().max_lag_samples;

        Self {
            probe,
            mic_delay_line: SampleDelayLine::new(max_delay_samples),
            speaker_delay_line: SampleDelayLine::new(max_delay_samples),
            last_alignment: AecAlignment::None,
            applied_alignment: AecAlignment::None,
            drift_samples_per_sec: None,
            samples_since_measure: 0,
            last_logged_state: None,
            last_logged_stable_lag_samples: None,
            log_probe_events: std::env::var(AUDIO_SYNC_PROBE_ENV).ok().as_deref() == Some("1"),
        }
    }

    pub(super) fn align(&mut self, raw_speaker: &[f32], raw_mic: &[f32]) -> AecAlignedPair {
        let observed = catch_unwind(AssertUnwindSafe(|| {
            self.probe.observe(raw_speaker, raw_mic)
        }));
        let event = match observed {
            Ok(event) => event,
            Err(_) => {
                tracing::error!("audio_sync_probe_panicked");
                None
            }
        };

        self.samples_since_measure += raw_mic.len().min(raw_speaker.len());
        let alignment_changed = if let Some(event) = event {
            self.samples_since_measure = 0;
            self.drift_samples_per_sec = self.probe.drift_samples_per_sec();
            let alignment_changed = self.update_alignment(&event);
            if self.log_probe_events {
                self.log_probe_event(event);
            }
            alignment_changed
        } else {
            false
        };

        if alignment_changed {
            // L'annulation d'écho repart de zéro : les lignes sautent directement au nouvel
            // alignement.
            self.mic_delay_line
                .snap_to(self.applied_alignment.mic_delay_samples());
            self.speaker_delay_line
                .snap_to(self.applied_alignment.speaker_delay_samples());
        }
        let target = self.drift_extrapolated_alignment();
        let aligned_mic = self
            .mic_delay_line
            .process_slewed(raw_mic, target.mic_delay_samples());
        let aligned_speaker = self
            .speaker_delay_line
            .process_slewed(raw_speaker, target.speaker_delay_samples());

        AecAlignedPair {
            mic: Arc::from(aligned_mic),
            speaker: Arc::from(aligned_speaker),
            alignment_changed,
        }
    }

    /// Alignement visé à cet instant : le dernier alignement appliqué, avancé de la dérive
    /// d'horloge estimée depuis la dernière mesure de la sonde. Ne change jamais de sens.
    fn drift_extrapolated_alignment(&self) -> AecAlignment {
        let Some(drift) = self.drift_samples_per_sec else {
            return self.applied_alignment;
        };
        let elapsed_secs =
            self.samples_since_measure as f64 / self.probe.config().sample_rate as f64;
        let shift = drift * elapsed_secs;
        let extend = |samples: usize, sign: f64| -> usize {
            (samples as f64 + sign * shift).round().max(0.0) as usize
        };
        match self.applied_alignment {
            AecAlignment::None => AecAlignment::None,
            // Retard positif (référence retardée) : une dérive positive l'allonge.
            AecAlignment::DelaySpeaker(samples) => AecAlignment::DelaySpeaker(extend(samples, 1.0)),
            AecAlignment::DelayMic(samples) => AecAlignment::DelayMic(extend(samples, -1.0)),
        }
    }

    pub(super) fn update_alignment(&mut self, event: &SyncProbeEvent) -> bool {
        let snapshot = event.snapshot();
        let next_alignment = if matches!(
            snapshot.state,
            SyncProbeState::Locked | SyncProbeState::Holdover
        ) {
            AecAlignment::from_lag_samples(snapshot.stable_lag_samples)
        } else {
            AecAlignment::None
        };

        if next_alignment != self.last_alignment {
            let sample_rate = self.probe.config().sample_rate;
            macro_rules! log_alignment_change {
                ($level:expr) => {
                    tracing::event!(
                        $level,
                        previous_alignment = ?self.last_alignment,
                        alignment = ?next_alignment,
                        mic_delay_samples = next_alignment.mic_delay_samples(),
                        speaker_delay_samples = next_alignment.speaker_delay_samples(),
                        mic_delay_ms =
                            next_alignment.mic_delay_samples() as f32 / sample_rate as f32 * 1000.0,
                        speaker_delay_ms = next_alignment.speaker_delay_samples() as f32
                            / sample_rate as f32
                            * 1000.0,
                        stable_lag_samples = snapshot.stable_lag_samples,
                        state = ?snapshot.state,
                        "aec_reference_alignment_changed"
                    )
                };
            }
            if is_significant_alignment_change(self.last_alignment, next_alignment, sample_rate) {
                log_alignment_change!(tracing::Level::INFO);
            } else {
                log_alignment_change!(tracing::Level::DEBUG);
            }
            self.last_alignment = next_alignment;
        }

        self.commit_alignment(next_alignment)
    }

    /// Fait de l'alignement mesuré la cible des lignes de retard ; renvoie `true` si
    /// l'annulation d'écho doit repartir de zéro.
    ///
    /// Avant #437, l'alignement appliqué ne bougeait qu'au-delà de 1 ms (hystérésis de #322) et
    /// chaque déplacement réinitialisait le modèle. Une dérive d'horloge (≈ 13 échantillons par
    /// seconde à 800 ppm) le réinitialisait donc toutes les secondes ou presque. Désormais :
    /// - même sens, déplacement sous [`AEC_ALIGNMENT_RESET_SHIFT_MS`] : la cible change, les
    ///   lignes de retard la rejoignent en glissant d'un échantillon à la fois et le modèle garde
    ///   son état ;
    /// - verrouillage, perte, changement de sens ou saut plus grand : nouvel alignement et
    ///   réinitialisation.
    pub(super) fn commit_alignment(&mut self, next_alignment: AecAlignment) -> bool {
        if next_alignment == self.applied_alignment {
            return false;
        }
        let sample_rate = self.probe.config().sample_rate as usize;
        let reset_threshold = sample_rate * AEC_ALIGNMENT_RESET_SHIFT_MS as usize / 1000;
        let structural = match (self.applied_alignment, next_alignment) {
            (AecAlignment::DelaySpeaker(before), AecAlignment::DelaySpeaker(after))
            | (AecAlignment::DelayMic(before), AecAlignment::DelayMic(after)) => {
                before.abs_diff(after) >= reset_threshold
            }
            _ => true,
        };
        self.applied_alignment = next_alignment;
        structural
    }

    /// Retard de la référence par rapport au micro réellement appliqué par les lignes de retard
    /// (positif : référence retardée), ou `None` sans alignement. Sert aux mesures de #437.
    #[cfg(test)]
    pub(super) fn applied_delay_samples(&self) -> Option<f64> {
        (self.applied_alignment != AecAlignment::None).then_some(
            self.speaker_delay_line.current_delay as f64 - self.mic_delay_line.current_delay as f64,
        )
    }

    pub(super) fn log_probe_event(&mut self, event: SyncProbeEvent) {
        let snapshot = event.snapshot();
        let should_log = self.last_logged_state != Some(snapshot.state)
            || self.last_logged_stable_lag_samples != snapshot.stable_lag_samples;

        if !should_log {
            return;
        }

        match event {
            SyncProbeEvent::Measured(measurement) => {
                tracing::info!(
                    capture_time_sec = measurement.capture_time_sec,
                    state = ?measurement.snapshot.state,
                    stable_lag_samples = measurement.snapshot.stable_lag_samples,
                    candidate_lag_samples = measurement.snapshot.candidate_lag_samples,
                    accepted_window_count = measurement.snapshot.accepted_window_count,
                    confidence = measurement.snapshot.confidence,
                    peak_ratio = measurement.estimate.peak_ratio,
                    distinctiveness = measurement.estimate.distinctiveness,
                    drift_ppm = measurement.trend.drift_ppm,
                    "audio_sync_probe"
                );
            }
            SyncProbeEvent::SkippedLowConfidence(skip) => {
                tracing::info!(
                    capture_time_sec = skip.capture_time_sec,
                    state = ?skip.snapshot.state,
                    stable_lag_samples = skip.snapshot.stable_lag_samples,
                    candidate_lag_samples = skip.snapshot.candidate_lag_samples,
                    accepted_window_count = skip.snapshot.accepted_window_count,
                    confidence = skip.snapshot.confidence,
                    reason = ?skip.reason,
                    peak_ratio = skip.estimate.peak_ratio,
                    distinctiveness = skip.estimate.distinctiveness,
                    "audio_sync_probe"
                );
            }
            SyncProbeEvent::SkippedLowEnergy(skip) => {
                tracing::info!(
                    capture_time_sec = skip.capture_time_sec,
                    state = ?skip.snapshot.state,
                    stable_lag_samples = skip.snapshot.stable_lag_samples,
                    accepted_window_count = skip.snapshot.accepted_window_count,
                    reference_rms = skip.reference_rms,
                    observed_rms = skip.observed_rms,
                    "audio_sync_probe"
                );
            }
        }

        self.last_logged_state = Some(snapshot.state);
        self.last_logged_stable_lag_samples = snapshot.stable_lag_samples;
    }
}

pub(super) struct SampleDelayLine {
    history: VecDeque<f32>,
    max_delay_samples: usize,
    /// Retard réellement appliqué, qui rejoint la cible en glissant (`process_slewed`).
    current_delay: usize,
    slew_progress: usize,
}

impl SampleDelayLine {
    pub(super) fn new(max_delay_samples: usize) -> Self {
        Self {
            history: VecDeque::with_capacity(max_delay_samples + 1),
            max_delay_samples,
            current_delay: 0,
            slew_progress: 0,
        }
    }

    /// Place le retard directement sur `delay_samples` (après une réinitialisation).
    pub(super) fn snap_to(&mut self, delay_samples: usize) {
        self.current_delay = delay_samples.min(self.max_delay_samples);
        self.slew_progress = 0;
    }

    /// Retarde `input` en rejoignant `target_delay` d'un échantillon tous les
    /// [`AEC_DELAY_SLEW_INTERVAL_SAMPLES`] : un pas répète (retard qui croît) ou saute
    /// (retard qui décroît) un seul échantillon, sans discontinuité plus grande (#437).
    pub(super) fn process_slewed(&mut self, input: &[f32], target_delay: usize) -> Vec<f32> {
        let target_delay = target_delay.min(self.max_delay_samples);
        let mut output = Vec::with_capacity(input.len());
        for &sample in input {
            if self.current_delay != target_delay {
                self.slew_progress += 1;
                if self.slew_progress >= AEC_DELAY_SLEW_INTERVAL_SAMPLES {
                    self.slew_progress = 0;
                    if self.current_delay < target_delay {
                        self.current_delay += 1;
                    } else {
                        self.current_delay -= 1;
                    }
                }
            } else {
                self.slew_progress = 0;
            }
            output.push(self.push_and_read(sample, self.current_delay));
        }
        output
    }

    /// Retard appliqué immédiatement, sans glissement (mesures de #322).
    #[cfg(test)]
    pub(super) fn process(&mut self, input: &[f32], delay_samples: usize) -> Vec<f32> {
        let delay_samples = delay_samples.min(self.max_delay_samples);
        self.current_delay = delay_samples;
        input
            .iter()
            .map(|&sample| self.push_and_read(sample, delay_samples))
            .collect()
    }

    fn push_and_read(&mut self, sample: f32, delay_samples: usize) -> f32 {
        self.history.push_back(sample);
        let delayed = self
            .history
            .len()
            .checked_sub(delay_samples + 1)
            .and_then(|idx| self.history.get(idx))
            .copied()
            .unwrap_or(0.0);
        while self.history.len() > self.max_delay_samples + 1 {
            self.history.pop_front();
        }
        delayed
    }
}
