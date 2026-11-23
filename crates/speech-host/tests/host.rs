//! Cycle de vie avec le vrai binaire du compagnon, construit avec le moteur
//! factice (`cargo build --features fake-engine` dans `apps/speech`) et donné
//! par `SYNTHEO_SPEECH_TEST_BIN`. Sauté sans cette variable.

use std::path::{Path, PathBuf};
use std::time::Duration;

use futures_util::StreamExt;
use owhisper_client::{FinalizeHandle, ListenClient, NvidiaAdapter};
use owhisper_interface::MixedMessage;
use owhisper_interface::stream::StreamResponse;
use speech_host::companion::binary_name;
use speech_host::models::ModelFile;
use speech_host::{Companion, HostError, SpeechHost};

/// Dossier d'installation (le compagnon) et dossier de données (un modèle
/// factice), comme dans l'application.
struct Fixture {
    install: tempfile::TempDir,
    data: tempfile::TempDir,
}

fn placeholder() -> ModelFile {
    ModelFile {
        path: "placeholder".to_owned(),
        size: 1,
        // SHA-256 de « x ».
        sha256: "2d711642b726b04401627ca9fbac32f5c8530fb1903cc4db02258717921a4881".to_owned(),
    }
}

fn fixture(binary: &Path) -> Fixture {
    let install = tempfile::tempdir().unwrap();
    std::fs::copy(binary, install.path().join(binary_name())).unwrap();
    fixture_in(install)
}

fn fixture_in(install: tempfile::TempDir) -> Fixture {
    let data = tempfile::tempdir().unwrap();
    std::fs::create_dir_all(data.path().join("models")).unwrap();
    std::fs::write(data.path().join("models/placeholder"), b"x").unwrap();
    Fixture { install, data }
}

impl Fixture {
    fn companion(&self) -> Companion {
        Companion::hashed_now(self.install.path(), &[binary_name()]).unwrap()
    }

    fn host(&self) -> SpeechHost {
        SpeechHost::new(self.data.path().to_path_buf(), Some(self.companion()), 1)
            .with_engine("fake")
            .with_models(vec![placeholder()])
    }

