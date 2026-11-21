use std::fs::TryLockError;
use std::path::Path;
use std::sync::{Arc, Mutex};

const LAUNCH_LOCK_FILENAME: &str = "launch.lock";
const SLOW_STARTUP_INDICATOR_DELAY: std::time::Duration = std::time::Duration::from_secs(3);
// Startup migrations can hold the database for minutes before any window or
// plugin exists, so single-instance semantics are enforced with an OS file
// lock that is held from process start until the single-instance plugin is
// initialized. The OS releases it automatically if the process dies.
pub struct LaunchLock {
    _file: std::fs::File,
}

pub enum LaunchLockState {
    Acquired(LaunchLock),
    HeldByAnotherProcess,
    Unavailable(String),
}

pub fn acquire_launch_lock(identifier: &str) -> LaunchLockState {
    let Some(dir) = crate::db::desktop_db_dir(identifier) else {
        return LaunchLockState::Unavailable(
            "application data directory is unavailable".to_string(),
        );
    };
    if let Err(error) = std::fs::create_dir_all(&dir) {
        return LaunchLockState::Unavailable(format!(
            "failed to create application data directory: {error}"
        ));
    }
    harden_data_dir_permissions(&dir);
    lock_launch_file(&dir.join(LAUNCH_LOCK_FILENAME))
}

/// Dossier de données réservé à l'utilisateur (issue 653) : 0700 pour le
/// dossier et ses sous-dossiers directs, 0600 pour les fichiers qu'ils
/// contiennent (base, journaux, sauvegardes). Corrigé à chaque démarrage, y
/// compris pour les fichiers créés par une version précédente. Pas d'umask
/// global : les exports écrits ailleurs par l'utilisateur gardent leurs droits
/// habituels. Sous Windows, le dossier de l'utilisateur n'est pas lisible par
/// les autres comptes.
pub(crate) fn harden_data_dir_permissions(dir: &Path) {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;

        fn set_mode(path: &Path, mode: u32) {
            if let Err(error) =
                std::fs::set_permissions(path, std::fs::Permissions::from_mode(mode))
            {
                eprintln!("failed to restrict {}: {error}", path.display());
            }
        }

        fn restrict_entries(dir: &Path, depth: u8) {
            let Ok(entries) = std::fs::read_dir(dir) else {
                return;
            };
            for entry in entries.flatten() {
                let Ok(file_type) = entry.file_type() else {
                    continue;
                };
                let path = entry.path();
                if file_type.is_dir() {
                    set_mode(&path, 0o700);
                    if depth > 0 {
                        restrict_entries(&path, depth - 1);
                    }
                } else if file_type.is_file() {
                    set_mode(&path, 0o600);
                }
            }
        }

        set_mode(dir, 0o700);
        // Dossier et un niveau de sous-dossiers (journaux, index) : le 0700
        // du dossier suffit déjà à fermer tout ce qu'il contient.
        restrict_entries(dir, 1);
    }
    #[cfg(not(unix))]
    let _ = dir;
}

fn lock_launch_file(path: &Path) -> LaunchLockState {
    let file = match std::fs::OpenOptions::new()
        .create(true)
        .truncate(false)
        .write(true)
        .open(path)
    {
        Ok(file) => file,
        Err(error) => {
            return LaunchLockState::Unavailable(format!(
                "failed to open {}: {error}",
                path.display()
            ));
        }
    };

    match file.try_lock() {
        Ok(()) => LaunchLockState::Acquired(LaunchLock { _file: file }),
        Err(TryLockError::WouldBlock) => LaunchLockState::HeldByAnotherProcess,
        Err(TryLockError::Error(error)) => {
            LaunchLockState::Unavailable(format!("failed to lock {}: {error}", path.display()))
        }
    }
}

// Nightly and stable open the same database. SQLite serializes their writes,
// but live queries and CloudSync only see their own process, so the two
// channels exclude each other for the whole app lifetime. Each channel holds
// its own lock file; the peer's lock being held means the peer is running.
// Same-channel relaunches keep working: an own lock that is already held is
// left to the single-instance plugin, as before.
pub struct ChannelLock {
    _file: std::fs::File,
}

