use std::collections::HashSet;
use std::fmt::Write as _;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::time::{Duration, UNIX_EPOCH};

use crate::error::AudioImportError;
use crate::path::is_uuid;
use crate::runtime::{AudioImportEvent, AudioImportRuntime};
use chrono::{DateTime, Utc};
use sha2::{Digest, Sha256};

mod activity;
mod peaks;
pub use activity::has_speech;
pub use peaks::{AudioPeaks, PEAKS_PER_CHANNEL, cached_peaks, compute_peaks};

const AUDIO_FORMATS: [&str; 3] = ["audio.mp3", "audio.wav", "audio.ogg"];
const AUDIO_ARTIFACTS: [&str; 7] = [
    "audio.mp3",
    "audio.wav",
    "audio.ogg",
    "audio.mp3.tmp",
    "audio.wav.tmp",
    "audio_mic.wav",
    "audio_spk.wav",
];

#[derive(Clone, serde::Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct AudioSourceMetadata {
    pub created_at: Option<String>,
    pub modified_at: Option<String>,
    pub duration_ms: Option<u64>,
}

#[derive(Clone, Debug, PartialEq, Eq, serde::Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct AudioFileMetadata {
    pub filename: String,
    pub content_type: String,
    pub size_bytes: u64,
    pub sha256: String,
}

pub fn exists(session_dir: &Path) -> std::io::Result<bool> {
    AUDIO_FORMATS
        .iter()
        .map(|format| session_dir.join(format))
        .try_fold(false, |acc, path| {
            std::fs::exists(&path).map(|exists| acc || exists)
        })
}

pub fn delete(session_dir: &Path) -> std::io::Result<bool> {
    let recovery_deleted = match std::fs::remove_dir_all(session_dir.join("audio-recovery")) {
        Ok(()) => true,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => false,
        Err(error) => return Err(error),
    };
    let audio_deleted = delete_with(session_dir, |path| std::fs::remove_file(path))?;
    match std::fs::remove_file(session_dir.join(".delete-audio-on-stop")) {
        Err(error) if error.kind() != std::io::ErrorKind::NotFound => return Err(error),
        _ => {}
    }
    Ok(audio_deleted || recovery_deleted)
}

pub fn copy(source_dir: &Path, target_dir: &Path) -> std::io::Result<bool> {
    let Some(source_path) = path(source_dir) else {
        return Ok(false);
    };
    if exists(target_dir)? {
        return Err(std::io::Error::new(
            std::io::ErrorKind::AlreadyExists,
            "audio_target_exists",
        ));
    }

    std::fs::create_dir_all(target_dir)?;
    let Some(filename) = source_path.file_name() else {
        return Err(std::io::Error::other("audio_source_filename_missing"));
    };
    let target_path = target_dir.join(filename);
    if source_path == target_path {
        return Err(std::io::Error::new(
            std::io::ErrorKind::InvalidInput,
            "audio_copy_same_path",
        ));
    }

    // `create_new` refuse tout nom déjà pris, lien cassé compris : `fs::copy`
    // suivrait un tel lien et créerait ou écraserait un fichier hors du coffre.
    let mut source = std::fs::File::open(&source_path)?;
    let mut target = std::fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&target_path)
        .map_err(|error| {
            if error.kind() == std::io::ErrorKind::AlreadyExists {
                std::io::Error::new(std::io::ErrorKind::AlreadyExists, "audio_target_exists")
            } else {
                error
            }
        })?;
    if let Err(error) = std::io::copy(&mut source, &mut target) {
        drop(target);
        let _ = std::fs::remove_file(&target_path);
        return Err(error);
    }
    Ok(true)
}

pub fn path(session_dir: &Path) -> Option<PathBuf> {
    AUDIO_FORMATS
        .iter()
        .map(|format| session_dir.join(format))
        .find(|path| path.exists())
}

pub fn metadata(session_dir: &Path) -> std::io::Result<Option<AudioFileMetadata>> {
    let Some(path) = path(session_dir) else {
        return Ok(None);
    };
    let Some(filename) = path.file_name().and_then(|filename| filename.to_str()) else {
        return Ok(None);
    };

    let content_type = match filename {
        "audio.mp3" => "audio/mpeg",
        "audio.wav" => "audio/wav",
        "audio.ogg" => "audio/ogg",
        _ => return Ok(None),
    };

    let mut file = std::fs::File::open(&path)?;
    let mut hasher = Sha256::new();
    let mut buffer = [0_u8; 64 * 1024];
    let mut size_bytes = 0_u64;

    loop {
        let bytes_read = file.read(&mut buffer)?;
        if bytes_read == 0 {
            break;
        }
        hasher.update(&buffer[..bytes_read]);
        size_bytes = size_bytes
            .checked_add(bytes_read as u64)
            .ok_or_else(|| std::io::Error::other("audio_file_too_large"))?;
    }

    let sha256 = hasher
        .finalize()
        .iter()
        .fold(String::with_capacity(64), |mut output, byte| {
            write!(&mut output, "{byte:02x}").unwrap();
            output
        });

    Ok(Some(AudioFileMetadata {
        filename: filename.to_string(),
        content_type: content_type.to_string(),
        size_bytes,
        sha256,
    }))
}

