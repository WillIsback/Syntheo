pub type Result<T> = std::result::Result<T, Error>;

#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error(transparent)]
    Io(#[from] std::io::Error),
    #[error(transparent)]
    Opener(#[from] tauri_plugin_opener::Error),
    #[error("url not allowed: only http(s) pages and plain mailto addresses can be opened")]
    UrlNotAllowed,
    #[error("path not allowed: network and device paths cannot be opened")]
    PathNotAllowed,
    /// Fichier qui peut lancer un programme (issue 654) : montré dans son
    /// dossier, jamais ouvert. Message stable, reconnu par l'interface.
    #[error("active_file_not_opened")]
    ActiveFileNotOpened,
}
