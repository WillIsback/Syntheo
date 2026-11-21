use std::sync::Arc;

use syntheo_db_core::Db;

const DB_FILENAME: &str = "app.db";
const DB_RESET_MARKER: &str = "app.db.reset-requested";
pub(crate) const STABLE_BUNDLE_ID: &str = syntheo_brand::STABLE_BUNDLE_ID;
pub(crate) const NIGHTLY_BUNDLE_ID: &str = "com.syntheo.nightly";
const DB_OPEN_LOCK_RETRIES: u32 = 12;
const DB_OPEN_LOCK_RETRY_DELAY: std::time::Duration = std::time::Duration::from_secs(5);

pub async fn open_desktop_db(identifier: &str) -> Result<Arc<Db>, String> {
    let dir = desktop_db_dir(identifier)
        .ok_or_else(|| "application data directory is unavailable".to_string())?;
    tokio::fs::create_dir_all(&dir)
        .await
        .map_err(|error| format!("failed to create application data directory: {error}"))?;

    match apply_pending_database_reset(&dir) {
        Ok(Some(backup)) => eprintln!(
            "moved the application database aside for a fresh start: {}",
            backup.display()
        ),
        Ok(None) => {}
        Err(error) => eprintln!("failed to reset the application database: {error}"),
    }
    purge_old_database_backups(&dir, unix_now());
    let db_path = dir.join(DB_FILENAME);

    // During an update relaunch the previous process can hold the database for
    // several seconds while it flushes and exits; retry instead of failing the
    // whole startup on a transient lock.
    let mut attempts = 0u32;
    let db = loop {
        match tauri_plugin_db::open_app_db_unmigrated(Some(&db_path)).await {
            Ok(db) => break db,
            Err(error) if attempts < DB_OPEN_LOCK_RETRIES && is_transient_lock_error(&error) => {
                attempts += 1;
                eprintln!(
                    "application database is locked by another process; \
                     retrying ({attempts}/{DB_OPEN_LOCK_RETRIES}): {error}"
                );
                tokio::time::sleep(DB_OPEN_LOCK_RETRY_DELAY).await;
            }
            Err(error) => {
                return Err(format!("failed to open application database: {error}"));
            }
        }
    };

    // La base et ses fichiers WAL viennent d'être créés : mêmes droits que le
    // reste du dossier (issue 653).
    crate::startup::harden_data_dir_permissions(&dir);
    Ok(Arc::new(db))
}

fn apply_pending_database_reset(
    dir: &std::path::Path,
) -> Result<Option<std::path::PathBuf>, String> {
    let marker = dir.join(DB_RESET_MARKER);
    if !marker.is_file() {
        return Ok(None);
    }
    let stamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|elapsed| elapsed.as_secs())
        .unwrap_or(0);
    let backup = dir.join(format!("{DB_FILENAME}.{stamp}.bak"));
    for suffix in ["", "-wal", "-shm"] {
        let source = dir.join(format!("{DB_FILENAME}{suffix}"));
        if !source.exists() {
            continue;
        }
        let target = dir.join(format!("{DB_FILENAME}.{stamp}.bak{suffix}"));
        std::fs::rename(&source, &target)
            .map_err(|error| format!("failed to move {} aside: {error}", source.display()))?;
    }
    std::fs::remove_file(&marker)
        .map_err(|error| format!("failed to clear the database reset marker: {error}"))?;
    Ok(Some(backup))
}

/// Les sauvegardes laissées par une réinitialisation contiennent toutes les
/// notes : gardées 30 jours, puis supprimées, sauf la plus récente
/// (issue 653).
const DATABASE_BACKUP_RETENTION_SECS: u64 = 30 * 24 * 60 * 60;

fn unix_now() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|elapsed| elapsed.as_secs())
        .unwrap_or(0)
}

/// Horodatage d'un fichier `app.db.<horodatage>.bak[-wal|-shm]`.
fn backup_stamp(name: &str) -> Option<u64> {
    let rest = name.strip_prefix(&format!("{DB_FILENAME}."))?;
    let (stamp, suffix) = rest.split_once(".bak")?;
    if !["", "-wal", "-shm"].contains(&suffix) {
        return None;
    }
    stamp.parse().ok()
}

