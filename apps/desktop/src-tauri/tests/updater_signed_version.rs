//! `requireSignedVersion` en fonctionnement (issue 659) : avec la configuration
//! réelle du plugin de mise à jour (`tauri.conf.json`), une signature valide
//! pour une autre version que celle annoncée par le manifeste est refusée, et
//! une signature qui ne porte aucune version aussi.
//! Hors ligne : serveur local, clé jetable générée pour ce test (seules la clé
//! publique et les signatures sont ici, jamais la clé privée).

use serde_json::{Value, json};
use tauri_plugin_updater::UpdaterExt;
use wiremock::{
    Mock, MockServer, ResponseTemplate,
    matchers::{method, path},
};

/// Clé publique jetable (identifiant 1BEF2CA695E0B2D2), format de `tauri signer`.
const TEST_PUBKEY: &str = "dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIHB1YmxpYyBrZXk6IDFCRUYyQ0E2OTVFMEIyRDIKUldUU3N1Q1ZwaXp2R3pnRkZDR3RueFVYMEQ1UElMaXF3ckRHUjRid0dMTW03RVdtWGRublJycEgK";
/// Signature de `PACKAGE` par cette clé, avec `--app-version 2.0.0`
/// (trusted comment `version:2.0.0`).
const SIGNATURE_FOR_2_0_0: &str = "dW50cnVzdGVkIGNvbW1lbnQ6IHNpZ25hdHVyZSBmcm9tIHRhdXJpIHNlY3JldCBrZXkKUlVUU3N1Q1ZwaXp2Ry8vZUZrVmE2SmcrZnJta3lYZE5CR3gxT2xzL1lBNVM2dHFnOHh5aTdBWE1CUEhIdDFtV2xaZVBiQ2tMbnF5WURhMUJDRjVMV0psWnkrZUdYczllK1FZPQp0cnVzdGVkIGNvbW1lbnQ6IHRpbWVzdGFtcDoxNzk1MjkwNTYyCWZpbGU6cGtnNjU5LmJpbgl2ZXJzaW9uOjIuMC4wCldpV2dHcUZDV1orUXhVNFQzM0xFdnZHUXpObXJORWVsMmtvdm4zLzE3N3BCQjZadFZsaU5PNHVjVkxjTXBGNG1yWjZQTFA3MHF2QUNQUWxBaWVGRUNBPT0K";
/// Signature du même paquet sans version (`tauri signer sign` sans
/// `--app-version`) : refusée parce que la configuration exige une version.
const SIGNATURE_WITHOUT_VERSION: &str = "dW50cnVzdGVkIGNvbW1lbnQ6IHNpZ25hdHVyZSBmcm9tIHRhdXJpIHNlY3JldCBrZXkKUlVUU3N1Q1ZwaXp2Ry95OFhwZVAxR2RpYzhCK0ljeXp4eS9pR255M2k5K09PRitUMkdtcTZkK1QvQmRwNkVzblpTRGpNMWgvNWRIMU56eFZwRDJLWUVlcXAxS29FOW9BbGc0PQp0cnVzdGVkIGNvbW1lbnQ6IHRpbWVzdGFtcDoxNzk1MjkwNjUxCWZpbGU6cGtnNjU5dS5iaW4KN2k3S2NHMGxqMGhHTGNuTEllUko2RklUN0ZWRUJpYXh6WDEwcXhoZEU0SzlyRE05K2tKTkVsN2R5K2Qrb2JHMS82OHNlaGxwZFhiRVQxYVBzdmJXQmc9PQo=";
const PACKAGE: &[u8] = b"syntheo-update-package";

fn shipped_updater_config() -> Value {
    let path = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("tauri.conf.json");
    let config: Value = serde_json::from_str(&std::fs::read_to_string(path).unwrap()).unwrap();
    config["plugins"]["updater"].clone()
}

/// Application de test avec la configuration livrée, seules la clé publique et
/// l'adresse du manifeste remplacées (serveur local en HTTP).
fn app(endpoint: &str) -> tauri::App<tauri::test::MockRuntime> {
    let mut updater = shipped_updater_config();
    updater["pubkey"] = json!(TEST_PUBKEY);
    updater["endpoints"] = json!([endpoint]);
    updater["dangerousInsecureTransportProtocol"] = json!(true);
    let mut context = tauri::test::mock_context(tauri::test::noop_assets());
    context
        .config_mut()
        .plugins
        .0
        .insert("updater".to_string(), updater);
    tauri::test::mock_builder()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .build(context)
        .unwrap()
}

async fn update_announcing(version: &str) -> tauri_plugin_updater::Update {
    update_signed_with(version, SIGNATURE_FOR_2_0_0).await
}

async fn update_signed_with(version: &str, signature: &str) -> tauri_plugin_updater::Update {
    let server = MockServer::start().await;
    Mock::given(method("GET"))
        .and(path("/latest.json"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            "version": version,
            "notes": "",
            "pub_date": "2026-11-21T00:00:00Z",
            "platforms": {
                "test-target": {
                    "url": format!("{}/package", server.uri()),
                    "signature": signature,
                }
            }
        })))
        .mount(&server)
        .await;
    let app = app(&format!("{}/latest.json", server.uri()));
    app.updater_builder()
        .target("test-target")
        .build()
        .unwrap()
        .check()
        .await
        .unwrap()
        .expect("the manifest announces a newer version")
}

#[test]
fn shipped_config_requires_a_signed_version() {
    assert_eq!(
        shipped_updater_config()["requireSignedVersion"],
        json!(true)
    );
}

#[tokio::test]
async fn a_package_signed_for_the_announced_version_is_accepted() {
    let update = update_announcing("2.0.0").await;
    update.verify(PACKAGE).unwrap();
}

#[tokio::test]
async fn a_valid_signature_for_another_version_is_refused() {
    // Manifeste falsifié : il présente comme 3.0.0 un paquet signé pour 2.0.0.
    let update = update_announcing("3.0.0").await;
    let error = update.verify(PACKAGE).unwrap_err();
    assert!(
        matches!(
            error,
            tauri_plugin_updater::Error::SignedVersionMismatch { .. }
        ),
        "{error:?}"
    );
}

// C'est ce cas que `requireSignedVersion` couvre : sans lui, une signature
// sans version serait acceptée pour n'importe quelle version annoncée.
#[tokio::test]
async fn a_signature_without_version_is_refused() {
    let update = update_signed_with("2.0.0", SIGNATURE_WITHOUT_VERSION).await;
    let error = update.verify(PACKAGE).unwrap_err();
    assert!(
        matches!(error, tauri_plugin_updater::Error::MissingSignedVersion),
        "{error:?}"
    );
}

#[tokio::test]
async fn a_tampered_package_is_refused() {
    let update = update_announcing("2.0.0").await;
    assert!(update.verify(b"tampered").is_err());
}
