use std::collections::VecDeque;

use crate::drift::LagTrendTracker;
use crate::estimator::{GccPhatLagEstimator, LagEstimate};
use crate::level::LevelAccumulator;

mod config;
mod events;

pub use config::{SyncProbeConfig, SyncProbeThresholds, SyncProbeTuning};
pub use events::{
    SyncProbeEvent, SyncProbeLowConfidence, SyncProbeLowConfidenceReason, SyncProbeLowEnergy,
    SyncProbeMeasurement, SyncProbeRejectionCounts, SyncProbeSnapshot, SyncProbeState,
};

pub struct SyncProbe {
    sample_rate: u32,
    window_samples: usize,
    interval_samples: usize,
    min_rms: f32,
    tuning: SyncProbeTuning,
    reference_history: Vec<f32>,
    observed_history: Vec<f32>,
    reference_window: Vec<f32>,
    observed_window: Vec<f32>,
    history_write_cursor: usize,
    history_len: usize,
    acquisition_entries: VecDeque<Option<isize>>,
    stable_lag_history: VecDeque<isize>,
    state: SyncProbeState,
    stable_lag_samples: Option<isize>,
    consecutive_rejections: usize,
    rejections: SyncProbeRejectionCounts,
    interval_progress: usize,
    processed_samples: u64,
    estimator: GccPhatLagEstimator,
    trend: LagTrendTracker,
    reference_input_levels: LevelAccumulator,
}

impl SyncProbe {
    pub fn new(config: SyncProbeConfig) -> Self {
        let window_samples = config.window_samples.max(256);
        let max_lag_samples = config.max_lag_samples.min(window_samples.saturating_sub(1));
        let level_interval_samples = config.level_interval_samples.max(1);

        Self {
            sample_rate: config.sample_rate,
            window_samples,
            interval_samples: config.interval_samples.max(1),
            min_rms: config.min_rms.max(0.0),
            tuning: config.tuning,
            reference_history: vec![0.0; window_samples],
            observed_history: vec![0.0; window_samples],
            reference_window: vec![0.0; window_samples],
            observed_window: vec![0.0; window_samples],
            history_write_cursor: 0,
            history_len: 0,
            acquisition_entries: VecDeque::with_capacity(config.tuning.acquire_window.max(1)),
            stable_lag_history: VecDeque::with_capacity(config.tuning.stable_lag_window.max(1)),
            state: SyncProbeState::Searching,
            stable_lag_samples: None,
            consecutive_rejections: 0,
            rejections: SyncProbeRejectionCounts::default(),
            interval_progress: 0,
            processed_samples: 0,
            estimator: GccPhatLagEstimator::new(window_samples, max_lag_samples),
            trend: LagTrendTracker::default(),
            reference_input_levels: LevelAccumulator::new(level_interval_samples),
        }
    }

    pub fn config(&self) -> SyncProbeConfig {
        SyncProbeConfig {
            sample_rate: self.sample_rate,
            window_samples: self.window_samples,
            max_lag_samples: self.estimator.max_lag_samples,
            interval_samples: self.interval_samples,
            min_rms: self.min_rms,
            tuning: self.tuning,
            level_interval_samples: self.reference_input_levels.interval_samples,
        }
    }

