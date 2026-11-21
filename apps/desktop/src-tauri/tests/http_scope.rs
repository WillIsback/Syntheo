//! Portée HTTP de l'interface (issue 646 et suite) : la capacité `http:default`
//! doit laisser passer un serveur d'inférence en HTTPS sur n'importe quel port
//! (`tailscale serve` publie par exemple sur 9443 ou 30443), et en HTTP vers
//! un nom d'hôte avec port. La règle d'URL de l'application
//! (`validate_provider_base_url`) décide ensuite de ce qui est accepté.
//!
//! Les motifs sont analysés comme dans tauri-plugin-http 2.9.0 (`scope.rs`,
//! `parse_url_pattern`), avec la même bibliothèque urlpattern.

use serde_json::Value;
use url::Url;
use urlpattern::{UrlPattern, UrlPatternInit, UrlPatternMatchInput};

/// Copie de `parse_url_pattern` de tauri-plugin-http 2.9.0.
fn parse_url_pattern(s: &str) -> UrlPattern {
    let mut init = UrlPatternInit::parse_constructor_string::<regex::Regex>(s, None).unwrap();
    if init.search.as_ref().map(|p| p.is_empty()).unwrap_or(true) {
        init.search.replace("*".to_string());
    }
    if init.hash.as_ref().map(|p| p.is_empty()).unwrap_or(true) {
        init.hash.replace("*".to_string());
    }
    if init
        .pathname
        .as_ref()
        .map(|p| p.is_empty() || p == "/")
        .unwrap_or(true)
    {
        init.pathname.replace("*".to_string());
    }
    UrlPattern::parse(init, Default::default()).unwrap()
}

fn http_scope() -> Vec<UrlPattern> {
    let path = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("capabilities/default.json");
    let capability: Value = serde_json::from_str(&std::fs::read_to_string(path).unwrap()).unwrap();
    let entry = capability["permissions"]
        .as_array()
        .unwrap()
        .iter()
        .find(|permission| permission["identifier"] == "http:default")
        .expect("http:default permission");
    entry["allow"]
        .as_array()
        .unwrap()
        .iter()
        .map(|allow| parse_url_pattern(allow["url"].as_str().unwrap()))
        .collect()
}

fn allowed(scope: &[UrlPattern], url: &str) -> bool {
    let url = Url::parse(url).unwrap();
    scope.iter().any(|pattern| {
        pattern
            .test(UrlPatternMatchInput::Url(url.clone()))
            .unwrap_or_default()
    })
}

#[test]
fn https_servers_on_any_port_are_in_scope() {
    let scope = http_scope();
    for url in [
        "https://spark-787d-1.tail6cba9f.ts.net:9443/ready",
        "https://host.example.ts.net:9443/v1/models",
        "https://host:30443/v1",
        "https://api.openai.com/v1/models",
        "https://asr.example.com:8443/v1/audio/transcriptions",
    ] {
        assert!(allowed(&scope, url), "{url}");
    }
}

#[test]
fn http_servers_on_a_private_name_or_address_are_in_scope() {
    let scope = http_scope();
    for url in [
        "http://localhost:8000/v1/models",
        "http://127.0.0.1:11434/v1/models",
        "http://192.168.1.87:8000/v1/models",
        "http://gpu.local:8000/v1/models",
        "http://machine.tailnet.ts.net:8000/v1/models",
        "http://gpu.local/v1/models",
    ] {
        assert!(allowed(&scope, url), "{url}");
    }
}

#[test]
fn other_schemes_stay_out_of_scope() {
    let scope = http_scope();
    for url in [
        "file:///etc/passwd",
        "ftp://host:21/file",
        "ws://host:8000/v1/realtime",
    ] {
        assert!(!allowed(&scope, url), "{url}");
    }
}
