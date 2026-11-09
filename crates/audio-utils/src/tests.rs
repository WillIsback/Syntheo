use super::*;

#[test]
fn audio_file_metadata_reads_supported_formats() {
    for (label, path) in [
        ("wav", syntheo_data::english_1::AUDIO_PATH),
        ("mp3", syntheo_data::english_1::AUDIO_MP3_PATH),
        ("mp4", syntheo_data::english_1::AUDIO_MP4_PATH),
        ("m4a", syntheo_data::english_1::AUDIO_M4A_PATH),
        ("ogg", syntheo_data::english_1::AUDIO_OGG_PATH),
        ("flac", syntheo_data::english_1::AUDIO_FLAC_PATH),
        ("aac", syntheo_data::english_1::AUDIO_AAC_PATH),
        ("aiff", syntheo_data::english_1::AUDIO_AIFF_PATH),
    ] {
        let metadata = audio_file_metadata(path).unwrap();
        assert!(metadata.sample_rate > 0, "{label}");
        assert!(metadata.channels > 0, "{label}");
    }
}

#[test]
fn resample_preserves_duration() {
    let from_rate = 44100;
    let to_rate = 16000;
    let duration_secs = 5;
    let channels = 2;
    let total_samples = from_rate * duration_secs * channels;

    let source = rodio::buffer::SamplesBuffer::new(
        std::num::NonZeroU16::new(channels as u16).unwrap(),
        std::num::NonZeroU32::new(from_rate as u32).unwrap(),
        vec![0.5f32; total_samples],
    );
    let output = resample_audio(source, to_rate as u32).unwrap();

    let expected_frames = duration_secs * to_rate;
    let actual_frames = output.len() / channels;
    let ratio = actual_frames as f64 / expected_frames as f64;
    assert!(
        (ratio - 1.0).abs() < 0.02,
        "expected ~{expected_frames} frames, got {actual_frames} (ratio {ratio:.4})"
    );
}

#[test]
fn resample_short_partial_chunk_preserves_duration() {
    let from_rate = 44_100;
    let to_rate = 16_000;
    let channels = 2;
    let input_frames = 200;

    let source = rodio::buffer::SamplesBuffer::new(
        std::num::NonZeroU16::new(channels as u16).unwrap(),
        std::num::NonZeroU32::new(from_rate as u32).unwrap(),
        vec![0.5f32; input_frames * channels],
    );
    let output = resample_audio(source, to_rate as u32).unwrap();

    let actual_frames = output.len() / channels;
    let expected_frames = (input_frames as f64 * to_rate as f64 / from_rate as f64).round();
    assert!(
        (actual_frames as f64 - expected_frames).abs() <= 2.0,
        "expected ~{expected_frames} frames, got {actual_frames}"
    );
}

#[test]
fn channel_resampling_deinterleaves_without_changing_sample_rate() {
    let source = rodio::buffer::SamplesBuffer::new(
        std::num::NonZeroU16::new(2).unwrap(),
        std::num::NonZeroU32::new(16_000).unwrap(),
        vec![0.1, 0.9, 0.2, 0.8],
    );

    let channels = resample_audio_channels(source, 16_000).unwrap();

    assert_eq!(channels, vec![vec![0.1, 0.2], vec![0.9, 0.8]]);
}

#[test]
fn channel_resampling_preserves_distinct_channels() {
    let input_frames = 4_100;
    let samples = (0..input_frames)
        .flat_map(|_| [0.25, -0.5])
        .collect::<Vec<_>>();
    let channel_source = rodio::buffer::SamplesBuffer::new(
        std::num::NonZeroU16::new(2).unwrap(),
        std::num::NonZeroU32::new(44_100).unwrap(),
        samples,
    );

    let channels = resample_audio_channels(channel_source, 16_000).unwrap();
    let expected_frames = (input_frames as f64 * 16_000.0 / 44_100.0).ceil() as usize;

    assert_eq!(channels.len(), 2);
    assert_eq!(channels[0].len(), expected_frames);
    assert_eq!(channels[1].len(), expected_frames);
    assert!(
        channels[0][100..expected_frames - 100]
            .iter()
            .all(|sample| (sample - 0.25).abs() < 0.01)
    );
    assert!(
        channels[1][100..expected_frames - 100]
            .iter()
            .all(|sample| (sample + 0.5).abs() < 0.01)
    );
}

#[test]
fn channel_resampling_flushes_a_short_partial_chunk() {
    let input_frames = 200;
    let source = rodio::buffer::SamplesBuffer::new(
        std::num::NonZeroU16::new(2).unwrap(),
        std::num::NonZeroU32::new(44_100).unwrap(),
        vec![0.25; input_frames * 2],
    );

    let channels = resample_audio_channels(source, 16_000).unwrap();
    let expected_frames = (input_frames as f64 * 16_000.0 / 44_100.0).ceil() as usize;

    assert_eq!(channels.len(), 2);
    assert_eq!(channels[0].len(), expected_frames);
    assert_eq!(channels[1].len(), expected_frames);
}

#[test]
fn channel_resampling_streams_ordered_blocks_through_eof() {
    let input_frames = 4_100;
    let source = rodio::buffer::SamplesBuffer::new(
        std::num::NonZeroU16::new(2).unwrap(),
        std::num::NonZeroU32::new(44_100).unwrap(),
        (0..input_frames)
            .flat_map(|frame| [frame as f32 / input_frames as f32, -0.75])
            .collect::<Vec<_>>(),
    );
    let mut output = vec![Vec::new(), Vec::new()];
    let mut block_count = 0usize;

    let info = for_each_resampled_channel_block::<_, crate::Error>(source, 16_000, |channels| {
        assert_eq!(channels.len(), 2);
        assert_eq!(channels[0].len(), channels[1].len());
        assert!(!channels[0].is_empty());
        for (output, channel) in output.iter_mut().zip(channels) {
            output.extend_from_slice(channel);
        }
        block_count += 1;
        Ok(())
    })
    .unwrap();

    let expected_frames = (input_frames as f64 * 16_000.0 / 44_100.0).ceil() as usize;
    assert!(block_count >= 2);
    assert_eq!(info.frame_count, expected_frames);
    assert_eq!(output[0].len(), expected_frames);
    assert_eq!(output[1].len(), expected_frames);
    assert!(
        output[0][100..expected_frames - 100]
            .windows(2)
            .all(|window| window[0] <= window[1])
    );
    assert!(
        output[1][100..expected_frames - 100]
            .iter()
            .all(|sample| (sample + 0.75).abs() < 0.01)
    );
}