pub(crate) fn purge_old_database_backups(dir: &std::path::Path, now: u64) {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };
    let backups: Vec<(u64, std::path::PathBuf)> = entries
        .flatten()
        .filter_map(|entry| {
            let name = entry.file_name();
            backup_stamp(&name.to_string_lossy()).map(|stamp| (stamp, entry.path()))
        })
        .collect();
    let newest = backups.iter().map(|(stamp, _)| *stamp).max();
    for (stamp, path) in backups {
        if Some(stamp) != newest
            && now.saturating_sub(stamp) > DATABASE_BACKUP_RETENTION_SECS
            && let Err(error) = std::fs::remove_file(&path)
        {
            eprintln!(
                "failed to remove old database backup {}: {error}",
                path.display()
            );
        }
    }
}

pub fn is_transient_lock_error(error: &impl std::fmt::Display) -> bool {
    let message = error.to_string();
    message.contains("database is locked") || message.contains("database table is locked")
}

// Matches MigrateError::SchemaFromNewerApp, which reaches startup as a string
// after crossing the tauri plugin setup boundary.
// Only consulted on macOS (native startup alert); allow dead code elsewhere.
#[cfg_attr(not(target_os = "macos"), allow(dead_code))]
pub fn is_newer_schema_error(error: &impl std::fmt::Display) -> bool {
    error
        .to_string()
        .contains("created by a newer version of Syntheo")
}
// Nightly previews run against the user's real notes, so it opens stable's
// database while keeping its own settings, store, and sign-in. db-migrate keeps
// the two builds compatible: stable tolerates the additive migrations a newer
// Nightly applies and refuses the file after a "-- breaking" one until a stable
// release includes that migration.
pub(crate) fn shared_database_peer(identifier: &str) -> Option<&'static str> {
    match identifier {
        NIGHTLY_BUNDLE_ID => Some(STABLE_BUNDLE_ID),
        STABLE_BUNDLE_ID => Some(NIGHTLY_BUNDLE_ID),
        _ => None,
    }
}

fn database_identifier(identifier: &str) -> &str {
    if identifier == NIGHTLY_BUNDLE_ID {
        STABLE_BUNDLE_ID
    } else {
        identifier
    }
}

pub(crate) fn desktop_db_dir(identifier: &str) -> Option<std::path::PathBuf> {
    let identifier = database_identifier(identifier);
    let data_dir = dirs::data_dir()?;
    let default_dir = syntheo_storage::global::compute_default_base(identifier)?;
    let identifier_dir = data_dir.join(identifier);

    if identifier_dir.join(DB_FILENAME).is_file() && !default_dir.join(DB_FILENAME).is_file() {
        Some(identifier_dir)
    } else {
        Some(default_dir)
    }
}

#[cfg(test)]
mod tests {
    // Issue 653 : sauvegardes de plus de 30 jours supprimées, sauf la plus
    // récente.
    #[test]
    fn purges_old_database_backups_but_keeps_the_newest() {
        let dir = std::env::temp_dir().join(format!(
            "syntheo-bak-{}-{}",
            std::process::id(),
            super::unix_now()
        ));
        std::fs::create_dir_all(&dir).unwrap();
        let day = 24 * 60 * 60;
        let now = 1_000 * day;
        let old = now - 40 * day;
        let older = now - 90 * day;
        let recent = now - 5 * day;
        let files = [
            format!("app.db.{older}.bak"),
            format!("app.db.{older}.bak-wal"),
            format!("app.db.{old}.bak"),
            format!("app.db.{recent}.bak"),
            format!("app.db.{recent}.bak-shm"),
            "app.db".to_string(),
            "app.db.reset-requested".to_string(),
            "notes.bak".to_string(),
        ];
        for name in &files {
            std::fs::write(dir.join(name), b"x").unwrap();
        }

        super::purge_old_database_backups(&dir, now);

        let left: std::collections::BTreeSet<String> = std::fs::read_dir(&dir)
            .unwrap()
            .map(|entry| entry.unwrap().file_name().to_string_lossy().into_owned())
            .collect();
        assert_eq!(
            left,
            [
                format!("app.db.{recent}.bak"),
                format!("app.db.{recent}.bak-shm"),
                "app.db".to_string(),
                "app.db.reset-requested".to_string(),
                "notes.bak".to_string(),
            ]
            .into_iter()
            .collect()
        );

        // Seule sauvegarde, même ancienne : gardée.
        std::fs::write(dir.join(format!("app.db.{older}.bak")), b"x").unwrap();
        std::fs::remove_file(dir.join(format!("app.db.{recent}.bak"))).unwrap();
        std::fs::remove_file(dir.join(format!("app.db.{recent}.bak-shm"))).unwrap();
        super::purge_old_database_backups(&dir, now);
        assert!(dir.join(format!("app.db.{older}.bak")).exists());
        std::fs::remove_dir_all(dir).unwrap();
    }