    fn model(&self) -> PathBuf {
        self.data.path().join("models/placeholder")
    }
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

/// Session diarisée (paramètres par défaut) sur de l'audio PCM16 16 kHz ;
/// rend le nombre de mots finaux attribués à un intervenant.
async fn diarized_session(target: owhisper_client::OnDeviceTarget, pcm: &[u8]) -> usize {
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
    let audio: Vec<owhisper_client::ListenClientInput> = pcm
        .chunks(640)
        .take(50 * 30)
        .map(|chunk| MixedMessage::Audio(bytes::Bytes::copy_from_slice(chunk)))
        .collect();
    let input = futures_util::stream::iter(audio).chain(futures_util::stream::pending());
    let (output, handle) = client.from_realtime_audio(Box::pin(input)).await.unwrap();
    let mut output = Box::pin(output);
    let mut speakers = 0;
    let deadline = tokio::time::Instant::now() + Duration::from_secs(120);
    let mut finalized = false;
    while tokio::time::Instant::now() < deadline {
        match tokio::time::timeout(Duration::from_secs(10), output.next()).await {
            Ok(Some(Ok(StreamResponse::TranscriptResponse {
                is_final: true,
                channel,
                ..
            }))) => {
                speakers += channel.alternatives[0]
                    .words
                    .iter()
                    .filter(|w| w.speaker.is_some())
                    .count();
            }
            Ok(Some(Ok(_))) => {}
            Ok(Some(Err(_))) | Ok(None) => break,
            Err(_) if !finalized => {
                handle.finalize().await;
                finalized = true;
            }
            Err(_) => break,
        }
    }
    speakers
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
    let fixture = fixture(&binary);
    let host = fixture.host();

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
        // On exécute la copie vérifiée, gardée tant que le module vit, et le
        // dossier courant n'est pas celui du module.
        let exe = std::fs::read_link(format!("/proc/{pid}/exe")).unwrap();
        let exe = exe.to_string_lossy().into_owned();
        assert!(
            exe.contains("/.run-") && !exe.ends_with(" (deleted)"),
            "{exe}"
        );
        // Le modèle vérifié est hérité par descripteur (zéro copie).
        let inherited = std::fs::read_dir(format!("/proc/{pid}/fd"))
            .unwrap()
            .flatten()
            .filter_map(|fd| std::fs::read_link(fd.path()).ok())
            .any(|target| target == fixture.model());
        assert!(inherited, "modèle hérité par descripteur");
        assert_eq!(
            std::fs::read_link(format!("/proc/{pid}/cwd")).unwrap(),
            Path::new("/")
        );
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
async fn an_altered_model_never_starts() {
    let Some(binary) = binary() else { return };
    let fixture = fixture(&binary);
    std::fs::write(fixture.model(), b"y").unwrap();
    let host = fixture.host();
    assert!(matches!(host.target(true).await, Err(HostError::Verify(_))));
    assert!(!host.is_running().await);
}

/// Compagnon dont le « binaire » est un script qui sort aussitôt.
#[cfg(unix)]
fn crashing_fixture() -> Fixture {
    use std::os::unix::fs::PermissionsExt;
    let install = tempfile::tempdir().unwrap();
    let binary = install.path().join(binary_name());
    std::fs::write(&binary, "#!/bin/sh\nexit 1\n").unwrap();
    std::fs::set_permissions(&binary, std::fs::Permissions::from_mode(0o755)).unwrap();
    fixture_in(install)
}

// Revue de l'issue 684 : chaque tentative compte, réussie ou non ; au-delà
// du maximum, refus sans relancer pendant toute la fenêtre.
#[cfg(unix)]
#[tokio::test]
async fn a_module_that_exits_at_once_is_refused_after_the_last_attempt() {
    let fixture = crashing_fixture();
    let host = fixture
        .host()
        .with_restart_policy(speech_host::host::RestartPolicy {
            max_attempts: 2,
            window: Duration::from_secs(60),
            stable_after: Duration::from_secs(60),
        });
    for _ in 0..2 {
        let error = host.target(true).await.unwrap_err();
        assert!(matches!(error, HostError::Launch(_)), "{error:?}");
        assert!(!error.is_permanent());
    }
    for _ in 0..3 {
        let error = host.target(true).await.unwrap_err();
        assert_eq!(error, HostError::RestartBudget);
        assert!(error.is_permanent());
    }
    // Fin d'écoute : l'état « en panne » dure jusqu'à la fin de la fenêtre.
    host.stop().await;
    assert_eq!(
        host.target(true).await.unwrap_err(),
        HostError::RestartBudget
    );
    assert_eq!(host.verifications().await, 2);
}

// Un compagnon altéré après la construction : une seule tentative, un seul
// hachage, refus définitif.
#[cfg(unix)]
#[tokio::test]
async fn an_altered_companion_is_checked_once() {
    let fixture = crashing_fixture();
    let host = fixture.host();
    std::fs::write(
        fixture.install.path().join(binary_name()),
        "#!/bin/sh\nexit 2\n",
    )
    .unwrap();
    for _ in 0..5 {
        let error = host.target(true).await.unwrap_err();
        assert!(matches!(error, HostError::Verify(_)), "{error:?}");
        assert!(error.is_permanent());
    }
    assert_eq!(host.verifications().await, 1);
}

/// Compagnon réel (binaire release, vrais modèles) : `SYNTHEO_SPEECH_RELEASE_BIN`
/// et `SYNTHEO_SPEECH_DATA_DIR` (dossier qui contient `models/`). Vérifie les
/// empreintes compilées de `models.json` et le lancement avec le moteur A.
fn real_host() -> Option<(SpeechHost, PathBuf, tempfile::TempDir)> {
    let binary = std::env::var_os("SYNTHEO_SPEECH_RELEASE_BIN")?;
    let data: PathBuf = std::env::var_os("SYNTHEO_SPEECH_DATA_DIR")?.into();
    let install = tempfile::tempdir().unwrap();
    std::fs::copy(binary, install.path().join(binary_name())).unwrap();
    let companion = Companion::hashed_now(install.path(), &[binary_name()]).unwrap();
    Some((
        SpeechHost::new(data.clone(), Some(companion), 2),
        data,
        install,
    ))
}

#[tokio::test]
async fn a_real_companion_starts_and_accepts_a_session() {
    let Some((host, dir, _install)) = real_host() else {
        eprintln!("SYNTHEO_SPEECH_RELEASE_BIN ou SYNTHEO_SPEECH_DATA_DIR absent : essai sauté");
        return;
    };
    let target = host.target(true).await.expect("module vérifié et lancé");
    // `dir` ne sert qu'au contrôle des données externes, propre à Linux.
    #[cfg(not(target_os = "linux"))]
    let _ = &dir;
    #[cfg(target_os = "linux")]
    {
        // ONNX Runtime a chargé encoder.onnx.data (données externes) par le
        // lien du dossier privé vers le descripteur hérité.
        let pid = host.pid().await.unwrap();
        let exe = std::fs::read_link(format!("/proc/{pid}/exe")).unwrap();
        let data = exe
            .parent()
            .unwrap()
            .join("models/nemotron/encoder.onnx.data");
        let link = std::fs::read_link(&data).unwrap();
        assert!(link.starts_with("/proc/self/fd/"), "{link:?}");
        let fd = link.file_name().unwrap().to_string_lossy().into_owned();
        assert_eq!(
            std::fs::read_link(format!("/proc/{pid}/fd/{fd}")).unwrap(),
            dir.join("models/nemotron/encoder.onnx.data"),
            "descripteur hérité par le module"
        );
        eprintln!(
            "encoder.onnx.data : {} -> {link:?} (fd {fd} du module)",
            data.display()
        );
    }
    // Revue de l'issue 683 : une session diarisée, ouverte après l'annonce,
    // recharge le modèle de diarisation depuis le chemin vérifié.
    if let Ok(audio) = std::env::var("SYNTHEO_SPEECH_AUDIO") {
        let bytes = std::fs::read(audio).unwrap();
        let speakers = diarized_session(target.clone(), &bytes[44..]).await;
        assert!(speakers > 0, "mots attribués à un intervenant");
    } else {
        session(target).await;
    }
    host.stop().await;
    assert!(!host.is_running().await);
}

/// WAV 16 kHz mono PCM16 de `seconds` secondes (le moteur factice ne lit
/// pas le contenu).
fn wav(seconds: usize) -> Vec<u8> {
    let data = vec![0u8; seconds * 32_000];
    let mut out = b"RIFF".to_vec();
    out.extend((36 + data.len() as u32).to_le_bytes());
    out.extend(b"WAVEfmt ");
    out.extend(16u32.to_le_bytes());
    out.extend(1u16.to_le_bytes());
    out.extend(1u16.to_le_bytes());
    out.extend(16_000u32.to_le_bytes());
    out.extend(32_000u32.to_le_bytes());
    out.extend(2u16.to_le_bytes());
    out.extend(16u16.to_le_bytes());
    out.extend(b"data");
    out.extend((data.len() as u32).to_le_bytes());
    out.extend(data);
    out
}

// Issue 686 : mise en service mesurée, dans l'ordre de conclusion-680 §4.
// Moteur factice à coût simulé : deux flux diarisés dépassent le temps réel
// (2 × 0,9), deux flux sans diarisation tiennent (2 × 0,2).
#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn commissioning_picks_the_first_profile_that_keeps_up() {
    let Some(binary) = binary() else { return };
    let fixture = fixture(&binary);
    let host = fixture
        .host()
        .with_commissioning_audio(wav(8)[44..].to_vec(), wav(8)[44..].to_vec())
        .with_extra_args(&["--fake-cost", "0.9,0.6,0.2"]);
    assert_eq!(host.commissioning_progress(), None);
    let (result, seen) = tokio::join!(host.commission(true, Duration::from_secs(8)), async {
        let mut seen = Vec::new();
        for _ in 0..400 {
            tokio::time::sleep(Duration::from_millis(100)).await;
            if let Some(progress) = host.commissioning_progress()
                && seen.last() != Some(&progress)
            {
                seen.push(progress);
            }
            if seen.len() == 2 {
                break;
            }
        }
        seen
    });
    let result = result.expect("mise en service");
    // Avancement : profil 1 puis 2 sur 4, et arrêt au premier retenu.
    assert_eq!(seen, vec![(1, 4), (2, 4)]);
    assert_eq!(result.measures.len(), 2);
    assert_eq!(host.commissioning_progress(), None);
    use speech_host::commissioning::Profile;
    assert_eq!(result.measures[0].profile, Profile::TwoStreamsDiarized);
    assert!(!result.measures[0].passed, "{:?}", result.measures[0]);
    assert_eq!(result.profile, Some(Profile::TwoStreams), "{result:?}");
    let last = result.measures.last().unwrap();
    assert!(
        last.passed && last.finals >= 4 && last.p95_ms < 2000,
        "{last:?}"
    );
    // Enregistrée, liée à la construction du module.
    assert_eq!(host.commissioning(), Some(result));
    assert_eq!(
        host.profile(),
        Some(owhisper_client::OnDeviceProfile {
            two_streams: true,
            diarization: false
        })
    );
    host.stop().await;
}

// Le module publie ses mesures de charge pendant une écoute.
#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn the_module_reports_its_load() {
    let Some(binary) = binary() else { return };
    let fixture = fixture(&binary);
    let host = fixture
        .host()
        .with_extra_args(&["--fake-cost", "0.1,0.1,0.1"]);
    let target = host.target(true).await.unwrap();
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
    let (tx, mut rx) = tokio::sync::mpsc::channel::<owhisper_client::ListenClientInput>(8);
    let input = futures_util::stream::poll_fn(move |cx| rx.poll_recv(cx))
        .chain(futures_util::stream::pending());
    let (_output, _handle) = client.from_realtime_audio(Box::pin(input)).await.unwrap();
    let mut load = None;
    for _ in 0..400 {
        let _ = tx
            .send(MixedMessage::Audio(bytes::Bytes::from(vec![0u8; 640])))
            .await;
        tokio::time::sleep(Duration::from_millis(20)).await;
        if let Some(found) = host.load() {
            load = Some(found);
            break;
        }
    }
    let load = load.expect("mesures publiées");
    assert_eq!(load.sessions.len(), 1);
    assert_eq!(load.sessions[0].diarization, "full");
    assert!(load.sessions[0].rtf > 0.0);
    host.stop().await;
}

