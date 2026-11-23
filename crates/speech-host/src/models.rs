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

/// État des modèles installés. Sans hachage quand le marqueur d'installation
/// correspond à la liste compilée ; sinon les fichiers de bonne taille sont
/// rehachés une fois (voir [`Present`]). La vérification complète a lieu à
/// chaque lancement.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ModelsStatus {
    /// Aucun fichier en place.
    Missing { total_bytes: u64 },
    /// Une partie en place (installation interrompue, ou fichiers d'une autre
    /// liste de même taille). `present_bytes` compte les fichiers en place et
    /// les octets déjà téléchargés dans les `.part` (QA 0.8.0-3) ;
    /// `resumable` : au moins un `.part`, que le téléchargement reprendra.
    Partial {
        present_bytes: u64,
        total_bytes: u64,
        resumable: bool,
    },
    /// Tous les fichiers en place, à la bonne taille (et à la bonne
    /// empreinte, vérifiée à l'installation ou rehachée depuis).
    Installed { total_bytes: u64 },
}

/// Marqueur écrit dans le dossier des modèles après une installation
/// complète : l'empreinte de la liste installée.
pub const MARKER: &str = "models.installed.json";
const MARKER_FORMAT: u32 = 1;

#[derive(serde::Serialize, serde::Deserialize)]
struct Marker {
    format: u32,
    fingerprint: u64,
}

/// Le marqueur du dossier correspond à `files`.
fn marker_matches(dir: &Path, files: &[ModelFile]) -> bool {
    std::fs::read(dir.join(MARKER))
        .ok()
        .and_then(|bytes| serde_json::from_slice::<Marker>(&bytes).ok())
        .is_some_and(|m| m.format == MARKER_FORMAT && m.fingerprint == fingerprint_of(files))
}

/// Écrit le marqueur de `files` : fichier temporaire puis renommage, pour ne
/// jamais laisser un marqueur tronqué.
fn write_marker(dir: &Path, files: &[ModelFile]) -> std::io::Result<()> {
    let marker = Marker {
        format: MARKER_FORMAT,
        fingerprint: fingerprint_of(files),
    };
    let bytes = serde_json::to_vec(&marker).map_err(std::io::Error::other)?;
    let tmp = dir.join(format!("{MARKER}.{}.tmp", uuid::Uuid::new_v4()));
    let written =
        std::fs::write(&tmp, &bytes).and_then(|()| std::fs::rename(&tmp, dir.join(MARKER)));
    if written.is_err() {
        let _ = std::fs::remove_file(&tmp);
    }
    written
}

/// Empreintes déjà calculées, par chemin : (taille, date de modification,
/// SHA-256). Un fichier remplacé (renommage d'un `.part`, copie) change de
/// date et est rehaché.
type HashCache = std::collections::HashMap<PathBuf, (u64, std::time::SystemTime, String)>;
static HASHES: LazyLock<std::sync::Mutex<HashCache>> = LazyLock::new(Default::default);

/// SHA-256 de `path`, depuis le cache si le fichier n'a pas changé. La taille
/// et la date viennent du fichier ouvert, celui qui est haché.
fn cached_sha256(path: &Path) -> std::io::Result<String> {
    let mut handle = std::fs::File::open(path)?;
    let metadata = handle.metadata()?;
    let key = (metadata.len(), metadata.modified()?);
    let cache = || HASHES.lock().unwrap_or_else(|e| e.into_inner());
    if let Some((len, modified, sha)) = cache().get(path)
        && (*len, *modified) == key
    {
        return Ok(sha.clone());
    }
    let sha = {
        use sha2::{Digest, Sha256};
        use std::io::Read;
        let mut hasher = Sha256::new();
        let mut buffer = vec![0u8; 1 << 20];
        loop {
            let read = handle.read(&mut buffer)?;
            if read == 0 {
                break;
            }
            hasher.update(&buffer[..read]);
        }
        hasher
            .finalize()
            .iter()
            .map(|b| format!("{b:02x}"))
            .collect::<String>()
    };
    cache().insert(path.to_path_buf(), (key.0, key.1, sha.clone()));
    Ok(sha)
}

