#[cfg(test)]
mod test_fixtures;

pub mod audio;
pub mod error;
pub mod folder;
pub mod frontmatter;
pub mod json;
pub mod path;
pub mod runtime;
pub mod scan;
pub mod session;
pub mod session_content;
pub mod types;

pub use runtime::*;

pub use error::{Error, Result};
pub use path::{build_session_dir, is_uuid, normalize_folder_path, resolve_path_inside_base};
pub use session::find_session_dir;
pub use types::*;

use std::path::PathBuf;

pub struct FsSyncCore {
    sessions_dir: PathBuf,
}

impl FsSyncCore {
    pub fn new(base_dir: PathBuf) -> Self {
        let sessions_dir = base_dir.join("sessions");
        Self { sessions_dir }
    }

    pub fn list_folders(&self) -> Result<ListFoldersResult> {
        let mut result = ListFoldersResult {
            folders: std::collections::HashMap::new(),
            session_folder_map: std::collections::HashMap::new(),
        };

        if !self.sessions_dir.exists() {
            return Ok(result);
        }

        folder::scan_directory_recursive(&self.sessions_dir, "", &mut result);

        Ok(result)
    }

    pub fn move_session(
        &self,
        session_id: &str,
        from_folder_path: &str,
        target_folder_path: &str,
    ) -> Result<MoveSessionResult> {
        let from_folder_path = normalize_folder_path(from_folder_path)?;
        let target_folder_path = normalize_folder_path(target_folder_path)?;

        if from_folder_path == target_folder_path {
            return Err(Error::Path("session_move_noop".into()));
        }

        let source = build_session_dir(&self.sessions_dir, &from_folder_path, session_id)?;
        if !source.exists() {
            return Err(Error::Path("session_source_missing".into()));
        }

        let target = build_session_dir(&self.sessions_dir, &target_folder_path, session_id)?;
        if target.exists() {
            return Err(Error::Path("session_target_exists".into()));
        }

        // Issue 426 : ni la session déplacée ni sa destination ne doivent se
        // trouver, une fois les liens résolus, hors du dossier des sessions.
        let source = self.resolve_entry(&source)?;
        let target = self.resolve_entry(&target)?;
        if let Some(parent) = target.parent() {
            std::fs::create_dir_all(parent)?;
        }
        std::fs::rename(&source, &target)?;

        tracing::info!(
            "Moved session {} from {:?} to {:?}",
            session_id,
            source,
            target
        );

        Ok(MoveSessionResult {
            session_id: session_id.to_string(),
            folder_id: target_folder_path,
        })
    }

    pub fn create_folder(&self, folder_path: &str) -> Result<()> {
        let folder_path = normalize_folder_path(folder_path)?;
        let folder = self.sessions_dir.join(folder_path);

        if folder.exists() {
            return Ok(());
        }

        std::fs::create_dir_all(&folder)?;
        tracing::info!("Created folder: {:?}", folder);
        Ok(())
    }

    pub fn rename_folder(&self, old_path: &str, new_path: &str) -> Result<RenameFolderResult> {
        let old_path = normalize_folder_path(old_path)?;
        let new_path = normalize_folder_path(new_path)?;

        if old_path.is_empty() || new_path.is_empty() {
            return Err(Error::Path("folder_rename_root_not_allowed".into()));
        }
        if old_path == new_path {
            return Err(Error::Path("folder_rename_noop".into()));
        }

        let source = self.sessions_dir.join(&old_path);
        let target = self.sessions_dir.join(&new_path);

        if !source.exists() {
            return Err(Error::Path("folder_source_missing".into()));
        }

        if target.exists() {
            return Err(Error::Path("folder_target_exists".into()));
        }

        // Issue 426 : un dossier lié se renomme (le lien bouge), mais on ne
        // déplace rien vers ou depuis un dossier situé hors du coffre.
        let source = self.resolve_entry(&source)?;
        let target = self.resolve_entry(&target)?;
        if let Some(parent) = target.parent() {
            std::fs::create_dir_all(parent)?;
        }

        std::fs::rename(&source, &target)?;
        tracing::info!("Renamed folder from {:?} to {:?}", source, target);

        let mut updates = Vec::new();
        folder::collect_session_updates(&self.sessions_dir, &new_path, &mut updates);
        updates.sort_by(|a, b| a.session_id.cmp(&b.session_id));

        Ok(RenameFolderResult { updates })
    }