pub enum ChannelLockState {
    Acquired(Option<ChannelLock>),
    PeerRunning { peer: &'static str },
    Unavailable(String),
}

pub fn acquire_channel_lock(identifier: &str) -> ChannelLockState {
    let Some(peer) = crate::db::shared_database_peer(identifier) else {
        return ChannelLockState::Acquired(None);
    };
    let Some(dir) = crate::db::desktop_db_dir(identifier) else {
        return ChannelLockState::Unavailable(
            "application data directory is unavailable".to_string(),
        );
    };
    lock_channel_files(
        &dir.join(channel_lock_filename(identifier)),
        &dir.join(channel_lock_filename(peer)),
        peer,
    )
}

fn channel_lock_filename(identifier: &str) -> String {
    format!("{identifier}.running.lock")
}

// The peer is probed before our own lock is taken. Two channels starting at
// the same instant can both slip through, which only preserves today's
// behavior; the reverse order could make both of them exit.
fn lock_channel_files(own_path: &Path, peer_path: &Path, peer: &'static str) -> ChannelLockState {
    match lock_launch_file(peer_path) {
        LaunchLockState::Acquired(probe) => drop(probe),
        LaunchLockState::HeldByAnotherProcess => return ChannelLockState::PeerRunning { peer },
        LaunchLockState::Unavailable(reason) => return ChannelLockState::Unavailable(reason),
    }

    match lock_launch_file(own_path) {
        LaunchLockState::Acquired(LaunchLock { _file }) => {
            ChannelLockState::Acquired(Some(ChannelLock { _file }))
        }
        LaunchLockState::HeldByAnotherProcess => ChannelLockState::Acquired(None),
        LaunchLockState::Unavailable(reason) => ChannelLockState::Unavailable(reason),
    }
}

pub fn exit_for_running_peer_channel(identifier: &str, peer: &str) -> ! {
    let own_name = channel_product_name(identifier);
    let peer_name = channel_product_name(peer);
    eprintln!("{peer_name} is running on the shared database; exiting {own_name}");

    #[cfg(target_os = "macos")]
    {
        let alert = format!(
            "display alert \"{own_name} cannot open yet\" message \"{peer_name} is running, and both apps use the same notes. Quit {peer_name}, then open {own_name} again.\" as critical buttons {{\"OK\"}} default button \"OK\""
        );
        let _ = std::process::Command::new("/usr/bin/osascript")
            .args(["-e", &alert])
            .spawn();
    }

    std::process::exit(0);
}

fn channel_product_name(_identifier: &str) -> &'static str {
    syntheo_brand::PRODUCT_NAME
}

pub fn exit_for_already_running_instance() -> ! {
    eprintln!("another Syntheo process holds the launch lock; exiting");

    #[cfg(target_os = "macos")]
    {
        let alert = "display alert \"Syntheo démarre déjà\" message \"Une autre instance de Syntheo prépare vos données. L'application s'ouvrira automatiquement dès qu'elle sera prête.\" buttons {\"OK\"} default button \"OK\"";
        let _ = std::process::Command::new("/usr/bin/osascript")
            .args(["-e", alert])
            .spawn();
    }

    std::process::exit(0);
}

// Older versions let users point notes and recordings at a custom folder,
// typically an Obsidian vault, while the database stayed in the app data
// directory. Everything now lives in the app data directory; the first launch
// after updating moves the custom folder's contents back before any plugin
// resolves the storage location. Runs under the launch lock.
pub fn consolidate_custom_storage(identifier: &str) {
    let Some(base) = syntheo_storage::global::compute_default_base(identifier) else {
        return;
    };
    match syntheo_storage::vault::consolidate_custom_vault(&base, &base) {
        Ok(Some(previous)) if previous != base => eprintln!(
            "moved notes and recordings from {} to {}",
            previous.display(),
            base.display()
        ),
        Ok(_) => {}
        Err(error) => eprintln!(
            "failed to move notes and recordings into {}; will retry on next launch: {error}",
            base.display()
        ),
    }
}

// Database open and plugin setup can still take a few seconds before the
// webview exists. After a short delay this shows a native alert (spawned
// osascript, matching the startup-failure alerts) that is killed as soon as
// the database file is open. Longer schema and legacy-import work then runs
// with the main window visible.
pub struct SlowStartupIndicator {
    state: Arc<Mutex<IndicatorState>>,
}

struct IndicatorState {
    dismissed: bool,
    child: Option<std::process::Child>,
}

impl SlowStartupIndicator {
    pub fn show_after_delay() -> Self {
        let state = Arc::new(Mutex::new(IndicatorState {
            dismissed: false,
            child: None,
        }));

        {
            let state = state.clone();
            std::thread::spawn(move || {
                std::thread::sleep(SLOW_STARTUP_INDICATOR_DELAY);
                let mut state = state.lock().unwrap();
                if state.dismissed {
                    return;
                }
                state.child = spawn_indicator_alert();
            });
        }

        Self { state }
    }

