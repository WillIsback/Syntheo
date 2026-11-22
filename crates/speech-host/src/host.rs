//! Cycle de vie du processus `syntheo-speech` (issue 684).
//!
//! - Avant chaque lancement : vérification des empreintes (`verify`).
//! - Lancement : environnement vidé (aucune clé d'API héritée), dossier du
//!   module comme dossier courant, jeton aléatoire écrit sur l'entrée
//!   standard (jamais sur la ligne de commande, dans l'environnement ni dans
//!   un journal), annonce lue sur la sortie standard.
//! - Le jeton et le port du lancement en cours restent en mémoire ; un module
//!   mort est relancé avec un nouveau jeton et un nouveau port, jamais
//!   reconnecté à l'ancien. Les relances sont bornées.
//! - Arrêt : fermeture de l'entrée standard (le module s'arrête), puis arrêt
//!   forcé après un délai. Le processus meurt aussi avec l'application.

use std::path::PathBuf;
use std::process::Stdio;
use std::time::Duration;

use owhisper_client::{OnDeviceTarget, OnDeviceToken};
use syntheo_supervisor::{RestartBudget, RestartTracker};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, ChildStdin, Command};
use tokio::sync::Mutex;

use crate::verify::{Verified, verify};

/// Version du protocole entre l'application et le module.
pub const PROTOCOL: u64 = 1;
/// Délai de chargement du moteur jusqu'à l'annonce.
const ANNOUNCE_TIMEOUT: Duration = Duration::from_secs(60);
/// Délai d'arrêt propre avant l'arrêt forcé.
const STOP_TIMEOUT: Duration = Duration::from_secs(3);
/// Longueur maximale d'une ligne de journal du module relayée.
const MAX_LOG_LINE: usize = 200;

/// Variables d'environnement transmises au module : rien d'autre (aucune clé
/// d'API, aucun jeton). Windows a besoin de quelques variables système pour
/// charger ses bibliothèques.
const KEPT_ENV: &[&str] = if cfg!(windows) {
    &["SystemRoot", "SYSTEMROOT", "windir", "TEMP", "TMP"]
} else {
    &[]
};

#[derive(Debug, PartialEq, Eq)]
pub enum HostError {
    /// Interdit par un réglage géré.
    Disabled,
    /// Module absent, altéré ou incomplet.
    Verify(String),
    /// Le processus n'a pas démarré ou n'a pas annoncé son port.
    Launch(String),
    /// Trop de relances rapprochées : le module plante en boucle.
    RestartBudget,
}

impl std::fmt::Display for HostError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Disabled => f.write_str("on-device transcription is disabled by policy"),
            Self::Verify(message) => write!(f, "on-device module rejected: {message}"),
            Self::Launch(message) => write!(f, "on-device module failed to start: {message}"),
            Self::RestartBudget => f.write_str("on-device module keeps stopping"),
        }
    }
}

/// Un lancement en cours.
struct Running {
    child: Child,
    /// Gardée ouverte : sa fermeture arrête le module.
    stdin: Option<ChildStdin>,
    target: OnDeviceTarget,
}

/// Tire un jeton de 32 octets (deux UUID v4 : 244 bits aléatoires).
fn fresh_token() -> Vec<u8> {
    let mut bytes = uuid::Uuid::new_v4().as_bytes().to_vec();
    bytes.extend_from_slice(uuid::Uuid::new_v4().as_bytes());
    bytes
}

fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

