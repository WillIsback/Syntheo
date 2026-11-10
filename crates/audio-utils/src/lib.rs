use std::convert::TryFrom;

use bytes::{BufMut, Bytes, BytesMut};
use futures_util::{Stream, StreamExt};
use syntheo_audio_interface::AsyncSource;

mod decoder;
mod error;
mod pcm;
mod playback;

pub use decoder::AudioDecoder;
pub use error::*;
pub use pcm::*;
pub use playback::open_default_playback_sink;

pub use rodio::Source;

const I16_SCALE: f32 = 32768.0;

pub fn mono_frames(
    mut source: impl Iterator<Item = f32>,
    channel_count: usize,
) -> impl Iterator<Item = f32> {
    std::iter::from_fn(move || {
        let first = source.next()?;
        let mut sum = first;
        let mut count = 1usize;
        while count < channel_count {
            let Some(sample) = source.next() else {
                break;
            };
            sum += sample;
            count += 1;
        }
        Some(sum / count as f32)
    })
}

#[derive(Debug, Clone, Copy)]
pub struct AudioMetadata {
    pub sample_rate: u32,
    pub channels: u8,
}

impl<T: AsyncSource> AudioFormatExt for T {}

pub trait AudioFormatExt: AsyncSource {
    fn to_i16_le_chunks(
        self,
        sample_rate: u32,
        chunk_size: usize,
    ) -> impl Stream<Item = Bytes> + Send + Unpin
    where
        Self: Sized + Send + Unpin + 'static,
    {
        syntheo_resampler::ResamplerDynamicOld::new(self, sample_rate)
            .chunks(chunk_size)
            .map(|chunk| {
                let n = std::mem::size_of::<f32>() * chunk.len();

                let mut buf = BytesMut::with_capacity(n);
                for sample in chunk {
                    let scaled = (sample * I16_SCALE).clamp(-I16_SCALE, I16_SCALE);
                    buf.put_i16_le(scaled as i16);
                }
                buf.freeze()
            })
    }
}

pub fn f32_to_i16_samples(samples: &[f32]) -> Vec<i16> {
    samples
        .iter()
        .map(|&sample| {
            let scaled = (sample * I16_SCALE).clamp(-I16_SCALE, I16_SCALE);
            scaled as i16
        })
        .collect()
}

pub fn f32_to_i16_bytes<I>(samples: I) -> Bytes
where
    I: Iterator<Item = f32>,
{
    let mut buf = BytesMut::new();
    for sample in samples {
        let i16_sample = (sample * I16_SCALE).clamp(-I16_SCALE, I16_SCALE) as i16;
        buf.put_i16_le(i16_sample);
    }
    buf.freeze()
}

pub fn interleave(channels: &[Vec<f32>]) -> Vec<f32> {
    if channels.is_empty() {
        return Vec::new();
    }
    let frames = channels.iter().map(|c| c.len()).max().unwrap_or(0);
    let mut output = Vec::with_capacity(frames * channels.len());
    for frame in 0..frames {
        for ch in channels {
            output.push(ch.get(frame).copied().unwrap_or(0.0));
        }
    }
    output
}

pub fn mix_sample_f32(mic: f32, speaker: f32) -> f32 {
    (mic + speaker).clamp(-1.0, 1.0)
}

pub use syntheo_audio_mime::content_type_to_extension;

/// Decode the first audio track of a file. Video tracks of an mp4, mov, mkv
/// or webm are skipped (issue 524).
pub fn source_from_path(path: impl AsRef<std::path::Path>) -> Result<AudioDecoder, crate::Error> {
    let path = path.as_ref();
    let file = std::fs::File::open(path)?;
    let extension = path.extension().and_then(|extension| extension.to_str());
    AudioDecoder::new(Box::new(file), extension)
}

