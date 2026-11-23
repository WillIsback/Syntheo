#[cfg(target_os = "macos")]
use std::{
    fs,
    path::{Path, PathBuf},
    process::Command,
};

#[cfg(target_os = "macos")]
const MACOS_MINIMUM_SYSTEM_VERSION: &str = "15.0";

fn main() {
    #[cfg(target_os = "macos")]
    println!("cargo:rustc-link-arg=-fapple-link-rtlib");

    speech_companion();

    #[cfg(target_os = "macos")]
    if std::env::var_os("CARGO_FEATURE_APP_STORE").is_none() {
        build_check_permissions();
    }

    tauri_build::build()
}

#[cfg(target_os = "macos")]
fn build_check_permissions() {
    let triple = std::env::var("TARGET").unwrap();
    let swift_target = swift_target(&triple);

    let manifest_dir = PathBuf::from(
        std::env::var_os("CARGO_MANIFEST_DIR").expect("CARGO_MANIFEST_DIR is set by Cargo"),
    );
    let build_rs = manifest_dir.join("build.rs");
    let swift_src = manifest_dir.join("../../../plugins/permissions/swift/check-permissions.swift");
    let binaries_dir = manifest_dir.join("binaries");
    let dst = binaries_dir.join(format!("check-permissions-{triple}"));
    let out_dir = PathBuf::from(std::env::var_os("OUT_DIR").expect("OUT_DIR is set"));
    let compiled = out_dir.join(format!("check-permissions-{triple}"));

    println!("cargo:rerun-if-changed={}", build_rs.display());
    println!("cargo:rerun-if-changed={}", swift_src.display());

    fs::create_dir_all(&binaries_dir).expect("create binaries/");

    if is_fresh(&dst, &[&build_rs, &swift_src]) {
        return;
    }

    let status = Command::new("swiftc")
        .args(["-O", "-target"])
        .arg(&swift_target)
        .arg("-o")
        .arg(&compiled)
        .arg(&swift_src)
        .status()
        .expect("failed to run swiftc");

    assert!(
        status.success(),
        "swiftc failed to compile check-permissions"
    );

    if !same_contents(&compiled, &dst) {
        fs::copy(&compiled, &dst).expect("copy check-permissions binary");
    }
}

#[cfg(target_os = "macos")]
fn swift_target(cargo_target: &str) -> String {
    let arch = cargo_target
        .split('-')
        .next()
        .expect("TARGET contains an architecture");
    let arch = match arch {
        "aarch64" => "arm64",
        "x86_64" => "x86_64",
        _ => panic!("unsupported macOS target architecture: {arch}"),
    };

    format!("{arch}-apple-macosx{MACOS_MINIMUM_SYSTEM_VERSION}")
}

#[cfg(target_os = "macos")]
fn is_fresh(output: &Path, inputs: &[&Path]) -> bool {
    let Ok(output_modified) = fs::metadata(output).and_then(|metadata| metadata.modified()) else {
        return false;
    };

    inputs.iter().all(|input| {
        fs::metadata(input)
            .and_then(|metadata| metadata.modified())
            .is_ok_and(|modified| modified <= output_modified)
    })
}

#[cfg(target_os = "macos")]
fn same_contents(a: &Path, b: &Path) -> bool {
    match (fs::read(a), fs::read(b)) {
        (Ok(a), Ok(b)) => a == b,
        _ => false,
    }
}

