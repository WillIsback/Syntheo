pub type Result<T> = std::result::Result<T, Error>;

#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error(transparent)]
    Io(#[from] std::io::Error),
    #[error(transparent)]
    Opener(#[from] tauri_plugin_opener::Error),
    #[error("url not allowed: only http(s) pages and plain mailto addresses can be opened")]
    UrlNotAllowed,
}