/// Mise en service réelle (binaire release, vrais modèles, audio MLS
/// compilé) : mêmes variables que `a_real_companion_starts…`. Mesure
/// d'appoint, 30 s par profil.
#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
#[ignore = "mise en service réelle, de moins d'une minute à environ trois minutes"]
async fn a_real_companion_is_commissioned() {
    let Some((host, _dir, _install)) = real_host() else {
        return;
    };
    let result = host
        .commission(true, speech_host::commissioning::MEASURE)
        .await
        .expect("mise en service");
    for measure in &result.measures {
        eprintln!("{measure:?}");
    }
    eprintln!("profil retenu : {:?}", result.profile);
    assert!(
        result.measures.iter().all(|m| m.finals >= 6),
        "assez de finals mesurés"
    );
    host.stop().await;
}

// Revue de l'issue 686, constat 3 : le module tombe pendant la mesure d'un
// profil ; ce profil est refusé avec sa raison, le module est relancé et la
// mesure passe au profil suivant.
#[cfg(unix)]
#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn a_profile_that_errors_is_refused_and_the_next_is_measured() {
    let Some(binary) = binary() else { return };
    let fixture = fixture(&binary);
    let host = std::sync::Arc::new(
        fixture
            .host()
            .with_commissioning_audio(wav(6)[44..].to_vec(), wav(6)[44..].to_vec())
            .with_extra_args(&["--fake-cost", "0.1,0.1,0.1"]),
    );
    let killer = {
        let host = host.clone();
        tokio::spawn(async move {
            for _ in 0..100 {
                tokio::time::sleep(Duration::from_millis(100)).await;
                if host.commissioning_progress() == Some((1, 4))
                    && let Some(pid) = host.pid().await
                {
                    tokio::time::sleep(Duration::from_secs(2)).await;
                    std::process::Command::new("kill")
                        .arg("-9")
                        .arg(pid.to_string())
                        .status()
                        .unwrap();
                    return;
                }
            }
        })
    };
    let result = host
        .commission(true, Duration::from_secs(6))
        .await
        .expect("mise en service");
    killer.await.unwrap();
    use speech_host::commissioning::Profile;
    assert!(!result.measures[0].passed);
    assert!(
        result.measures[0].error.is_some(),
        "{:?}",
        result.measures[0]
    );
    assert_eq!(result.profile, Some(Profile::TwoStreams), "{result:?}");
    host.stop().await;
}

