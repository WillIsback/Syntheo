mod assembly;
mod finalize;
mod stitch;

pub(crate) use assembly::assemble;
pub(crate) use finalize::{finalize_words, to_partial};
pub(crate) use stitch::{dedup, stitch};
