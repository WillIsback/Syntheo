//! Marque « venu d'internet » (Mark-of-the-Web) sur les pièces jointes
//! enregistrées dans le coffre (issue 654, constat SEC-19). Windows s'en sert
//! pour SmartScreen et le mode protégé d'Office : sans elle, un fichier reçu
//! par une réunion ou un courriel puis copié ici paraîtrait local et sûr.
//! L'origine réelle des octets étant inconnue (ils arrivent de l'interface),
//! la zone Internet (3) est posée, au mieux : un volume sans flux NTFS
//! alternatifs (FAT, exFAT, certains partages) refuse l'écriture, qui est
//! alors journalisée sans faire échouer l'enregistrement.

use std::path::{Path, PathBuf};

/// Contenu du flux `Zone.Identifier` : zone Internet.
#[cfg_attr(not(windows), allow(dead_code))]
pub(crate) const ZONE_IDENTIFIER: &str = "[ZoneTransfer]\r\nZoneId=3\r\n";

/// Chemin du flux NTFS alternatif `Zone.Identifier` de `path`.
#[cfg_attr(not(windows), allow(dead_code))]
pub(crate) fn stream_path(path: &Path) -> PathBuf {
    let mut stream = path.as_os_str().to_owned();
    stream.push(":Zone.Identifier");
    PathBuf::from(stream)
}

/// Pose la marque sous Windows ; sans effet ailleurs.
pub(crate) fn mark(path: &Path) {
    #[cfg(windows)]
    if let Err(error) = std::fs::write(stream_path(path), ZONE_IDENTIFIER) {
        tracing::warn!(%error, "attachment_mark_of_the_web_failed");
    }
    #[cfg(not(windows))]
    let _ = path;
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_stream_names_the_internet_zone() {
        assert_eq!(
            stream_path(Path::new(r"C:\Vault\attachments\facture.pdf")),
            PathBuf::from(r"C:\Vault\attachments\facture.pdf:Zone.Identifier")
        );
        assert_eq!(ZONE_IDENTIFIER, "[ZoneTransfer]\r\nZoneId=3\r\n");
    }

    // Hors Windows, l'enregistrement ne crée aucun fichier en plus.
    #[cfg(not(windows))]
    #[test]
    fn nothing_is_written_outside_windows() {
        let dir = assert_fs::TempDir::new().unwrap();
        let file = dir.path().join("note.pdf");
        std::fs::write(&file, b"x").unwrap();
        mark(&file);
        assert_eq!(std::fs::read_dir(dir.path()).unwrap().count(), 1);
    }
}
