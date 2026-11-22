//! Modèles de syntheo-speech (issue 683), téléchargés à la demande ou
//! installés depuis un dossier, jamais livrés avec l'application (≈ 1 Go).
//! Leur liste, leurs tailles et leurs empreintes sont compilées dans
//! l'application (`apps/speech/models/models.json`) : un fichier n'est mis en
//! place que s'il y correspond, et chaque lancement le revérifie (`verify`).

use std::path::{Component, Path, PathBuf};
use std::sync::LazyLock;
use std::sync::atomic::AtomicBool;
use std::time::Duration;

use syntheo_pinned_fetch::{FetchError, Fetcher, Pinned};

/// Un fichier de modèle attendu : chemin relatif (`/`), taille, SHA-256.
#[derive(Debug, Clone, PartialEq, Eq, serde::Deserialize)]
pub struct ModelFile {
    pub path: String,
    pub size: u64,
    pub sha256: String,
}

impl ModelFile {
    pub fn pinned(&self) -> Pinned<'_> {
        Pinned {
            size: self.size,
            sha256: &self.sha256,
        }
    }

    /// Chemin sous `dir`, composante par composante.
    pub fn under(&self, dir: &Path) -> PathBuf {
        self.path
            .split('/')
            .fold(dir.to_path_buf(), |p, c| p.join(c))
    }
}

#[derive(serde::Deserialize)]
struct ModelsJson {
    files: Vec<ModelFile>,
}

/// Chemin relatif sûr : composantes ordinaires, séparateur `/`.
fn safe_path(path: &str) -> bool {
    !path.is_empty()
        && !path.contains('\\')
        && Path::new(path)
            .components()
            .all(|c| matches!(c, Component::Normal(_)))
}

/// Lit une liste au format de `models.json`.
pub fn parse(json: &str) -> Option<Vec<ModelFile>> {
    let parsed: ModelsJson = serde_json::from_str(json).ok()?;
    let valid = !parsed.files.is_empty()
        && parsed.files.iter().all(|f| {
            safe_path(&f.path)
                && f.sha256.len() == 64
                && f.sha256
                    .bytes()
                    .all(|b| b.is_ascii_hexdigit() && !b.is_ascii_uppercase())
        });
    valid.then_some(parsed.files)
}

const MODELS_JSON: &str = include_str!("../../../apps/speech/models/models.json");

/// Empreinte de la liste des modèles compilée (60 bits) : une autre liste,
/// donc d'autres modèles, demande une nouvelle mise en service.
/// Seuls les fichiers (chemin, taille, empreinte) comptent : épingler ou
/// changer les sources ne demande pas de nouvelle mesure.
pub fn fingerprint() -> u64 {
    fingerprint_of(files())
}

fn fingerprint_of(files: &[ModelFile]) -> u64 {
    use sha2::{Digest, Sha256};
    let mut hasher = Sha256::new();
    for file in files {
        hasher.update(format!("{}\0{}\0{}\n", file.path, file.size, file.sha256).as_bytes());
    }
    let digest = hasher.finalize();
    u64::from_be_bytes(digest[..8].try_into().unwrap_or_default()) >> 4
}

/// Modèles de cette application, compilés.
pub fn files() -> &'static [ModelFile] {
    static FILES: LazyLock<Vec<ModelFile>> =
        LazyLock::new(|| parse(MODELS_JSON).expect("models.json compilé invalide"));
    &FILES
}

/// Sources de téléchargement compilées (`sources` de models.json), dans
/// l'ordre ; vide tant que les modèles ne sont pas publiés. Une liste
/// invalide compte pour vide.
pub fn compiled_sources() -> Vec<Source> {
    // Une liste invalide fait échouer la construction (build.rs de
    // l'application) : ce repli ne sert qu'aux essais.
    syntheo_speech_sources::models_json_sources(MODELS_JSON).unwrap_or_default()
}

/// Taille totale des modèles.
pub fn total_size(files: &[ModelFile]) -> u64 {
    files.iter().map(|f| f.size).sum()
}

/// État des modèles installés, sans hachage (la vérification complète a lieu
/// à chaque lancement).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ModelsStatus {
    /// Aucun fichier en place.
    Missing { total_bytes: u64 },
    /// Une partie en place (installation interrompue).
    Partial {
        present_bytes: u64,
        total_bytes: u64,
    },
    /// Tous les fichiers en place, à la bonne taille.
    Installed { total_bytes: u64 },
}

