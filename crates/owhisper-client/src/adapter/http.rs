use std::path::Path;

use reqwest::Response;
use reqwest::multipart::Part;

use crate::error::Error;

const MAX_ERROR_BODY_BYTES: usize = 64 * 1024;

/// Plafond d'une réponse de transcription réussie (issue 656) : plusieurs
/// heures de mots horodatés tiennent en quelques Mo ; au-delà, la réponse
/// est refusée au lieu d'être lue en entier en mémoire.
pub const MAX_TRANSCRIPT_BODY_BYTES: usize = 64 * 1024 * 1024;

/// Plafond d'une petite réponse de service (liste des modèles).
pub const MAX_SMALL_BODY_BYTES: usize = 1024 * 1024;

/// Lit un corps JSON réussi, par morceaux, sans dépasser `limit` octets.
pub async fn json_body_with_limit<T: serde::de::DeserializeOwned>(
    mut response: Response,
    limit: usize,
) -> Result<T, Error> {
    let status = response.status();
    let too_large = || Error::ProviderFailure {
        message: format!("response body larger than {limit} bytes"),
        retryable: false,
        status: Some(status),
    };
    if response
        .content_length()
        .is_some_and(|length| length > limit as u64)
    {
        return Err(too_large());
    }
    let mut body = Vec::new();
    while let Some(chunk) = response.chunk().await? {
        if body.len() + chunk.len() > limit {
            return Err(too_large());
        }
        body.extend_from_slice(&chunk);
    }
    serde_json::from_slice(&body).map_err(|error| Error::ProviderFailure {
        message: format!("invalid JSON response: {error}"),
        retryable: false,
        status: Some(status),
    })
}

pub async fn ensure_success(response: Response) -> Result<Response, Error> {
    let status = response.status();
    if status.is_success() {
        Ok(response)
    } else {
        let body = error_body(response).await;
        Err(Error::UnexpectedStatus { status, body })
    }
}

pub async fn error_body(response: Response) -> String {
    error_body_with_limit(response, MAX_ERROR_BODY_BYTES).await
}

async fn error_body_with_limit(mut response: Response, limit: usize) -> String {
    let mut body = Vec::with_capacity(
        response
            .content_length()
            .and_then(|length| usize::try_from(length).ok())
            .unwrap_or_default()
            .min(limit),
    );
    let mut truncated = response
        .content_length()
        .is_some_and(|length| length > limit as u64);

    while let Ok(Some(chunk)) = response.chunk().await {
        let remaining = limit.saturating_sub(body.len());
        let keep = remaining.min(chunk.len());
        body.extend_from_slice(&chunk[..keep]);
        if keep < chunk.len() {
            truncated = true;
            break;
        }
        if body.len() == limit {
            if let Ok(Some(_)) = response.chunk().await {
                truncated = true;
            }
            break;
        }
    }

    let mut body = String::from_utf8_lossy(&body).into_owned();
    if truncated {
        body.push_str("\n[response body truncated]");
    }
    body
}

pub fn mime_type_from_extension(path: &Path) -> &'static str {
    match path.extension().and_then(|e| e.to_str()) {
        Some("mp3") => "audio/mpeg",
        Some("mp4") => "audio/mp4",
        Some("m4a") => "audio/mp4",
        Some("wav") => "audio/wav",
        Some("webm") => "audio/webm",
        Some("ogg") => "audio/ogg",
        Some("flac") => "audio/flac",
        _ => "application/octet-stream",
    }
}

pub async fn streaming_file_body(file_path: &Path) -> Result<(reqwest::Body, u64), Error> {
    let file = tokio::fs::File::open(file_path)
        .await
        .map_err(|e| Error::AudioProcessing(e.to_string()))?;
    let length = file
        .metadata()
        .await
        .map_err(|e| Error::AudioProcessing(e.to_string()))?
        .len();

    Ok((reqwest::Body::from(file), length))
}

/// Construit une partie multipart à partir d'un tampon audio en mémoire. Les
/// chemins qui ne doivent rien écrire sur disque (dictée, imports) passent par
/// ici plutôt que par un fichier.
pub fn streaming_bytes_part(
    data: Vec<u8>,
    file_name: &str,
    mime_type: &str,
) -> Result<Part, Error> {
    let length = data.len() as u64;
    Part::stream_with_length(reqwest::Body::from(data), length)
        .file_name(file_name.to_string())
        .mime_str(mime_type)
        .map_err(|e| Error::AudioProcessing(e.to_string()))
}

