//! Cycle de vie du processus `syntheo-speech` (issue 684).
//!
//! - Avant chaque lancement : fichiers du compagnon et modèles contrôlés
//!   contre leurs empreintes compilées (`verify`).
//! - Lancement : environnement vidé (aucune clé d'API héritée), dossier du
//!   module comme dossier courant, jeton aléatoire écrit sur l'entrée
//!   standard (jamais sur la ligne de commande, dans l'environnement ni dans
//!   un journal), annonce lue sur la sortie standard.
//! - Le jeton et le port du lancement en cours restent en mémoire ; un module
//!   mort est relancé avec un nouveau jeton et un nouveau port, jamais
//!   reconnecté à l'ancien.
//! - Chaque tentative de lancement compte, réussie ou non, avant la
//!   vérification : au-delà de `RestartPolicy::max_attempts` dans la fenêtre,
//!   l'hôte est « en panne » et refuse tout lancement jusqu'à la fin de la
//!   fenêtre. Le compte repart à zéro après un lancement resté vivant
//!   `RestartPolicy::stable_after`. Un module refusé à la vérification n'est
//!   plus revérifié avant `stop` (fin d'écoute).
//! - Arrêt : fermeture de l'entrée standard (le module s'arrête), puis arrêt
//!   forcé après un délai. Le processus meurt aussi avec l'application.

use std::path::PathBuf;
use std::process::Stdio;
use std::time::{Duration, Instant};

use owhisper_client::{OnDeviceTarget, OnDeviceToken};
use std::sync::Arc;

use tokio::io::{AsyncBufReadExt, AsyncReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, ChildStdin, Command};
use tokio::sync::Mutex;

use crate::companion::Companion;
use crate::models::{ModelFile, ModelsStatus, Source};
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
    /// Trop de tentatives rapprochées : le module plante en boucle.
    RestartBudget,
    /// Une installation du module est en cours.
    Installing,
    /// Une mesure de mise en service est en cours.
    Measuring,
    /// Le système a refusé d'exécuter la copie vérifiée du programme (dossier
    /// de données) : AppLocker ou SRP par règles de chemin, montage noexec.
    ExecutionBlocked,
}

impl HostError {
    /// Refus définitif pour la durée de l'écoute : ne pas réessayer.
    pub fn is_permanent(&self) -> bool {
        !matches!(self, Self::Launch(_) | Self::Installing | Self::Measuring)
    }

    /// Erreur à transmettre au listener.
    pub fn to_on_device_error(&self) -> owhisper_client::OnDeviceError {
        use owhisper_client::OnDeviceErrorKind as Kind;
        let kind = match self {
            Self::Disabled => Kind::Disabled,
            Self::Verify(_) => Kind::Invalid,
            Self::RestartBudget => Kind::Crashing,
            Self::Launch(_) => Kind::FailedToStart,
            Self::ExecutionBlocked => Kind::ExecutionBlocked,
            Self::Installing => Kind::Installing,
            Self::Measuring => Kind::Measuring,
        };
        owhisper_client::OnDeviceError {
            kind,
            message: self.to_string(),
        }
    }
}

/// Borne des tentatives de lancement.
#[derive(Debug, Clone)]
pub struct RestartPolicy {
    /// Tentatives admises dans la fenêtre.
    pub max_attempts: usize,
    /// Fenêtre de comptage, et durée de l'état « en panne ».
    pub window: Duration,
    /// Durée de vie après laquelle un lancement remet le compte à zéro.
    pub stable_after: Duration,
}

impl Default for RestartPolicy {
    fn default() -> Self {
        Self {
            max_attempts: 3,
            window: Duration::from_secs(10 * 60),
            stable_after: Duration::from_secs(60),
        }
    }
}

impl std::fmt::Display for HostError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Disabled => f.write_str("on-device transcription is disabled by policy"),
            Self::Verify(message) => write!(f, "on-device module rejected: {message}"),
            Self::Launch(message) => write!(f, "on-device module failed to start: {message}"),
            Self::RestartBudget => f.write_str("on-device module keeps stopping"),
            Self::Installing => f.write_str("on-device module is being installed"),
            Self::Measuring => f.write_str("on-device module is being measured"),
            Self::ExecutionBlocked => f.write_str(
                "the system refused to run the on-device program from the app data folder (application control policy or noexec mount)",
            ),
        }
    }
}