fn delete_with(
    session_dir: &Path,
    mut remove_file: impl FnMut(&Path) -> std::io::Result<()>,
) -> std::io::Result<bool> {
    let primary_path = path(session_dir);

    for artifact in AUDIO_ARTIFACTS {
        let artifact_path = session_dir.join(artifact);
        if primary_path.as_ref() == Some(&artifact_path) {
            continue;
        }
        if std::fs::exists(&artifact_path)? {
            remove_file(&artifact_path)?;
        }
    }

    let Some(primary_path) = primary_path else {
        return Ok(false);
    };
    remove_file(&primary_path)?;
    Ok(true)
}

pub fn delete_orphaned_expired(
    sessions_dir: &Path,
    known_session_ids: &[String],
    retention_ms: u64,
    now_ms: u64,
) -> std::io::Result<Vec<String>> {
    if !sessions_dir.exists() {
        return Ok(Vec::new());
    }

    let known_session_ids: HashSet<&str> = known_session_ids.iter().map(String::as_str).collect();
    let expires_before_ms = now_ms.saturating_sub(retention_ms);
    let mut deleted = Vec::new();

    delete_orphaned_expired_in_dir(
        sessions_dir,
        &known_session_ids,
        expires_before_ms,
        &mut deleted,
    )?;

    Ok(deleted)
}

pub fn source_metadata(source_path: &Path) -> std::io::Result<AudioSourceMetadata> {
    use syntheo_audio_utils::Source;

    let metadata = std::fs::metadata(source_path)?;
    let created_at = metadata.created().ok().map(system_time_to_iso);
    let modified_at = metadata.modified().ok().map(system_time_to_iso);
    let duration_ms = syntheo_audio_utils::source_from_path(source_path)
        .ok()
        .and_then(|source| source.total_duration())
        .and_then(|duration| u64::try_from(duration.as_millis()).ok());

    Ok(AudioSourceMetadata {
        created_at,
        modified_at,
        duration_ms,
    })
}

fn delete_orphaned_expired_in_dir(
    dir: &Path,
    known_session_ids: &HashSet<&str>,
    expires_before_ms: u64,
    deleted: &mut Vec<String>,
) -> std::io::Result<()> {
    let entries = match std::fs::read_dir(dir) {
        Ok(entries) => entries,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(()),
        Err(error) => return Err(error),
    };

    for entry in entries {
        let entry = entry?;
        let path = entry.path();
        // `file_type` ne suit pas les liens : un lien vers un dossier hors de
        // `sessions` n'est ni parcouru ni purgé.
        if !entry.file_type()?.is_dir() {
            continue;
        }

        let Some(name) = path.file_name().and_then(|name| name.to_str()) else {
            continue;
        };

        if is_uuid(name) {
            if known_session_ids.contains(name) || path.join("_meta.json").exists() {
                continue;
            }

            if orphan_audio_expired(&path, expires_before_ms)? {
                delete(&path)?;
                deleted.push(name.to_string());
            }
            continue;
        }

        delete_orphaned_expired_in_dir(&path, known_session_ids, expires_before_ms, deleted)?;
    }

    Ok(())
}

fn orphan_audio_expired(session_dir: &Path, expires_before_ms: u64) -> std::io::Result<bool> {
    let mut latest_modified_ms = None;
    for artifact in AUDIO_ARTIFACTS.into_iter().chain(["audio-recovery"]) {
        collect_audio_modified(&session_dir.join(artifact), &mut latest_modified_ms)?;
    }
    Ok(latest_modified_ms.is_some_and(|modified_ms| modified_ms <= expires_before_ms))
}

fn collect_audio_modified(path: &Path, latest: &mut Option<u64>) -> std::io::Result<()> {
    let metadata = match std::fs::symlink_metadata(path) {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(()),
        Err(error) => return Err(error),
    };
    if metadata.is_symlink() {
        return Ok(());
    }
    let modified_ms = metadata
        .modified()?
        .duration_since(UNIX_EPOCH)
        .unwrap_or(Duration::ZERO)
        .as_millis()
        .try_into()
        .unwrap_or(u64::MAX);
    *latest = Some(latest.map_or(modified_ms, |value| value.max(modified_ms)));
    if metadata.is_dir() {
        for entry in std::fs::read_dir(path)? {
            collect_audio_modified(&entry?.path(), latest)?;
        }
    }
    Ok(())
}

/// Validates the user's file and returns its original path. The audio is read
/// from where it already lives: nothing is copied into the app's data directory,
/// so no audio ever touches the disk.
pub fn import_to_session(
    runtime: &dyn AudioImportRuntime,
    session_id: &str,
    source_path: &Path,
) -> Result<PathBuf, AudioImportError> {
    runtime.emit(AudioImportEvent::Started {
        session_id: session_id.to_string(),
    });

    let result = validate_import_source(source_path);
    match result {
        Ok(()) => {
            runtime.emit(AudioImportEvent::Completed {
                session_id: session_id.to_string(),
            });
            Ok(source_path.to_path_buf())
        }
        Err(error) => {
            runtime.emit(AudioImportEvent::Failed {
                session_id: session_id.to_string(),
                error: error.to_string(),
            });
            Err(error.into())
        }
    }
}

fn validate_import_source(source_path: &Path) -> std::io::Result<()> {
    let metadata = std::fs::metadata(source_path)?;
    if !metadata.is_file() || metadata.len() == 0 {
        return Err(std::io::Error::new(
            std::io::ErrorKind::InvalidInput,
            "audio_source_must_be_a_nonempty_file",
        ));
    }
    Ok(())
}

fn system_time_to_iso(time: std::time::SystemTime) -> String {
    DateTime::<Utc>::from(time).to_rfc3339()
}

#[cfg(test)]
mod tests;
