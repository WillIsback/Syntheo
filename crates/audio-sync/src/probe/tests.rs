use super::*;

fn excitation(len: usize) -> Vec<f32> {
    let mut state = 0x1234_5678u32;
    (0..len)
        .map(|idx| {
            state ^= state << 13;
            state ^= state >> 17;
            state ^= state << 5;
            let noise = (state as f32 / u32::MAX as f32) * 2.0 - 1.0;
            let pulse = if idx % 257 == 0 { 0.75 } else { 0.0 };
            0.6 * noise + pulse
        })
        .collect()
}

fn delay_signal(input: &[f32], delay_samples: usize) -> Vec<f32> {
    let mut out = vec![0.0; input.len()];
    for idx in delay_samples..input.len() {
        out[idx] = input[idx - delay_samples];
    }
    out
}

fn advance_signal(input: &[f32], advance_samples: usize) -> Vec<f32> {
    let mut out = vec![0.0; input.len()];
    for idx in 0..input.len().saturating_sub(advance_samples) {
        out[idx] = input[idx + advance_samples];
    }
    out
}

fn test_config(window_samples: usize) -> SyncProbeConfig {
    SyncProbeConfig {
        sample_rate: 16_000,
        window_samples,
        max_lag_samples: 512,
        interval_samples: window_samples,
        min_rms: 0.0,
        tuning: SyncProbeTuning {
            acquire: SyncProbeThresholds::new(0.0, 0.0),
            hold: SyncProbeThresholds::new(0.0, 0.0),
            acquire_lock_count: 3,
            acquire_window: 4,
            acquire_cluster_tolerance_samples: 24,
            hold_interval_count: 2,
            lost_after_rejections: 3,
            lock_outlier_tolerance_samples: 48,
            stable_lag_window: 5,
        },
        level_interval_samples: 16_000,
    }
}

#[test]
fn sync_probe_requires_acquisition_before_locking() {
    let window = 4096;
    let delay = 192;
    let reference = excitation(window);
    let observed = delay_signal(&reference, delay);
    let mut probe = SyncProbe::new(test_config(window));

    let first = probe.observe(&reference, &observed).unwrap();
    assert_eq!(first.snapshot().state, SyncProbeState::Acquiring);

    let second = probe.observe(&reference, &observed).unwrap();
    assert_eq!(second.snapshot().state, SyncProbeState::Acquiring);

    let third = probe.observe(&reference, &observed).unwrap();
    let snapshot = third.snapshot();
    assert_eq!(snapshot.state, SyncProbeState::Locked);
    assert_eq!(snapshot.stable_lag_samples, Some(delay as isize));
    assert_eq!(snapshot.accepted_window_count, 3);
}

#[test]
fn sync_probe_can_lock_negative_lag() {
    let window = 4096;
    let delay = 192;
    let reference = excitation(window);
    let observed = advance_signal(&reference, delay);
    let mut probe = SyncProbe::new(test_config(window));

    for _ in 0..2 {
        let event = probe.observe(&reference, &observed).unwrap();
        assert_eq!(event.snapshot().state, SyncProbeState::Acquiring);
    }

    let locked = probe.observe(&reference, &observed).unwrap();
    let snapshot = locked.snapshot();

    assert_eq!(snapshot.state, SyncProbeState::Locked);
    assert_eq!(snapshot.stable_lag_samples, Some(-(delay as isize)));
}

