use super::super::echo_gate::GatedEchoCanceller;
use super::super::echo_gate::tests::CountingCanceller;
use super::super::recovery::ChannelItem;
use super::aec::{build_aec, process_aec};
use super::aligner::{
    AecAlignment, AecReferenceAligner, SampleDelayLine, is_significant_alignment_change,
};
use super::loops::reset_echo_cancellation;
use super::*;

#[tokio::test]
async fn channel_failure_preserves_healthy_audio_and_recovery_restores_stereo_frames() {
    let (chunks_tx, chunks_rx) = tokio::sync::mpsc::channel(32);
    let (tx, mut rx) = tokio::sync::mpsc::channel(32);
    let task = tokio::spawn(run_dual_loop(
        tx,
        CancellationToken::new(),
        16_000,
        32,
        Arc::new(AtomicBool::new(false)),
        chunks_rx,
    ));
    let speaker = vec![0.25; 32];
    let mic = vec![0.5; 32];
    for item in [
        ChannelItem::Failed(CaptureChannel::Mic, Error::MicOpenFailed),
        ChannelItem::Ready(CaptureChannel::Speaker, None),
        ChannelItem::Chunk(CaptureChannel::Speaker, speaker.clone()),
        ChannelItem::Ready(CaptureChannel::Mic, Some("fallback".into())),
        ChannelItem::Chunk(CaptureChannel::Mic, mic.clone()),
        ChannelItem::Chunk(CaptureChannel::Speaker, speaker.clone()),
        ChannelItem::Failed(CaptureChannel::Speaker, Error::SpeakerStreamSetupFailed),
        ChannelItem::Chunk(CaptureChannel::Mic, mic.clone()),
    ] {
        chunks_tx.send(item).await.unwrap();
    }
    drop(chunks_tx);
    let mut frames = Vec::new();
    while let Some(event) = rx.recv().await {
        if let CaptureEvent::Frame(frame) = event.unwrap() {
            frames.push(frame);
        }
    }
    task.await.unwrap();
    assert_eq!(frames.len(), 3);
    assert_eq!(&*frames[0].raw_speaker, &speaker);
    assert!(frames[0].raw_mic.iter().all(|sample| *sample == 0.0));
    assert_eq!(&*frames[1].raw_mic, &mic);
    assert_eq!(&*frames[1].raw_speaker, &speaker);
    assert_eq!(&*frames[2].raw_mic, &mic);
    assert!(frames[2].raw_speaker.iter().all(|sample| *sample == 0.0));
}

#[tokio::test(start_paused = true)]
async fn dual_outage_keeps_sixty_seconds_of_silence_before_recovered_audio() {
    let (chunks_tx, chunks_rx) = tokio::sync::mpsc::channel(32);
    let (tx, mut rx) = tokio::sync::mpsc::channel(32);
    let cancel = CancellationToken::new();
    let task = tokio::spawn(run_dual_loop(
        tx,
        cancel.clone(),
        100,
        10,
        Arc::new(AtomicBool::new(false)),
        chunks_rx,
    ));
    chunks_tx
        .send(ChannelItem::Ready(CaptureChannel::Mic, Some("mic".into())))
        .await
        .unwrap();
    chunks_tx
        .send(ChannelItem::Chunk(CaptureChannel::Mic, vec![0.5; 10]))
        .await
        .unwrap();
    while !matches!(
        tokio::time::timeout(std::time::Duration::from_secs(1), rx.recv())
            .await
            .unwrap()
            .unwrap()
            .unwrap(),
        CaptureEvent::Frame(_)
    ) {}
    chunks_tx
        .send(ChannelItem::Failed(
            CaptureChannel::Mic,
            Error::MicOpenFailed,
        ))
        .await
        .unwrap();
    chunks_tx
        .send(ChannelItem::Failed(
            CaptureChannel::Speaker,
            Error::SpeakerStreamSetupFailed,
        ))
        .await
        .unwrap();
    for _ in 0..2 {
        assert!(matches!(
            tokio::time::timeout(std::time::Duration::from_secs(1), rx.recv())
                .await
                .unwrap()
                .unwrap()
                .unwrap(),
            CaptureEvent::ChannelFailed { .. }
        ));
    }
    // Advance once; catch-up padding stays bounded by the output queue.
    tokio::time::advance(std::time::Duration::from_secs(60)).await;
    let mut gap_samples = 0;
    while gap_samples < 6000 {
        match tokio::time::timeout(std::time::Duration::from_secs(1), rx.recv())
            .await
            .unwrap()
            .unwrap()
            .unwrap()
        {
            CaptureEvent::Gap(frame) => {
                assert!(
                    frame
                        .raw_dual()
                        .0
                        .iter()
                        .chain(frame.raw_dual().1.iter())
                        .all(|sample| *sample == 0.0)
                );
                gap_samples += frame.raw_mic.len();
            }
            _ => panic!("silence cannot claim capture readiness"),
        }
    }
    chunks_tx
        .send(ChannelItem::Ready(CaptureChannel::Speaker, None))
        .await
        .unwrap();
    chunks_tx
        .send(ChannelItem::Chunk(CaptureChannel::Speaker, vec![0.25; 10]))
        .await
        .unwrap();
    loop {
        match tokio::time::timeout(std::time::Duration::from_secs(1), rx.recv())
            .await
            .unwrap()
            .unwrap()
            .unwrap()
        {
            CaptureEvent::Gap(frame) => gap_samples += frame.raw_mic.len(),
            CaptureEvent::Frame(frame) => {
                assert_eq!(&*frame.raw_speaker, &[0.25; 10]);
                assert!(
                    gap_samples >= 6000,
                    "recorder and transcription must retain the full outage offset"
                );
                break;
            }
            _ => {}
        }
    }
    cancel.cancel();
    task.await.unwrap();
}

