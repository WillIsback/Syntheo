#[derive(Debug, Clone, Copy)]
pub struct SyncProbeThresholds {
    pub min_peak_ratio: f32,
    pub min_distinctiveness: f32,
}

impl SyncProbeThresholds {
    pub const fn new(min_peak_ratio: f32, min_distinctiveness: f32) -> Self {
        Self {
            min_peak_ratio,
            min_distinctiveness,
        }
    }
}

#[derive(Debug, Clone, Copy)]
pub struct SyncProbeTuning {
    pub acquire: SyncProbeThresholds,
    pub hold: SyncProbeThresholds,
    pub acquire_lock_count: usize,
    pub acquire_window: usize,
    pub acquire_cluster_tolerance_samples: usize,
    pub hold_interval_count: usize,
    pub lost_after_rejections: usize,
    pub lock_outlier_tolerance_samples: usize,
    pub stable_lag_window: usize,
}

impl Default for SyncProbeTuning {
    fn default() -> Self {
        Self {
            acquire: SyncProbeThresholds::new(10.0, 1.15),
            hold: SyncProbeThresholds::new(8.0, 1.05),
            acquire_lock_count: 3,
            acquire_window: 4,
            acquire_cluster_tolerance_samples: 24,
            hold_interval_count: 2,
            lost_after_rejections: 3,
            lock_outlier_tolerance_samples: 48,
            stable_lag_window: 5,
        }
    }
}

#[derive(Debug, Clone, Copy)]
pub struct SyncProbeConfig {
    pub sample_rate: u32,
    pub window_samples: usize,
    pub max_lag_samples: usize,
    pub interval_samples: usize,
    pub min_rms: f32,
    pub tuning: SyncProbeTuning,
    pub level_interval_samples: usize,
}

impl SyncProbeConfig {
    pub fn new(sample_rate: u32) -> Self {
        Self {
            sample_rate,
            window_samples: 4096,
            max_lag_samples: 960,
            interval_samples: 16_000,
            min_rms: 0.003,
            tuning: SyncProbeTuning::default(),
            level_interval_samples: sample_rate as usize,
        }
    }
}