/// Installation réelle depuis un dossier (issue 683) : les vrais modèles,
/// vérifiés contre les empreintes compilées de models.json, puis lancement
/// du compagnon release et une session : `SYNTHEO_SPEECH_RELEASE_BIN` et
/// `SYNTHEO_SPEECH_MODELS_SRC` (dossier qui contient nemotron/ et diar/).
#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
#[ignore = "copie ≈ 1 Go et lance le vrai moteur"]
async fn real_models_install_from_a_folder_and_run() {
    let (Some(binary), Some(source)) = (
        std::env::var_os("SYNTHEO_SPEECH_RELEASE_BIN"),
        std::env::var_os("SYNTHEO_SPEECH_MODELS_SRC"),
    ) else {
        return;
    };
    let install = tempfile::tempdir().unwrap();
    std::fs::copy(binary, install.path().join(binary_name())).unwrap();
    let companion = Companion::hashed_now(install.path(), &[binary_name()]).unwrap();
    let data = tempfile::tempdir().unwrap();
    let host = SpeechHost::new(data.path().to_path_buf(), Some(companion), 2);
    let started = std::time::Instant::now();
    host.install_models_from(source.into())
        .await
        .expect("modèles installés");
    eprintln!("installation : {:?}", started.elapsed());
    assert!(matches!(
        host.status().await.models,
        speech_host::models::ModelsStatus::Installed { .. }
    ));
    let target = host.target(true).await.expect("compagnon vérifié et lancé");
    session(target).await;
    host.stop().await;
}