#[test]
fn process_aec_returns_output_when_enabled() {
    crate::capture::use_source_aec_models();
    let mut aec = build_aec(16_000);
    let mut linear_echo_gain = None;
    let mic = Arc::<[f32]>::from(vec![0.1_f32; 160]);
    let speaker = Arc::<[f32]>::from(vec![0.2_f32; 160]);

    let processed = process_aec(&mut aec, &mut linear_echo_gain, &mic, &speaker);
    assert_eq!(processed.as_ref().map(|data| data.len()), Some(160));
}

#[test]
fn process_aec_skips_the_model_when_the_reference_is_silent() {
    let fake = CountingCanceller::new(0.2, 0);
    let calls = Arc::clone(&fake.calls);
    let mut aec = Some(GatedEchoCanceller::new(fake, 16_000));
    let mut linear_echo_gain = Some(0.5);
    let mic = test_signal(1_920);
    let speaker = vec![0.0_f32; 1_920];

    let processed = process_aec(&mut aec, &mut linear_echo_gain, &mic, &speaker);

    assert_eq!(processed.as_deref(), Some(&mic[..]));
    assert_eq!(calls.load(Ordering::SeqCst), 0);
    assert_eq!(linear_echo_gain, Some(0.5));
}

#[test]
fn process_aec_runs_the_model_when_the_reference_plays() {
    let fake = CountingCanceller::new(0.2, 0);
    let calls = Arc::clone(&fake.calls);
    let mut aec = Some(GatedEchoCanceller::new(fake, 16_000));
    let mut linear_echo_gain = None;
    let mic = test_signal(1_920);
    let speaker = test_signal(1_920);

    let processed = process_aec(&mut aec, &mut linear_echo_gain, &mic, &speaker);

    assert_eq!(processed.map(|data| data.len()), Some(1_920));
    assert_eq!(calls.load(Ordering::SeqCst), 1);
}

#[test]
fn process_aec_with_dtln_passes_the_mic_through_on_silence() {
    crate::capture::use_source_aec_models();
    let mut aec = build_aec(16_000);
    let Some(latency) = aec
        .as_ref()
        .map(|_| syntheo_aec::BLOCK_SIZE - syntheo_aec::BLOCK_SHIFT)
    else {
        return;
    };
    let mut linear_echo_gain = None;
    let mic = test_signal(1_920);
    let speaker = vec![0.0_f32; 1_920];

    let processed = process_aec(&mut aec, &mut linear_echo_gain, &mic, &speaker).unwrap();

    assert!(processed[..latency].iter().all(|sample| *sample == 0.0));
    assert_eq!(&processed[latency..], &mic[..1_920 - latency]);
}

