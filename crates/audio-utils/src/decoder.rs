//! Décodage d'un fichier ou d'un tampon audio en échantillons `f32` entrelacés.
//!
//! `rodio::Decoder` retient la piste par défaut du conteneur pour la durée, puis
//! passe au décodeur audio **tous** les paquets, y compris ceux de la vidéo :
//! dans un mp4, mov, mkv ou webm qui contient une vidéo, le décodage s'arrête
//! au premier paquet vidéo (issue 524). Ce décodeur choisit la première piste
//! audio décodable et ne lit que ses paquets.

use std::time::Duration;

use rodio::source::Source;
use symphonia::core::audio::{Channels, SampleBuffer, SignalSpec};
use symphonia::core::codecs::{CODEC_TYPE_NULL, Decoder, DecoderOptions};
use symphonia::core::errors::Error as SymphoniaError;
use symphonia::core::formats::{FormatOptions, FormatReader, Track};
use symphonia::core::io::{MediaSource, MediaSourceStream};
use symphonia::core::meta::MetadataOptions;
use symphonia::core::probe::Hint;

/// Source audio décodée depuis la première piste audio du conteneur.
pub struct AudioDecoder {
    format: Box<dyn FormatReader>,
    decoder: Box<dyn Decoder>,
    track_id: u32,
    spec: SignalSpec,
    buffer: SampleBuffer<f32>,
    offset: usize,
    total_duration: Option<Duration>,
}

impl AudioDecoder {
    /// Sonde le conteneur, retient la première piste audio dont le codec est
    /// pris en charge et décode son premier paquet pour connaître le format.
    pub(crate) fn new(
        source: Box<dyn MediaSource>,
        extension: Option<&str>,
    ) -> Result<Self, crate::Error> {
        let mut hint = Hint::new();
        if let Some(extension) = extension {
            hint.with_extension(extension);
        }
        let stream = MediaSourceStream::new(source, Default::default());
        let format_options = FormatOptions {
            enable_gapless: true,
            ..Default::default()
        };
        let format = symphonia::default::get_probe()
            .format(&hint, stream, &format_options, &MetadataOptions::default())?
            .format;

        let (track_id, decoder, total_duration) = format
            .tracks()
            .iter()
            .filter(|track| is_audio_track(track))
            .find_map(|track| {
                let decoder = symphonia::default::get_codecs()
                    .make(&track.codec_params, &DecoderOptions::default())
                    .ok()?;
                Some((track.id, decoder, track_duration(track)))
            })
            .ok_or(crate::Error::NoAudioTrack)?;

        // Format provisoire, remplacé au premier paquet décodé.
        let placeholder = SignalSpec::new(0, Channels::FRONT_LEFT);
        let mut decoder = Self {
            format,
            decoder,
            track_id,
            spec: placeholder,
            buffer: SampleBuffer::new(0, placeholder),
            offset: 0,
            total_duration,
        };
        if !decoder.decode_next_packet() {
            // Piste vide : le format annoncé par le conteneur suffit.
            let params = decoder.decoder.codec_params();
            let (Some(rate), Some(channels)) = (params.sample_rate, params.channels) else {
                return Err(crate::Error::NoAudioTrack);
            };
            decoder.spec = SignalSpec::new(rate, channels);
        }
        if decoder.spec.rate == 0 {
            return Err(crate::Error::InvalidSampleRate(0));
        }
        if decoder.spec.channels.count() == 0 {
            return Err(crate::Error::UnsupportedChannelCount { count: 0 });
        }
        Ok(decoder)
    }

    /// Décode le prochain paquet non vide de la piste retenue dans le tampon.
    /// Renvoie `false` à la fin du flux ou sur une erreur non récupérable.
    fn decode_next_packet(&mut self) -> bool {
        loop {
            let Ok(packet) = self.format.next_packet() else {
                return false;
            };
            if packet.track_id() != self.track_id {
                continue;
            }
            let decoded = match self.decoder.decode(&packet) {
                Ok(decoded) => decoded,
                // Un paquet abîmé est sauté, comme le faisait rodio.
                Err(SymphoniaError::DecodeError(_)) => continue,
                Err(_) => return false,
            };
            if decoded.frames() == 0 {
                continue;
            }
            let spec = *decoded.spec();
            let frames = decoded.capacity();
            if spec != self.spec || self.buffer.capacity() < frames * spec.channels.count() {
                self.buffer = SampleBuffer::new(frames as u64, spec);
                self.spec = spec;
            }
            self.buffer.copy_interleaved_ref(decoded);
            self.offset = 0;
            return true;
        }
    }
}

fn is_audio_track(track: &Track) -> bool {
    track.codec_params.codec != CODEC_TYPE_NULL && track.codec_params.sample_rate.is_some()
}

fn track_duration(track: &Track) -> Option<Duration> {
    let params = &track.codec_params;
    params
        .time_base
        .zip(params.n_frames)
        .map(|(base, frames)| Duration::from(base.calc_time(frames)))
        .filter(|duration| !duration.is_zero())
}

impl Iterator for AudioDecoder {
    type Item = f32;

    fn next(&mut self) -> Option<f32> {
        if self.offset >= self.buffer.len() && !self.decode_next_packet() {
            return None;
        }
        let sample = *self.buffer.samples().get(self.offset)?;
        self.offset += 1;
        Some(sample)
    }
}

impl Source for AudioDecoder {
    fn current_span_len(&self) -> Option<usize> {
        Some(self.buffer.len())
    }

    fn channels(&self) -> rodio::ChannelCount {
        let count = u16::try_from(self.spec.channels.count()).unwrap_or(u16::MAX);
        rodio::ChannelCount::new(count).expect("nombre de canaux vérifié à l'ouverture")
    }

    fn sample_rate(&self) -> rodio::SampleRate {
        rodio::SampleRate::new(self.spec.rate).expect("fréquence vérifiée à l'ouverture")
    }

    fn total_duration(&self) -> Option<Duration> {
        self.total_duration
    }
}