// Revue de 7d72caf6, constat 18 : une annulation demandée hors installation
// n'annule pas l'installation suivante.
#[tokio::test]
async fn a_cancel_outside_an_installation_is_ignored() {
    let data = tempfile::tempdir().unwrap();
    let source = tempfile::tempdir().unwrap();
    std::fs::write(source.path().join("placeholder"), b"x").unwrap();
    let host = SpeechHost::new(data.path().to_path_buf(), None, 1).with_models(vec![placeholder()]);
    host.cancel_install();
    host.install_models_from(source.path().to_path_buf())
        .await
        .expect("installation non annulée");
    assert_eq!(
        std::fs::read(data.path().join("models/placeholder")).unwrap(),
        b"x"
    );
    assert!(host.install_progress().is_none());
}

// Revue de 7d72caf6, constat 7 : un lancement refusé par le système a son
// propre code, définitif.
#[test]
fn a_blocked_launch_has_its_own_permanent_code() {
    let error = HostError::ExecutionBlocked;
    assert!(error.is_permanent());
    assert_eq!(error.to_on_device_error().kind.code(), "execution_blocked");
}

fn kill(pid: u32) {
    std::process::Command::new("kill")
        .arg("-9")
        .arg(pid.to_string())
        .status()
        .unwrap();
}

fn tight_policy() -> speech_host::host::RestartPolicy {
    speech_host::host::RestartPolicy {
        max_attempts: 3,
        window: Duration::from_secs(600),
        stable_after: Duration::from_secs(600),
    }
}

