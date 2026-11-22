//! Cycle de vie avec le vrai binaire du module, construit avec le moteur
//! factice (`cargo build --features fake-engine` dans `apps/speech`) et donné
//! par `SYNTHEO_SPEECH_TEST_BIN`. Sauté sans cette variable.

use std::path::Path;
use std::time::Duration;

use futures_util::StreamExt;
use owhisper_client::{FinalizeHandle, ListenClient, NvidiaAdapter};
use owhisper_interface::MixedMessage;
use owhisper_interface::stream::StreamResponse;
use speech_host::{HostError, SpeechHost};

fn sha256(path: &Path) -> String {
    use sha2::{Digest, Sha256};
    Sha256::digest(std::fs::read(path).unwrap())
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect()
}

/// Dossier de module : le binaire, un modèle factice, la liste des empreintes.
fn module_dir(binary: &Path) -> tempfile::TempDir {
    let dir = tempfile::tempdir().unwrap();
    let name = speech_host::verify::binary_name();
    std::fs::copy(binary, dir.path().join(name)).unwrap();
    std::fs::create_dir_all(dir.path().join("models")).unwrap();
    std::fs::write(dir.path().join("models/placeholder"), b"x").unwrap();
    let list: String = [name, "models/placeholder"]
        .iter()
        .map(|p| format!("{}  {p}\n", sha256(&dir.path().join(p))))
        .collect();
    std::fs::write(dir.path().join(speech_host::verify::LIST_FILE), list).unwrap();
    dir
}

fn binary() -> Option<std::path::PathBuf> {
    std::env::var_os("SYNTHEO_SPEECH_TEST_BIN").map(Into::into)
}

/// Une session complète avec le client de l'application.
async fn session(target: owhisper_client::OnDeviceTarget) -> usize {
    let client = ListenClient::builder()
        .adapter::<NvidiaAdapter>()
        .api_base(target.base_url)
        .params(owhisper_interface::ListenParams {
            languages: vec!["fr".parse().unwrap()],
            ..Default::default()
        })
        .on_device(target.token)
        .build_single()
        .await
        .unwrap();
    let audio: Vec<owhisper_client::ListenClientInput> = (0..100)
        .map(|_| MixedMessage::Audio(bytes::Bytes::from(vec![0u8; 640])))
        .collect();
    let input = futures_util::stream::iter(audio).chain(futures_util::stream::pending());
    let (output, handle) = client.from_realtime_audio(Box::pin(input)).await.unwrap();
    tokio::time::sleep(Duration::from_millis(200)).await;
    handle.finalize().await;
    let mut output = Box::pin(output);
    let mut finals = 0;
    while let Ok(Some(Ok(response))) =
        tokio::time::timeout(Duration::from_secs(5), output.next()).await
    {
        if let StreamResponse::TranscriptResponse {
            is_final: true,
            channel,
            ..
        } = &response
            && !channel.alternatives[0].transcript.is_empty()
        {
            finals += 1;
        }
    }
    finals
}

#[cfg(target_os = "linux")]
fn proc_text(pid: u32, file: &str) -> String {
    String::from_utf8_lossy(&std::fs::read(format!("/proc/{pid}/{file}")).unwrap_or_default())
        .into_owned()
}

#[tokio::test]
async fn launch_session_restart_with_a_new_token_and_stop() {
    let Some(binary) = binary() else {
        eprintln!("SYNTHEO_SPEECH_TEST_BIN absent : essai sauté");
        return;
    };
    let dir = module_dir(&binary);
    let host = SpeechHost::new(dir.path().to_path_buf(), 1).with_engine("fake");

    let first = host.target(true).await.expect("lancement");
    assert!(first.base_url.starts_with("http://127.0.0.1:"));
    assert_eq!(session(first.clone()).await, 1);
    // Même lancement tant que le module vit.
    assert_eq!(host.target(true).await.unwrap().base_url, first.base_url);

    let pid = host.pid().await.unwrap();
    #[cfg(target_os = "linux")]
    {
        // Le jeton n'est ni sur la ligne de commande ni dans l'environnement.
        let environ = proc_text(pid, "environ");
        assert!(environ.is_empty(), "environnement vidé : {environ:?}");
        assert!(!proc_text(pid, "cmdline").to_lowercase().contains("token"));
        assert_eq!(format!("{:?}", first.token), "OnDeviceToken(<masqué>)");
    }

    // Plantage : relance avec un nouveau port et un nouveau jeton.
    std::process::Command::new("kill")
        .arg("-9")
        .arg(pid.to_string())
        .status()
        .unwrap();
    tokio::time::sleep(Duration::from_millis(200)).await;
    let second = host.target(true).await.expect("relance");
    assert_ne!(host.pid().await.unwrap(), pid);
    assert_eq!(session(second.clone()).await, 1);
    // L'ancien jeton ne vaut plus rien sur le nouveau lancement.
    let stale = owhisper_client::OnDeviceTarget {
        base_url: second.base_url.clone(),
        token: first.token.clone(),
    };
    let refused = ListenClient::builder()
        .adapter::<NvidiaAdapter>()
        .api_base(stale.base_url)
        .on_device(stale.token)
        .build_single()
        .await
        .unwrap()
        .from_realtime_audio(futures_util::stream::pending())
        .await;
    assert!(refused.is_err());

    // Réglage géré : arrêt, et aucun lancement.
    assert_eq!(host.target(false).await.err(), Some(HostError::Disabled));
    assert!(!host.is_running().await);
}

#[tokio::test]
async fn an_altered_module_never_starts() {
    let Some(binary) = binary() else { return };
    let dir = module_dir(&binary);
    std::fs::write(dir.path().join("models/placeholder"), b"altere").unwrap();
    let host = SpeechHost::new(dir.path().to_path_buf(), 1).with_engine("fake");
    assert!(matches!(host.target(true).await, Err(HostError::Verify(_))));
    assert!(!host.is_running().await);
}
