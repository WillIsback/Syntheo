use crate::{batch, common_derives, stream};

common_derives! {
    #[serde(tag = "type", rename_all = "snake_case")]
    pub enum BatchStreamEvent {
        Progress {
            percentage: f64,
            #[serde(default)]
            partial_text: Option<String>,
            /// Avancement inconnu : le serveur traite tout l'audio d'une seule
            /// requête sans en donner l'avancement (issue #568).
            #[serde(default)]
            indeterminate: bool,
        },
        Segment {
            response: stream::StreamResponse,
            percentage: f64,
        },
        Terminal {
            request_id: String,
            created: String,
            duration: f64,
            channels: u32,
        },
        Result {
            response: batch::Response,
        },
        Error {
            error_code: Option<i32>,
            error_message: String,
            provider: String,
        },
    }
}