pub fn status(dir: &Path, files: &[ModelFile]) -> ModelsStatus {
    let total_bytes = total_size(files);
    let present_bytes: u64 = files
        .iter()
        .filter(|f| {
            std::fs::symlink_metadata(f.under(dir)).is_ok_and(|m| m.is_file() && m.len() == f.size)
        })
        .map(|f| f.size)
        .sum();
    if present_bytes == total_bytes {
        ModelsStatus::Installed { total_bytes }
    } else if present_bytes == 0 {
        ModelsStatus::Missing { total_bytes }
    } else {
        ModelsStatus::Partial {
            present_bytes,
            total_bytes,
        }
    }
}

/// Erreurs d'installation : des codes stables pour l'interface.
#[derive(Debug, PartialEq, Eq)]
pub enum InstallError {
    /// Le dossier choisi ne contient pas les modèles attendus.
    NotFound,
    /// Un fichier ne correspond pas à son empreinte ou à sa taille.
    Mismatch,
    /// Pas assez d'espace disque.
    NoSpace,
    /// Aucune adresse de téléchargement dans cette application.
    NoSource,
    /// Téléchargement impossible (réseau, serveur).
    Network,
    Cancelled,
    Io,
}

impl InstallError {
    pub fn code(&self) -> &'static str {
        match self {
            Self::NotFound => "models_not_found",
            Self::Mismatch => "models_mismatch",
            Self::NoSpace => "not_enough_disk",
            Self::NoSource => "no_download_source",
            Self::Network => "network",
            Self::Cancelled => "cancelled",
            Self::Io => "io",
        }
    }
}

impl From<FetchError> for InstallError {
    fn from(error: FetchError) -> Self {
        match error {
            FetchError::Mismatch => Self::Mismatch,
            FetchError::Cancelled => Self::Cancelled,
            FetchError::Http(_)
            | FetchError::Insecure
            | FetchError::Unexpected
            | FetchError::Incomplete => Self::Network,
            FetchError::Io(_) => Self::Io,
        }
    }
}

/// Fichiers qui manquent ou n'ont pas la taille attendue.
fn missing<'a>(dir: &Path, files: &'a [ModelFile]) -> Vec<&'a ModelFile> {
    files
        .iter()
        .filter(|f| {
            !std::fs::symlink_metadata(f.under(dir)).is_ok_and(|m| m.is_file() && m.len() == f.size)
        })
        .collect()
}

/// Marge gardée libre en plus des modèles.
const SPACE_MARGIN: u64 = 200 << 20;

/// Contrôle d'espace avant d'écrire `needed` octets dans `dir`.
fn check_space(dir: &Path, needed: u64) -> Result<(), InstallError> {
    std::fs::create_dir_all(dir).map_err(|_| InstallError::Io)?;
    match syntheo_speech_probe::hardware::free_disk(dir) {
        Some(free) if free >= needed + SPACE_MARGIN => Ok(()),
        Some(_) => Err(InstallError::NoSpace),
        // Disque introuvable : on tente quand même, l'écriture dira.
        None => Ok(()),
    }
}

/// Dossier source : les modèles sont soit directement dedans, soit dans un
/// sous-dossier `models`.
/// Emplacement de `file` dans le dossier choisi : arborescence de models.json
/// (`<dossier>[/models]/nemotron/encoder.onnx`) ou fichiers à plat, comme les
/// assets d'une release GitHub (`<dossier>[/models]/encoder.onnx`). Les noms
/// sont uniques dans models.json et chaque fichier est vérifié contre son
/// empreinte : la disposition ne change rien à ce qui est installé.
fn locate(source: &Path, file: &ModelFile) -> Option<PathBuf> {
    let name = file.path.rsplit('/').next().unwrap_or(&file.path);
    let roots = [source.join("models"), source.to_path_buf()];
    roots
        .iter()
        .map(|root| file.under(root))
        .chain(roots.iter().map(|root| root.join(name)))
        .find(|path| std::fs::symlink_metadata(path).is_ok_and(|m| m.is_file()))
}