/// Decode audio held in memory. Dictation and imported files must never be
/// written to disk, so the batch engine decodes straight from bytes.
pub fn source_from_bytes<T>(data: T) -> Result<AudioDecoder, crate::Error>
where
    T: AsRef<[u8]> + Send + Sync + 'static,
{
    AudioDecoder::new(Box::new(std::io::Cursor::new(data)), None)
}

pub fn audio_bytes_metadata<T>(data: T) -> Result<AudioMetadata, crate::Error>
where
    T: AsRef<[u8]> + Send + Sync + 'static,
{
    let source = source_from_bytes(data)?;
    metadata_from_source(&source)
}

fn metadata_from_source<S>(source: &S) -> Result<AudioMetadata, crate::Error>
where
    S: Source,
{
    let sample_rate: u32 = source.sample_rate().into();
    let channels_u16: u16 = source.channels().into();

    let channels =
        u8::try_from(channels_u16).map_err(|_| crate::Error::UnsupportedChannelCount {
            count: channels_u16,
        })?;

    Ok(AudioMetadata {
        sample_rate,
        channels,
    })
}

pub fn audio_file_metadata(
    path: impl AsRef<std::path::Path>,
) -> Result<AudioMetadata, crate::Error> {
    let source = source_from_path(path)?;
    metadata_from_source(&source)
}

pub fn resample_audio<S>(source: S, to_rate: u32) -> Result<Vec<f32>, crate::Error>
where
    S: rodio::Source,
{
    use audioadapter_buffers::direct::SequentialSliceOfVecs;
    use rubato::Resampler;

    let from_rate = u32::from(source.sample_rate()) as f64;
    let channels = u16::from(source.channels()) as usize;
    let to_rate_f64 = to_rate as f64;

    let samples: Vec<f32> = source.collect();

    if (from_rate - to_rate_f64).abs() < 1.0 {
        return Ok(samples);
    }

    let mut resampler = sinc_resampler(from_rate, to_rate_f64, channels)?;

    let frames_per_channel = samples.len() / channels;
    let mut input_channels: Vec<Vec<f32>> = vec![Vec::with_capacity(frames_per_channel); channels];
    for (i, &sample) in samples.iter().enumerate() {
        input_channels[i % channels].push(sample);
    }

    let input_adapter = SequentialSliceOfVecs::new(&input_channels, channels, frames_per_channel)
        .expect("input adapter");
    let output_len = resampler.process_all_needed_output_len(frames_per_channel);
    let mut output_channels: Vec<Vec<f32>> = vec![vec![0.0; output_len]; channels];
    let mut output_adapter =
        SequentialSliceOfVecs::new_mut(&mut output_channels, channels, output_len)
            .expect("output adapter");
    let (_, total_frames) = resampler.process_all_into_buffer(
        &input_adapter,
        &mut output_adapter,
        frames_per_channel,
        None,
    )?;

    let mut output = Vec::with_capacity(total_frames * channels);
    for frame in 0..total_frames {
        for ch in output_channels.iter() {
            output.push(ch[frame]);
        }
    }

    Ok(output)
}