/// Fichiers en place, à la bonne taille, et, sans marqueur correspondant
/// (constats 6, 12 et 14 de la revue QA 0.8.0-3 : une requantification garde
/// les tailles), à la bonne empreinte.
///
/// Coût : sans marqueur, chaque fichier de bonne taille est haché (≈ 1 Go),
/// une fois par version du fichier grâce au cache. Quand tous concordent,
/// le marqueur est écrit : le poste est à jour et les appels suivants ne
/// regardent plus que les tailles. Un fichier illisible (rare : verrou d'un
/// autre programme) compte comme présent, sans marqueur ; le lancement le
/// revérifie.
struct Present {
    /// `present[i]` : `files[i]` est en place.
    present: Vec<bool>,
    /// Les fichiers comptés en place sont sûrs : marqueur correspondant, ou
    /// tous hachés. Faux si un fichier illisible a été compté sans hachage :
    /// le marqueur ne doit alors pas être écrit (vérification 789ef9bb, V2).
    verified: bool,
}

impl Present {
    fn of(dir: &Path, files: &[ModelFile]) -> Self {
        let sized: Vec<bool> = files
            .iter()
            .map(|f| {
                std::fs::symlink_metadata(f.under(dir))
                    .is_ok_and(|m| m.is_file() && m.len() == f.size)
            })
            .collect();
        if marker_matches(dir, files) {
            return Self {
                present: sized,
                verified: true,
            };
        }
        let mut all_hashed = true;
        let present: Vec<bool> = files
            .iter()
            .zip(sized)
            .map(|(file, sized)| {
                sized
                    && match cached_sha256(&file.under(dir)) {
                        Ok(sha) => sha == file.sha256,
                        Err(_) => {
                            all_hashed = false;
                            true
                        }
                    }
            })
            .collect();
        if all_hashed && present.iter().all(|p| *p) {
            // Erreur d'écriture : on rehachera (depuis le cache) au prochain
            // appel.
            let _ = write_marker(dir, files);
        }
        Self {
            present,
            verified: all_hashed,
        }
    }
}

