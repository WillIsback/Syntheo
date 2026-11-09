use crate::drift::DriftTrendSnapshot;
use crate::estimator::LagEstimate;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SyncProbeState {
    Searching,
    Acquiring,
    Locked,
    Holdover,
    Lost,
}

#[derive(Debug, Default, Clone, Copy)]
pub struct SyncProbeRejectionCounts {
    pub low_energy: u64,
    pub weak_correlation: u64,
    pub lag_outlier: u64,
}

#[derive(Debug, Clone, Copy)]
pub struct SyncProbeSnapshot {
    pub state: SyncProbeState,
    pub stable_lag_samples: Option<isize>,
    pub candidate_lag_samples: Option<isize>,
    pub accepted_window_count: usize,
    pub confidence: Option<f32>,
    pub rejections: SyncProbeRejectionCounts,
}

#[derive(Debug, Clone, Copy)]
pub enum SyncProbeEvent {
    SkippedLowEnergy(SyncProbeLowEnergy),
    SkippedLowConfidence(SyncProbeLowConfidence),
    Measured(SyncProbeMeasurement),
}

impl SyncProbeEvent {
    pub fn snapshot(&self) -> SyncProbeSnapshot {
        match self {
            Self::SkippedLowEnergy(event) => event.snapshot,
            Self::SkippedLowConfidence(event) => event.snapshot,
            Self::Measured(event) => event.snapshot,
        }
    }

    pub fn capture_time_sec(&self) -> f64 {
        match self {
            Self::SkippedLowEnergy(event) => event.capture_time_sec,
            Self::SkippedLowConfidence(event) => event.capture_time_sec,
            Self::Measured(event) => event.capture_time_sec,
        }
    }
}

#[derive(Debug, Clone, Copy)]
pub struct SyncProbeLowEnergy {
    pub capture_time_sec: f64,
    pub reference_rms: f32,
    pub observed_rms: f32,
    pub snapshot: SyncProbeSnapshot,
}

#[derive(Debug, Clone, Copy)]
pub struct SyncProbeLowConfidence {
    pub capture_time_sec: f64,
    pub estimate: LagEstimate,
    pub reference_rms: f32,
    pub observed_rms: f32,
    pub reason: SyncProbeLowConfidenceReason,
    pub snapshot: SyncProbeSnapshot,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SyncProbeLowConfidenceReason {
    WeakCorrelation,
    LagOutlier { nearest_accepted_lag_samples: isize },
}

#[derive(Debug, Clone, Copy)]
pub struct SyncProbeMeasurement {
    pub capture_time_sec: f64,
    pub estimate: LagEstimate,
    pub reference_rms: f32,
    pub observed_rms: f32,
    pub trend: DriftTrendSnapshot,
    pub snapshot: SyncProbeSnapshot,
}