/// Un lancement en cours.
struct Running {
    child: Child,
    /// Gardée ouverte : sa fermeture arrête le module.
    stdin: Option<ChildStdin>,
    target: OnDeviceTarget,
    started_at: Instant,
    /// Tentative comptée pour ce lancement (instant ajouté à `attempts`) :
    /// retirée si le lancement se termine par un arrêt voulu.
    attempt: Option<Instant>,
    /// Objets vérifiés gardés tant que le processus vit.
    _staging: Option<crate::verify::Staging>,
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
/// Dossier courant du module : jamais le dossier du module (aucune
/// bibliothèque ne doit pouvoir y être cherchée).
fn neutral_dir() -> PathBuf {
    if cfg!(windows) {
        std::env::var_os("SystemRoot")
            .map(|root| PathBuf::from(root).join("System32"))
            .unwrap_or_else(std::env::temp_dir)
    } else {
        PathBuf::from("/")
    }
}

/// Mesures de charge publiées par le module pendant une écoute (issue 686).
#[derive(Debug, Clone, PartialEq, serde::Serialize)]
pub struct SessionLoad {
    pub lag_ms: u64,
    pub rtf: f64,
    /// `full`, `spaced` ou `off`.
    pub diarization: String,
    pub audio_s: f64,
}

#[derive(Debug, Clone, Default, PartialEq, serde::Serialize)]
pub struct ModuleLoad {
    pub sessions: Vec<SessionLoad>,
}

/// Lit une ligne de mesures ; tout autre contenu est ignoré.
fn parse_load(line: &str) -> Option<ModuleLoad> {
    let value: serde_json::Value = serde_json::from_str(line).ok()?;
    if value["event"] != "metrics" {
        return None;
    }
    let sessions = value["sessions"]
        .as_array()?
        .iter()
        .take(16)
        .filter_map(|s| {
            let diarization = s["diarization"].as_str()?;
            ["full", "spaced", "off"]
                .contains(&diarization)
                .then(|| SessionLoad {
                    lag_ms: s["lag_ms"].as_u64().unwrap_or(0),
                    rtf: s["rtf"].as_f64().unwrap_or(0.0),
                    diarization: diarization.to_owned(),
                    audio_s: s["audio_s"].as_f64().unwrap_or(0.0),
                })
        })
        .collect();
    Some(ModuleLoad { sessions })
}

type LoadSlot = Arc<std::sync::Mutex<Option<(Instant, ModuleLoad)>>>;

async fn launch(
    verified: Verified,
    engine: &str,
    threads: usize,
    extra_args: &[String],
    load: LoadSlot,
    windows_rules: bool,
) -> Result<Running, LaunchFailure> {
    let mut command = Command::new(&verified.binary);
    command.args(extra_args);
    command
        .arg("--engine")
        .arg(engine)
        .arg("--models")
        .arg(&verified.models)
        .arg("--threads")
        .arg(threads.max(1).to_string())
        .current_dir(neutral_dir())
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
    #[cfg(unix)]
    {
        // Les modèles vérifiés passent par descripteur hérité : seuls ceux-là
        // perdent FD_CLOEXEC, dans le processus fils, juste avant exec.
        let fds = verified.staging.inherited_fds();
        // SAFETY : fcntl est sûr entre fork et exec ; aucune allocation.
        unsafe {
            command.pre_exec(move || {
                for fd in &fds {
                    let flags = libc::fcntl(*fd, libc::F_GETFD);
                    if flags < 0 || libc::fcntl(*fd, libc::F_SETFD, flags & !libc::FD_CLOEXEC) < 0 {
                        return Err(std::io::Error::last_os_error());
                    }
                }
                Ok(())
            });
        }
    }
    #[cfg(windows)]
    {
        // Aucune fenêtre de console.
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        command.creation_flags(CREATE_NO_WINDOW);
    }
    let mut child = command.spawn().map_err(|e| {
        // La copie vérifiée s'exécute depuis le dossier de données : une
        // politique de contrôle des applications par chemin (AppLocker,
        // SRP) ou un montage noexec la refuse (issue 683, revue 7).
        match classify_spawn_error(&e, windows_rules) {
            SpawnRefusal::Blocked => LaunchFailure::Host(HostError::ExecutionBlocked),
            SpawnRefusal::AccessDenied => LaunchFailure::AccessDenied,
            SpawnRefusal::Other => {
                LaunchFailure::Host(HostError::Launch(format!("{:?}", e.kind())))
            }
        }
    })?;

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
        return Err(HostError::Launch("unexpected announcement".into()).into());
    }
    let port = port.ok_or_else(|| HostError::Launch("invalid port".into()))? as u16;
    let token = OnDeviceToken::new(token).ok_or_else(|| HostError::Launch("token".into()))?;
    // Après l'annonce, la sortie standard porte les mesures de charge (toutes
    // les 5 s pendant une écoute) ; lignes bornées.
    tokio::spawn(async move {
        let mut line = String::new();
        loop {
            line.clear();
            let read = (&mut reader).take(64 * 1024).read_line(&mut line).await;
            match read {
                Ok(0) | Err(_) => break,
                Ok(_) => {
                    if let Some(parsed) = parse_load(&line) {
                        *load.lock().unwrap_or_else(|e| e.into_inner()) =
                            Some((Instant::now(), parsed));
                    }
                }
            }
        }
    });
    // Le module rouvre le modèle de diarisation à chaque session : copie
    // privée, descripteurs et handles restent jusqu'à sa mort.
    let staging = Some(verified.staging);
    Ok(Running {
        child,
        stdin: Some(stdin),
        _staging: staging,
        started_at: Instant::now(),
        attempt: None,
        target: OnDeviceTarget {
            base_url: format!("http://127.0.0.1:{port}"),
            token,
        },
    })
}

