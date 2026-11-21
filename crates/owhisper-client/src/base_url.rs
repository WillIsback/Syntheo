//! Règle d'URL des serveurs d'inférence (issue 646), appliquée côté Rust au
//! démarrage d'une capture ou d'une transcription, en plus de la validation de
//! l'interface : une URL écrite directement en base ou mal formée est refusée
//! par une erreur, jamais par une panique.
//!
//! HTTPS partout. HTTP clair accepté sur cette machine ou vers une adresse de
//! réseau privé (réseau local, plage CGNAT de Tailscale, `.local`, `*.ts.net`),
//! que l'interface signale comme non chiffrée et fait confirmer : la forme de
//! l'adresse ne prouve pas l'identité du serveur.

#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
pub enum BaseUrlError {
    #[error("invalid server address")]
    Invalid,
    #[error("server address must not contain credentials")]
    Credentials,
    #[error("unencrypted HTTP is only allowed to this machine or a private network")]
    InsecureScheme,
}

pub fn validate_provider_base_url(base_url: &str) -> Result<url::Url, BaseUrlError> {
    let url = url::Url::parse(base_url.trim()).map_err(|_| BaseUrlError::Invalid)?;
    if !url.username().is_empty() || url.password().is_some() || url.fragment().is_some() {
        return Err(BaseUrlError::Credentials);
    }
    let host = url.host_str().ok_or(BaseUrlError::Invalid)?;
    match url.scheme() {
        "https" => Ok(url),
        "http" if is_private_host(host) => Ok(url),
        "http" => Err(BaseUrlError::InsecureScheme),
        _ => Err(BaseUrlError::Invalid),
    }
}

/// Cette machine : `localhost`, 127.0.0.0/8, `[::1]`. Seul cas où le HTTP clair
/// ne quitte pas le poste.
pub fn is_loopback_host(host: &str) -> bool {
    let host = host.to_ascii_lowercase();
    if host == "localhost" || host == "[::1]" || host == "::1" {
        return true;
    }
    parse_ipv4(&host).is_some_and(|[a, ..]| a == 127)
}

/// Même règle que `isPrivateHost` de `@syntheo/provider-validation`.
pub fn is_private_host(host: &str) -> bool {
    let host = host.to_ascii_lowercase();
    if is_loopback_host(&host) || host.ends_with(".local") || is_tailnet_name(&host) {
        return true;
    }
    parse_ipv4(&host).is_some_and(|[a, b, ..]| {
        a == 10
            || (a == 172 && (16..=31).contains(&b))
            || (a == 192 && b == 168)
            || (a == 100 && (64..=127).contains(&b))
    })
}

fn is_tailnet_name(host: &str) -> bool {
    host.strip_suffix(".ts.net")
        .is_some_and(|name| name.split('.').all(|label| !label.is_empty()))
}

fn parse_ipv4(host: &str) -> Option<[u8; 4]> {
    let octets: Vec<u8> = host
        .split('.')
        .map(|part| part.parse::<u8>().ok())
        .collect::<Option<_>>()?;
    octets.try_into().ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_https_and_local_or_private_http() {
        for url in [
            "https://api.example.com/v1",
            "https://speech.tailnet.ts.net/v1?provider=nvidia",
            "http://localhost:8000/v1",
            "http://127.0.0.1:8000/v1",
            "http://[::1]:8000/v1",
            "http://192.168.1.87:8000/v1?provider=nvidia",
            "http://10.0.0.5:8000",
            "http://172.20.0.1:8000",
            "http://100.101.102.103:8000",
            "http://gpu.local:8000",
            "http://gpu.tailnet.ts.net:8000",
        ] {
            assert!(validate_provider_base_url(url).is_ok(), "{url}");
        }
    }

    #[test]
    fn refuses_public_http_credentials_and_garbage_without_panicking() {
        for (url, error) in [
            ("http://api.example.com/v1", BaseUrlError::InsecureScheme),
            ("http://8.8.8.8:8000", BaseUrlError::InsecureScheme),
            ("http://evil-ts.net:8000", BaseUrlError::InsecureScheme),
            ("http://ts.net:8000", BaseUrlError::InsecureScheme),
            ("http://172.32.0.1:8000", BaseUrlError::InsecureScheme),
            (
                "https://user:pass@api.example.com",
                BaseUrlError::Credentials,
            ),
            ("https://api.example.com/#x", BaseUrlError::Credentials),
            ("not a url", BaseUrlError::Invalid),
            ("", BaseUrlError::Invalid),
            ("ftp://192.168.1.2", BaseUrlError::Invalid),
            ("file:///etc/passwd", BaseUrlError::Invalid),
        ] {
            assert_eq!(validate_provider_base_url(url), Err(error), "{url}");
        }
    }

    #[test]
    fn only_this_machine_is_loopback() {
        for host in ["localhost", "127.0.0.1", "127.5.6.7", "[::1]"] {
            assert!(is_loopback_host(host), "{host}");
        }
        for host in [
            "192.168.1.87",
            "gpu.local",
            "gpu.tailnet.ts.net",
            "100.64.0.1",
        ] {
            assert!(!is_loopback_host(host), "{host}");
        }
    }
}
