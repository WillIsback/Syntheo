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
    if delay_samples < input.len() {
        out[delay_samples..].copy_from_slice(&input[..input.len() - delay_samples]);
    }
    out
}

fn advance_signal(input: &[f32], advance_samples: usize) -> Vec<f32> {
    let mut out = vec![0.0; input.len()];
    if advance_samples < input.len() {
        let kept = input.len() - advance_samples;
        out[..kept].copy_from_slice(&input[advance_samples..]);
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
            ..SyncProbeTuning::default()
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
fn sync_probe_holds_through_silence_and_then_lost() {
    let window = 4096;
    let delay = 192;
    let reference = excitation(window);
    let observed = delay_signal(&reference, delay);
    let silence = vec![0.0; window];
    let mut config = test_config(window);
    config.min_rms = 0.1;
    config.tuning.lost_after_silent_intervals = 5;
    let mut probe = SyncProbe::new(config);

    for _ in 0..3 {
        let event = probe.observe(&reference, &observed).unwrap();
        assert!(matches!(event, SyncProbeEvent::Measured(_)));
    }

    // Un silence ne dit rien de l'alignement (#437) : le verrou tient, au-delà des
    // `lost_after_rejections` (3) intervalles qui suffisent à le perdre sur des mesures rejetées.
    for _ in 0..4 {
        let silent = probe.observe(&silence, &silence).unwrap();
        assert!(matches!(silent, SyncProbeEvent::SkippedLowEnergy(_)));
        assert_eq!(silent.snapshot().state, SyncProbeState::Holdover);
        assert_eq!(silent.snapshot().stable_lag_samples, Some(delay as isize));
    }

    let resumed = probe.observe(&reference, &observed).unwrap();
    assert_eq!(resumed.snapshot().state, SyncProbeState::Locked);
    assert_eq!(resumed.snapshot().stable_lag_samples, Some(delay as isize));

    for _ in 0..4 {
        probe.observe(&silence, &silence).unwrap();
    }
    let lost = probe.observe(&silence, &silence).unwrap();
    assert_eq!(lost.snapshot().state, SyncProbeState::Lost);

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

#[test]
fn sync_probe_follows_clock_drift_and_extrapolates_through_silence() {
    // Retard qui croît de 4 échantillons par fenêtre de 4096 (≈ 15,6 éch./s, 977 ppm à 16 kHz),
    // comme deux périphériques aux horloges différentes (#437).
    let window = 4096;
    let step = 4;
    let reference = excitation(window);
    let silence = vec![0.0; window];
    let mut config = test_config(window);
    config.min_rms = 0.1;
    // Fenêtres de 0,256 s : douze retards couvrent 2,8 s, sous les 3 s par défaut.
    config.tuning.drift_min_span_secs = 1.0;
    let mut probe = SyncProbe::new(config);

    let mut delay = 100;
    for _ in 0..30 {
        let event = probe
            .observe(&reference, &delay_signal(&reference, delay))
            .unwrap();
        assert!(matches!(event, SyncProbeEvent::Measured(_)));
        delay += step;
    }
    let expected_slope = step as f64 * 16_000.0 / window as f64;
    let slope = probe.drift_samples_per_sec().unwrap();
    assert!((slope - expected_slope).abs() < 0.5, "pente {slope}");
    let locked = probe
        .observe(&reference, &delay_signal(&reference, delay))
        .unwrap();
    let stable = locked.snapshot().stable_lag_samples.unwrap();
    assert!(
        (stable - delay as isize).abs() <= 1,
        "retard {stable} pour {delay}"
    );

    // Silence : le retard verrouillé continue d'avancer avec la dérive.
    for _ in 0..4 {
        delay += step;
        let silent = probe.observe(&silence, &silence).unwrap();
        assert_eq!(silent.snapshot().state, SyncProbeState::Holdover);
        let stable = silent.snapshot().stable_lag_samples.unwrap();
        assert!(
            (stable - delay as isize).abs() <= 1,
            "retard {stable} pour {delay}"
        );
    }
}
