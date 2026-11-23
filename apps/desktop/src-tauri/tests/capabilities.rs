// Permissions accordées à l'interface (capabilities/default.json).

use serde_json::Value;

fn permission_identifiers() -> Vec<String> {
    let path = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("capabilities/default.json");
    let capability: Value = serde_json::from_str(&std::fs::read_to_string(path).unwrap()).unwrap();
    capability["permissions"]
        .as_array()
        .unwrap()
        .iter()
        .map(|permission| match permission {
            Value::String(id) => id.clone(),
            other => other["identifier"].as_str().unwrap().to_owned(),
        })
        .collect()
}

// Issue 675 : les hooks de settings.json, qui lançaient des commandes au début
// et à la fin de l'écoute, sont retirés. Aucune permission ne doit les rouvrir.
#[test]
fn interface_cannot_run_settings_hooks() {
    let ids = permission_identifiers();
    assert!(!ids.is_empty());
    let hooks: Vec<_> = ids.iter().filter(|id| id.starts_with("hooks:")).collect();
    assert!(
        hooks.is_empty(),
        "permissions hooks encore accordées : {hooks:?}"
    );
}