/// Hôte du compagnon : un lancement à la fois, relancé au besoin.
pub struct SpeechHost {
    /// Dossier de données de la source (`<données>/speech`) : modèles, copies
    /// privées de lancement, mise en service.
    root: PathBuf,
    /// Compagnon livré avec l'application ; `None` : construction sans lui.
    companion: Option<Companion>,
    /// Modèles attendus (compilés).
    models: Vec<ModelFile>,
    /// Audio de mise en service (PCM16 16 kHz), compilé.
    audio: [Vec<u8>; 2],
    engine: String,
    /// Arguments supplémentaires du module (essais : coût du moteur factice).
    extra_args: Vec<String>,
    threads: usize,
    policy: RestartPolicy,
    state: Mutex<HostState>,
    /// Dernières mesures de charge du module.
    load: LoadSlot,
    /// Installation ou retrait des modèles en cours : `target()` refuse
    /// aussitôt.
    installing: std::sync::atomic::AtomicBool,
    /// Demande d'annulation de l'installation en cours.
    cancel: Arc<std::sync::atomic::AtomicBool>,
    /// Avancement de l'installation : octets écrits, octets à écrire.
    progress: Arc<std::sync::Mutex<Option<(u64, u64)>>>,
    /// Mesure de mise en service en cours : `target()` refuse aussitôt.
    measuring: std::sync::atomic::AtomicBool,
    /// Profil en cours de mesure (1 à 4), 0 hors mesure.
    measuring_profile: std::sync::atomic::AtomicUsize,
    /// Mise en service du compagnon, lue une fois puis gardée.
    commissioned: std::sync::Mutex<Option<Option<crate::commissioning::Commissioning>>>,
    /// Règles de lancement de Windows (accès refusé retenté une fois) ;
    /// activables sur une autre plateforme pour les essais.
    windows_spawn_rules: bool,
}

/// Libère un indicateur (installation, mesure), même en cas d'erreur.
struct InstallingGuard<'a>(&'a std::sync::atomic::AtomicBool);

impl Drop for InstallingGuard<'_> {
    fn drop(&mut self) {
        self.0.store(false, std::sync::atomic::Ordering::SeqCst);
    }
}

#[derive(Default)]
struct HostState {
    running: Option<Running>,
    /// Tentatives de lancement dans la fenêtre.
    attempts: Vec<Instant>,
    /// « En panne » jusqu'à cet instant.
    blocked_until: Option<Instant>,
    /// Refus de vérification, rendu sans revérifier jusqu'à `stop`.
    rejected: Option<String>,
    /// Nombre de vérifications faites (essais).
    verifications: usize,
}

/// État de la source, pour l'interface (sans hachage).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct SpeechStatus {
    /// Le compagnon est livré avec l'application et présent.
    pub companion: bool,
    pub models: ModelsStatus,
}

impl SpeechHost {
    /// `root` : dossier de données de la source ; `companion` : compagnon de
    /// l'application ; `threads` : fils par session.
    pub fn new(root: PathBuf, companion: Option<Companion>, threads: usize) -> Self {
        let audio = crate::commissioning::AUDIO.map(|wav| {
            crate::commissioning::wav_pcm16(wav)
                .unwrap_or_default()
                .to_vec()
        });
        Self {
            root,
            companion,
            models: crate::models::files().to_vec(),
            audio,
            engine: "parakeet".to_owned(),
            extra_args: Vec::new(),
            threads,
            policy: RestartPolicy::default(),
            state: Mutex::new(HostState::default()),
            installing: Default::default(),
            cancel: Default::default(),
            progress: Default::default(),
            commissioned: Default::default(),
            measuring: Default::default(),
            measuring_profile: Default::default(),
            load: LoadSlot::default(),
            windows_spawn_rules: cfg!(windows),
        }
    }