    pub fn dismiss(&self) {
        let mut state = self.state.lock().unwrap();
        state.dismissed = true;
        if let Some(mut child) = state.child.take() {
            let _ = child.kill();
            let _ = child.wait();
        }
    }
}

#[cfg(target_os = "macos")]
fn spawn_indicator_alert() -> Option<std::process::Child> {
    let alert = "display alert \"Mise à jour de vos données\" message \"Syntheo met à jour vos données. Cela peut prendre plusieurs minutes pour une grande bibliothèque.\\n\\nGardez Syntheo ouvert : l'application s'ouvrira automatiquement à la fin de la mise à jour.\" buttons {\"OK\"} default button \"OK\"";
    std::process::Command::new("/usr/bin/osascript")
        .args(["-e", alert])
        .spawn()
        .ok()
}

#[cfg(not(target_os = "macos"))]
fn spawn_indicator_alert() -> Option<std::process::Child> {
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn launch_lock_excludes_a_second_holder_until_released() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join(LAUNCH_LOCK_FILENAME);

        let first = lock_launch_file(&path);
        assert!(matches!(first, LaunchLockState::Acquired(_)));

        assert!(matches!(
            lock_launch_file(&path),
            LaunchLockState::HeldByAnotherProcess
        ));

        drop(first);
        assert!(matches!(
            lock_launch_file(&path),
            LaunchLockState::Acquired(_)
        ));
    }

    #[test]
    fn channel_lock_excludes_the_peer_channel_while_held() {
        let dir = tempfile::tempdir().unwrap();
        let stable = dir.path().join(channel_lock_filename("com.syntheo.stable"));
        let nightly = dir
            .path()
            .join(channel_lock_filename("com.syntheo.nightly"));

        let stable_lock = lock_channel_files(&stable, &nightly, "com.syntheo.nightly");
        assert!(matches!(stable_lock, ChannelLockState::Acquired(Some(_))));

        assert!(matches!(
            lock_channel_files(&nightly, &stable, "com.syntheo.stable"),
            ChannelLockState::PeerRunning {
                peer: "com.syntheo.stable"
            }
        ));

        drop(stable_lock);
        assert!(matches!(
            lock_channel_files(&nightly, &stable, "com.syntheo.stable"),
            ChannelLockState::Acquired(Some(_))
        ));
    }

    #[test]
    fn channel_lock_defers_same_channel_relaunches_to_single_instance() {
        let dir = tempfile::tempdir().unwrap();
        let stable = dir.path().join(channel_lock_filename("com.syntheo.stable"));
        let nightly = dir
            .path()
            .join(channel_lock_filename("com.syntheo.nightly"));

        let _running = lock_channel_files(&stable, &nightly, "com.syntheo.nightly");

        assert!(matches!(
            lock_channel_files(&stable, &nightly, "com.syntheo.nightly"),
            ChannelLockState::Acquired(None)
        ));
    }
}

#[cfg(all(test, unix))]
mod permission_tests {
    use std::os::unix::fs::PermissionsExt;

    fn mode(path: &std::path::Path) -> u32 {
        std::fs::metadata(path).unwrap().permissions().mode() & 0o777
    }

    // Issue 653 : base, journaux et sauvegardes réservés à l'utilisateur.
    #[test]
    fn data_dir_is_restricted_to_the_user() {
        let dir = std::env::temp_dir().join(format!(
            "syntheo-perm-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let logs = dir.join("logs");
        std::fs::create_dir_all(&logs).unwrap();
        for file in [
            dir.join("app.db"),
            dir.join("app.db-wal"),
            logs.join("app.log"),
        ] {
            std::fs::write(&file, b"x").unwrap();
            std::fs::set_permissions(&file, std::fs::Permissions::from_mode(0o644)).unwrap();
        }
        std::fs::set_permissions(&dir, std::fs::Permissions::from_mode(0o755)).unwrap();
        std::fs::set_permissions(&logs, std::fs::Permissions::from_mode(0o755)).unwrap();

        super::harden_data_dir_permissions(&dir);

        assert_eq!(mode(&dir), 0o700);
        assert_eq!(mode(&logs), 0o700);
        assert_eq!(mode(&dir.join("app.db")), 0o600);
        assert_eq!(mode(&dir.join("app.db-wal")), 0o600);
        assert_eq!(mode(&logs.join("app.log")), 0o600);
        std::fs::remove_dir_all(dir).unwrap();
    }
}
