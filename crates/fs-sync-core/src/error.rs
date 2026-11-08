use serde::{Serialize, ser::Serializer};

pub type Result<T> = std::result::Result<T, Error>;

#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error("Unknown error")]
    Unknown,
    #[error(transparent)]
    Io(#[from] std::io::Error),
    #[error("Path error: {0}")]
    Path(String),
    #[error(transparent)]
    Frontmatter(#[from] syntheo_frontmatter::Error),
    #[error("Markdown error: {0}")]
    Markdown(String),
}

impl From<syntheo_storage::safe_path::UnsafePath> for Error {
    fn from(error: syntheo_storage::safe_path::UnsafePath) -> Self {
        match error {
            syntheo_storage::safe_path::UnsafePath::Io(error) => Self::Io(error),
            other => Self::Path(other.to_string()),
        }
    }
}

impl Serialize for Error {
    fn serialize<S>(&self, serializer: S) -> std::result::Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        serializer.serialize_str(self.to_string().as_ref())
    }
}

#[derive(Debug, thiserror::Error)]
pub enum AudioImportError {
    #[error(transparent)]
    Io(#[from] std::io::Error),
}