/// Source audio d'un envoi batch : un fichier existant, ou un tampon en mémoire
/// quand l'audio ne doit jamais toucher le disque.
#[derive(Debug, Clone)]
pub(crate) enum AudioBody {
    Path(std::path::PathBuf),
    Bytes { data: Vec<u8>, file_name: String },
}

impl AudioBody {
    pub(crate) async fn to_part(&self) -> Result<Part, Error> {
        match self {
            AudioBody::Path(path) => streaming_file_part(path).await,
            AudioBody::Bytes { data, file_name } => {
                let mime = mime_type_from_extension(Path::new(file_name));
                streaming_bytes_part(data.clone(), file_name, mime)
            }
        }
    }
}

pub async fn streaming_file_part(file_path: &Path) -> Result<Part, Error> {
    let fallback_name = match file_path.extension().and_then(|e| e.to_str()) {
        Some(ext) => format!("audio.{}", ext),
        None => "audio".to_string(),
    };

    let file_name = file_path
        .file_name()
        .and_then(|n| n.to_str())
        .map(ToOwned::to_owned)
        .unwrap_or(fallback_name);

    let (body, length) = streaming_file_body(file_path).await?;
    let mime_type = mime_type_from_extension(file_path);

    Part::stream_with_length(body, length)
        .file_name(file_name)
        .mime_str(mime_type)
        .map_err(|e| Error::AudioProcessing(e.to_string()))
}

#[cfg(test)]
mod tests {
    use wiremock::{Mock, MockServer, ResponseTemplate, matchers::path};

    use super::{error_body_with_limit, json_body_with_limit, streaming_bytes_part};

    // Issue 656 : une réponse réussie trop grosse est refusée sans être lue
    // en entier ; une réponse sous le plafond est décodée normalement.
    #[tokio::test]
    async fn success_body_is_capped() {
        let server = MockServer::start().await;
        Mock::given(path("/big"))
            .respond_with(
                ResponseTemplate::new(200)
                    .set_body_string(format!("{{\"text\":\"{}\"}}", "a".repeat(64))),
            )
            .mount(&server)
            .await;
        let get = || async { reqwest::get(format!("{}/big", server.uri())).await.unwrap() };

        let error = json_body_with_limit::<serde_json::Value>(get().await, 32)
            .await
            .unwrap_err();
        assert!(
            error.to_string().contains("larger than 32 bytes"),
            "{error}"
        );
        let value: serde_json::Value = json_body_with_limit(get().await, 1024).await.unwrap();
        assert_eq!(value["text"].as_str().unwrap().len(), 64);
    }

    #[tokio::test]
    async fn error_body_is_capped_and_marked() {
        let server = MockServer::start().await;
        Mock::given(path("/error"))
            .respond_with(ResponseTemplate::new(500).set_body_bytes(vec![b'x'; 17]))
            .mount(&server)
            .await;
        let response = reqwest::get(format!("{}/error", server.uri()))
            .await
            .unwrap();

        let body = error_body_with_limit(response, 16).await;
        assert_eq!(
            body,
            format!("{}\n[response body truncated]", "x".repeat(16))
        );
    }

    #[tokio::test]
    async fn in_memory_audio_is_sent_as_a_multipart_file_part() {
        let server = MockServer::start().await;
        Mock::given(path("/v1/audio/transcriptions"))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({})))
            .expect(1)
            .mount(&server)
            .await;

        let part = streaming_bytes_part(b"abc".to_vec(), "dictation.wav", "audio/wav").unwrap();
        let form = reqwest::multipart::Form::new().part("file", part);
        reqwest::Client::new()
            .post(format!("{}/v1/audio/transcriptions", server.uri()))
            .multipart(form)
            .send()
            .await
            .unwrap();

        let requests = server.received_requests().await.unwrap();
        let body = String::from_utf8_lossy(&requests[0].body).into_owned();
        assert!(body.contains("filename=\"dictation.wav\""), "{body:.300}");
        assert!(body.contains("Content-Type: audio/wav"), "{body:.300}");
        assert!(body.contains("abc"), "{body:.300}");
    }
}
