mod error;
pub use error::*;

use ort::{
    Result,
    session::{
        Session,
        builder::{GraphOptimizationLevel, SessionBuilder},
    },
};

pub use ndarray;
pub use ort;

pub fn load_model_from_bytes(bytes: &[u8]) -> Result<Session, Error> {
    Ok(session_builder()?.commit_from_memory(bytes)?)
}

fn session_builder() -> Result<SessionBuilder, Error> {
    Ok(Session::builder()?
        .with_intra_threads(1)?
        .with_inter_threads(1)?
        .with_optimization_level(GraphOptimizationLevel::Level3)?)
}
