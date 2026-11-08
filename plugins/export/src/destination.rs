// Emplacements où l'export peut écrire (issue 422) : un fichier neuf, directement
// dans un dossier d'export configuré (ou Téléchargements), ou le chemin que la
// personne vient de choisir dans la boîte de dialogue native ouverte par Rust.
use std::collections::HashSet;
use std::ffi::OsStr;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, MutexGuard, PoisonError};

pub(crate) const PDF_EXTENSIONS: &[&str] = &["pdf"];
pub(crate) const TEXT_EXTENSIONS: &[&str] = &["md", "txt", "org"];

// Chemins rendus par la boîte de dialogue « Enregistrer sous », chacun valable
// pour une seule écriture.
#[derive(Default)]
pub struct ChosenExportPaths(Mutex<HashSet<PathBuf>>);

impl ChosenExportPaths {
    pub fn remember(&self, path: PathBuf) {
        self.lock().insert(path);
    }

    fn take(&self, path: &Path) -> bool {
        self.lock().remove(path)
    }

    fn lock(&self) -> MutexGuard<'_, HashSet<PathBuf>> {
        self.0.lock().unwrap_or_else(PoisonError::into_inner)
    }
}

#[derive(Debug, PartialEq, Eq, Clone, Copy)]
pub(crate) enum Destination {
    // Choisi par la personne : elle a confirmé un éventuel remplacement.
    Chosen,
    // Nom horodaté dans le dossier d'export : jamais d'écrasement.
    InFolder,
}

pub(crate) fn authorize(
    path: &Path,
    extensions: &[&str],
    folders: &[PathBuf],
    chosen: &ChosenExportPaths,
) -> Result<Destination, String> {
    if chosen.take(path) {
        return Ok(Destination::Chosen);
    }
    let forbidden = || format!("export destination not allowed: {}", path.display());
    let (Some(parent), Some(name)) = (path.parent(), path.file_name()) else {
        return Err(forbidden());
    };
    let has_export_extension = Path::new(name)
        .extension()
        .and_then(OsStr::to_str)
        .is_some_and(|extension| {
            extensions
                .iter()
                .any(|allowed| extension.eq_ignore_ascii_case(allowed))
        });
    if !path.is_absolute() || !has_export_extension {
        return Err(forbidden());
    }
    // Le dossier d'export configuré peut ne pas encore exister.
    if let Some(folder) = folders.iter().find(|folder| folder.as_path() == parent) {
        let _ = std::fs::create_dir_all(folder);
    }
    let Ok(parent) = parent.canonicalize() else {
        return Err(forbidden());
    };
    let inside = folders
        .iter()
        .filter_map(|folder| folder.canonicalize().ok())
        .any(|folder| folder == parent);
    if inside {
        Ok(Destination::InFolder)
    } else {
        Err(forbidden())
    }
}

// Un fichier du dossier d'export est toujours créé, jamais remplacé : un lien
// ou un fichier existant à ce nom est refusé.
pub(crate) fn write_export(
    path: &Path,
    destination: Destination,
    content: &[u8],
) -> std::io::Result<()> {
    let mut options = std::fs::OpenOptions::new();
    options.write(true);
    match destination {
        Destination::InFolder => options.create_new(true),
        Destination::Chosen => options.create(true).truncate(true),
    };
    let mut file = options.open(path)?;
    let written = file.write_all(content).and_then(|()| file.sync_all());
    if written.is_err() && destination == Destination::InFolder {
        drop(file);
        let _ = std::fs::remove_file(path);
    }
    written
}

