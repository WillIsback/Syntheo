mod common;

use mp3::MonoStreamEncoder;

use crate::common::{
    Case, TestResult, assert_decoded_matches_case, decode_mp3_bytes, fixture_channel_i16,
};

#[test]
fn mono_stream_encoder_i16_roundtrips() -> TestResult {
    let case = Case {
        channels: 1,
        frames: 5_000,
        sample_rate: 22_050,
    };
    let samples = fixture_channel_i16(case.frames, 0);
    let mut encoder = MonoStreamEncoder::new(case.sample_rate)?;
    let mut output = Vec::new();

    encoder.encode_i16(&samples[..2_048], &mut output)?;
    encoder.encode_i16(&samples[2_048..], &mut output)?;
    encoder.flush(&mut output)?;

    assert!(!output.is_empty(), "streaming encoder produced no mp3 data");

    let (decoded_spec, decoded_samples) = decode_mp3_bytes(&output)?;
    assert_decoded_matches_case(case, samples.len(), &decoded_spec, &decoded_samples);
    Ok(())
}

#[test]
fn mono_stream_encoder_empty_flush_produces_decodable_silence() -> TestResult {
    let case = Case {
        channels: 1,
        frames: 0,
        sample_rate: 16_000,
    };
    let mut encoder = MonoStreamEncoder::new(case.sample_rate)?;
    let mut output = Vec::new();

    encoder.encode_i16(&[], &mut output)?;
    encoder.flush(&mut output)?;

    assert!(
        !output.is_empty(),
        "flush-only stream should still emit mp3 data"
    );

    let (decoded_spec, decoded_samples) = decode_mp3_bytes(&output)?;
    assert_decoded_matches_case(case, 0, &decoded_spec, &decoded_samples);
    Ok(())
}