#[test]
fn sample_delay_line_delays_and_clamps() {
    let mut delay = SampleDelayLine::new(4);
    let output = delay.process(&[1.0, 2.0, 3.0], 0);
    assert_eq!(output, vec![1.0, 2.0, 3.0]);
    let mut delay = SampleDelayLine::new(4);
    let first = delay.process(&[1.0, 2.0, 3.0], 2);
    let second = delay.process(&[4.0, 5.0], 2);
    assert_eq!(first, vec![0.0, 0.0, 1.0]);
    assert_eq!(second, vec![2.0, 3.0]);
    let mut delay = SampleDelayLine::new(2);
    let first = delay.process(&[1.0, 2.0, 3.0], 10);
    let second = delay.process(&[4.0], 10);
    assert_eq!(first, vec![0.0, 0.0, 1.0]);
    assert_eq!(second, vec![2.0]);
}

#[test]
fn aec_alignment_delays_the_leading_signal() {
    let speaker_alignment = AecAlignment::from_lag_samples(Some(320));
    assert_eq!(speaker_alignment, AecAlignment::DelaySpeaker(320));
    assert_eq!(speaker_alignment.mic_delay_samples(), 0);
    assert_eq!(speaker_alignment.speaker_delay_samples(), 320);

    let mic_alignment = AecAlignment::from_lag_samples(Some(-320));
    assert_eq!(mic_alignment, AecAlignment::DelayMic(320));
    assert_eq!(mic_alignment.mic_delay_samples(), 320);
    assert_eq!(mic_alignment.speaker_delay_samples(), 0);
}

#[test]
fn alignment_log_keeps_info_for_lock_loss_and_direction_change() {
    use AecAlignment::{DelayMic, DelaySpeaker, None};

    assert!(is_significant_alignment_change(
        None,
        DelaySpeaker(904),
        16_000
    ));
    assert!(is_significant_alignment_change(
        None,
        DelayMic(1_056),
        16_000
    ));
    assert!(is_significant_alignment_change(
        DelaySpeaker(904),
        None,
        16_000
    ));
    assert!(is_significant_alignment_change(
        DelayMic(1_056),
        None,
        16_000
    ));
    assert!(is_significant_alignment_change(
        DelaySpeaker(2),
        DelayMic(2),
        16_000
    ));
    assert!(is_significant_alignment_change(
        DelayMic(2),
        DelaySpeaker(2),
        16_000
    ));
}

#[test]
fn alignment_log_demotes_small_shifts_below_one_millisecond() {
    use AecAlignment::{DelayMic, DelaySpeaker};

    assert!(!is_significant_alignment_change(
        DelaySpeaker(904),
        DelaySpeaker(906),
        16_000
    ));
    assert!(!is_significant_alignment_change(
        DelaySpeaker(906),
        DelaySpeaker(902),
        16_000
    ));
    assert!(!is_significant_alignment_change(
        DelayMic(1_056),
        DelayMic(1_071),
        16_000
    ));
    assert!(is_significant_alignment_change(
        DelaySpeaker(904),
        DelaySpeaker(920),
        16_000
    ));
    assert!(is_significant_alignment_change(
        DelayMic(1_056),
        DelayMic(1_040),
        16_000
    ));
    // Le seuil suit la fréquence : 48 échantillons à 48 kHz.
    assert!(!is_significant_alignment_change(
        DelaySpeaker(904),
        DelaySpeaker(951),
        48_000
    ));
    assert!(is_significant_alignment_change(
        DelaySpeaker(904),
        DelaySpeaker(952),
        48_000
    ));
}

