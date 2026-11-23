use std::path::Path;

use crate::Error;

pub fn decode_to_wav(mp3_path: &Path, wav_path: &Path) -> Result<(), Error> {
    use syntheo_audio_utils::Source;

    let source = syntheo_audio_utils::source_from_path(mp3_path)?;
    let channels: u16 = source.channels().into();
    let sample_rate: u32 = source.sample_rate().into();

    let spec = hound::WavSpec {
        channels,
        sample_rate,
        bits_per_sample: 32,
        sample_format: hound::SampleFormat::Float,
    };

    let mut writer = hound::WavWriter::create(wav_path, spec)?;
    for sample in source {
        writer.write_sample(sample)?;
    }
    writer.finalize()?;
    Ok(())
}
