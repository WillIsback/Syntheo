// Navigation des fenêtres (issue 655, constat SEC-30) : une fenêtre de
// l'application n'affiche que l'application. Un lien suivi par erreur (lien
// glissé dans la fenêtre, `location = …` injecté) ne remplace pas
// l'interface par une page distante, et `window.open` / `target="_blank"`
// n'ouvre jamais de fenêtre web dans l'application : une adresse http(s) part
// au navigateur par opener2, qui applique sa propre politique (issue 676).

use tauri::webview::NewWindowResponse;
use tauri::{Manager, Url, WebviewWindowBuilder, Wry};
use tauri_plugin_opener2::Opener2PluginExt;

/// Adresse servie par l'application : protocole propre (`tauri://localhost`
/// sous Linux et macOS, `http(s)://tauri.localhost` sous Windows), page vide,
/// ou serveur de développement (`devUrl`) dans une version de développement.
pub(crate) fn is_app_url(url: &Url, dev_url: Option<&Url>) -> bool {
    match url.scheme() {
        "tauri" => url.host_str() == Some("localhost"),
        "http" | "https" if url.host_str() == Some("tauri.localhost") => true,
        "about" => url.path() == "blank",
        _ => dev_url.is_some_and(|dev| same_origin(url, dev)),
    }
}

fn same_origin(a: &Url, b: &Url) -> bool {
    a.scheme() == b.scheme()
        && a.host_str() == b.host_str()
        && a.port_or_known_default() == b.port_or_known_default()
}

fn dev_url(app: &tauri::AppHandle<Wry>) -> Option<Url> {
    if cfg!(debug_assertions) {
        app.config().build.dev_url.clone()
    } else {
        None
    }
}

/// Pose les deux gardes sur le constructeur d'une fenêtre.
pub(crate) fn guard<'a, M: Manager<Wry>>(
    builder: WebviewWindowBuilder<'a, Wry, M>,
    app: &tauri::AppHandle<Wry>,
) -> WebviewWindowBuilder<'a, Wry, M> {
    let dev = dev_url(app);
    let opener = app.clone();
    builder
        .on_navigation(move |url| {
            let allowed = is_app_url(url, dev.as_ref());
            if !allowed {
                tracing::warn!(scheme = url.scheme(), "window_navigation_refused");
            }
            allowed
        })
        .on_new_window(move |url, _features| {
            if matches!(url.scheme(), "http" | "https") {
                if let Err(error) = opener.opener2().open_url(url.as_str()) {
                    tracing::warn!(%error, "new_window_link_not_opened");
                }
            } else {
                tracing::warn!(scheme = url.scheme(), "new_window_refused");
            }
            NewWindowResponse::Deny
        })
}

#[cfg(test)]
mod tests {
    use super::is_app_url;
    use tauri::Url;

    fn url(value: &str) -> Url {
        Url::parse(value).unwrap()
    }

    // Issue 655 : seule l'application s'affiche dans ses fenêtres.
    #[test]
    fn only_the_app_origin_is_navigable() {
        for allowed in [
            "tauri://localhost/app/note/1",
            "http://tauri.localhost/index.html",
            "https://tauri.localhost/app",
            "about:blank",
        ] {
            assert!(is_app_url(&url(allowed), None), "{allowed}");
        }
        for refused in [
            "https://example.com/",
            "http://localhost:1422/",
            "file:///etc/passwd",
            "tauri://evil.example/",
            "https://tauri.localhost.example.com/",
            "about:srcdoc",
            "data:text/html,<p>x</p>",
        ] {
            assert!(!is_app_url(&url(refused), None), "{refused}");
        }
    }

    #[test]
    fn the_dev_server_is_navigable_only_when_configured() {
        let dev = url("http://localhost:1422");
        assert!(is_app_url(&url("http://localhost:1422/app"), Some(&dev)));
        assert!(!is_app_url(&url("http://localhost:1423/app"), Some(&dev)));
        assert!(!is_app_url(&url("https://localhost:1422/app"), Some(&dev)));
    }
}