pub fn status(dir: &Path, files: &[ModelFile]) -> ModelsStatus {
    let total_bytes = total_size(files);
    let present = Present::of(dir, files).present;
    let mut installed_bytes = 0u64;
    let mut partial_bytes = 0u64;
    for (file, present) in files.iter().zip(present) {
        if present {
            installed_bytes += file.size;
        } else if let Ok(part) =
            std::fs::symlink_metadata(syntheo_pinned_fetch::part_path(&file.under(dir)))
            && part.is_file()
            && part.len() <= file.size
        {
            // Téléchargement interrompu : repris là où il s'est arrêté. Un
            // `.part` plus long que le fichier attendu est jeté par le
            // téléchargement (constat 13) : il ne compte pas.
            partial_bytes += part.len();
        }
    }
    if installed_bytes == total_bytes {
        ModelsStatus::Installed { total_bytes }
    } else if installed_bytes + partial_bytes == 0 {
        ModelsStatus::Missing { total_bytes }
    } else {
        ModelsStatus::Partial {
            present_bytes: installed_bytes + partial_bytes,
            total_bytes,
            resumable: partial_bytes > 0,
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

/// Fichiers qui manquent, n'ont pas la taille attendue ou, sans marqueur
/// correspondant, pas l'empreinte attendue (voir [`Present`]) : ils seront
/// remplacés (le `.part` est renommé par-dessus). Rend aussi si les fichiers
/// gardés sont sûrs ([`Present::verified`]) : sinon, pas de marqueur après
/// l'installation.
fn missing<'a>(dir: &Path, files: &'a [ModelFile]) -> (Vec<&'a ModelFile>, bool) {
    let present = Present::of(dir, files);
    let todo = files
        .iter()
        .zip(present.present)
        .filter_map(|(f, present)| (!present).then_some(f))
        .collect();
    (todo, present.verified)
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
/// gardés. Le marqueur est écrit à la fin (déjà écrit si rien ne manquait).
pub fn install_from_dir(
    source: &Path,
    dir: &Path,
    files: &[ModelFile],
    cancel: &AtomicBool,
    progress: &mut dyn FnMut(u64, u64),
) -> Result<(), InstallError> {
    let (todo, kept_verified) = missing(dir, files);
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
    if kept_verified {
        write_marker(dir, files).map_err(|_| InstallError::Io)?;
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
/// Le marqueur est écrit à la fin (déjà écrit si rien ne manquait).
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
    // Le rehachage éventuel (≈ 1 Go sans marqueur) se fait hors de la boucle
    // asynchrone.
    let (todo, kept_verified): (Vec<&ModelFile>, bool) = {
        let (owned_dir, owned) = (dir.to_path_buf(), files.to_vec());
        let (indices, verified) = tokio::task::spawn_blocking(move || {
            let (todo, verified) = missing(&owned_dir, &owned);
            let indices = owned
                .iter()
                .enumerate()
                .filter(|(_, f)| todo.contains(f))
                .map(|(i, _)| i)
                .collect::<Vec<usize>>();
            (indices, verified)
        })
        .await
        .map_err(|_| InstallError::Io)?;
        (indices.into_iter().map(|i| &files[i]).collect(), verified)
    };
    if todo.is_empty() {
        return Ok(());
    }
    let needed: u64 = todo.iter().map(|f| f.size).sum();
    // Déjà téléchargé dans les `.part` : ne compte pas dans l'espace à prévoir
    // (un `.part` trop long sera jeté).
    let partial: u64 = todo
        .iter()
        .filter_map(|f| {
            std::fs::metadata(syntheo_pinned_fetch::part_path(&f.under(dir)))
                .ok()
                .map(|m| m.len())
                .filter(|len| *len <= f.size)
        })
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
    if kept_verified {
        write_marker(dir, files).map_err(|_| InstallError::Io)?;
    }
    Ok(())
}

/// Retire les modèles (avec les `.part` et le marqueur) ; garde le reste du
/// dossier de données.
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

    // QA 0.8.0-3 : un téléchargement interrompu compte ses `.part` et se dit
    // reprenable, même sans fichier complet. Constat 13 : un `.part` plus long
    // que le fichier attendu, que le téléchargement jettera, ne compte pas.
    #[test]
    fn interrupted_downloads_count_their_part_files() {
        let files = vec![file("one.onnx", b"un"), file("two.bin", b"deux")];
        let dest = tempfile::tempdir().unwrap();
        let dir = dest.path();
        std::fs::write(dir.join("two.bin.part"), b"de").unwrap();
        assert_eq!(
            status(dir, &files),
            ModelsStatus::Partial {
                present_bytes: 2,
                total_bytes: 6,
                resumable: true,
            }
        );
        std::fs::write(dir.join("two.bin.part"), b"deux").unwrap();
        assert_eq!(
            status(dir, &files),
            ModelsStatus::Partial {
                present_bytes: 4,
                total_bytes: 6,
                resumable: true,
            }
        );
        std::fs::write(dir.join("one.onnx"), b"un").unwrap();
        std::fs::write(dir.join("two.bin.part"), b"deux et plus").unwrap();
        assert_eq!(
            status(dir, &files),
            ModelsStatus::Partial {
                present_bytes: 2,
                total_bytes: 6,
                resumable: false,
            }
        );
        std::fs::remove_file(dir.join("two.bin.part")).unwrap();
        std::fs::write(dir.join("two.bin"), b"deux").unwrap();
        assert_eq!(
            status(dir, &files),
            ModelsStatus::Installed { total_bytes: 6 }
        );
    }

    /// Remplace le contenu de `path` sans changer sa taille, à une date de
    /// modification nouvelle (le cache d'empreintes la regarde).
    fn overwrite_same_size(path: &Path, bytes: &[u8], secs: u64) {
        std::fs::write(path, bytes).unwrap();
        std::fs::File::options()
            .write(true)
            .open(path)
            .unwrap()
            .set_modified(std::time::UNIX_EPOCH + Duration::from_secs(secs))
            .unwrap();
    }

    // Constats 6, 12 et 14 : un fichier d'une autre liste, de même taille mais
    // d'une autre empreinte, n'est pas « installé » tant qu'aucun marqueur ne
    // le garantit ; le téléchargement le remplace et écrit le marqueur.
    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn a_same_size_file_from_another_list_is_downloaded_again() {
        let files = vec![file("a/one.onnx", b"un"), file("two.bin", b"deux")];
        let dest = tempfile::tempdir().unwrap();
        let dir = dest.path().join("models");
        std::fs::create_dir_all(dir.join("a")).unwrap();
        std::fs::write(dir.join("a/one.onnx"), b"un").unwrap();
        std::fs::write(dir.join("two.bin"), b"DEUX").unwrap();
        assert_eq!(
            status(&dir, &files),
            ModelsStatus::Partial {
                present_bytes: 2,
                total_bytes: 6,
                resumable: false,
            }
        );
        assert_eq!(missing(&dir, &files).0, vec![&files[1]]);
        assert!(!dir.join(MARKER).exists());
        let server = serve(vec![
            ("a/one.onnx".into(), b"un".to_vec()),
            ("two.bin".into(), b"deux".to_vec()),
        ])
        .await;
        let sources = vec![Source::unchecked_for_tests(format!("{server}/ok/{{path}}"))];
        let mut last = (0, 0);
        download(
            &sources,
            &dir,
            &files,
            &AtomicBool::new(false),
            &mut |d, t| last = (d, t),
        )
        .await
        .unwrap();
        // Seul le fichier faux est retéléchargé.
        assert_eq!(last, (4, 4));
        assert_eq!(std::fs::read(dir.join("two.bin")).unwrap(), b"deux");
        assert!(marker_matches(&dir, &files));
        assert_eq!(
            status(&dir, &files),
            ModelsStatus::Installed { total_bytes: 6 }
        );
    }

    // Vérification 789ef9bb (V2) : un fichier gardé qui n'a pas pu être haché
    // (illisible) compte comme présent, mais le marqueur n'est pas écrit après
    // le téléchargement des autres : le prochain statut le rehachera.
    #[cfg(unix)]
    #[tokio::test]
    async fn no_marker_when_a_kept_file_could_not_be_hashed() {
        use std::os::unix::fs::PermissionsExt;
        let files = vec![file("a/one.onnx", b"un"), file("two.bin", b"deux")];
        let dest = tempfile::tempdir().unwrap();
        let dir = dest.path().join("models");
        std::fs::create_dir_all(dir.join("a")).unwrap();
        let kept = dir.join("a/one.onnx");
        std::fs::write(&kept, b"un").unwrap();
        std::fs::set_permissions(&kept, std::fs::Permissions::from_mode(0o000)).unwrap();
        if std::fs::read(&kept).is_ok() {
            // Lancé avec des droits qui ignorent le mode (root) : rien à vérifier.
            return;
        }
        let server = serve(vec![
            ("a/one.onnx".into(), b"un".to_vec()),
            ("two.bin".into(), b"deux".to_vec()),
        ])
        .await;
        let sources = vec![Source::unchecked_for_tests(format!("{server}/ok/{{path}}"))];
        download(
            &sources,
            &dir,
            &files,
            &AtomicBool::new(false),
            &mut |_, _| {},
        )
        .await
        .unwrap();
        assert_eq!(std::fs::read(dir.join("two.bin")).unwrap(), b"deux");
        assert!(!dir.join(MARKER).exists());
        std::fs::set_permissions(&kept, std::fs::Permissions::from_mode(0o644)).unwrap();
    }

    // Marqueur égal : tailles seulement, sans rehachage. Marqueur absent ou
    // d'une autre liste : rehachage, puis installation depuis un dossier qui
    // remplace le fichier faux. `remove` retire le marqueur avec le reste.
    #[test]
    fn the_marker_spares_the_hashing_until_the_list_changes() {
        let files = vec![file("one.onnx", b"un"), file("two.bin", b"deux")];
        let dest = tempfile::tempdir().unwrap();
        let dir = dest.path().join("models");
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("one.onnx"), b"un").unwrap();
        std::fs::write(dir.join("two.bin"), b"deux").unwrap();
        // Sans marqueur, tout concorde après rehachage : le marqueur est écrit.
        assert_eq!(
            status(&dir, &files),
            ModelsStatus::Installed { total_bytes: 6 }
        );
        assert!(marker_matches(&dir, &files));
        // Contenu changé, taille gardée : le marqueur évite le hachage.
        overwrite_same_size(&dir.join("two.bin"), b"DEUX", 1);
        assert_eq!(
            status(&dir, &files),
            ModelsStatus::Installed { total_bytes: 6 }
        );
        assert!(missing(&dir, &files).0.is_empty());
        // Marqueur d'une autre liste : rehachage, le fichier faux manque.
        let other = vec![file("one.onnx", b"un")];
        write_marker(&dir, &other).unwrap();
        assert!(!marker_matches(&dir, &files));
        assert_eq!(missing(&dir, &files).0, vec![&files[1]]);
        assert_eq!(
            status(&dir, &files),
            ModelsStatus::Partial {
                present_bytes: 2,
                total_bytes: 6,
                resumable: false,
            }
        );
        let source = tempfile::tempdir().unwrap();
        std::fs::write(source.path().join("two.bin"), b"deux").unwrap();
        install_from_dir(
            source.path(),
            &dir,
            &files,
            &AtomicBool::new(false),
            &mut |_, _| {},
        )
        .unwrap();
        assert_eq!(std::fs::read(dir.join("two.bin")).unwrap(), b"deux");
        assert!(marker_matches(&dir, &files));
        // Aucun fichier temporaire laissé par l'écriture du marqueur.
        let mut names: Vec<String> = std::fs::read_dir(&dir)
            .unwrap()
            .map(|e| e.unwrap().file_name().to_string_lossy().into_owned())
            .collect();
        names.sort();
        assert_eq!(names, [MARKER, "one.onnx", "two.bin"]);
        remove(&dir).unwrap();
        assert!(!dir.join(MARKER).exists());
        assert_eq!(
            status(&dir, &files),
            ModelsStatus::Missing { total_bytes: 6 }
        );
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
                total_bytes: 6,
                resumable: false,
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
    fn the_compiled_sources_point_to_the_github_release_then_hugging_face() {
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
        // Puis Hugging Face, en arborescence, à une révision épinglée.
        assert_eq!(sources.len(), 2);
        let hf = sources[1].as_str();
        let revision = hf
            .strip_prefix("https://huggingface.co/WillisBack/syntheo-speech-models/resolve/")
            .and_then(|rest| rest.strip_suffix("/{path}"))
            .expect("gabarit Hugging Face");
        assert!(
            revision.len() == 40 && revision.bytes().all(|b| b.is_ascii_hexdigit()),
            "révision épinglée : {revision}"
        );
        assert_eq!(
            sources[1].url_for("diar/nemotron3_diar_v3.onnx"),
            format!(
                "https://huggingface.co/WillisBack/syntheo-speech-models/resolve/{revision}/diar/nemotron3_diar_v3.onnx"
            )
        );
        // Aucun gabarit provisoire parmi les sources.
        assert!(sources.iter().all(|s| !s.as_str().contains('<')));
    }
}
