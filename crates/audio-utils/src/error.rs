#[derive(thiserror::Error, Debug)]
pub enum Error {
    #[error(transparent)]
    ResampleError(#[from] rubato::ResampleError),
    #[error(transparent)]
    ResamplerConstructionError(#[from] rubato::ResamplerConstructionError),
    #[error(transparent)]
    DecoderError(#[from] rodio::decoder::DecoderError),
    #[error(transparent)]
    Symphonia(#[from] symphonia::core::errors::Error),
    #[error("no decodable audio track")]
    NoAudioTrack,
    /// Piste Opus (OGG, WebM) : symphonia 0.5 n'a pas de décodeur Opus
    /// (issue 714). Message stable, reconnu par l'interface.
    #[error("unsupported audio codec: opus")]
    UnsupportedOpus,
    #[error(transparent)]
    Resampler(#[from] syntheo_resampler::Error),
    #[error(transparent)]
    Io(#[from] std::io::Error),
    #[error(transparent)]
    Hound(#[from] hound::Error),
    #[error("unsupported channel count {count}")]
    UnsupportedChannelCount { count: u16 },
    #[error("invalid sample rate {0}")]
    InvalidSampleRate(u32),
}
