//! Fichiers épinglés par leur taille et leur SHA-256 (issues 429 et 683) :
//! téléchargement HTTPS ou copie depuis un dossier, toujours écrits dans un
//! `.part` à côté, hachés à la volée, contrôlés, puis renommés. Une coupure
//! laisse au pire un `.part`, jamais un fichier tronqué ou altéré à sa place.
//! Un téléchargement interrompu reprend où il s'était arrêté (`Range`), après
//! avoir re-haché ce qui est déjà écrit.

use std::io::Read;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;

use sha2::{Digest, Sha256};
use tokio::io::AsyncWriteExt;

/// Un fichier attendu, identifié par son contenu.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Pinned<'a> {
    pub size: u64,
    pub sha256: &'a str,
}

#[derive(Debug, thiserror::Error)]
pub enum FetchError {
    /// Adresse refusée : autre chose que `https://`.
    #[error("only https:// addresses are accepted")]
    Insecure,
    #[error("download failed: {0}")]
    Http(#[from] reqwest::Error),
    /// Taille ou empreinte différente de celle épinglée.
    #[error("file does not match its pinned size or checksum")]
    Mismatch,
    /// Réponse inattendue : statut autre que 200 (ou 206 en reprise), ou
    /// plage (`Content-Range`) qui ne reprend pas où on s'était arrêté. Le
    /// `.part` est gardé.
    #[error("unexpected response from the server")]
    Unexpected,
    /// Flux terminé avant la taille attendue : le `.part` est gardé pour une
    /// reprise.
    #[error("download ended before the end of the file")]
    Incomplete,
    #[error("cancelled")]
    Cancelled,
    #[error("input/output error: {0}")]
    Io(#[from] std::io::Error),
}

/// Lecture et écriture par blocs de 1 Mio.
const BLOCK: usize = 1 << 20;

fn hex(digest: impl AsRef<[u8]>) -> String {
    digest.as_ref().iter().map(|b| format!("{b:02x}")).collect()
}

/// `.part` à côté de la destination.
pub fn part_path(dest: &Path) -> PathBuf {
    let mut name = dest.file_name().unwrap_or_default().to_os_string();
    name.push(".part");
    dest.with_file_name(name)
}

/// Empreinte et taille d'un fichier, sans tout charger en mémoire.
pub fn hash_file(path: &Path) -> std::io::Result<(u64, String)> {
    hash_reader(&mut std::fs::File::open(path)?)
}

fn hash_reader(reader: &mut impl Read) -> std::io::Result<(u64, String)> {
    let mut hasher = Sha256::new();
    let mut buffer = vec![0u8; BLOCK];
    let mut size = 0u64;
    loop {
        let read = reader.read(&mut buffer)?;
        if read == 0 {
            break;
        }
        size += read as u64;
        hasher.update(&buffer[..read]);
    }
    Ok((size, hex(hasher.finalize())))
}

/// Le fichier est présent, ordinaire, et correspond à `pinned`.
pub fn matches(path: &Path, pinned: Pinned<'_>) -> bool {
    std::fs::symlink_metadata(path).is_ok_and(|m| m.is_file() && m.len() == pinned.size)
        && hash_file(path).is_ok_and(|(size, sha)| size == pinned.size && sha == pinned.sha256)
}

/// Contrôle final du `.part`, puis renommage.
fn finish(
    part: &Path,
    dest: &Path,
    size: u64,
    sha: String,
    pinned: Pinned<'_>,
) -> Result<(), FetchError> {
    if size != pinned.size || sha != pinned.sha256 {
        let _ = std::fs::remove_file(part);
        return Err(FetchError::Mismatch);
    }
    std::fs::rename(part, dest)?;
    Ok(())
}

/// Copie `source` vers `dest` si son contenu correspond à `pinned` : lecture
/// bornée à la taille épinglée, hachage pendant la copie, `.part` puis
/// renommage. Un lien symbolique ou un fichier spécial est refusé.
pub fn copy_verified(
    source: &Path,
    dest: &Path,
    pinned: Pinned<'_>,
    cancel: &AtomicBool,
    progress: &mut dyn FnMut(u64),
) -> Result<(), FetchError> {
    let metadata = std::fs::symlink_metadata(source)?;
    if !metadata.is_file() || metadata.len() != pinned.size {
        return Err(FetchError::Mismatch);
    }
    if let Some(parent) = dest.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let part = part_path(dest);
    let mut input = std::fs::File::open(source)?.take(pinned.size + 1);
    let mut output = std::fs::File::create(&part)?;
    let mut hasher = Sha256::new();
    let mut buffer = vec![0u8; BLOCK];
    let mut size = 0u64;
    loop {
        if cancel.load(Ordering::Relaxed) {
            drop(output);
            let _ = std::fs::remove_file(&part);
            return Err(FetchError::Cancelled);
        }
        let read = input.read(&mut buffer)?;
        if read == 0 {
            break;
        }
        size += read as u64;
        if size > pinned.size {
            drop(output);
            let _ = std::fs::remove_file(&part);
            return Err(FetchError::Mismatch);
        }
        hasher.update(&buffer[..read]);
        std::io::Write::write_all(&mut output, &buffer[..read])?;
        progress(read as u64);
    }
    output.sync_all()?;
    drop(output);
    finish(&part, dest, size, hex(hasher.finalize()), pinned)
}

fn secure(url: &reqwest::Url) -> bool {
    match url.scheme() {
        "https" => true,
        #[cfg(any(test, feature = "test-loopback"))]
        "http" => url.host_str() == Some("127.0.0.1"),
        _ => false,
    }
}

/// Redirections HTTPS suivies au plus, vers n'importe quel hôte.
pub const MAX_REDIRECTS: usize = 5;

/// Client de téléchargement : HTTPS seulement, redirections comprises.
pub struct Fetcher {
    client: reqwest::Client,
}

impl Fetcher {
    /// `connect` : délai de connexion ; `read` : délai maximal sans recevoir
    /// d'octet (pas de délai global : un gros fichier prend le temps qu'il
    /// faut tant qu'il avance).
    pub fn new(connect: Duration, read: Duration) -> Result<Self, FetchError> {
        let policy = reqwest::redirect::Policy::custom(|attempt| {
            // `previous()` compte l'adresse de départ : au plus
            // MAX_REDIRECTS redirections suivies.
            if attempt.previous().len() > MAX_REDIRECTS || !secure(attempt.url()) {
                attempt.stop()
            } else {
                attempt.follow()
            }
        });
        let client = reqwest::Client::builder()
            .connect_timeout(connect)
            .read_timeout(read)
            .redirect(policy)
            .build()?;
        Ok(Self { client })
    }

    /// Télécharge `url` vers `dest` si son contenu correspond à `pinned`.
    /// Reprend un `.part` laissé par un essai précédent ; s'il est plus long
    /// que le fichier attendu, ou si le serveur ignore la reprise, repart de
    /// zéro. `progress` reçoit les octets écrits, reprise comprise.
    pub async fn fetch(
        &self,
        url: &str,
        dest: &Path,
        pinned: Pinned<'_>,
        cancel: &AtomicBool,
        progress: &mut (dyn FnMut(u64) + Send),
    ) -> Result<(), FetchError> {
        let url = reqwest::Url::parse(url).map_err(|_| FetchError::Insecure)?;
        if !secure(&url) {
            return Err(FetchError::Insecure);
        }
        if let Some(parent) = dest.parent() {
            tokio::fs::create_dir_all(parent).await?;
        }
        let part = part_path(dest);
        // Reprise : ce qui est déjà écrit est re-haché (fichier épinglé, donc
        // tout octet déjà écrit doit déjà être le bon).
        let mut hasher = Sha256::new();
        let mut size = 0u64;
        if let Ok(metadata) = tokio::fs::symlink_metadata(&part).await {
            if metadata.is_file() && metadata.len() <= pinned.size {
                let path = part.clone();
                let (h, s) = tokio::task::spawn_blocking(move || -> std::io::Result<_> {
                    let mut hasher = Sha256::new();
                    let mut file = std::fs::File::open(&path)?;
                    let mut buffer = vec![0u8; BLOCK];
                    let mut size = 0u64;
                    loop {
                        let read = file.read(&mut buffer)?;
                        if read == 0 {
                            break;
                        }
                        size += read as u64;
                        hasher.update(&buffer[..read]);
                    }
                    Ok((hasher, size))
                })
                .await
                .map_err(|_| FetchError::Cancelled)??;
                hasher = h;
                size = s;
            } else {
                let _ = tokio::fs::remove_file(&part).await;
            }
        }
        if size == pinned.size {
            return finish(&part, dest, size, hex(hasher.finalize()), pinned);
        }
        if cancel.load(Ordering::Relaxed) {
            return Err(FetchError::Cancelled);
        }
        let (mut response, resumed) = loop {
            let mut request = self.client.get(url.clone());
            if size > 0 {
                request = request.header(reqwest::header::RANGE, format!("bytes={size}-"));
            }
            let response = tokio::select! {
                response = request.send() => response?,
                () = cancelled(cancel) => return Err(FetchError::Cancelled),
            };
            // Avant de toucher au `.part` : une redirection refusée (non
            // HTTPS, trop de sauts) arrive ici en 3xx, un serveur quelconque
            // peut rendre un autre 2xx. Seuls 200, ou 206 en reprise, sont
            // acceptés.
            let status = response.status();
            if status.is_redirection() {
                return Err(FetchError::Insecure);
            }
            let response = response.error_for_status()?;
            match status {
                reqwest::StatusCode::OK => break (response, false),
                reqwest::StatusCode::PARTIAL_CONTENT if size > 0 => {
                    // La plage doit reprendre exactement où on s'était arrêté,
                    // sur le fichier épinglé (total inconnu « * » admis).
                    let range = response
                        .headers()
                        .get(reqwest::header::CONTENT_RANGE)
                        .and_then(|v| v.to_str().ok())
                        .and_then(parse_content_range);
                    if matches!(range, Some((start, total)) if start == size
                        && total.is_none_or(|t| t == pinned.size))
                    {
                        break (response, true);
                    }
                    // Plage fausse (intermédiaire non conforme) : la reprise
                    // est abandonnée, le fichier repart de zéro, sans Range.
                    drop(response);
                    let _ = tokio::fs::remove_file(&part).await;
                    hasher = Sha256::new();
                    size = 0;
                }
                _ => return Err(FetchError::Unexpected),
            }
        };
        let mut output = if resumed {
            progress(size);
            tokio::fs::OpenOptions::new()
                .append(true)
                .open(&part)
                .await?
        } else {
            hasher = Sha256::new();
            size = 0;
            tokio::fs::File::create(&part).await?
        };
        loop {
            let chunk = tokio::select! {
                chunk = response.chunk() => chunk,
                () = cancelled(cancel) => {
                    output.flush().await?;
                    return Err(FetchError::Cancelled);
                }
            };
            let Some(chunk) = chunk? else { break };
            size += chunk.len() as u64;
            if size > pinned.size {
                drop(output);
                let _ = tokio::fs::remove_file(&part).await;
                return Err(FetchError::Mismatch);
            }
            hasher.update(&chunk);
            output.write_all(&chunk).await?;
            progress(chunk.len() as u64);
        }
        output.sync_all().await?;
        drop(output);
        if size < pinned.size {
            // Fin propre mais trop tôt (corps délimité par la fermeture, plage
            // plafonnée) : le préfixe écrit est gardé pour une reprise.
            return Err(FetchError::Incomplete);
        }
        finish(&part, dest, size, hex(hasher.finalize()), pinned)
    }
}

/// Se termine quand l'annulation est demandée (lue toutes les 100 ms).
async fn cancelled(cancel: &AtomicBool) {
    while !cancel.load(Ordering::Relaxed) {
        tokio::time::sleep(Duration::from_millis(100)).await;
    }
}

/// `bytes <début>-<fin>/<total>` → `(début, total)`, si cohérent ; total
/// `None` s'il est inconnu (`*`).
fn parse_content_range(value: &str) -> Option<(u64, Option<u64>)> {
    let range = value.trim().strip_prefix("bytes ")?;
    let (span, total) = range.split_once('/')?;
    let (start, end) = span.split_once('-')?;
    let (start, end): (u64, u64) = (start.parse().ok()?, end.parse().ok()?);
    let total = match total {
        "*" => None,
        total => Some(total.parse::<u64>().ok()?),
    };
    (start <= end && total.is_none_or(|t| end < t)).then_some((start, total))
}

#[cfg(test)]
mod tests;
