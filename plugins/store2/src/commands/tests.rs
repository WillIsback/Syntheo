#[test]
fn secure_store_service_is_syntheo_specific() {
    assert_eq!(
        secure_store_service(syntheo_brand::STABLE_BUNDLE_ID),
        format!("fr.willisback.syntheo.{SECURE_STORE_SUFFIX}")
    );
    assert_eq!(
        secure_store_service(syntheo_brand::DEV_BUNDLE_ID),
        format!("fr.willisback.syntheo.dev.{SECURE_STORE_SUFFIX}")
    );
}

use super::*;

#[test]
fn maps_bundle_identifiers_to_secure_store_services() {
    for (identifier, expected) in [
        (
            "fr.willisback.syntheo.dev",
            "fr.willisback.syntheo.dev.secure-store",
        ),
        (
            "fr.willisback.syntheo",
            "fr.willisback.syntheo.secure-store",
        ),
        ("com.example.app", "com.example.app.secure-store"),
    ] {
        assert_eq!(
            secure_store_service(identifier),
            expected,
            "unexpected service for {identifier}"
        );
    }
}

#[test]
fn versions_dev_accounts_across_signing_changes() {
    assert_eq!(
        secure_store_account("fr.willisback.syntheo.dev", "provider", "openai"),
        "v2:provider:openai"
    );
    assert_eq!(
        secure_store_account("fr.willisback.syntheo", "provider", "openai"),
        "provider:openai"
    );
}

#[test]
fn lists_legacy_secret_locations_without_duplicates() {
    for (identifier, expected) in [
        (
            "fr.willisback.syntheo.dev",
            vec![(
                "fr.willisback.syntheo.dev.secure-store".to_string(),
                "provider:openai".to_string(),
            )],
        ),
        ("com.example.app", vec![]),
    ] {
        let locations = legacy_secret_locations(identifier, "provider", "openai");
        assert_eq!(
            locations, expected,
            "unexpected legacy locations for {identifier}"
        );
        let unique: std::collections::HashSet<_> = locations.iter().collect();
        assert_eq!(
            locations.len(),
            unique.len(),
            "duplicate locations for {identifier}"
        );
    }
}

#[test]
fn isolates_native_secret_accounts_from_renderer_commands() {
    assert!(validate_secret_coordinate(SecretCaller::Renderer, "provider", "openai").is_ok());
    assert!(
        validate_secret_coordinate(SecretCaller::Renderer, "e2ee", "account:user-a:recovery-v1")
            .is_err()
    );
    assert!(
        validate_secret_coordinate(SecretCaller::Renderer, "e2ee:account", "user-a:recovery-v1")
            .is_err()
    );
    assert!(
        validate_secret_coordinate(SecretCaller::Native, "e2ee", "account:user-a:recovery-v1")
            .is_ok()
    );
}

#[tokio::test]
async fn renderer_secret_commands_reject_native_accounts_before_keychain_access() {
    let app = tauri::test::mock_builder()
        .build(tauri::test::mock_context(tauri::test::noop_assets()))
        .unwrap();
    let app = app.handle().clone();
    let scope = "e2ee".to_string();
    let key = "account:user-a:recovery-v1".to_string();
    let expected = "secure-store account is reserved for native use";

    assert_eq!(
        get_secret(app.clone(), scope.clone(), key.clone())
            .await
            .unwrap_err(),
        expected
    );
    assert_eq!(
        set_secret(
            app.clone(),
            scope.clone(),
            key.clone(),
            "replacement".to_string()
        )
        .await
        .unwrap_err(),
        expected
    );
    assert_eq!(delete_secret(app, scope, key).await.unwrap_err(), expected);
}
