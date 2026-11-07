// « Imprimer… » (issue 374) : le compte rendu est écrit dans un PDF
// temporaire, que le lecteur PDF du système ouvre pour l'impression.
//
// - Dossier : `<cache de l'app>/print`, propre à l'utilisateur (jamais le
//   dossier temporaire partagé du système) ; droits 0700 sous Unix.
// - Nom : titre de la note suivi d'un UUID v4, donc non devinable.
// - Nettoyage : le lecteur doit avoir pu ouvrir le fichier avant qu'on le
//   supprime. On efface donc les PDF de plus de `PRINT_FILE_TTL` à chaque
//   impression et quand l'interface le redemande (après ce délai), puis tous
//   les PDF restants au lancement suivant. Un fichier encore verrouillé par
//   le lecteur (Windows) reste en place et part au passage suivant.

use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime};

pub const PRINT_DIR_NAME: &str = "print";
pub const PRINT_FILE_TTL: Duration = Duration::from_secs(10 * 60);

const MAX_TITLE_CHARS: usize = 60;

pub fn print_file_name(title: &str) -> String {
    let safe: String = title
        .chars()
        .filter(|c| c.is_alphanumeric() || matches!(c, ' ' | '-' | '_'))
        .take(MAX_TITLE_CHARS)
        .collect();
    let safe = safe.trim();
    let stem = if safe.is_empty() { "note" } else { safe };
    format!("{stem}-{}.pdf", uuid::Uuid::new_v4())
}

pub fn prepare_print_dir(dir: &Path) -> std::io::Result<()> {
    std::fs::create_dir_all(dir)?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(dir, std::fs::Permissions::from_mode(0o700))?;
    }
    Ok(())
}

pub fn new_print_path(dir: &Path, title: &str) -> PathBuf {
    dir.join(print_file_name(title))
}

// Supprime les PDF du dossier d'impression modifiés il y a au moins
// `min_age`. Les erreurs (dossier absent, fichier verrouillé) sont ignorées :
// le passage suivant réessaiera. Renvoie le nombre de fichiers supprimés.
pub fn cleanup_print_dir(dir: &Path, min_age: Duration, now: SystemTime) -> usize {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return 0;
    };

    let mut removed = 0;
    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().is_none_or(|ext| ext != "pdf") {
            continue;
        }
        let Ok(metadata) = entry.metadata() else {
            continue;
        };
        if !metadata.is_file() {
            continue;
        }
        let old_enough = metadata
            .modified()
            .ok()
            .and_then(|modified| now.duration_since(modified).ok())
            .is_some_and(|age| age >= min_age);
        if (old_enough || min_age.is_zero()) && std::fs::remove_file(&path).is_ok() {
            removed += 1;
        }
    }
    removed
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn file_name_is_unguessable_and_safe() {
        let first = print_file_name("Réunion : budget/2026");
        let second = print_file_name("Réunion : budget/2026");
        assert_ne!(first, second);
        assert!(first.starts_with("Réunion  budget2026-"), "{first}");
        assert!(first.ends_with(".pdf"));
        assert!(!first.contains('/') && !first.contains(':'));
        assert!(print_file_name("../..").starts_with("note-"));
        assert!(print_file_name("").starts_with("note-"));
    }

    #[test]
    fn new_path_stays_in_the_print_dir() {
        let dir = Path::new("/cache/app/print");
        let path = new_print_path(dir, "../../etc/passwd");
        assert_eq!(path.parent(), Some(dir));
    }

    #[test]
    fn prepare_creates_a_private_dir() {
        let root = tempfile::tempdir().unwrap();
        let dir = root.path().join(PRINT_DIR_NAME);
        prepare_print_dir(&dir).unwrap();
        assert!(dir.is_dir());
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let mode = std::fs::metadata(&dir).unwrap().permissions().mode();
            assert_eq!(mode & 0o777, 0o700);
        }
    }

    #[test]
    fn cleanup_removes_only_old_pdfs() {
        let root = tempfile::tempdir().unwrap();
        let dir = root.path();
        let pdf = dir.join("old.pdf");
        let other = dir.join("keep.txt");
        std::fs::write(&pdf, b"%PDF").unwrap();
        std::fs::write(&other, b"x").unwrap();

        let now = SystemTime::now();
        assert_eq!(cleanup_print_dir(dir, PRINT_FILE_TTL, now), 0);
        assert!(pdf.exists(), "a fresh PDF must stay for the reader");

        let later = now + PRINT_FILE_TTL + Duration::from_secs(1);
        assert_eq!(cleanup_print_dir(dir, PRINT_FILE_TTL, later), 1);
        assert!(!pdf.exists());
        assert!(other.exists(), "only PDFs are removed");
    }

    #[test]
    fn cleanup_at_launch_removes_every_pdf() {
        let root = tempfile::tempdir().unwrap();
        let pdf = root.path().join("fresh.pdf");
        std::fs::write(&pdf, b"%PDF").unwrap();
        assert_eq!(
            cleanup_print_dir(root.path(), Duration::ZERO, SystemTime::now()),
            1
        );
        assert!(!pdf.exists());
    }

    #[test]
    fn cleanup_ignores_a_missing_dir() {
        let root = tempfile::tempdir().unwrap();
        let missing = root.path().join("absent");
        assert_eq!(
            cleanup_print_dir(&missing, Duration::ZERO, SystemTime::now()),
            0
        );
    }
}
