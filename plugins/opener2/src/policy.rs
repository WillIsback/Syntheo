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

#[cfg(test)]
mod tests {
    use super::check_openable_url;

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