/// Installe depuis un dossier local (bloquant) : chaque fichier manquant est
/// copié, haché pendant la copie et mis en place s'il correspond. Un fichier
/// absent du dossier choisi est une erreur ; les fichiers déjà en place sont
/// gardés.
pub fn install_from_dir(
    source: &Path,
    dir: &Path,
    files: &[ModelFile],
    cancel: &AtomicBool,
    progress: &mut dyn FnMut(u64, u64),
) -> Result<(), InstallError> {
    let todo = missing(dir, files);
    if todo.is_empty() {
        return Ok(());
    }
    let sources: Vec<PathBuf> = todo
        .iter()
        .map(|file| locate(source, file))
        .collect::<Option<_>>()
        .ok_or(InstallError::NotFound)?;
    let needed: u64 = todo.iter().map(|f| f.size).sum();
    check_space(dir, needed)?;
    let mut done = 0u64;
    for (file, from) in todo.into_iter().zip(sources) {
        syntheo_pinned_fetch::copy_verified(
            &from,
            &file.under(dir),
            file.pinned(),
            cancel,
            &mut |n| {
                done += n;
                progress(done, needed);
            },
        )?;
    }
    Ok(())
}

const CONNECT_TIMEOUT: Duration = Duration::from_secs(20);
const READ_TIMEOUT: Duration = Duration::from_secs(60);
pub use syntheo_speech_sources::{Source, parse_sources};

/// Échec d'une source pour un fichier : on passe à la suivante (réseau,
/// statut HTTP d'erreur, adresse refusée, contenu différent). Annulation et
/// erreur disque arrêtent tout.
fn try_next_source(error: &FetchError) -> bool {
    matches!(
        error,
        FetchError::Http(_)
            | FetchError::Insecure
            | FetchError::Mismatch
            | FetchError::Unexpected
            | FetchError::Incomplete
    )
}

/// Télécharge les fichiers manquants, fichier par fichier, depuis la
/// première source qui le sert correctement ; reprise des téléchargements
/// interrompus (les empreintes compilées valent pour toutes les sources).
pub async fn download(
    sources: &[Source],
    dir: &Path,
    files: &[ModelFile],
    cancel: &AtomicBool,
    progress: &mut (dyn FnMut(u64, u64) + Send),
) -> Result<(), InstallError> {
    if sources.is_empty() {
        return Err(InstallError::NoSource);
    }
    let todo = missing(dir, files);
    if todo.is_empty() {
        return Ok(());
    }
    let needed: u64 = todo.iter().map(|f| f.size).sum();
    // Déjà téléchargé dans les `.part` : ne compte pas dans l'espace à prévoir.
    let partial: u64 = todo
        .iter()
        .filter_map(|f| std::fs::metadata(syntheo_pinned_fetch::part_path(&f.under(dir))).ok())
        .map(|m| m.len())
        .sum();
    check_space(dir, needed.saturating_sub(partial))?;
    let fetcher = Fetcher::new(CONNECT_TIMEOUT, READ_TIMEOUT)?;
    let mut done = 0u64;
    for file in todo {
        let mut last = InstallError::Network;
        let mut fetched = false;
        for (index, source) in sources.iter().enumerate() {
            if cancel.load(std::sync::atomic::Ordering::Relaxed) {
                return Err(InstallError::Cancelled);
            }
            let mut file_done = 0u64;
            let result = fetcher
                .fetch(
                    &source.url_for(&file.path),
                    &file.under(dir),
                    file.pinned(),
                    cancel,
                    &mut |n| {
                        file_done += n;
                        progress(done + file_done, needed);
                    },
                )
                .await;
            match result {
                Ok(()) => {
                    fetched = true;
                    break;
                }
                Err(error) if try_next_source(&error) => {
                    tracing::warn!(
                        target: "syntheo_speech",
                        source = index,
                        file = %file.path,
                        "model source failed: {error}"
                    );
                    last = error.into();
                }
                Err(error) => return Err(error.into()),
            }
        }
        if !fetched {
            return Err(last);
        }
        done += file.size;
    }
    Ok(())
}