#[test]
fn small_alignment_jitter_keeps_the_echo_canceller_converged() {
    let fake = CountingCanceller::new(0.2, 0);
    let resets = Arc::clone(&fake.resets);
    let mut aec = Some(GatedEchoCanceller::new(fake, 16_000));
    let mut linear_echo_gain = None;
    let mut aligner = AecReferenceAligner::new(16_000);
    let mut observe = |alignment, linear_echo_gain: &mut Option<f32>| {
        if aligner.commit_alignment(alignment) {
            reset_echo_cancellation(&mut aec, linear_echo_gain);
        }
        aligner.applied_alignment
    };

    // Verrouillage : None → 904, réinitialisation.
    let applied = observe(AecAlignment::DelaySpeaker(904), &mut linear_echo_gain);
    assert_eq!(applied, AecAlignment::DelaySpeaker(904));
    assert_eq!(resets.load(Ordering::SeqCst), 1);

    // Bruit de mesure sous 1 ms (16 échantillons) : ni remise à zéro, ni réalignement.
    linear_echo_gain = Some(0.5);
    for jitter in [906, 905, 907] {
        let applied = observe(AecAlignment::DelaySpeaker(jitter), &mut linear_echo_gain);
        assert_eq!(applied, AecAlignment::DelaySpeaker(904));
    }
    assert_eq!(resets.load(Ordering::SeqCst), 1);
    assert_eq!(linear_echo_gain, Some(0.5));

    // Vrai déplacement du chemin d'écho : 904 → 950, réinitialisation.
    let applied = observe(AecAlignment::DelaySpeaker(950), &mut linear_echo_gain);
    assert_eq!(applied, AecAlignment::DelaySpeaker(950));
    assert_eq!(resets.load(Ordering::SeqCst), 2);
    assert_eq!(linear_echo_gain, None);

    // Changement de sens et perte du verrouillage, même petits : réinitialisation.
    observe(AecAlignment::DelayMic(4), &mut linear_echo_gain);
    observe(AecAlignment::None, &mut linear_echo_gain);
    assert_eq!(resets.load(Ordering::SeqCst), 4);
}

#[test]
fn slow_drift_realigns_once_it_reaches_one_millisecond() {
    let mut aligner = AecReferenceAligner::new(16_000);
    assert!(aligner.commit_alignment(AecAlignment::DelaySpeaker(904)));
    // Chaque pas reste sous 1 ms, mais l'écart cumulé à l'alignement appliqué l'atteint.
    let changes: Vec<bool> = (905..=920)
        .map(|lag| aligner.commit_alignment(AecAlignment::DelaySpeaker(lag)))
        .collect();
    assert_eq!(changes.iter().filter(|changed| **changed).count(), 1);
    assert!(changes[changes.len() - 1]);
    assert_eq!(aligner.applied_alignment, AecAlignment::DelaySpeaker(920));
}

fn test_signal(len: usize) -> Vec<f32> {
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

fn delayed(input: &[f32], delay_samples: usize) -> Vec<f32> {
    let mut output = vec![0.0; input.len()];
    output[delay_samples..].copy_from_slice(&input[..input.len() - delay_samples]);
    output
}

fn detected_alignment(speaker: &[f32], mic: &[f32]) -> AecAlignment {
    let mut aligner = AecReferenceAligner::new(16_000);
    for (speaker, mic) in speaker.chunks(1_600).zip(mic.chunks(1_600)) {
        aligner.align(speaker, mic);
    }
    aligner.last_alignment
}

#[test]
fn aec_reference_aligner_locks_negative_macbook_scale_lag() {
    let mic = test_signal(16_000 * 5);
    let speaker = delayed(&mic, 7_200);

    let alignment = detected_alignment(&speaker, &mic);

    assert_eq!(alignment, AecAlignment::DelayMic(7_200));
}

#[test]
fn aec_reference_aligner_locks_at_supported_lag_boundary() {
    let speaker = test_signal(16_000 * 5);
    let mic = delayed(&speaker, 9_600);

    let alignment = detected_alignment(&speaker, &mic);

    assert_eq!(alignment, AecAlignment::DelaySpeaker(9_600));
}

#[test]
fn aec_reference_aligner_emits_detected_speaker_delay() {
    let speaker = test_signal(16_000 * 5);
    let mic = delayed(&speaker, 7_200);
    let mut aligner = AecReferenceAligner::new(16_000);
    let mut aligned = None;

    for (speaker, mic) in speaker.chunks(1_600).zip(mic.chunks(1_600)) {
        aligned = Some(aligner.align(speaker, mic));
    }

    let aligned = aligned.unwrap();
    assert_eq!(aligner.last_alignment, AecAlignment::DelaySpeaker(7_200));
    assert_eq!(&*aligned.speaker, &speaker[71_200..72_800]);
}