pub fn resample_audio_channels<S>(source: S, to_rate: u32) -> Result<Vec<Vec<f32>>, crate::Error>
where
    S: rodio::Source,
{
    let mut output = Vec::<Vec<f32>>::new();
    let info = for_each_resampled_channel_block::<_, crate::Error>(source, to_rate, |channels| {
        if output.is_empty() {
            output.resize_with(channels.len(), Vec::new);
        }
        for (output, channel) in output.iter_mut().zip(channels) {
            output.extend_from_slice(channel);
        }
        Ok(())
    })?;
    output.resize_with(info.channels, Vec::new);
    Ok(output)
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ResampledAudioInfo {
    pub channels: usize,
    pub frame_count: usize,
    pub sample_rate: u32,
}

pub fn for_each_resampled_channel_block<S, E>(
    mut source: S,
    to_rate: u32,
    mut on_block: impl FnMut(&[&[f32]]) -> Result<(), E>,
) -> Result<ResampledAudioInfo, E>
where
    S: rodio::Source,
    E: From<crate::Error>,
{
    use rubato::Resampler;

    let from_rate = u32::from(source.sample_rate()) as f64;
    let channels = u16::from(source.channels()) as usize;
    let to_rate_f64 = to_rate as f64;

    if (from_rate - to_rate_f64).abs() < 1.0 {
        let mut input = (0..channels)
            .map(|_| Vec::with_capacity(1024))
            .collect::<Vec<_>>();
        let mut total_frames = 0usize;
        let mut reached_end = false;

        while !reached_end {
            while input[0].len() < 1024 {
                let frame_index = input[0].len();
                for channel in &mut input {
                    let Some(sample) = source.next() else {
                        reached_end = true;
                        break;
                    };
                    channel.push(sample);
                }
                if reached_end {
                    for channel in &mut input {
                        channel.truncate(frame_index);
                    }
                    break;
                }
                total_frames += 1;
            }

            if !input[0].is_empty() {
                emit_channel_block(&input, input[0].len(), &mut on_block)?;
                input.iter_mut().for_each(Vec::clear);
            }
        }

        return Ok(ResampledAudioInfo {
            channels,
            frame_count: total_frames,
            sample_rate: to_rate,
        });
    }

    let mut resampler = sinc_resampler(from_rate, to_rate_f64, channels).map_err(E::from)?;
    let mut input = (0..channels)
        .map(|_| Vec::with_capacity(resampler.input_frames_max()))
        .collect::<Vec<_>>();
    let mut output_scratch = (0..channels)
        .map(|_| vec![0.0; resampler.output_frames_max()])
        .collect::<Vec<_>>();
    let mut pending_output: Option<Vec<Vec<f32>>> = None;
    let mut total_input_frames = 0usize;
    let mut emitted_frames = 0usize;
    let mut frames_to_trim = resampler.output_delay();
    let mut reached_end = false;

    while !reached_end {
        let needed_frames = resampler.input_frames_next();
        while input[0].len() < needed_frames {
            let frame_index = input[0].len();
            for channel in &mut input {
                let Some(sample) = source.next() else {
                    reached_end = true;
                    break;
                };
                channel.push(sample);
            }

            if reached_end {
                for channel in &mut input {
                    channel.truncate(frame_index);
                }
                break;
            }
            total_input_frames += 1;
        }

        if input[0].len() == needed_frames {
            let (skip, written) = process_resampled_chunk(
                &mut resampler,
                &input,
                None,
                &mut output_scratch,
                &mut frames_to_trim,
            )
            .map_err(E::from)?;
            if let Some(pending) = pending_output.replace(
                output_scratch
                    .iter()
                    .map(|channel| channel[skip..written].to_vec())
                    .collect(),
            ) {
                let frames = pending.first().map_or(0, Vec::len);
                emit_channel_block(&pending, frames, &mut on_block)?;
                emitted_frames += frames;
            }
            input.iter_mut().for_each(Vec::clear);
        }
    }

    let expected_output_frames =
        (total_input_frames as f64 * to_rate_f64 / from_rate).ceil() as usize;
    if let Some(pending) = pending_output.take() {
        let frames = pending
            .first()
            .map_or(0, Vec::len)
            .min(expected_output_frames.saturating_sub(emitted_frames));
        emit_channel_block(&pending, frames, &mut on_block)?;
        emitted_frames += frames;
    }

    let remaining_frames = input[0].len();
    if remaining_frames > 0 && emitted_frames < expected_output_frames {
        let (skip, written) = process_resampled_chunk(
            &mut resampler,
            &input,
            Some(remaining_frames),
            &mut output_scratch,
            &mut frames_to_trim,
        )
        .map_err(E::from)?;
        let frames = (written - skip).min(expected_output_frames - emitted_frames);
        emit_channel_block_range(&output_scratch, skip, frames, &mut on_block)?;
        emitted_frames += frames;
        input.iter_mut().for_each(Vec::clear);
    }

    while emitted_frames < expected_output_frames {
        let (skip, written) = process_resampled_chunk(
            &mut resampler,
            &input,
            Some(0),
            &mut output_scratch,
            &mut frames_to_trim,
        )
        .map_err(E::from)?;
        let frames = (written - skip).min(expected_output_frames - emitted_frames);
        emit_channel_block_range(&output_scratch, skip, frames, &mut on_block)?;
        emitted_frames += frames;
    }

    Ok(ResampledAudioInfo {
        channels,
        frame_count: expected_output_frames,
        sample_rate: to_rate,
    })
}

fn emit_channel_block<E>(
    block: &[Vec<f32>],
    frames: usize,
    on_block: &mut impl FnMut(&[&[f32]]) -> Result<(), E>,
) -> Result<(), E> {
    emit_channel_block_range(block, 0, frames, on_block)
}

fn emit_channel_block_range<E>(
    block: &[Vec<f32>],
    start: usize,
    frames: usize,
    on_block: &mut impl FnMut(&[&[f32]]) -> Result<(), E>,
) -> Result<(), E> {
    if frames == 0 {
        return Ok(());
    }
    let channels = block
        .iter()
        .map(|channel| &channel[start..start + frames])
        .collect::<Vec<_>>();
    on_block(&channels)
}

fn sinc_resampler(
    from_rate: f64,
    to_rate: f64,
    channels: usize,
) -> Result<rubato::Async<f32>, crate::Error> {
    use rubato::{
        Async, FixedAsync, SincInterpolationParameters, SincInterpolationType, WindowFunction,
    };

    let params = SincInterpolationParameters {
        sinc_len: 256,
        f_cutoff: Some(0.95),
        interpolation: SincInterpolationType::Linear,
        oversampling_factor: 256,
        window: WindowFunction::BlackmanHarris2,
    };

    Ok(Async::<f32>::new_sinc(
        to_rate / from_rate,
        2.0,
        &params,
        1024,
        channels,
        FixedAsync::Input,
    )?)
}

fn process_resampled_chunk(
    resampler: &mut rubato::Async<f32>,
    input: &[Vec<f32>],
    partial_len: Option<usize>,
    output_scratch: &mut [Vec<f32>],
    frames_to_trim: &mut usize,
) -> Result<(usize, usize), crate::Error> {
    use audioadapter_buffers::direct::SequentialSliceOfVecs;
    use rubato::{Indexing, Resampler};

    let channels = input.len();
    let input_frames = input.first().map_or(0, Vec::len);
    let output_frames = output_scratch.first().map_or(0, Vec::len);
    let input_adapter =
        SequentialSliceOfVecs::new(input, channels, input_frames).expect("resampler input adapter");
    let mut output_adapter =
        SequentialSliceOfVecs::new_mut(output_scratch, channels, output_frames)
            .expect("resampler output adapter");
    let indexing = partial_len.map(|partial_len| Indexing {
        input_offset: 0,
        output_offset: 0,
        partial_len: Some(partial_len),
        active_channels_mask: None,
    });
    let (_, written) =
        resampler.process_into_buffer(&input_adapter, &mut output_adapter, indexing.as_ref())?;
    let skip = written.min(*frames_to_trim);
    *frames_to_trim -= skip;
    Ok((skip, written))
}

#[derive(Debug)]
pub struct ChunkedAudio {
    pub chunks: Vec<Bytes>,
    pub sample_count: usize,
    pub frame_count: usize,
    pub metadata: AudioMetadata,
}

pub fn chunk_size_for_stt(sample_rate: u32) -> usize {
    // https://github.com/orgs/deepgram/discussions/224#discussioncomment-6234166
    const CHUNK_MS: u32 = 120;

    let samples = ((sample_rate as u64) * (CHUNK_MS as u64)) / 1000;
    samples.clamp(1024, 7168) as usize
}

#[cfg(test)]
mod tests;
