//! Status of the standalone `syntheo` CLI.
//!
//! The app no longer bundles nor installs the CLI: it is installed separately
//! with `cargo install --locked --path apps/cli` (see the installation guide).
//! The app only reports where it finds it.

use std::path::{Path, PathBuf};

use serde::Serialize;

#[derive(Clone, Debug, PartialEq, Eq, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct CliStatus {
    /// Command the CLI installs (`syntheo`).
    pub command_name: String,
    /// Absolute path of the CLI, when found on `PATH` or in cargo's `bin`
    /// directory.
    pub path: Option<String>,
    /// True when the first `syntheo` on `PATH` is the desktop app itself (the
    /// `.deb` installs the app as `/usr/bin/syntheo`), so typing `syntheo`
    /// launches the app instead of the CLI.
    pub shadowed_by_app: bool,
}

pub fn check() -> CliStatus {
    let command_name = syntheo_brand::CLI_COMMAND;
    let file_name = format!("{command_name}{}", std::env::consts::EXE_SUFFIX);
    let path_dirs: Vec<PathBuf> = std::env::var_os("PATH")
        .map(|value| std::env::split_paths(&value).collect())
        .unwrap_or_default();
    let app_exe = std::env::current_exe()
        .ok()
        .and_then(|path| path.canonicalize().ok());

    locate(
        command_name,
        &file_name,
        &path_dirs,
        cargo_bin_dir().as_deref(),
        app_exe.as_deref(),
    )
}

fn cargo_bin_dir() -> Option<PathBuf> {
    std::env::var_os("CARGO_HOME")
        .map(PathBuf::from)
        .or_else(|| dirs::home_dir().map(|home| home.join(".cargo")))
        .map(|cargo_home| cargo_home.join("bin"))
}

// `PATH` is searched in order, then cargo's `bin` directory: an app launched
// from the desktop often inherits a `PATH` without `~/.cargo/bin`.
fn locate(
    command_name: &str,
    file_name: &str,
    path_dirs: &[PathBuf],
    cargo_bin: Option<&Path>,
    app_exe: Option<&Path>,
) -> CliStatus {
    let mut shadowed_by_app = false;
    let mut path = None;

    for dir in path_dirs.iter().map(PathBuf::as_path).chain(cargo_bin) {
        let candidate = dir.join(file_name);
        if !candidate.is_file() {
            continue;
        }
        if is_app_executable(&candidate, app_exe) {
            shadowed_by_app = true;
            continue;
        }
        path = Some(candidate.display().to_string());
        break;
    }

    CliStatus {
        command_name: command_name.to_string(),
        path,
        shadowed_by_app,
    }
}

fn is_app_executable(candidate: &Path, app_exe: Option<&Path>) -> bool {
    let Some(app_exe) = app_exe else {
        return false;
    };
    candidate
        .canonicalize()
        .is_ok_and(|resolved| resolved == app_exe)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn touch(dir: &Path, name: &str) -> PathBuf {
        let path = dir.join(name);
        std::fs::write(&path, b"").unwrap();
        path
    }

    #[test]
    fn finds_the_cli_on_path() {
        let first = tempfile::tempdir().unwrap();
        let second = tempfile::tempdir().unwrap();
        let cli = touch(second.path(), "syntheo");

        let status = locate(
            "syntheo",
            "syntheo",
            &[first.path().to_path_buf(), second.path().to_path_buf()],
            None,
            None,
        );

        assert_eq!(status.path, Some(cli.display().to_string()));
        assert!(!status.shadowed_by_app);
    }

    #[test]
    fn falls_back_to_cargo_bin() {
        let path_dir = tempfile::tempdir().unwrap();
        let cargo_bin = tempfile::tempdir().unwrap();
        let cli = touch(cargo_bin.path(), "syntheo");

        let status = locate(
            "syntheo",
            "syntheo",
            &[path_dir.path().to_path_buf()],
            Some(cargo_bin.path()),
            None,
        );

        assert_eq!(status.path, Some(cli.display().to_string()));
    }

    #[test]
    fn skips_the_desktop_app_and_reports_the_shadowing() {
        let usr_bin = tempfile::tempdir().unwrap();
        let cargo_bin = tempfile::tempdir().unwrap();
        let app = touch(usr_bin.path(), "syntheo");
        let cli = touch(cargo_bin.path(), "syntheo");
        let app_exe = app.canonicalize().unwrap();

        let status = locate(
            "syntheo",
            "syntheo",
            &[usr_bin.path().to_path_buf()],
            Some(cargo_bin.path()),
            Some(&app_exe),
        );

        assert_eq!(status.path, Some(cli.display().to_string()));
        assert!(status.shadowed_by_app);
    }

    #[test]
    fn reports_a_missing_cli() {
        let path_dir = tempfile::tempdir().unwrap();
        std::fs::create_dir(path_dir.path().join("syntheo")).unwrap();

        let status = locate(
            "syntheo",
            "syntheo",
            &[path_dir.path().to_path_buf()],
            None,
            None,
        );

        assert_eq!(
            status,
            CliStatus {
                command_name: "syntheo".to_string(),
                path: None,
                shadowed_by_app: false,
            }
        );
    }
}