/// Retire les modèles (et les `.part`) ; garde le reste du dossier.
pub fn remove(dir: &Path) -> std::io::Result<()> {
    match std::fs::remove_dir_all(dir) {
        Err(error) if error.kind() != std::io::ErrorKind::NotFound => Err(error),
        _ => Ok(()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use sha2::{Digest, Sha256};

    fn file(path: &str, bytes: &[u8]) -> ModelFile {
        ModelFile {
            path: path.to_owned(),
            size: bytes.len() as u64,
            sha256: Sha256::digest(bytes)
                .iter()
                .map(|b| format!("{b:02x}"))
                .collect(),
        }
    }

    #[test]
    fn the_compiled_list_is_valid() {
        // Sources compilées : valides (vides avant publication).
        assert!(syntheo_speech_sources::models_json_sources(MODELS_JSON).is_some());
        let files = files();
        assert!(files.len() >= 2);
        assert!(total_size(files) > 500 << 20, "≈ 1 Go attendu");
        for bad in [
            r#"{"files":[{"path":"../x","size":1,"sha256":"%"}]}"#,
            r#"{"files":[]}"#,
            "pas du json",
        ] {
            let bad = bad.replace('%', &"a".repeat(64));
            assert!(parse(&bad).is_none(), "{bad}");
        }
        let abs = format!(
            r#"{{"files":[{{"path":"/etc/x","size":1,"sha256":"{}"}}]}}"#,
            "a".repeat(64)
        );
        assert!(parse(&abs).is_none());
    }

    #[test]
    fn installs_from_a_folder_with_or_without_a_models_subfolder() {
        let files = vec![file("a/one.onnx", b"un"), file("two.bin", b"deux")];
        for (nested, flat) in [(false, false), (true, false), (false, true), (true, true)] {
            let source = tempfile::tempdir().unwrap();
            let root = if nested {
                source.path().join("models")
            } else {
                source.path().to_path_buf()
            };
            std::fs::create_dir_all(root.join("a")).unwrap();
            // À plat (assets d'une release) ou en arborescence.
            let one = if flat { "one.onnx" } else { "a/one.onnx" };
            std::fs::write(root.join(one), b"un").unwrap();
            std::fs::write(root.join("two.bin"), b"deux").unwrap();
            let dest = tempfile::tempdir().unwrap();
            let dir = dest.path().join("models");
            assert_eq!(
                status(&dir, &files),
                ModelsStatus::Missing { total_bytes: 6 }
            );
            let mut last = (0, 0);
            install_from_dir(
                source.path(),
                &dir,
                &files,
                &AtomicBool::new(false),
                &mut |d, t| last = (d, t),
            )
            .unwrap();
            assert_eq!(last, (6, 6));
            assert_eq!(
                status(&dir, &files),
                ModelsStatus::Installed { total_bytes: 6 }
            );
            assert_eq!(std::fs::read(dir.join("a/one.onnx")).unwrap(), b"un");
        }
    }

    #[test]
    fn a_wrong_or_missing_file_is_refused_and_good_ones_are_kept() {
        let files = vec![file("one.onnx", b"un"), file("two.bin", b"deux")];
        let source = tempfile::tempdir().unwrap();
        std::fs::write(source.path().join("one.onnx"), b"un").unwrap();
        std::fs::write(source.path().join("two.bin"), b"deuX").unwrap();
        let dest = tempfile::tempdir().unwrap();
        let dir = dest.path().join("models");
        let never = AtomicBool::new(false);
        assert_eq!(
            install_from_dir(source.path(), &dir, &files, &never, &mut |_, _| {}),
            Err(InstallError::Mismatch)
        );
        assert_eq!(
            status(&dir, &files),
            ModelsStatus::Partial {
                present_bytes: 2,
                total_bytes: 6
            }
        );
        assert!(!dir.join("two.bin").exists());
        std::fs::remove_file(source.path().join("two.bin")).unwrap();
        assert_eq!(
            install_from_dir(source.path(), &dir, &files, &never, &mut |_, _| {}),
            Err(InstallError::NotFound)
        );
        let empty = tempfile::tempdir().unwrap();
        let other = dest.path().join("other");
        assert_eq!(
            install_from_dir(empty.path(), &other, &files, &never, &mut |_, _| {}),
            Err(InstallError::NotFound)
        );
        remove(&dir).unwrap();
        assert_eq!(
            status(&dir, &files),
            ModelsStatus::Missing { total_bytes: 6 }
        );
    }

    #[tokio::test]
    async fn download_needs_a_source() {
        let files = vec![file("one.onnx", b"un")];
        let dest = tempfile::tempdir().unwrap();
        assert_eq!(
            download(
                &[],
                dest.path(),
                &files,
                &AtomicBool::new(false),
                &mut |_, _| {}
            )
            .await,
            Err(InstallError::NoSource)
        );
    }

    /// Serveur local : sert `files` (chemin → contenu) sous `/ok/`, rien
    /// ailleurs (404).
    async fn serve(files: Vec<(String, Vec<u8>)>) -> String {
        use tokio::io::{AsyncReadExt, AsyncWriteExt};
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let base = format!("http://{}", listener.local_addr().unwrap());
        tokio::spawn(async move {
            while let Ok((mut socket, _)) = listener.accept().await {
                let files = files.clone();
                tokio::spawn(async move {
                    let mut request = vec![0u8; 4096];
                    let n = socket.read(&mut request).await.unwrap_or(0);
                    let line = String::from_utf8_lossy(&request[..n])
                        .lines()
                        .next()
                        .unwrap_or("")
                        .to_owned();
                    let path = line.split(' ').nth(1).unwrap_or("");
                    let body = path
                        .strip_prefix("/ok/")
                        .and_then(|p| files.iter().find(|(name, _)| name == p))
                        .map(|(_, body)| body.clone());
                    let head = match &body {
                        Some(body) => format!("HTTP/1.1 200 OK\r\ncontent-length: {}\r\nconnection: close\r\n\r\n", body.len()),
                        None => "HTTP/1.1 404 Not Found\r\ncontent-length: 0\r\nconnection: close\r\n\r\n".to_owned(),
                    };
                    let _ = socket.write_all(head.as_bytes()).await;
                    if let Some(body) = body {
                        let _ = socket.write_all(&body).await;
                    }
                });
            }
        });
        base
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn each_file_falls_back_to_the_next_source() {
        let files = vec![
            file("nemotron/one.onnx", b"un"),
            file("diar/two.onnx", b"deux"),
        ];
        // Source 1 : 404 partout. Source 2 : contenu faux pour two.onnx.
        // Source 3 (à plat) : les bons fichiers.
        let missing = serve(vec![]).await;
        let wrong = serve(vec![
            ("nemotron/one.onnx".into(), b"un".to_vec()),
            ("diar/two.onnx".into(), b"DEUX".to_vec()),
        ])
        .await;
        let flat = serve(vec![("two.onnx".into(), b"deux".to_vec())]).await;
        let sources = vec![
            Source::unchecked_for_tests(format!("{missing}/ok/{{path}}")),
            Source::unchecked_for_tests(format!("{wrong}/ok/{{path}}")),
            Source::unchecked_for_tests(format!("{flat}/ok/{{name}}")),
        ];
        let dest = tempfile::tempdir().unwrap();
        let mut last = (0, 0);
        download(
            &sources,
            dest.path(),
            &files,
            &AtomicBool::new(false),
            &mut |d, t| last = (d, t),
        )
        .await
        .unwrap();
        assert_eq!(
            std::fs::read(dest.path().join("nemotron/one.onnx")).unwrap(),
            b"un"
        );
        assert_eq!(
            std::fs::read(dest.path().join("diar/two.onnx")).unwrap(),
            b"deux"
        );
        assert_eq!(last.1, 6);
        // Aucune source ne sert le bon contenu : refus, rien en place.
        let other = tempfile::tempdir().unwrap();
        let error = download(
            &sources[..2],
            other.path(),
            &files,
            &AtomicBool::new(false),
            &mut |_, _| {},
        )
        .await
        .unwrap_err();
        assert_eq!(error, InstallError::Mismatch);
        assert!(!other.path().join("diar/two.onnx").exists());
    }

    // Revue, R5 : l'empreinte de mise en service ne dépend que des fichiers.
    #[test]
    fn the_fingerprint_ignores_the_sources() {
        let sha = "0".repeat(64);
        let bare = format!(r#"{{"files":[{{"path":"a/x.onnx","size":2,"sha256":"{sha}"}}]}}"#);
        let pinned = format!(
            r#"{{"files":[{{"path":"a/x.onnx","size":2,"sha256":"{sha}"}}],"sources":["https://a.example/{{path}}"]}}"#
        );
        let other = format!(r#"{{"files":[{{"path":"a/x.onnx","size":3,"sha256":"{sha}"}}]}}"#);
        let of = |json: &str| fingerprint_of(&parse(json).unwrap());
        assert_eq!(of(&bare), of(&pinned));
        assert_ne!(of(&bare), of(&other));
    }

    // Sources épinglées : la release GitHub speech-models-1, à plat ; chaque
    // fichier y a un nom unique (un asset par fichier).
    #[test]
    fn the_compiled_sources_point_to_the_github_release() {
        let sources = compiled_sources();
        assert_eq!(
            sources.first().map(Source::as_str),
            Some("https://github.com/WillIsback/Syntheo/releases/download/speech-models-1/{name}")
        );
        let urls: std::collections::HashSet<String> = files()
            .iter()
            .map(|f| sources[0].url_for(&f.path))
            .collect();
        assert_eq!(urls.len(), files().len());
        assert!(urls.contains(
            "https://github.com/WillIsback/Syntheo/releases/download/speech-models-1/encoder.onnx.data"
        ));
        // Aucun gabarit provisoire (révision Hugging Face à venir) parmi les sources.
        assert!(sources.iter().all(|s| !s.as_str().contains('<')));
    }
}