    /// Essais : applique les règles de lancement de Windows.
    #[doc(hidden)]
    pub fn with_windows_spawn_rules(mut self) -> Self {
        self.windows_spawn_rules = true;
        self
    }

    /// Modèles attendus (essais : un modèle factice).
    pub fn with_models(mut self, models: Vec<ModelFile>) -> Self {
        self.models = models;
        self
    }

    /// Audio de mise en service, PCM16 16 kHz (essais : plus court).
    pub fn with_commissioning_audio(mut self, mic: Vec<u8>, sys: Vec<u8>) -> Self {
        self.audio = [mic, sys];
        self
    }

    /// Moteur du module (`parakeet` par défaut ; `fake` pour les essais avec
    /// un binaire construit avec le moteur factice).
    pub fn with_engine(mut self, engine: &str) -> Self {
        self.engine = engine.to_owned();
        self
    }

    /// Arguments supplémentaires du module (essais).
    pub fn with_extra_args(mut self, args: &[&str]) -> Self {
        self.extra_args = args.iter().map(|a| (*a).to_owned()).collect();
        self
    }

    /// Borne des tentatives (essais).
    pub fn with_restart_policy(mut self, policy: RestartPolicy) -> Self {
        self.policy = policy;
        self
    }

    /// Dossier des modèles installés.
    pub fn models_dir(&self) -> PathBuf {
        self.root.join("models")
    }

    /// Cible du lancement en cours ; lance ou relance le module au besoin
    /// (après vérification des empreintes). `allowed` : réglage géré.
    pub async fn target(&self, allowed: bool) -> Result<OnDeviceTarget, HostError> {
        if !allowed {
            self.stop().await;
            return Err(HostError::Disabled);
        }
        // Pendant une installation, refus immédiat plutôt qu'une attente du
        // verrou pendant toute la copie.
        if self.installing.load(std::sync::atomic::Ordering::SeqCst) {
            return Err(HostError::Installing);
        }
        if self.measuring.load(std::sync::atomic::Ordering::SeqCst) {
            return Err(HostError::Measuring);
        }
        let result = self.launch_target().await;
        if matches!(result, Err(HostError::ExecutionBlocked)) {
            self.forget_profile_after_refusal(HostError::ExecutionBlocked);
        }
        result
    }

    /// QA 0.8.0-3 : le système refuse d'exécuter le programme après une mise
    /// en service réussie (politique ajoutée, montage noexec). Le profil
    /// retenu ne vaut plus : la mise en service enregistrée le perd, avec ce
    /// refus pour raison, comme une mise en service arrêtée par lui ; la
    /// carte et le statut le disent jusqu'à une nouvelle mesure.
    fn forget_profile_after_refusal(&self, error: HostError) {
        let Some(mut commissioning) = self.commissioning() else {
            return;
        };
        let Some(profile) = commissioning.profile.take() else {
            return;
        };
        let reason = error.to_on_device_error().kind.code().to_owned();
        tracing::warn!(target: "syntheo_speech", "launch refused after commissioning: {reason}");
        commissioning
            .measures
            .push(crate::commissioning::Measure::failed(profile, reason));
        // Même en cas d'échec d'écriture, la mémoire ne retient plus le profil.
        if crate::commissioning::save(&self.root, &commissioning).is_err() {
            tracing::warn!(target: "syntheo_speech", "commissioning not saved after refusal");
        }
        *self.commissioned.lock().unwrap_or_else(|e| e.into_inner()) = Some(Some(commissioning));
    }

