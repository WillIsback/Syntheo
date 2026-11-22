// Ce que l'interface peut ouvrir (issue 676) : seulement des pages web en
// http(s), et une adresse électronique simple en `mailto:`, toujours avec le
// programme par défaut du système. Aucun autre schéma : un lien collé ou
// généré ne doit pas pouvoir lancer un gestionnaire de protocole quelconque.

use url::Url;

use crate::{Error, Result};

pub(crate) fn check_openable_url(raw: &str) -> Result<()> {
    let url = Url::parse(raw.trim()).map_err(|_| Error::UrlNotAllowed)?;
    match url.scheme() {
        "http" | "https" if url.host_str().is_some_and(|host| !host.is_empty()) => Ok(()),
        "mailto" if is_plain_address(url.path()) && url.query().is_none() => Ok(()),
        _ => Err(Error::UrlNotAllowed),
    }
}

// Une seule adresse, sans en-têtes ni paramètres (`?subject=`, `&body=`…), ni
// caractère encodé, espace ou caractère de contrôle.
fn is_plain_address(path: &str) -> bool {
    let Some((local, domain)) = path.split_once('@') else {
        return false;
    };
    let allowed = |c: char| c.is_ascii_alphanumeric() || "._+-".contains(c);
    !local.is_empty()
        && domain.contains('.')
        && !domain.starts_with('.')
        && !domain.ends_with('.')
        && local.chars().all(allowed)
        && domain
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || ".-".contains(c))
}

/// Chemin de fichier local, seule forme que l'application accepte d'ouvrir ou
/// de servir (issue 677). Décidé sur la seule chaîne, avant tout accès au
/// système de fichiers, pour ne jamais ouvrir de connexion SMB.
///
/// - Windows : seul un chemin absolu sur un lecteur (`C:\…`, `C:/…`) est
///   accepté. Tout le reste est refusé : chemin réseau (`\\serveur\…`),
///   de périphérique (`\\?\…`, `\\.\…`), d'objet NT (`\??\…`, que les
///   API Win32 transmettent tel quel et qui peut désigner un partage), chemin
///   commençant par une seule barre, relatif ou relatif à un lecteur (`C:x`).
/// - Linux et macOS : refus de deux séparateurs en tête (`//…`, `\\…`).
///
/// Le caractère nul est refusé partout.
pub fn is_local_path(path: &str) -> bool {
    if path.contains('\0') {
        return false;
    }
    #[cfg(windows)]
    {
        use std::path::{Component, Path, Prefix};
        let mut components = Path::new(path).components();
        matches!(
            (components.next(), components.next()),
            (Some(Component::Prefix(prefix)), Some(Component::RootDir))
                if matches!(prefix.kind(), Prefix::Disk(_))
        )
    }
    #[cfg(not(windows))]
    {
        let mut chars = path.chars();
        let is_sep = |c: Option<char>| matches!(c, Some('/' | '\\'));
        !(is_sep(chars.next()) && is_sep(chars.next()))
    }
}

pub(crate) fn check_openable_path(path: &str) -> Result<()> {
    if is_local_path(path) {
        Ok(())
    } else {
        Err(Error::PathNotAllowed)
    }
}

#[cfg(test)]
mod tests {
    use super::{check_openable_path, check_openable_url};

    #[test]
    fn network_and_device_paths_are_refused() {
        for path in [
            r"\\server\share\report.pdf",
            "//server/share/report.pdf",
            r"\/server\share",
            r"\\?\UNC\server\share\report.pdf",
            r"\\.\pipe\name",
            "report\0.pdf",
        ] {
            assert!(check_openable_path(path).is_err(), "{path}");
        }
    }

    #[cfg(not(windows))]
    #[test]
    fn absolute_unix_paths_are_local() {
        assert!(check_openable_path("/home/user/.local/share/syntheo/report.pdf").is_ok());
    }

    // Sous Windows, seul un chemin absolu sur un lecteur passe : le préfixe
    // d'objet NT `\??\` (vu comme une racine par Rust, mais transmis tel quel
    // au gestionnaire d'objets) et toute forme sans lecteur sont refusés.
    #[cfg(windows)]
    #[test]
    fn only_drive_paths_are_local_on_windows() {
        for path in [
            r"\??\UNC\localhost\C$\Windows\notepad.exe",
            r"\??\C:\Windows\notepad.exe",
            r"\Windows\notepad.exe",
            "/Windows/notepad.exe",
            r"relatif\x",
            "C:relatif",
            r"\\?\C:\Windows\notepad.exe",
        ] {
            assert!(!super::is_local_path(path), "{path}");
        }
        for path in [
            r"C:\Users\user\Documents\report.pdf",
            "C:/Users/user/report.pdf",
        ] {
            assert!(super::is_local_path(path), "{path}");
        }
    }

    #[test]
    fn web_pages_and_plain_addresses_open() {
        for url in [
            "https://github.com/WillIsback/Syntheo/issues",
            "http://localhost:8000/docs",
            "https://www.linkedin.com/in/someone",
            "mailto:alice.martin@example.fr",
        ] {
            assert!(check_openable_url(url).is_ok(), "{url}");
        }
    }

    #[test]
    fn other_schemes_are_refused() {
        for url in [
            "file:///etc/passwd",
            "smb://server/share",
            "ms-settings:privacy",
            "javascript:alert(1)",
            "vscode://file/tmp/x",
            "zoommtg://zoom.us/join",
            "data:text/html,hello",
            "ftp://example.com/file",
            "mailto:alice@example.fr?subject=x",
            "mailto:alice@example.fr,bob@example.fr",
            "mailto:%61lice@example.fr",
            "mailto:",
            "https://",
            "/home/user/file.pdf",
            "",
        ] {
            assert!(check_openable_url(url).is_err(), "{url}");
        }
    }
}
