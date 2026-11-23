mod encoder;
mod error;
mod segment;
mod wav;

pub use encoder::{Mono, MonoStreamEncoder, StreamEncoder};
pub use error::Error;
pub use segment::{encode_mono_segments, encode_mono_segments_in_memory};
pub use wav::decode_to_wav;