// Dossiers d'export enregistrés dans les paramètres, y compris dans les
// anciens documents de réglages encore lus par l'interface.
const EXPORT_FOLDERS_SQL: &str = "
WITH setting_rows AS (
  SELECT id, CASE WHEN json_valid(value_json) THEN value_json END AS value_json
  FROM (
    SELECT id, value_json FROM app_settings
    UNION ALL
    SELECT id, value_json FROM synced_preferences
  )
  WHERE id IN ('export_directory', 'legacy_settings_document', 'legacy_main_values_document')
),
folders AS (
  SELECT CASE id
    WHEN 'export_directory' THEN json_extract(value_json, '$')
    WHEN 'legacy_settings_document' THEN json_extract(value_json, '$.general.export_directory')
    ELSE json_extract(value_json, '$.export_directory')
  END AS folder
  FROM setting_rows
)
SELECT folder FROM folders WHERE typeof(folder) = 'text' AND folder != ''
";

pub(crate) async fn configured_export_folders(
    pool: &sqlx::SqlitePool,
) -> Result<Vec<PathBuf>, sqlx::Error> {
    let folders: Vec<String> = sqlx::query_scalar(EXPORT_FOLDERS_SQL)
        .fetch_all(pool)
        .await?;
    Ok(folders.into_iter().map(PathBuf::from).collect())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn folder() -> (tempfile::TempDir, PathBuf) {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().canonicalize().unwrap();
        (dir, path)
    }

    #[test]
    fn new_export_file_in_the_export_folder_is_allowed() {
        let (_dir, exports) = folder();
        let path = exports.join("Project review_2026.md");
        let chosen = ChosenExportPaths::default();

        let destination = authorize(
            &path,
            TEXT_EXTENSIONS,
            std::slice::from_ref(&exports),
            &chosen,
        )
        .unwrap();

        assert_eq!(destination, Destination::InFolder);
        write_export(&path, destination, b"# Notes").unwrap();
        assert_eq!(std::fs::read(&path).unwrap(), b"# Notes");
    }

    #[test]
    fn missing_export_folder_is_created() {
        let (_dir, root) = folder();
        let exports = root.join("Comptes rendus");
        let path = exports.join("review.pdf");

        let destination = authorize(
            &path,
            PDF_EXTENSIONS,
            std::slice::from_ref(&exports),
            &ChosenExportPaths::default(),
        )
        .unwrap();

        assert_eq!(destination, Destination::InFolder);
        assert!(exports.is_dir());
    }

    #[test]
    fn path_outside_the_export_folders_is_refused() {
        let (_exports_dir, exports) = folder();
        let (_home_dir, home) = folder();
        let chosen = ChosenExportPaths::default();

        for path in [
            home.join("notes.md"),
            exports.join("sub").join("notes.md"),
            exports.join("..").join("notes.md"),
        ] {
            assert!(
                authorize(
                    &path,
                    TEXT_EXTENSIONS,
                    std::slice::from_ref(&exports),
                    &chosen
                )
                .is_err(),
                "{} was allowed",
                path.display()
            );
        }
        assert!(!home.join("notes.md").exists());
    }

    #[test]
    fn non_export_extension_or_relative_path_is_refused() {
        let (_dir, exports) = folder();
        let chosen = ChosenExportPaths::default();
        for path in [
            exports.join("authorized_keys"),
            exports.join(".bashrc"),
            exports.join("run.sh"),
            exports.join("review.pdf"),
            PathBuf::from("review.md"),
        ] {
            assert!(
                authorize(
                    &path,
                    TEXT_EXTENSIONS,
                    std::slice::from_ref(&exports),
                    &chosen
                )
                .is_err(),
                "{} was allowed",
                path.display()
            );
        }
    }

    #[cfg(unix)]
    #[test]
    fn folder_reached_through_a_link_is_refused() {
        let (_exports_dir, exports) = folder();
        let (_home_dir, home) = folder();
        let link = exports.join("ailleurs");
        std::os::unix::fs::symlink(&home, &link).unwrap();

        let result = authorize(
            &link.join("notes.md"),
            TEXT_EXTENSIONS,
            &[exports],
            &ChosenExportPaths::default(),
        );

        assert!(result.is_err());
    }

    #[test]
    fn existing_file_in_the_export_folder_is_never_replaced() {
        let (_dir, exports) = folder();
        let path = exports.join("review.md");
        std::fs::write(&path, "kept").unwrap();

        let destination = authorize(
            &path,
            TEXT_EXTENSIONS,
            &[exports],
            &ChosenExportPaths::default(),
        )
        .unwrap();

        assert!(write_export(&path, destination, b"new").is_err());
        assert_eq!(std::fs::read_to_string(&path).unwrap(), "kept");
    }

    #[cfg(unix)]
    #[test]
    fn link_named_like_the_export_is_not_followed() {
        let (_exports_dir, exports) = folder();
        let (_home_dir, home) = folder();
        let target = home.join("victim.md");
        let path = exports.join("review.md");
        std::os::unix::fs::symlink(&target, &path).unwrap();

        let destination = authorize(
            &path,
            TEXT_EXTENSIONS,
            &[exports],
            &ChosenExportPaths::default(),
        )
        .unwrap();

        assert!(write_export(&path, destination, b"new").is_err());
        assert!(!target.exists());
    }

    #[test]
    fn path_chosen_in_the_dialog_is_allowed_once_and_may_replace() {
        let (_exports_dir, exports) = folder();
        let (_home_dir, home) = folder();
        let path = home.join("Rapport final");
        std::fs::write(&path, "old").unwrap();
        let chosen = ChosenExportPaths::default();
        chosen.remember(path.clone());

        let destination = authorize(
            &path,
            PDF_EXTENSIONS,
            std::slice::from_ref(&exports),
            &chosen,
        )
        .unwrap();
        assert_eq!(destination, Destination::Chosen);
        write_export(&path, destination, b"new").unwrap();
        assert_eq!(std::fs::read_to_string(&path).unwrap(), "new");

        assert!(authorize(&path, PDF_EXTENSIONS, &[exports], &chosen).is_err());
    }

    async fn settings_pool(rows: &[(&str, &str, &str)]) -> sqlx::SqlitePool {
        let pool = sqlx::sqlite::SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .unwrap();
        sqlx::query(
            "CREATE TABLE app_settings (id TEXT PRIMARY KEY, value_json TEXT NOT NULL);
             CREATE TABLE synced_preferences (id TEXT PRIMARY KEY, value_json TEXT NOT NULL);",
        )
        .execute(&pool)
        .await
        .unwrap();
        for (table, id, value_json) in rows {
            let insert = match *table {
                "app_settings" => "INSERT INTO app_settings (id, value_json) VALUES (?, ?)",
                _ => "INSERT INTO synced_preferences (id, value_json) VALUES (?, ?)",
            };
            sqlx::query(insert)
                .bind(id)
                .bind(value_json)
                .execute(&pool)
                .await
                .unwrap();
        }
        pool
    }

    #[tokio::test]
    async fn export_folders_are_read_from_current_and_legacy_settings() {
        let pool = settings_pool(&[
            (
                "app_settings",
                "export_directory",
                r#""/Users/anne/Exports""#,
            ),
            (
                "app_settings",
                "legacy_settings_document",
                r#"{"general":{"export_directory":"/Users/anne/Ancien"}}"#,
            ),
            (
                "app_settings",
                "legacy_main_values_document",
                r#"{"export_directory":""}"#,
            ),
            ("app_settings", "other", r#""/tmp""#),
            ("synced_preferences", "export_directory", "{"),
        ])
        .await;

        let mut folders = configured_export_folders(&pool).await.unwrap();
        folders.sort();

        assert_eq!(
            folders,
            vec![
                PathBuf::from("/Users/anne/Ancien"),
                PathBuf::from("/Users/anne/Exports"),
            ]
        );
    }

    #[tokio::test]
    async fn no_export_folder_setting_yields_no_folder() {
        let pool = settings_pool(&[("app_settings", "export_directory", r#""""#)]).await;

        assert!(configured_export_folders(&pool).await.unwrap().is_empty());
    }
}