    use super::*;

    #[test]
    fn a_reset_marker_moves_the_database_aside_once() {
        let dir = tempfile::tempdir().unwrap();
        for suffix in ["", "-wal", "-shm"] {
            std::fs::write(dir.path().join(format!("{DB_FILENAME}{suffix}")), b"data").unwrap();
        }
        assert_eq!(apply_pending_database_reset(dir.path()).unwrap(), None);
        std::fs::write(dir.path().join(DB_RESET_MARKER), b"").unwrap();

        let backup = apply_pending_database_reset(dir.path())
            .unwrap()
            .expect("database moved aside");

        assert!(backup.is_file());
        assert!(
            backup.with_extension("bak-wal").is_file() || {
                let name = format!("{}-wal", backup.file_name().unwrap().to_string_lossy());
                dir.path().join(name).is_file()
            }
        );
        assert!(!dir.path().join(DB_FILENAME).exists());
        assert!(!dir.path().join(DB_RESET_MARKER).exists());
        assert_eq!(apply_pending_database_reset(dir.path()).unwrap(), None);
    }

    #[test]
    fn startup_error_classifiers_recognize_lock_and_newer_schema_errors() {
        assert!(is_transient_lock_error(
            &"error returned from database: (code: 5) database is locked"
        ));
        assert!(is_transient_lock_error(
            &"error returned from database: (code: 6) database table is locked"
        ));
        assert!(!is_transient_lock_error(
            &"unable to open database file: /tmp/app.db"
        ));

        // Rendered form of MigrateError::SchemaFromNewerApp after crossing the
        // plugin setup boundary as a string.
        assert!(is_newer_schema_error(
            &"plugin db failed: the database was created by a newer version of Syntheo: it requires migration 20260901000000, but this build only includes migrations up to 20260816100100"
        ));
        assert!(!is_newer_schema_error(
            &"unable to open database file: /tmp/app.db"
        ));
    }

    #[test]
    fn only_nightly_and_stable_share_a_database_directory() {
        let db_dir = desktop_db_dir(syntheo_brand::DEV_BUNDLE_ID).unwrap();

        assert!(db_dir.ends_with(syntheo_brand::DEV_BUNDLE_ID));

        assert_eq!(
            desktop_db_dir(NIGHTLY_BUNDLE_ID),
            desktop_db_dir(STABLE_BUNDLE_ID)
        );
        assert!(
            !desktop_db_dir(NIGHTLY_BUNDLE_ID)
                .unwrap()
                .ends_with(NIGHTLY_BUNDLE_ID)
        );

        assert_eq!(
            shared_database_peer(NIGHTLY_BUNDLE_ID),
            Some(STABLE_BUNDLE_ID)
        );
        assert_eq!(
            shared_database_peer(STABLE_BUNDLE_ID),
            Some(NIGHTLY_BUNDLE_ID)
        );
        assert_eq!(shared_database_peer("com.syntheo.staging"), None);
        assert_eq!(shared_database_peer(syntheo_brand::DEV_BUNDLE_ID), None);
    }
}