// QA de 0.8.0-2 : des écoutes successives (lancement, arrêt voulu en fin
// d'écoute) ne sont pas des plantages et ne bloquent jamais la source.
#[tokio::test]
async fn intentional_stops_never_exhaust_the_restart_budget() {
    let Some(binary) = binary() else { return };
    let fixture = fixture(&binary);
    let host = fixture.host().with_restart_policy(tight_policy());
    for cycle in 0..10 {
        let target = host
            .target(true)
            .await
            .unwrap_or_else(|e| panic!("cycle {cycle} : {e:?}"));
        assert!(target.base_url.starts_with("http://127.0.0.1:"));
        host.stop().await;
        assert!(!host.is_running().await);
    }
    assert_eq!(host.verifications().await, 10);
}

// Le garde-fou reste entier : 3 morts non voulues dans la fenêtre bloquent.
#[tokio::test]
async fn unintended_deaths_still_exhaust_the_restart_budget() {
    let Some(binary) = binary() else { return };
    let fixture = fixture(&binary);
    let host = fixture.host().with_restart_policy(tight_policy());
    for _ in 0..3 {
        host.target(true).await.expect("lancement");
        kill(host.pid().await.unwrap());
        tokio::time::sleep(Duration::from_millis(200)).await;
    }
    assert_eq!(
        host.target(true).await.unwrap_err(),
        HostError::RestartBudget
    );
}

// Un module mort pendant la session, puis arrêté par la fin d'écoute, reste
// compté : l'arrêt voulu ne blanchit pas un plantage.
#[tokio::test]
async fn a_crash_followed_by_a_stop_still_counts() {
    let Some(binary) = binary() else { return };
    let fixture = fixture(&binary);
    let host = fixture.host().with_restart_policy(tight_policy());
    for _ in 0..3 {
        host.target(true).await.expect("lancement");
        kill(host.pid().await.unwrap());
        tokio::time::sleep(Duration::from_millis(200)).await;
        host.stop().await;
    }
    assert_eq!(
        host.target(true).await.unwrap_err(),
        HostError::RestartBudget
    );
}

// Arrêts voulus et plantages mêlés : seuls les plantages comptent.
#[tokio::test]
async fn only_crashes_count_between_intentional_stops() {
    let Some(binary) = binary() else { return };
    let fixture = fixture(&binary);
    let host = fixture.host().with_restart_policy(tight_policy());
    for _ in 0..2 {
        host.target(true).await.expect("lancement");
        kill(host.pid().await.unwrap());
        tokio::time::sleep(Duration::from_millis(200)).await;
        for _ in 0..3 {
            host.target(true).await.expect("relance puis écoutes");
            host.stop().await;
        }
    }
    // Deux plantages comptés sur trois admis : un lancement passe encore.
    host.target(true).await.expect("encore admis");
    kill(host.pid().await.unwrap());
    tokio::time::sleep(Duration::from_millis(200)).await;
    assert_eq!(
        host.target(true).await.unwrap_err(),
        HostError::RestartBudget
    );
}

/// Compagnon que le système refuse d'exécuter : son interpréteur n'est pas
/// exécutable, `execve` rend EACCES comme sur un montage noexec ou sous une
/// règle AppLocker.
#[cfg(unix)]
fn blocked_fixture() -> Fixture {
    use std::os::unix::fs::PermissionsExt;
    let install = tempfile::tempdir().unwrap();
    let binary = install.path().join(binary_name());
    std::fs::write(&binary, "#!/etc/passwd\n").unwrap();
    std::fs::set_permissions(&binary, std::fs::Permissions::from_mode(0o755)).unwrap();
    fixture_in(install)
}

// QA de 0.8.0-2 : exécution refusée par le système. La mise en service
// s'arrête au premier refus, avec sa raison, sans tenter les autres profils
// ni finir en « crashing » ; l'hôte rend la même raison ensuite.
#[cfg(unix)]
#[tokio::test]
async fn a_blocked_launch_stops_commissioning_with_its_reason() {
    let fixture = blocked_fixture();
    let host = fixture.host();
    let result = host
        .commission(true, Duration::from_secs(1))
        .await
        .expect("mesure enregistrée");
    assert_eq!(result.profile, None);
    assert_eq!(result.measures.len(), 1, "{:?}", result.measures);
    assert_eq!(
        result.measures[0].error.as_deref(),
        Some("execution_blocked")
    );
    assert_eq!(host.launch_refusal().as_deref(), Some("execution_blocked"));
    assert_eq!(host.verifications().await, 1);
    assert_eq!(
        host.target(true).await.unwrap_err(),
        HostError::ExecutionBlocked
    );
}