/// Programme compagnon `syntheo-speech` (issue 683) : posé dans `binaries/`
/// par scripts/build-speech.sh ou .ps1 avant `tauri build`, livré par
/// `bundle.externalBin` (tauri.conf.syntheo.json). Ses fichiers sont épinglés
/// ici, taille et empreinte (`syntheo-image-hash` : SHA-256, hors signature
/// Authenticode pour une image PE, que le job de signature Windows ajoute
/// après cette compilation), et compilés dans l'application
/// (`SYNTHEO_SPEECH_FILES`, `nom:sha256:taille` séparés par `;`, binaire en
/// premier) : l'application ne lance qu'un compagnon identique. Sous
/// Windows, le runtime Visual C++ embarqué à côté (`vcrt/`) en fait partie.
/// Sans binaire (développement, CI), liste vide : compagnon indisponible.
fn speech_companion() {
    use std::path::PathBuf;

    let manifest_dir = PathBuf::from(std::env::var_os("CARGO_MANIFEST_DIR").unwrap());
    let target = std::env::var("TARGET").unwrap_or_default();
    let windows = target.contains("windows");
    let binaries = manifest_dir.join("binaries");
    let exe = if windows { ".exe" } else { "" };
    let binary = binaries.join(format!("syntheo-speech-{target}{exe}"));
    println!("cargo:rerun-if-changed={}", binaries.display());
    println!("cargo:rerun-if-changed={}", binary.display());
    println!("cargo:rerun-if-env-changed=SYNTHEO_SPEECH_MODELS_URLS");
    println!("cargo:rerun-if-env-changed=SYNTHEO_SPEECH_ALLOW_NO_SOURCES");

    // Sources des modèles : SYNTHEO_SPEECH_MODELS_URLS (si défini) puis les
    // `sources` de models.json, avec le validateur de l'application ; une
    // liste invalide fait échouer la construction plutôt que de livrer une
    // application sans téléchargement.
    let models_json = manifest_dir.join("../../speech/models/models.json");
    println!("cargo:rerun-if-changed={}", models_json.display());
    let env_sources = match std::env::var("SYNTHEO_SPEECH_MODELS_URLS") {
        Ok(urls) if !urls.trim().is_empty() => syntheo_speech_sources::parse_sources([urls.as_str()])
            .unwrap_or_else(|| panic!("SYNTHEO_SPEECH_MODELS_URLS invalide (HTTPS, sans identifiants, requête ni fragment, 8 sources au plus) : « {urls} »"))
            .len(),
        _ => 0,
    };
    let json = std::fs::read_to_string(&models_json)
        .unwrap_or_else(|error| panic!("{} illisible : {error}", models_json.display()));
    let json_sources = syntheo_speech_sources::models_json_sources(&json)
        .unwrap_or_else(|| panic!("`sources` de {} invalides", models_json.display()))
        .len();

    let pin = |name: &str, path: &std::path::Path| -> Option<String> {
        let bytes = std::fs::read(path).ok()?;
        let hash = syntheo_image_hash::image_hash(&bytes);
        Some(format!("{name}:{hash}:{}", bytes.len()))
    };
    let mut files = Vec::new();
    if let Some(entry) = pin(&format!("syntheo-speech{exe}"), &binary) {
        files.push(entry);
        if windows {
            let vcrt = manifest_dir.join("vcrt");
            println!("cargo:rerun-if-changed={}", vcrt.display());
            for dll in [
                "vcruntime140.dll",
                "vcruntime140_1.dll",
                "msvcp140.dll",
                "msvcp140_1.dll",
            ] {
                if let Some(entry) = pin(dll, &vcrt.join(dll)) {
                    files.push(entry);
                }
            }
        }
    }
    // Une release (profil release, sans devtools) qui livre le compagnon doit
    // pouvoir télécharger ses modèles : sans aucune source, elle échoue. Les
    // alphas devtools restent possibles (installation depuis un dossier) ;
    // SYNTHEO_SPEECH_ALLOW_NO_SOURCES=1 l'autorise pour un build de test
    // jamais distribué (build-alpha.sh --updater-test).
    let release = std::env::var("PROFILE").as_deref() == Ok("release");
    let devtools = std::env::var_os("CARGO_FEATURE_DEVTOOLS").is_some();
    let allowed = std::env::var("SYNTHEO_SPEECH_ALLOW_NO_SOURCES").as_deref() == Ok("1");
    if !files.is_empty() && release && !devtools && !allowed && env_sources + json_sources == 0 {
        panic!(
            "le compagnon syntheo-speech est livré sans aucune source de téléchargement des modèles : \
             épingler les `sources` de apps/speech/models/models.json (ou SYNTHEO_SPEECH_MODELS_URLS) avant une release"
        );
    }
    println!("cargo:rustc-env=SYNTHEO_SPEECH_FILES={}", files.join(";"));
}
