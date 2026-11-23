use super::*;
use approx::assert_abs_diff_eq;
use dasp::sample::Sample;
use model::{BLOCK_SHIFT, BLOCK_SIZE};
use std::path::PathBuf;
use syntheo_audio_snapshot::{SpectralConfig, Tolerances};

mod data {
    pub const DOUBLETALK_LPB: &[u8] = include_bytes!("../../data/inputs/doubletalk_lpb_sample.wav");
    pub const DOUBLETALK_MIC: &[u8] = include_bytes!("../../data/inputs/doubletalk_mic_sample.wav");

    pub const SYNTHEO_LPB: &[u8] = include_bytes!("../../data/inputs/syntheo_lpb.wav");
    pub const SYNTHEO_MIC: &[u8] = include_bytes!("../../data/inputs/syntheo_mic.wav");

    pub const THEO_LPB: &[u8] = include_bytes!("../../data/inputs/theo_lpb.wav");
    pub const THEO_MIC: &[u8] = include_bytes!("../../data/inputs/theo_mic.wav");
}

fn get_feature() -> &'static str {
    if cfg!(feature = "128") {
        "128"
    } else if cfg!(feature = "256") {
        "256"
    } else if cfg!(feature = "512") {
        "512"
    } else {
        unreachable!()
    }
}

fn output_path(prefix: &str, feature: &str, mode: &str) -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("data")
        .join("outputs")
        .join(format!("{prefix}_{feature}_{mode}.wav"))
}

fn snapshot_path(prefix: &str, feature: &str, mode: &str) -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("data")
        .join("snapshots")
        .join(format!("{prefix}_{feature}_{mode}.json"))
}

macro_rules! aec_test {
    ($test_name:ident, $lpb_data:expr, $mic_data:expr, $output_prefix:literal) => {
        #[test]
        fn $test_name() {
            let feature = get_feature();
            let config = SpectralConfig {
                fft_size: BLOCK_SIZE,
                hop_size: BLOCK_SHIFT,
                sample_rate: 16000.0,
            };
            let tolerances = Tolerances::default();

            let lpb_sample =
                rodio::Decoder::new(std::io::BufReader::new(std::io::Cursor::new($lpb_data)))
                    .unwrap()
                    .collect::<Vec<_>>();

            let mic_sample =
                rodio::Decoder::new(std::io::BufReader::new(std::io::Cursor::new($mic_data)))
                    .unwrap()
                    .collect::<Vec<_>>();

            let lpb_samples: Vec<f32> = lpb_sample.into_iter().map(|s| s.to_sample()).collect();
            let mic_samples: Vec<f32> = mic_sample.into_iter().map(|s| s.to_sample()).collect();

            let batch_result = {
                let mut aec = AEC::new().unwrap();
                let result = aec.process(&mic_samples, &lpb_samples).unwrap();
                assert!(result.iter().all(|&x| x.is_finite()));
                result
            };

            let streaming_result = {
                let mut aec = AEC::new().unwrap();
                let mut streaming_result = Vec::new();

                let len_audio = mic_samples.len().min(lpb_samples.len());
                let mic_samples = &mic_samples[..len_audio];
                let lpb_samples = &lpb_samples[..len_audio];

                let chunk_size = model::BLOCK_SIZE * 2;
                let mut processed = 0;

                while processed < len_audio {
                    let end = (processed + chunk_size).min(len_audio);
                    let mic_chunk = &mic_samples[processed..end];
                    let lpb_chunk = &lpb_samples[processed..end];

                    let chunk_result = aec.process_streaming(mic_chunk, lpb_chunk).unwrap();
                    streaming_result.extend(chunk_result);

                    processed = end;
                }

                assert!(streaming_result.iter().all(|&x| x.is_finite()));
                streaming_result
            };

            let batch_snap = syntheo_audio_snapshot::assert_or_update(
                &batch_result,
                &output_path($output_prefix, feature, "batch"),
                &snapshot_path($output_prefix, feature, "batch"),
                &format!("{} {} batch", $output_prefix, feature),
                &config,
                &tolerances,
            );

            let streaming_snap = syntheo_audio_snapshot::assert_or_update(
                &streaming_result,
                &output_path($output_prefix, feature, "streaming"),
                &snapshot_path($output_prefix, feature, "streaming"),
                &format!("{} {} streaming", $output_prefix, feature),
                &config,
                &tolerances,
            );

            assert_abs_diff_eq!(
                batch_snap.rms_energy,
                streaming_snap.rms_energy,
                epsilon = 0.05,
            );
            assert_abs_diff_eq!(
                batch_snap.spectral_centroid,
                streaming_snap.spectral_centroid,
                epsilon = 300.0,
            );
        }
    };
}

aec_test!(
    test_aec_doubletalk,
    data::DOUBLETALK_LPB,
    data::DOUBLETALK_MIC,
    "doubletalk"
);

aec_test!(
    test_aec_syntheo,
    data::SYNTHEO_LPB,
    data::SYNTHEO_MIC,
    "syntheo"
);

aec_test!(test_aec_theo, data::THEO_LPB, data::THEO_MIC, "theo");