// Un module qui s'arrête aussitôt n'est pas un refus d'exécution : chaque
// profil échoue (lancement raté, passager) jusqu'à la pause de relances, et
// la mesure est alors refusée sans rien enregistrer.
#[cfg(unix)]
#[tokio::test]
async fn a_crashing_module_is_not_a_launch_refusal() {
    let fixture = crashing_fixture();
    let host = fixture.host();
    let error = host
        .commission(true, Duration::from_secs(1))
        .await
        .unwrap_err();
    assert_eq!(error, "crashing");
    assert!(host.commissioning().is_none());
    assert_eq!(host.launch_refusal(), None);
}

// Vérification de f84794c4 : sous Windows, un accès refusé peut venir d'un
// antivirus qui tient la copie privée tout juste écrite. Une seule nouvelle
// tentative, avec une copie neuve, avant de le déclarer définitif.
#[cfg(unix)]
#[tokio::test]
async fn windows_retries_an_access_denied_launch_once_with_a_fresh_copy() {
    let fixture = blocked_fixture();
    let host = fixture.host().with_windows_spawn_rules();
    assert_eq!(
        host.target(true).await.unwrap_err(),
        HostError::ExecutionBlocked
    );
    // Deux vérifications (deux copies) pour une seule tentative comptée.
    assert_eq!(host.verifications().await, 2);
    // Sans les règles de Windows (Linux, noexec) : définitif tout de suite.
    let linux_fixture = blocked_fixture();
    let linux = linux_fixture.host();
    assert_eq!(
        linux.target(true).await.unwrap_err(),
        HostError::ExecutionBlocked
    );
    assert_eq!(linux.verifications().await, 1);
}

// Vérification de f84794c4 : un poste mesuré dont le module plante en boucle
// pendant l'écoute. « Mesurer à nouveau » pendant le refus de 10 min est
// refusé sans rien écrire ; le profil retenu est gardé.
#[cfg(unix)]
#[tokio::test]
async fn a_measure_during_the_restart_pause_keeps_the_profile() {
    use speech_host::commissioning::{Commissioning, Profile, load, save};
    let fixture = crashing_fixture();
    let build = fixture.companion().build_id() ^ speech_host::models::fingerprint();
    let kept = Commissioning {
        profile: Some(Profile::TwoStreamsDiarized),
        measures: vec![],
        measured_at: 1,
        module_build: build,
    };
    save(fixture.data.path(), &kept).unwrap();
    let host = fixture
        .host()
        .with_restart_policy(speech_host::host::RestartPolicy {
            max_attempts: 2,
            window: Duration::from_secs(600),
            stable_after: Duration::from_secs(600),
        });
    assert!(host.profile().is_some());
    for _ in 0..2 {
        assert!(matches!(host.target(true).await, Err(HostError::Launch(_))));
    }
    assert_eq!(
        host.target(true).await.unwrap_err(),
        HostError::RestartBudget
    );
    let error = host
        .commission(true, Duration::from_secs(1))
        .await
        .unwrap_err();
    assert_eq!(error, "crashing");
    assert!(host.profile().is_some());
    assert_eq!(load(fixture.data.path(), build), Some(kept));
    assert_eq!(host.launch_refusal(), None);
}