#[test]
fn sync_probe_enters_holdover_and_then_lost() {
    let window = 4096;
    let delay = 192;
    let reference = excitation(window);
    let observed = delay_signal(&reference, delay);
    let silence = vec![0.0; window];
    let mut config = test_config(window);
    config.min_rms = 0.1;
    let mut probe = SyncProbe::new(config);

    for _ in 0..3 {
        let event = probe.observe(&reference, &observed).unwrap();
        assert!(matches!(event, SyncProbeEvent::Measured(_)));
    }

    let first = probe.observe(&silence, &silence).unwrap();
    assert_eq!(first.snapshot().state, SyncProbeState::Holdover);
    assert_eq!(first.snapshot().stable_lag_samples, Some(delay as isize));

    let second = probe.observe(&silence, &silence).unwrap();
    assert_eq!(second.snapshot().state, SyncProbeState::Holdover);

    let third = probe.observe(&silence, &silence).unwrap();
    assert_eq!(third.snapshot().state, SyncProbeState::Lost);

    let recovered = probe.observe(&reference, &observed).unwrap();
    assert_eq!(recovered.snapshot().state, SyncProbeState::Acquiring);
}

#[test]
fn sync_probe_reports_weak_correlation_skip() {
    let window = 4096;
    let delay = 192;
    let reference = excitation(window);
    let observed = delay_signal(&reference, delay);
    let mut config = test_config(window);
    config.tuning.acquire = SyncProbeThresholds::new(0.0, 100.0);
    config.tuning.hold = config.tuning.acquire;
    let mut probe = SyncProbe::new(config);

    let event = probe.observe(&reference, &observed).unwrap();

    match event {
        SyncProbeEvent::SkippedLowConfidence(skip) => {
            assert!(matches!(
                skip.reason,
                SyncProbeLowConfidenceReason::WeakCorrelation
            ));
            assert_eq!(skip.snapshot.state, SyncProbeState::Searching);
        }
        SyncProbeEvent::Measured(_) => panic!("expected low-confidence skip"),
        SyncProbeEvent::SkippedLowEnergy(_) => panic!("expected low-confidence skip"),
    }
}

#[test]
fn sync_probe_rejects_lag_outliers_while_locked() {
    let window = 4096;
    let delay = 192;
    let reference = excitation(window);
    let delayed = delay_signal(&reference, delay);
    let aligned = reference.clone();
    let mut probe = SyncProbe::new(test_config(window));

    for _ in 0..3 {
        let event = probe.observe(&reference, &delayed).unwrap();
        assert!(matches!(event, SyncProbeEvent::Measured(_)));
    }

    let event = probe.observe(&reference, &aligned).unwrap();

    match event {
        SyncProbeEvent::SkippedLowConfidence(skip) => {
            assert!(matches!(
                skip.reason,
                SyncProbeLowConfidenceReason::LagOutlier {
                    nearest_accepted_lag_samples: 192
                }
            ));
            assert_eq!(skip.snapshot.state, SyncProbeState::Holdover);
        }
        SyncProbeEvent::Measured(_) => panic!("expected outlier rejection"),
        SyncProbeEvent::SkippedLowEnergy(_) => panic!("expected outlier rejection"),
    }
}

#[test]
fn sync_probe_lag_outlier_can_transition_to_lost_without_panicking() {
    let window = 4096;
    let delay = 192;
    let reference = excitation(window);
    let delayed = delay_signal(&reference, delay);
    let aligned = reference.clone();
    let mut config = test_config(window);
    config.tuning.hold_interval_count = 0;
    config.tuning.lost_after_rejections = 1;
    let mut probe = SyncProbe::new(config);

    for _ in 0..3 {
        let event = probe.observe(&reference, &delayed).unwrap();
        assert!(matches!(event, SyncProbeEvent::Measured(_)));
    }

    let event = probe.observe(&reference, &aligned).unwrap();

    match event {
        SyncProbeEvent::SkippedLowConfidence(skip) => {
            assert!(matches!(
                skip.reason,
                SyncProbeLowConfidenceReason::LagOutlier {
                    nearest_accepted_lag_samples: 192
                }
            ));
            assert_eq!(skip.snapshot.state, SyncProbeState::Lost);
        }
        SyncProbeEvent::Measured(_) => panic!("expected lost transition"),
        SyncProbeEvent::SkippedLowEnergy(_) => panic!("expected lost transition"),
    }
}
