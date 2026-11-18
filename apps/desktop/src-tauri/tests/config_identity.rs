//! Identité Syntheo des configurations Tauri (dev et release).

use serde_json::{Value, json};

fn read(name: &str) -> Value {
    let raw = std::fs::read_to_string(name).unwrap_or_else(|e| panic!("{name}: {e}"));
    serde_json::from_str(&raw).unwrap_or_else(|e| panic!("{name}: {e}"))
}

#[test]
fn syntheo_configs_have_syntheo_identity() {
    let dev = read("tauri.conf.json");
    assert_eq!(dev["identifier"], "fr.willisback.syntheo.dev");
    assert_eq!(dev["productName"], "Syntheo Dev");
    assert_eq!(dev["mainBinaryName"], "syntheo-dev");
    assert_eq!(
        dev["plugins"]["deep-link"]["desktop"]["schemes"],
        json!(["syntheo-dev"])
    );
    assert_eq!(dev["bundle"]["createUpdaterArtifacts"], false);

    let rel = read("tauri.conf.syntheo.json");
    assert_eq!(rel["identifier"], "fr.willisback.syntheo");
    assert_eq!(
        rel["plugins"]["deep-link"]["desktop"]["schemes"],
        json!(["syntheo"])
    );
    assert!(
        rel["bundle"]["icon"]
            .as_array()
            .unwrap()
            .iter()
            .all(|p| p.as_str().unwrap().starts_with("icons/syntheo/"))
    );
}

#[test]
fn no_fastrepl_channel_configs_remain() {
    for f in ["stable", "staging", "nightly", "flatpak", "app-store"] {
        assert!(
            !std::path::Path::new(&format!("tauri.conf.{f}.json")).exists(),
            "tauri.conf.{f}.json"
        );
    }
}

// Mise à jour intégrée (issues 591 et 593).
#[test]
fn updater_reads_the_release_manifest_with_the_syntheo_key() {
    let dev = read("tauri.conf.json");
    let updater = &dev["plugins"]["updater"];
    assert_eq!(
        updater["endpoints"],
        json!(["https://github.com/WillIsback/Syntheo/releases/latest/download/latest.json"])
    );
    // Le manifeste falsifié qui présente une ancienne release comme nouvelle est
    // refusé : la version est liée à la signature.
    assert_eq!(updater["requireSignedVersion"], true);
    assert_eq!(updater["windows"]["installMode"], "passive");

    // Clé publique de la release (identifiant 682D46182EA91D28), en base64 d'un
    // fichier de clé minisign.
    let pubkey = updater["pubkey"].as_str().expect("pubkey");
    let decoded = decode_base64(pubkey);
    assert!(
        decoded.starts_with("untrusted comment: minisign public key: 682D46182EA91D28\n"),
        "{decoded}"
    );

    // La configuration de release ne remplace ni ne retire le réglage.
    let rel = read("tauri.conf.syntheo.json");
    assert!(rel["plugins"].get("updater").is_none());
    // Les installeurs sont signés après coup par la release (job `updater`).
    assert_eq!(rel["bundle"]["createUpdaterArtifacts"], false);
}

#[test]
fn updater_plugin_is_left_out_of_devtools_builds() {
    let lib = std::fs::read_to_string("src/lib.rs").unwrap();
    let registration = lib
        .find("tauri_plugin_updater::Builder::new()")
        .expect("plugin enregistré");
    let guard = lib[..registration]
        .rfind("#[cfg(not(feature = \"devtools\"))]")
        .expect("garde devtools");
    assert!(
        !lib[guard..registration].contains(".plugin(tauri_plugin_"),
        "la garde devtools doit précéder directement l'enregistrement"
    );
}

fn decode_base64(input: &str) -> String {
    const ALPHABET: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut bits: u32 = 0;
    let mut count = 0;
    let mut out = Vec::new();
    for byte in input.bytes().filter(|byte| *byte != b'=') {
        let value = ALPHABET
            .iter()
            .position(|candidate| *candidate == byte)
            .expect("base64") as u32;
        bits = (bits << 6) | value;
        count += 6;
        if count >= 8 {
            count -= 8;
            out.push((bits >> count) as u8);
            bits &= (1 << count) - 1;
        }
    }
    String::from_utf8(out).expect("utf-8")
}