    pub fn observe(&mut self, reference: &[f32], observed: &[f32]) -> Option<SyncProbeEvent> {
        let len = reference.len().min(observed.len());
        if len == 0 {
            return None;
        }

        self.append_history(&reference[..len], &observed[..len]);
        self.processed_samples += len as u64;
        self.interval_progress += len;

        if self.history_len < self.window_samples || self.interval_progress < self.interval_samples
        {
            return None;
        }
        self.interval_progress = 0;

        Self::fill_window(
            self.window_samples,
            self.history_write_cursor,
            &self.reference_history,
            &mut self.reference_window,
        );
        Self::fill_window(
            self.window_samples,
            self.history_write_cursor,
            &self.observed_history,
            &mut self.observed_window,
        );

        let reference_rms = rms(&self.reference_window);
        let observed_rms = rms(&self.observed_window);
        let capture_time_sec = self.capture_time_sec();

        if reference_rms < self.min_rms || observed_rms < self.min_rms {
            self.rejections.low_energy += 1;
            let snapshot = self.handle_missing_interval(None, None);
            return Some(SyncProbeEvent::SkippedLowEnergy(SyncProbeLowEnergy {
                capture_time_sec,
                reference_rms,
                observed_rms,
                snapshot,
            }));
        }

        let estimate = self
            .estimator
            .estimate(&self.reference_window, &self.observed_window)?;

        let thresholds = self.thresholds_for_current_state();
        let confidence = Some(self.confidence_for(estimate, thresholds));

        if !self.meets_thresholds(estimate, thresholds) {
            self.rejections.weak_correlation += 1;
            let snapshot = self.handle_missing_interval(Some(estimate.lag_samples), confidence);
            return Some(SyncProbeEvent::SkippedLowConfidence(
                SyncProbeLowConfidence {
                    capture_time_sec,
                    estimate,
                    reference_rms,
                    observed_rms,
                    reason: SyncProbeLowConfidenceReason::WeakCorrelation,
                    snapshot,
                },
            ));
        }

        if self.is_locking_state()
            && self
                .stable_lag_samples
                .is_some_and(|stable| self.is_lag_outlier(estimate.lag_samples, stable))
        {
            self.rejections.lag_outlier += 1;
            let nearest_accepted_lag_samples = self.stable_lag_samples;
            let snapshot = self.handle_missing_interval(Some(estimate.lag_samples), confidence);
            return Some(SyncProbeEvent::SkippedLowConfidence(
                SyncProbeLowConfidence {
                    capture_time_sec,
                    estimate,
                    reference_rms,
                    observed_rms,
                    reason: SyncProbeLowConfidenceReason::LagOutlier {
                        nearest_accepted_lag_samples: nearest_accepted_lag_samples
                            .unwrap_or(estimate.lag_samples),
                    },
                    snapshot,
                },
            ));
        }

        let snapshot = self.handle_accepted_estimate(estimate.lag_samples, confidence);
        let trend = self.trend.update(
            capture_time_sec,
            estimate.lag_samples as f32,
            self.sample_rate,
        );

        Some(SyncProbeEvent::Measured(SyncProbeMeasurement {
            capture_time_sec,
            estimate,
            reference_rms,
            observed_rms,
            trend,
            snapshot,
        }))
    }

    fn append_history(&mut self, reference: &[f32], observed: &[f32]) {
        for (&reference_sample, &observed_sample) in reference.iter().zip(observed.iter()) {
            self.reference_history[self.history_write_cursor] = reference_sample;
            self.observed_history[self.history_write_cursor] = observed_sample;
            self.history_write_cursor = (self.history_write_cursor + 1) % self.window_samples;
            self.history_len = (self.history_len + 1).min(self.window_samples);
        }
    }

    fn fill_window(
        window_samples: usize,
        history_write_cursor: usize,
        history: &[f32],
        window: &mut [f32],
    ) {
        let split = history_write_cursor;
        let tail = window_samples - split;
        window[..tail].copy_from_slice(&history[split..]);
        window[tail..].copy_from_slice(&history[..split]);
    }

    fn capture_time_sec(&self) -> f64 {
        self.processed_samples as f64 / self.sample_rate as f64
    }

    fn thresholds_for_current_state(&self) -> SyncProbeThresholds {
        if self.is_locking_state() {
            self.tuning.hold
        } else {
            self.tuning.acquire
        }
    }

    fn is_locking_state(&self) -> bool {
        matches!(
            self.state,
            SyncProbeState::Locked | SyncProbeState::Holdover
        ) && self.stable_lag_samples.is_some()
    }

    fn meets_thresholds(&self, estimate: LagEstimate, thresholds: SyncProbeThresholds) -> bool {
        estimate.peak_ratio >= thresholds.min_peak_ratio.max(0.0)
            && estimate.distinctiveness >= thresholds.min_distinctiveness.max(0.0)
    }

    fn confidence_for(&self, estimate: LagEstimate, thresholds: SyncProbeThresholds) -> f32 {
        let peak_ratio = if thresholds.min_peak_ratio <= f32::EPSILON {
            1.0
        } else {
            estimate.peak_ratio / thresholds.min_peak_ratio
        };
        let distinctiveness = if thresholds.min_distinctiveness <= f32::EPSILON {
            1.0
        } else {
            estimate.distinctiveness / thresholds.min_distinctiveness
        };

        peak_ratio.min(distinctiveness)
    }

    fn is_lag_outlier(&self, lag_samples: isize, stable_lag_samples: isize) -> bool {
        (lag_samples - stable_lag_samples).unsigned_abs()
            > self.tuning.lock_outlier_tolerance_samples
    }

    fn handle_missing_interval(
        &mut self,
        candidate_lag_samples: Option<isize>,
        confidence: Option<f32>,
    ) -> SyncProbeSnapshot {
        if self.is_locking_state() {
            return self.advance_holdover_or_loss(candidate_lag_samples, confidence);
        }

        if matches!(self.state, SyncProbeState::Acquiring) {
            self.push_acquisition_entry(None);
            if self.acquisition_match_count() == 0 {
                self.state = SyncProbeState::Searching;
                self.acquisition_entries.clear();
            }
        } else {
            self.state = SyncProbeState::Searching;
        }

        self.snapshot(self.state, candidate_lag_samples, confidence)
    }

