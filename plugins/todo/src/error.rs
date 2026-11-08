#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error(transparent)]
    AppleTodo(#[from] syntheo_apple_todo::Error),
    #[error("unsupported platform")]
    UnsupportedPlatform,
    #[error("invalid read path: {0}")]
    InvalidReadPath(String),
}

impl serde::Serialize for Error {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_str(&self.to_string())
    }
}

impl specta::Type for Error {
    fn definition(types: &mut specta::Types) -> specta::datatype::DataType {
        <String as specta::Type>::definition(types)
    }
}