    pub fn delete_folder(&self, folder_path: &str) -> Result<()> {
        let folder_path = normalize_folder_path(folder_path)?;
        if folder_path.is_empty() {
            return Err(Error::Path("folder_delete_root_not_allowed".into()));
        }
        let folder = self.sessions_dir.join(folder_path);

        if !folder.exists() {
            return Ok(());
        }

        // Issue 426 : un lien se supprime lui-même, mais on ne descend jamais
        // dans un dossier hors du coffre pour effacer son contenu.
        let resolved = self.resolve_entry(&folder)?;

        if folder::contains_sessions(&self.sessions_dir, &folder)? {
            return Err(Error::Path(
                "Cannot delete folder containing sessions. Move or delete sessions first."
                    .to_string(),
            ));
        }

        std::fs::remove_dir_all(&resolved)?;
        tracing::info!("Deleted folder: {:?}", folder);
        Ok(())
    }

    /// Emplacement réel d'une entrée à supprimer ou à déplacer, refusé s'il
    /// sort du dossier des sessions (voir `session_tree::resolve_session_entry`).
    fn resolve_entry(&self, path: &std::path::Path) -> Result<PathBuf> {
        Ok(syntheo_storage::session_tree::resolve_session_entry(
            &self.sessions_dir,
            path,
        )?)
    }

    pub fn attachment_save(
        &self,
        session_id: &str,
        data: &[u8],
        filename: &str,
    ) -> Result<AttachmentSaveResult> {
        let session_dir = self.resolve_session_dir(session_id)?;
        let attachments_dir = session_dir.join("attachments");

        std::fs::create_dir_all(&attachments_dir)?;

        let safe_filename = sanitize_filename(filename)?;
        let (file_path, final_filename) =
            write_unique_file(&attachments_dir, &safe_filename, data)?;

        Ok(AttachmentSaveResult {
            path: file_path.to_string_lossy().to_string(),
            attachment_id: final_filename,
        })
    }

    pub fn attachment_list(&self, session_id: &str) -> Result<Vec<AttachmentInfo>> {
        let session_dir = self.resolve_session_dir(session_id)?;
        let attachments_dir = session_dir.join("attachments");
        list_named_files(&attachments_dir)
    }

    pub fn attachment_read(&self, session_id: &str, attachment_id: &str) -> Result<Vec<u8>> {
        let session_dir = self.resolve_session_dir(session_id)?;
        let attachments_dir = session_dir.join("attachments");
        let safe_attachment_id = sanitize_filename(attachment_id)?;

        read_under(&attachments_dir, &safe_attachment_id)
    }

    pub fn attachment_remove(&self, session_id: &str, attachment_id: &str) -> Result<()> {
        let session_dir = self.resolve_session_dir(session_id)?;
        let attachments_dir = session_dir.join("attachments");
        remove_named_file(&attachments_dir, attachment_id)
    }

    pub fn folder_attachment_save(
        &self,
        folder_path: &str,
        data: &[u8],
        filename: &str,
    ) -> Result<AttachmentSaveResult> {
        let materials_dir = self.resolve_folder_materials_dir(folder_path)?;
        std::fs::create_dir_all(&materials_dir)?;

        let safe_filename = sanitize_filename(filename)?;
        let (file_path, final_filename) = write_unique_file(&materials_dir, &safe_filename, data)?;

        Ok(AttachmentSaveResult {
            path: file_path.to_string_lossy().to_string(),
            attachment_id: final_filename,
        })
    }

    pub fn folder_attachment_list(&self, folder_path: &str) -> Result<Vec<AttachmentInfo>> {
        let materials_dir = self.resolve_folder_materials_dir(folder_path)?;
        list_named_files(&materials_dir)
    }

    pub fn folder_attachment_read(
        &self,
        folder_path: &str,
        attachment_id: &str,
    ) -> Result<Vec<u8>> {
        let materials_dir = self.resolve_folder_materials_dir(folder_path)?;
        let safe_attachment_id = sanitize_filename(attachment_id)?;

        read_under(&materials_dir, &safe_attachment_id)
    }

    pub fn folder_attachment_remove(&self, folder_path: &str, attachment_id: &str) -> Result<()> {
        let materials_dir = self.resolve_folder_materials_dir(folder_path)?;
        remove_named_file(&materials_dir, attachment_id)
    }

    pub fn resolve_session_dir(&self, session_id: &str) -> Result<PathBuf> {
        find_session_dir(&self.sessions_dir, session_id)
    }

    fn resolve_folder_materials_dir(&self, folder_path: &str) -> Result<PathBuf> {
        let folder_path = normalize_folder_path(folder_path)?;
        if folder_path.is_empty() {
            return Err(Error::Path("folder_materials_root_not_allowed".into()));
        }

        Ok(self.sessions_dir.join(folder_path).join("materials"))
    }
}