    /// `target` sans les refus d'état (la mesure elle-même).
    async fn launch_target(&self) -> Result<OnDeviceTarget, HostError> {
        let mut state = self.state.lock().await;
        let now = Instant::now();
        if let Some(running) = state.running.as_mut() {
            if matches!(running.child.try_wait(), Ok(None)) {
                let stable = now.duration_since(running.started_at) >= self.policy.stable_after;
                let target = running.target.clone();
                if stable {
                    state.attempts.clear();
                }
                return Ok(target);
            }
            // Mort : jamais de reconnexion à son port.
            tracing::warn!(target: "syntheo_speech", "module stopped");
            state.running = None;
        }
        if let Some(message) = &state.rejected {
            return Err(HostError::Verify(message.clone()));
        }
        if state.blocked_until.is_some_and(|until| now < until) {
            return Err(HostError::RestartBudget);
        }
        state.blocked_until = None;
        let window = self.policy.window;
        state.attempts.retain(|at| now.duration_since(*at) < window);
        if state.attempts.len() >= self.policy.max_attempts {
            tracing::warn!(target: "syntheo_speech", "module keeps stopping; launches paused");
            state.blocked_until = Some(now + window);
            return Err(HostError::RestartBudget);
        }
        state.attempts.push(now);
        // Sous Windows, un accès refusé (ERROR_ACCESS_DENIED) peut venir d'un
        // antivirus qui tient encore la copie privée tout juste écrite : une
        // seule nouvelle tentative, avec une copie neuve, avant de le déclarer
        // définitif. Un refus de politique (1260) ou, sous Linux, un montage
        // noexec est définitif tout de suite.
        let mut retried = false;
        let running = loop {
            state.verifications += 1;
            let (root, companion, models) = (
                self.root.clone(),
                self.companion.clone(),
                self.models.clone(),
            );
            let verified = match tokio::task::spawn_blocking(move || {
                crate::verify::remove_stale_copies(&root);
                verify(companion.as_ref(), &root.join("models"), &models, &root)
            })
            .await
            {
                Ok(Ok(verified)) => verified,
                // Erreur d'entrée-sortie (disque plein…) : passagère, comptée
                // comme un lancement raté, jamais rangée comme refus.
                Ok(Err(crate::verify::VerifyError::Io)) => {
                    return Err(HostError::Launch(
                        crate::verify::VerifyError::Io.to_string(),
                    ));
                }
                Ok(Err(error)) => {
                    state.rejected = Some(error.code().to_owned());
                    return Err(HostError::Verify(error.code().to_owned()));
                }
                Err(_) => return Err(HostError::Verify("io".into())),
            };
            match launch(
                verified,
                &self.engine,
                self.threads,
                &self.extra_args,
                self.load.clone(),
                self.windows_spawn_rules,
            )
            .await
            {
                Ok(running) => break running,
                Err(LaunchFailure::AccessDenied) if !retried => {
                    tracing::warn!(
                        target: "syntheo_speech",
                        "launch refused (access denied); retrying once with a fresh copy"
                    );
                    retried = true;
                }
                Err(LaunchFailure::AccessDenied) => return Err(HostError::ExecutionBlocked),
                Err(LaunchFailure::Host(error)) => return Err(error),
            }
        };
        let mut running = running;
        running.attempt = Some(now);
        let target = running.target.clone();
        state.running = Some(running);
        Ok(target)
    }

    /// Arrête le lancement en cours, s'il y en a un ; un refus de
    /// vérification sera revérifié au prochain lancement. L'état « en panne »
    /// dure jusqu'à la fin de sa fenêtre.
    ///
    /// Un arrêt voulu d'un module encore vivant (fin d'écoute, fin de mesure)
    /// n'est pas un plantage : la tentative de ce lancement est retirée du
    /// compte. Un module déjà mort au moment de l'arrêt reste compté.
    pub async fn stop(&self) {
        let running = {
            let mut state = self.state.lock().await;
            state.rejected = None;
            let mut running = state.running.take();
            if let Some(running) = running.as_mut()
                && matches!(running.child.try_wait(), Ok(None))
                && let Some(at) = running.attempt
                && let Some(index) = state.attempts.iter().position(|a| *a == at)
            {
                state.attempts.remove(index);
            }
            running
        };
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

    /// État du compagnon et des modèles (sans hachage).
    pub async fn status(&self) -> SpeechStatus {
        let (dir, models) = (self.models_dir(), self.models.clone());
        let companion = self.companion.as_ref().is_some_and(Companion::present);
        let models = tokio::task::spawn_blocking(move || crate::models::status(&dir, &models))
            .await
            .unwrap_or(ModelsStatus::Missing { total_bytes: 0 });
        SpeechStatus { companion, models }
    }

    /// Marque une installation en cours ; refuse si le module tourne, se
    /// mesure, ou si une autre installation est en cours.
    async fn begin_install(&self) -> Result<InstallingGuard<'_>, &'static str> {
        use std::sync::atomic::Ordering;
        if self.measuring.load(Ordering::SeqCst) {
            return Err("measuring");
        }
        if self
            .installing
            .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
            .is_err()
        {
            return Err("installing");
        }
        // Installation acquise : une annulation restée d'une installation
        // précédente (refusée ensuite par `running`, ou terminée juste
        // après le clic) est oubliée ; un clic à partir d'ici compte, même
        // pendant l'attente du verrou ci-dessous. Un clic avant cette ligne
        // (pendant les refus communs du plugin) est ignoré : rien n'est
        // encore en cours.
        self.cancel.store(false, Ordering::SeqCst);
        let guard = InstallingGuard(&self.installing);
        let mut state = self.state.lock().await;
        if state
            .running
            .as_mut()
            .is_some_and(|r| matches!(r.child.try_wait(), Ok(None)))
        {
            return Err("running");
        }
        state.running = None;
        *self.progress.lock().unwrap_or_else(|e| e.into_inner()) = Some((0, 0));
        Ok(guard)
    }

    /// Fin d'une installation : refus et compteurs oubliés.
    async fn end_install(&self) {
        *self.progress.lock().unwrap_or_else(|e| e.into_inner()) = None;
        let mut state = self.state.lock().await;
        state.rejected = None;
        state.attempts.clear();
        state.blocked_until = None;
    }

    fn progress_sink(&self) -> impl FnMut(u64, u64) + Send + 'static {
        let progress = self.progress.clone();
        move |done, total| {
            *progress.lock().unwrap_or_else(|e| e.into_inner()) = Some((done, total));
        }
    }