/// Lance le module vérifié ; rend le lancement une fois le port annoncé.
async fn launch(verified: &Verified, engine: &str, threads: usize) -> Result<Running, HostError> {
    let mut command = Command::new(&verified.binary);
    command
        .arg("--engine")
        .arg(engine)
        .arg("--models")
        .arg(&verified.models)
        .arg("--threads")
        .arg(threads.max(1).to_string())
        .current_dir(&verified.dir)
        .env_clear()
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true);
    for name in KEPT_ENV {
        if let Some(value) = std::env::var_os(name) {
            command.env(name, value);
        }
    }
    #[cfg(windows)]
    {
        // Aucune fenêtre de console.
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        command.creation_flags(CREATE_NO_WINDOW);
    }
    let mut child = command
        .spawn()
        .map_err(|e| HostError::Launch(format!("{:?}", e.kind())))?;

    let token = fresh_token();
    let mut stdin = child
        .stdin
        .take()
        .ok_or_else(|| HostError::Launch("no stdin".into()))?;
    stdin
        .write_all(format!("{}\n", hex(&token)).as_bytes())
        .await
        .map_err(|_| HostError::Launch("stdin closed".into()))?;
    stdin
        .flush()
        .await
        .map_err(|_| HostError::Launch("stdin closed".into()))?;

    if let Some(stderr) = child.stderr.take() {
        // Journal du module : des nombres et des états, jamais de texte
        // transcrit (contrat du module) ; lignes tronquées par prudence.
        tokio::spawn(async move {
            let mut lines = BufReader::new(stderr).lines();
            while let Ok(Some(line)) = lines.next_line().await {
                let line: String = line.chars().take(MAX_LOG_LINE).collect();
                tracing::info!(target: "syntheo_speech", "{line}");
            }
        });
    }

    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| HostError::Launch("no stdout".into()))?;
    let mut announce = String::new();
    let mut reader = BufReader::new(stdout);
    tokio::time::timeout(ANNOUNCE_TIMEOUT, reader.read_line(&mut announce))
        .await
        .map_err(|_| HostError::Launch("no announcement".into()))?
        .map_err(|_| HostError::Launch("no announcement".into()))?;
    let value: serde_json::Value = serde_json::from_str(&announce)
        .map_err(|_| HostError::Launch("invalid announcement".into()))?;
    let port = value["port"].as_u64().filter(|p| (1..=65535).contains(p));
    if value["event"] != "listening" || value["protocol"].as_u64() != Some(PROTOCOL) {
        return Err(HostError::Launch("unexpected announcement".into()));
    }
    let port = port.ok_or_else(|| HostError::Launch("invalid port".into()))? as u16;
    let token = OnDeviceToken::new(token).ok_or_else(|| HostError::Launch("token".into()))?;
    Ok(Running {
        child,
        stdin: Some(stdin),
        target: OnDeviceTarget {
            base_url: format!("http://127.0.0.1:{port}"),
            token,
        },
    })
}

/// Hôte du module : un lancement à la fois, relancé au besoin.
pub struct SpeechHost {
    dir: PathBuf,
    engine: String,
    threads: usize,
    state: Mutex<HostState>,
}

struct HostState {
    running: Option<Running>,
    restarts: RestartTracker,
    budget: RestartBudget,
}

impl SpeechHost {
    /// `dir` : dossier du module installé ; `threads` : fils par session.
    pub fn new(dir: PathBuf, threads: usize) -> Self {
        Self {
            dir,
            engine: "parakeet".to_owned(),
            threads,
            state: Mutex::new(HostState {
                running: None,
                restarts: RestartTracker::new(),
                budget: RestartBudget::default(),
            }),
        }
    }

    /// Moteur du module (`parakeet` par défaut ; `fake` pour les essais avec
    /// un binaire construit avec le moteur factice).
    pub fn with_engine(mut self, engine: &str) -> Self {
        self.engine = engine.to_owned();
        self
    }

    /// Cible du lancement en cours ; lance ou relance le module au besoin
    /// (après vérification des empreintes). `allowed` : réglage géré.
    pub async fn target(&self, allowed: bool) -> Result<OnDeviceTarget, HostError> {
        if !allowed {
            self.stop().await;
            return Err(HostError::Disabled);
        }
        let mut state = self.state.lock().await;
        if let Some(running) = state.running.as_mut() {
            match running.child.try_wait() {
                Ok(None) => return Ok(running.target.clone()),
                // Mort : jamais de reconnexion à son port.
                _ => {
                    tracing::warn!(target: "syntheo_speech", "module stopped; restarting");
                    state.running = None;
                    let budget = state.budget.clone();
                    state.restarts.maybe_reset(&budget);
                    if !state.restarts.record_restart(&budget) {
                        return Err(HostError::RestartBudget);
                    }
                }
            }
        }
        let dir = self.dir.clone();
        let verified = tokio::task::spawn_blocking(move || verify(&dir))
            .await
            .map_err(|_| HostError::Verify("verification failed".into()))?
            .map_err(|e| HostError::Verify(e.to_string()))?;
        let running = launch(&verified, &self.engine, self.threads).await?;
        let target = running.target.clone();
        state.running = Some(running);
        Ok(target)
    }

    /// Arrête le lancement en cours, s'il y en a un.
    pub async fn stop(&self) {
        let running = self.state.lock().await.running.take();
        let Some(mut running) = running else { return };
        drop(running.stdin.take());
        if tokio::time::timeout(STOP_TIMEOUT, running.child.wait())
            .await
            .is_err()
        {
            let _ = running.child.kill().await;
        }
    }

    /// Un lancement est en cours (essais, diagnostic).
    pub async fn is_running(&self) -> bool {
        let mut state = self.state.lock().await;
        state
            .running
            .as_mut()
            .is_some_and(|r| matches!(r.child.try_wait(), Ok(None)))
    }

    /// PID du lancement en cours (essais).
    pub async fn pid(&self) -> Option<u32> {
        self.state
            .lock()
            .await
            .running
            .as_ref()
            .and_then(|r| r.child.id())
    }
}