fn list_named_files(dir: &std::path::Path) -> Result<Vec<AttachmentInfo>> {
    let mut attachments = Vec::new();

    let entries = match std::fs::read_dir(dir) {
        Ok(entries) => entries,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(attachments),
        Err(e) => return Err(e.into()),
    };

    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_file() {
            continue;
        }

        let filename = match path.file_name().and_then(|s| s.to_str()) {
            Some(name) => name.to_string(),
            None => continue,
        };

        let extension = path
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("")
            .to_string();

        let modified_at = entry
            .metadata()
            .and_then(|m| m.modified())
            .map(|t| {
                chrono::DateTime::<chrono::Utc>::from(t)
                    .to_rfc3339_opts(chrono::SecondsFormat::Millis, true)
            })
            .unwrap_or_default();

        attachments.push(AttachmentInfo {
            attachment_id: filename,
            path: path.to_string_lossy().to_string(),
            extension,
            modified_at,
        });
    }

    Ok(attachments)
}

fn remove_named_file(dir: &std::path::Path, attachment_id: &str) -> Result<()> {
    let entries = match std::fs::read_dir(dir) {
        Ok(entries) => entries,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(()),
        Err(e) => return Err(e.into()),
    };

    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_file() {
            continue;
        }

        let filename = match path.file_name().and_then(|s| s.to_str()) {
            Some(name) => name,
            None => continue,
        };

        if filename == attachment_id {
            std::fs::remove_file(&path)?;
            return Ok(());
        }
    }

    Ok(())
}

/// Garantit, au point d'accès, que `name` reste sous `dir` (voir
/// `syntheo_storage::safe_path::join_under_base`).
fn join_under(dir: &std::path::Path, name: &str) -> Result<PathBuf> {
    syntheo_storage::safe_path::join_under_base(dir, name)
        .map_err(|error| Error::from(std::io::Error::from(error)))
}

/// Lit `dir/name` : le chemin canonique est contrôlé puis ouvert sans suivre
/// de lien, pour que le contrôle et la lecture portent sur le même fichier
/// (issue 428).
fn read_under(dir: &std::path::Path, name: &str) -> Result<Vec<u8>> {
    use std::io::Read;

    let mut file = syntheo_storage::safe_path::open_under_base(
        dir,
        name,
        std::fs::OpenOptions::new().read(true),
    )
    .map_err(|error| Error::from(std::io::Error::from(error)))?;
    let mut data = Vec::new();
    file.read_to_end(&mut data)?;
    Ok(data)
}

fn sanitize_filename(filename: &str) -> Result<String> {
    let path = std::path::Path::new(filename);

    let clean_name = path.file_name().and_then(|n| n.to_str()).ok_or_else(|| {
        Error::from(std::io::Error::new(
            std::io::ErrorKind::InvalidInput,
            "Invalid filename",
        ))
    })?;

    if clean_name.is_empty() || clean_name.contains(['/', '\\', '\0']) {
        return Err(Error::from(std::io::Error::new(
            std::io::ErrorKind::InvalidInput,
            "Invalid filename characters",
        )));
    }

    Ok(clean_name.to_string())
}

fn write_unique_file(
    dir: &std::path::Path,
    filename: &str,
    data: &[u8],
) -> Result<(PathBuf, String)> {
    use std::io::Write;

    write_unique_file_with(dir, filename, data, |file, bytes| file.write_all(bytes))
}

fn write_unique_file_with(
    dir: &std::path::Path,
    filename: &str,
    data: &[u8],
    mut write_data: impl FnMut(&mut std::fs::File, &[u8]) -> std::io::Result<()>,
) -> Result<(PathBuf, String)> {
    use std::fs::OpenOptions;

    let path = std::path::Path::new(filename);
    let stem = path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or(filename);
    let extension = path.extension().and_then(|e| e.to_str());

    let mut counter = 0;
    loop {
        let candidate_filename = if counter == 0 {
            filename.to_string()
        } else {
            match extension {
                Some(ext) => format!("{} {}.{}", stem, counter, ext),
                None => format!("{} {}", stem, counter),
            }
        };

        let candidate_path = join_under(dir, &candidate_filename)?;

        // `create_new` refuse déjà un nom pris, lien compris ; `open_no_follow`
        // garde la même ouverture que les autres écritures du coffre.
        match syntheo_storage::safe_path::open_no_follow(
            &candidate_path,
            OpenOptions::new().write(true).create_new(true),
        ) {
            Ok(mut file) => {
                if let Err(error) = write_data(&mut file, data) {
                    drop(file);
                    if let Err(cleanup_error) = std::fs::remove_file(&candidate_path) {
                        tracing::warn!(
                            error = %cleanup_error,
                            "Failed to remove partially written attachment"
                        );
                    }
                    return Err(error.into());
                }
                return Ok((candidate_path, candidate_filename));
            }
            Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => {
                counter += 1;
                continue;
            }
            Err(e) => return Err(e.into()),
        }
    }
}

#[cfg(test)]
mod tests;