    /// Installe les modèles depuis le dossier local `source`, chaque fichier
    /// vérifié avant sa mise en place. Erreur : un code stable.
    pub async fn install_models_from(&self, source: PathBuf) -> Result<(), &'static str> {
        let _guard = self.begin_install().await?;
        let (dir, models) = (self.models_dir(), self.models.clone());
        let cancel = self.cancel.clone();
        let mut sink = self.progress_sink();
        let result = tokio::task::spawn_blocking(move || {
            crate::models::install_from_dir(&source, &dir, &models, &cancel, &mut sink)
        })
        .await
        .unwrap_or(Err(crate::models::InstallError::Io));
        self.end_install().await;
        result.map_err(|e| e.code())
    }

    /// Télécharge les modèles manquants depuis `sources` (compilées, ou
    /// imposées par l'organisation), fichier par fichier, source après
    /// source.
    pub async fn download_models(&self, sources: &[Source]) -> Result<(), &'static str> {
        if sources.is_empty() {
            return Err("no_download_source");
        }
        let _guard = self.begin_install().await?;
        let (dir, models) = (self.models_dir(), self.models.clone());
        let mut sink = self.progress_sink();
        let result = crate::models::download(sources, &dir, &models, &self.cancel, &mut sink).await;
        self.end_install().await;
        result.map_err(|e| e.code())
    }

    /// Demande l'annulation de l'installation en cours (un téléchargement
    /// annulé reprendra où il s'était arrêté).
    /// Sans effet hors installation : une demande laissée en attente
    /// annulerait la suivante.
    pub fn cancel_install(&self) {
        use std::sync::atomic::Ordering;
        if self.installing.load(Ordering::SeqCst) {
            self.cancel.store(true, Ordering::SeqCst);
        }
    }

    /// Avancement de l'installation en cours : `(écrits, à écrire)`.
    pub fn install_progress(&self) -> Option<(u64, u64)> {
        *self.progress.lock().unwrap_or_else(|e| e.into_inner())
    }

    /// Retire les modèles ; refusé pendant que le module tourne.
    pub async fn remove_models(&self) -> Result<(), &'static str> {
        let _guard = self.begin_install().await?;
        let dir = self.models_dir();
        let result = tokio::task::spawn_blocking(move || crate::models::remove(&dir))
            .await
            .map_err(|_| "io")
            .and_then(|r| r.map_err(|_| "io"));
        self.end_install().await;
        result
    }

    /// Vérifications faites depuis la création (essais).
    pub async fn verifications(&self) -> usize {
        self.state.lock().await.verifications
    }

    /// Construction du module (compagnon et liste des modèles compilée), si
    /// compagnon et modèles sont en place : une nouvelle version de l'un ou
    /// de l'autre se mesure à nouveau.
    fn module_build(&self) -> Option<u64> {
        let companion = self.companion.as_ref()?;
        crate::verify::check(Some(companion), &self.models_dir(), &self.models).ok()?;
        Some(companion.build_id() ^ crate::models::fingerprint())
    }

    /// Mise en service enregistrée pour le module installé (lue une fois,
    /// sans hachage, puis gardée en mémoire jusqu'à une nouvelle mesure ou
    /// une installation).
    pub fn commissioning(&self) -> Option<crate::commissioning::Commissioning> {
        let mut cached = self.commissioned.lock().unwrap_or_else(|e| e.into_inner());
        if let Some(value) = cached.as_ref() {
            return value.clone();
        }
        let loaded = self
            .module_build()
            .and_then(|build| crate::commissioning::load(&self.root, build));
        *cached = Some(loaded.clone());
        loaded
    }

    /// Refus de lancement qui a arrêté la dernière mise en service (par
    /// exemple `execution_blocked`), s'il n'y a pas de profil retenu.
    pub fn launch_refusal(&self) -> Option<String> {
        let commissioning = self.commissioning()?;
        if commissioning.profile.is_some() {
            return None;
        }
        commissioning
            .measures
            .last()?
            .error
            .clone()
            .filter(|code| LAUNCH_REFUSALS.contains(&code.as_str()))
    }

    /// Profil retenu, pour l'écoute.
    pub fn profile(&self) -> Option<owhisper_client::OnDeviceProfile> {
        self.commissioning()?
            .profile
            .map(|profile| owhisper_client::OnDeviceProfile {
                two_streams: profile.streams() == 2,
                diarization: profile.diarization(),
            })
    }

    /// Mesure les profils dans l'ordre, retient le premier qui tient, et
    /// enregistre le résultat. `duration` : durée de mesure d'un profil.
    pub async fn commission(
        &self,
        allowed: bool,
        duration: Duration,
    ) -> Result<crate::commissioning::Commissioning, String> {
        use crate::commissioning::{Commissioning, Profile, measure, save};
        use std::sync::atomic::Ordering;
        if !allowed {
            return Err("disabled".to_owned());
        }
        if self
            .measuring
            .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
            .is_err()
        {
            return Err("measuring".to_owned());
        }
        let _guard = InstallingGuard(&self.measuring);
        let build = self.module_build().ok_or("models_missing")?;
        if self.audio.iter().any(Vec::is_empty) {
            return Err("no_commissioning_audio".to_owned());
        }
        let audio = self.audio.clone();
        let mut measures = Vec::new();
        let mut chosen = None;
        struct ProgressReset<'a>(&'a std::sync::atomic::AtomicUsize);
        impl Drop for ProgressReset<'_> {
            fn drop(&mut self) {
                self.0.store(0, std::sync::atomic::Ordering::SeqCst);
            }
        }
        let _progress = ProgressReset(&self.measuring_profile);
        // Arrêt au premier profil retenu (ordre de conclusion-680 §4).
        for (index, profile) in Profile::ALL.into_iter().enumerate() {
            self.measuring_profile
                .store(index + 1, std::sync::atomic::Ordering::SeqCst);
            // Mesures de charge du profil précédent : oubliées.
            *self.load.lock().unwrap_or_else(|e| e.into_inner()) = None;
            // Une erreur (module tombé, session fermée) refuse ce profil avec
            // sa raison, et la mesure passe au suivant ; le module est relancé
            // au besoin, dans le budget de relances.
            let measured = match self.launch_target().await {
                Ok(target) => measure(&target, profile, &audio, duration)
                    .await
                    .map_err(|_| "measure_failed".to_owned()),
                // Plantages en boucle : refus passager (10 min), qui ne dit
                // rien du poste. La mesure est refusée sans rien écrire : un
                // profil déjà retenu est gardé.
                Err(HostError::RestartBudget) => {
                    return Err(HostError::RestartBudget
                        .to_on_device_error()
                        .kind
                        .code()
                        .to_owned());
                }
                // Refus de lancement définitif (exécution refusée par le
                // système, compagnon ou modèles refusés, réglage géré) : les
                // profils suivants échoueraient de même ; la mesure s'arrête
                // sur ce refus, enregistré avec sa raison.
                Err(error) if error.is_permanent() => {
                    let reason = error.to_on_device_error().kind.code().to_owned();
                    measures.push(crate::commissioning::Measure::failed(profile, reason));
                    break;
                }
                Err(error) => Err(error.to_on_device_error().kind.code().to_owned()),
            };
            let mut result = match measured {
                Ok(result) => result,
                Err(reason) => {
                    measures.push(crate::commissioning::Measure::failed(profile, reason));
                    continue;
                }
            };
            // Le module a dû espacer ou couper la diarisation : le profil ne
            // tient pas tel quel.
            if profile.diarization()
                && self
                    .load()
                    .is_some_and(|load| load.sessions.iter().any(|s| s.diarization != "full"))
            {
                result.passed = false;
            }
            let passed = result.passed;
            measures.push(result);
            if passed {
                chosen = Some(profile);
                break;
            }
        }
        let result = Commissioning {
            profile: chosen,
            measures,
            measured_at: std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map_or(0, |d| d.as_secs()),
            module_build: build,
        };
        save(&self.root, &result).map_err(|_| "io".to_owned())?;
        *self.commissioned.lock().unwrap_or_else(|e| e.into_inner()) = Some(Some(result.clone()));
        Ok(result)
    }

    /// Profil en cours de mesure, `(rang, total)`, pendant une mise en
    /// service.
    pub fn commissioning_progress(&self) -> Option<(usize, usize)> {
        let current = self
            .measuring_profile
            .load(std::sync::atomic::Ordering::SeqCst);
        (current > 0).then_some((current, crate::commissioning::Profile::ALL.len()))
    }

    /// Dernières mesures de charge, si elles datent de moins de 15 s.
    pub fn load(&self) -> Option<ModuleLoad> {
        let slot = self.load.lock().unwrap_or_else(|e| e.into_inner());
        slot.as_ref()
            .filter(|(at, _)| at.elapsed() < Duration::from_secs(15))
            .map(|(_, load)| load.clone())
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

/// Codes des refus de lancement définitifs qui arrêtent une mise en service
/// (`OnDeviceErrorKind::code`).
const LAUNCH_REFUSALS: [&str; 3] = ["execution_blocked", "invalid", "disabled"];

/// Échec d'un lancement : erreur de l'hôte, ou accès refusé sous Windows,
/// peut-être passager (nouvelle tentative possible).
enum LaunchFailure {
    Host(HostError),
    AccessDenied,
}

impl From<HostError> for LaunchFailure {
    fn from(error: HostError) -> Self {
        Self::Host(error)
    }
}

#[derive(Debug, PartialEq, Eq)]
enum SpawnRefusal {
    /// Refus définitif : politique (AppLocker, SRP) ou montage noexec.
    Blocked,
    /// Windows, ERROR_ACCESS_DENIED : politique ou antivirus qui tient la
    /// copie ; définitif seulement s'il se répète.
    AccessDenied,
    Other,
}

/// Classe une erreur de lancement. Sous Windows,
/// `ERROR_ACCESS_DISABLED_BY_POLICY` (1260, que std ne classe pas) est un
/// refus de politique ; un accès refusé (5) peut être passager. Ailleurs, un
/// accès refusé (EACCES : noexec, droits) est définitif.
fn classify_spawn_error(error: &std::io::Error, windows: bool) -> SpawnRefusal {
    const ERROR_ACCESS_DISABLED_BY_POLICY: i32 = 1260;
    if windows && error.raw_os_error() == Some(ERROR_ACCESS_DISABLED_BY_POLICY) {
        SpawnRefusal::Blocked
    } else if error.kind() == std::io::ErrorKind::PermissionDenied {
        if windows {
            SpawnRefusal::AccessDenied
        } else {
            SpawnRefusal::Blocked
        }
    } else {
        SpawnRefusal::Other
    }
}

#[cfg(test)]
mod tests {
    use super::{SpawnRefusal, classify_spawn_error, parse_load};

    // Revue, R4 et vérification de f84794c4 : refus de politique définitif
    // tout de suite ; sous Windows, accès refusé retenté une fois ; sous
    // Linux, EACCES (noexec) définitif.
    #[test]
    fn classifies_launch_refusals() {
        use std::io::{Error, ErrorKind};
        let policy = Error::from_raw_os_error(1260);
        let denied = Error::from(ErrorKind::PermissionDenied);
        let missing = Error::from(ErrorKind::NotFound);
        assert_eq!(classify_spawn_error(&policy, true), SpawnRefusal::Blocked);
        assert_eq!(
            classify_spawn_error(&denied, true),
            SpawnRefusal::AccessDenied
        );
        assert_eq!(classify_spawn_error(&missing, true), SpawnRefusal::Other);
        assert_eq!(classify_spawn_error(&denied, false), SpawnRefusal::Blocked);
        assert_eq!(classify_spawn_error(&missing, false), SpawnRefusal::Other);
    }

    #[test]
    fn reads_load_lines_and_ignores_the_rest() {
        let load = parse_load(
            r#"{"event":"metrics","sessions":[{"lag_ms":420,"rtf":0.21,"diarization":"spaced","audio_s":12.3}]}"#,
        )
        .unwrap();
        assert_eq!(load.sessions[0].lag_ms, 420);
        assert_eq!(load.sessions[0].diarization, "spaced");
        assert!(parse_load(r#"{"event":"listening","port":1}"#).is_none());
        assert!(parse_load("pas du json").is_none());
        let odd =
            parse_load(r#"{"event":"metrics","sessions":[{"diarization":"<script>"}]}"#).unwrap();
        assert!(odd.sessions.is_empty());
    }
}