    fn advance_holdover_or_loss(
        &mut self,
        candidate_lag_samples: Option<isize>,
        confidence: Option<f32>,
    ) -> SyncProbeSnapshot {
        self.consecutive_rejections += 1;
        let lost_after = self
            .tuning
            .lost_after_rejections
            .max(self.tuning.hold_interval_count.saturating_add(1))
            .max(1);

        if self.consecutive_rejections >= lost_after {
            let snapshot = self.snapshot(SyncProbeState::Lost, candidate_lag_samples, confidence);
            self.reset_after_loss();
            return snapshot;
        }

        self.state = SyncProbeState::Holdover;
        self.snapshot(SyncProbeState::Holdover, candidate_lag_samples, confidence)
    }

    fn handle_accepted_estimate(
        &mut self,
        lag_samples: isize,
        confidence: Option<f32>,
    ) -> SyncProbeSnapshot {
        self.consecutive_rejections = 0;

        if self.is_locking_state() {
            self.state = SyncProbeState::Locked;
            self.push_stable_lag(lag_samples);
            return self.snapshot(SyncProbeState::Locked, Some(lag_samples), confidence);
        }

        if let Some(center) = self.acquisition_center()
            && (lag_samples - center).unsigned_abs() > self.tuning.acquire_cluster_tolerance_samples
        {
            self.acquisition_entries.clear();
        }

        self.push_acquisition_entry(Some(lag_samples));
        self.state = SyncProbeState::Acquiring;

        if self.acquisition_match_count() >= self.tuning.acquire_lock_count.max(1) {
            self.promote_acquisition_to_lock();
            return self.snapshot(SyncProbeState::Locked, Some(lag_samples), confidence);
        }

        self.snapshot(SyncProbeState::Acquiring, Some(lag_samples), confidence)
    }

    fn push_acquisition_entry(&mut self, lag_samples: Option<isize>) {
        let acquire_window = self.tuning.acquire_window.max(1);
        if self.acquisition_entries.len() == acquire_window {
            self.acquisition_entries.pop_front();
        }
        self.acquisition_entries.push_back(lag_samples);
    }

    fn acquisition_match_count(&self) -> usize {
        self.acquisition_entries.iter().flatten().count()
    }

    fn acquisition_center(&self) -> Option<isize> {
        median_isize(self.acquisition_entries.iter().flatten().copied())
    }

    fn promote_acquisition_to_lock(&mut self) {
        let lags: Vec<isize> = self.acquisition_entries.iter().flatten().copied().collect();
        self.stable_lag_history.clear();
        for lag in lags {
            self.push_stable_lag(lag);
        }
        self.acquisition_entries.clear();
        self.state = SyncProbeState::Locked;
    }

    fn push_stable_lag(&mut self, lag_samples: isize) {
        let stable_lag_window = self.tuning.stable_lag_window.max(1);
        if self.stable_lag_history.len() == stable_lag_window {
            self.stable_lag_history.pop_front();
        }
        self.stable_lag_history.push_back(lag_samples);
        self.stable_lag_samples = median_isize(self.stable_lag_history.iter().copied());
    }

    fn reset_after_loss(&mut self) {
        self.state = SyncProbeState::Searching;
        self.stable_lag_samples = None;
        self.stable_lag_history.clear();
        self.acquisition_entries.clear();
        self.consecutive_rejections = 0;
    }

    fn snapshot(
        &self,
        state: SyncProbeState,
        candidate_lag_samples: Option<isize>,
        confidence: Option<f32>,
    ) -> SyncProbeSnapshot {
        let accepted_window_count = match state {
            SyncProbeState::Searching => 0,
            SyncProbeState::Acquiring => self.acquisition_match_count(),
            SyncProbeState::Locked | SyncProbeState::Holdover | SyncProbeState::Lost => {
                self.stable_lag_history.len()
            }
        };

        SyncProbeSnapshot {
            state,
            stable_lag_samples: self.stable_lag_samples,
            candidate_lag_samples,
            accepted_window_count,
            confidence,
            rejections: self.rejections,
        }
    }
}

fn rms(data: &[f32]) -> f32 {
    let energy = data.iter().map(|sample| sample * sample).sum::<f32>() / data.len().max(1) as f32;
    energy.sqrt()
}

fn median_isize(iter: impl IntoIterator<Item = isize>) -> Option<isize> {
    let mut values: Vec<isize> = iter.into_iter().collect();
    if values.is_empty() {
        return None;
    }

    values.sort_unstable();
    let mid = values.len() / 2;
    Some(if values.len().is_multiple_of(2) {
        (values[mid - 1] + values[mid]) / 2
    } else {
        values[mid]
    })
}

#[cfg(test)]
mod tests;
