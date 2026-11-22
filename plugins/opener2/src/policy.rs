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

/// Chemin local seulement : un chemin réseau (`\\serveur\partage`,
/// `//serveur/partage`) ou de périphérique (`\\?\…`, `\\.\…`) est refusé
/// avant tout accès, pour ne jamais ouvrir de connexion SMB (issue 677).
pub(crate) fn check_openable_path(path: &str) -> Result<()> {
    let mut chars = path.chars();
    let is_sep = |c: Option<char>| matches!(c, Some('/' | '\\'));
    if path.contains('\0') || (is_sep(chars.next()) && is_sep(chars.next())) {
        return Err(Error::PathNotAllowed);
    }
    #[cfg(windows)]
    {
        use std::path::{Component, Path, Prefix};
        if let Some(Component::Prefix(prefix)) = Path::new(path).components().next()
            && !matches!(prefix.kind(), Prefix::Disk(_))
        {
            return Err(Error::PathNotAllowed);
        }
    }
    Ok(())
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
        ] {
            assert!(check_openable_path(path).is_err(), "{path}");
        }
        for path in [
            "/home/user/.local/share/syntheo/report.pdf",
            r"C:\Users\user\Documents\report.pdf",
        ] {
            assert!(check_openable_path(path).is_ok(), "{path}");
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