// QA 0.8.0-3 : le système refuse d'exécuter le programme pendant une écoute,
// après une mise en service réussie (politique ajoutée, montage noexec). Le
// profil retenu ne vaut plus : la mise en service enregistrée le perd, avec
// ce refus pour raison ; l'hôte et l'application le disent jusqu'à une
// nouvelle mesure.
#[cfg(unix)]
#[tokio::test]
async fn a_launch_refused_after_commissioning_forgets_the_profile() {
    use speech_host::commissioning::{Commissioning, Profile, load, save};
    let fixture = blocked_fixture();
    let build = fixture.companion().build_id() ^ speech_host::models::fingerprint();
    save(
        fixture.data.path(),
        &Commissioning {
            profile: Some(Profile::TwoStreamsDiarized),
            measures: vec![],
            measured_at: 1,
            module_build: build,
        },
    )
    .unwrap();
    let host = fixture.host();
    assert!(host.profile().is_some());
    assert_eq!(host.launch_refusal(), None);

    assert_eq!(
        host.target(true).await.unwrap_err(),
        HostError::ExecutionBlocked
    );
    assert!(host.profile().is_none());
    assert_eq!(host.launch_refusal().as_deref(), Some("execution_blocked"));
    let saved = load(fixture.data.path(), build).expect("mise en service gardée");
    assert_eq!(saved.profile, None);
    assert_eq!(saved.measures.len(), 1);
    assert_eq!(saved.measures[0].profile, Profile::TwoStreamsDiarized);
    assert_eq!(
        saved.measures[0].error.as_deref(),
        Some("execution_blocked")
    );
    // Un nouvel hôte (redémarrage de l'application) lit le même état.
    assert_eq!(
        fixture.host().launch_refusal().as_deref(),
        Some("execution_blocked")
    );
}

// Revue QA 0.8.0-3, constat 5 : sous Windows, un accès refusé répété (deux
// copies neuves refusées, peut-être par un antivirus) fait échouer l'écoute
// en cours seulement. Le profil retenu reste, rien n'est écrit, et l'écoute
// suivante retente le lancement.
#[cfg(unix)]
#[tokio::test]
async fn a_repeated_access_denied_during_listening_keeps_the_profile() {
    use speech_host::commissioning::{Commissioning, Profile, load, save};
    let fixture = blocked_fixture();
    let build = fixture.companion().build_id() ^ speech_host::models::fingerprint();
    let kept = Commissioning {
        profile: Some(Profile::TwoStreamsDiarized),
        measures: vec![],
        measured_at: 1,
        module_build: build,
    };
    save(fixture.data.path(), &kept).unwrap();
    let host = fixture.host().with_windows_spawn_rules();
    assert!(host.profile().is_some());

    assert_eq!(
        host.target(true).await.unwrap_err(),
        HostError::ExecutionBlocked
    );
    assert_eq!(host.verifications().await, 2);
    assert!(host.profile().is_some());
    assert_eq!(host.launch_refusal(), None);
    assert_eq!(load(fixture.data.path(), build), Some(kept.clone()));

    // L'écoute suivante relance le module (deux nouvelles copies).
    assert_eq!(
        host.target(true).await.unwrap_err(),
        HostError::ExecutionBlocked
    );
    assert_eq!(host.verifications().await, 4);
    assert!(host.profile().is_some());
    assert_eq!(load(fixture.data.path(), build), Some(kept.clone()));
    // Un nouvel hôte (redémarrage de l'application) garde le profil.
    assert_eq!(fixture.host().launch_refusal(), None);

    // Vérification 789ef9bb (V1) : un refus d'exécution ne démarre aucun
    // processus et ne consomme pas le budget de relances (3 lancements en
    // 10 min). Cinq écoutes de suite restent « exécution refusée », jamais
    // « crashing ».
    for _ in 0..3 {
        assert_eq!(
            host.target(true).await.unwrap_err(),
            HostError::ExecutionBlocked
        );
    }
    assert_eq!(host.verifications().await, 10);
    assert!(host.profile().is_some());
    // « Mesurer à nouveau » n'est pas bloqué par une pause de relances : la
    // mesure s'arrête sur le refus et l'enregistre.
    let result = host
        .commission(true, Duration::from_secs(1))
        .await
        .expect("mesure enregistrée");
    assert_eq!(result.profile, None);
    assert_eq!(
        result.measures.last().and_then(|m| m.error.as_deref()),
        Some("execution_blocked")
    );
}
