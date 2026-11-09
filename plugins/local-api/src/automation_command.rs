// Étape « Lancer une commande » des automatisations : un programme local et
// ses arguments, lancés sans interpréteur de commandes (pas de `sh -c`, pas
// d'expansion), entrée standard fermée, durée et sortie bornées. La
// confirmation au premier lancement est demandée par l'application avant
// l'appel.

use std::time::Duration;

use tokio::io::{AsyncRead, AsyncReadExt};

const DEFAULT_TIMEOUT_SECS: u32 = 60;
const MAX_TIMEOUT_SECS: u32 = 600;
const MAX_ARGS: usize = 64;
const MAX_OUTPUT_BYTES: usize = 1024 * 1024;
const OUTPUT_SHUTDOWN_TIMEOUT: Duration = Duration::from_secs(1);

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize, specta::Type)]
#[serde(rename_all = "snake_case")]
pub struct AutomationCommandOutput {
    pub exit_code: Option<i32>,
    pub stdout: String,
    pub stderr: String,
    pub timed_out: bool,
}

pub(crate) fn effective_timeout(timeout_secs: Option<u32>) -> Duration {
    let secs = timeout_secs
        .filter(|secs| *secs > 0)
        .unwrap_or(DEFAULT_TIMEOUT_SECS)
        .min(MAX_TIMEOUT_SECS);
    Duration::from_secs(u64::from(secs))
}

pub(crate) async fn run_command(
    program: &str,
    args: &[String],
    timeout: Duration,
) -> Result<AutomationCommandOutput, String> {
    let program = program.trim();
    if program.is_empty() {
        return Err("command program is empty".to_string());
    }
    if args.len() > MAX_ARGS {
        return Err(format!("too many arguments (at most {MAX_ARGS})"));
    }
    if program.contains('\0') || args.iter().any(|arg| arg.contains('\0')) {
        return Err("command contains a NUL character".to_string());
    }

    let mut child = tokio::process::Command::new(program)
        .args(args)
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .kill_on_drop(true)
        .spawn()
        .map_err(|error| format!("could not start {program}: {error}"))?;

    let stdout_task = child.stdout.take().map(spawn_output_reader);
    let stderr_task = child.stderr.take().map(spawn_output_reader);

    match tokio::time::timeout(timeout, child.wait()).await {
        Ok(Ok(status)) => Ok(AutomationCommandOutput {
            exit_code: status.code(),
            stdout: collect_output(stdout_task).await,
            stderr: collect_output(stderr_task).await,
            timed_out: false,
        }),
        Ok(Err(error)) => {
            let _ = child.kill().await;
            let _ = child.wait().await;
            Err(format!("could not wait for {program}: {error}"))
        }
        Err(_) => {
            let _ = child.kill().await;
            let _ = child.wait().await;
            Ok(AutomationCommandOutput {
                exit_code: None,
                stdout: collect_output(stdout_task).await,
                stderr: collect_output(stderr_task).await,
                timed_out: true,
            })
        }
    }
}

fn spawn_output_reader(
    reader: impl AsyncRead + Unpin + Send + 'static,
) -> tokio::task::JoinHandle<String> {
    tokio::spawn(read_output_prefix(reader, MAX_OUTPUT_BYTES))
}

async fn collect_output(task: Option<tokio::task::JoinHandle<String>>) -> String {
    let Some(mut task) = task else {
        return String::new();
    };
    match tokio::time::timeout(OUTPUT_SHUTDOWN_TIMEOUT, &mut task).await {
        Ok(Ok(output)) => output,
        Ok(Err(_)) => String::new(),
        Err(_) => {
            task.abort();
            String::new()
        }
    }
}

// Lit toute la sortie (le programme ne reste pas bloqué sur un tube plein)
// mais n'en garde que le début.
async fn read_output_prefix(mut reader: impl AsyncRead + Unpin, limit: usize) -> String {
    let mut retained = Vec::with_capacity(limit.min(8 * 1024));
    let mut chunk = [0_u8; 8 * 1024];
    let mut truncated = false;
    loop {
        let read = match reader.read(&mut chunk).await {
            Ok(0) | Err(_) => break,
            Ok(read) => read,
        };
        let keep = limit.saturating_sub(retained.len()).min(read);
        retained.extend_from_slice(&chunk[..keep]);
        truncated |= keep < read;
    }
    let mut output = String::from_utf8_lossy(&retained).into_owned();
    if truncated {
        output.push_str("\n[output truncated]");
    }
    output
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn timeout_defaults_and_is_capped() {
        assert_eq!(effective_timeout(None), Duration::from_secs(60));
        assert_eq!(effective_timeout(Some(0)), Duration::from_secs(60));
        assert_eq!(effective_timeout(Some(5)), Duration::from_secs(5));
        assert_eq!(effective_timeout(Some(100_000)), Duration::from_secs(600));
    }

    #[tokio::test]
    async fn output_is_drained_but_retained_within_the_limit() {
        let output = read_output_prefix(&b"abcdefgh"[..], 4).await;
        assert_eq!(output, "abcd\n[output truncated]");
    }

    #[tokio::test]
    async fn rejects_an_empty_program() {
        let error = run_command("  ", &[], Duration::from_secs(1))
            .await
            .unwrap_err();
        assert!(error.contains("empty"));
    }

    #[tokio::test]
    async fn reports_a_missing_program() {
        let error = run_command("syntheo-no-such-program", &[], Duration::from_secs(1))
            .await
            .unwrap_err();
        assert!(error.contains("could not start"));
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn passes_arguments_verbatim_without_a_shell() {
        let output = run_command(
            "printf",
            &[
                "%s|%s".to_string(),
                "$HOME; echo pwned".to_string(),
                "b c".to_string(),
            ],
            Duration::from_secs(5),
        )
        .await
        .unwrap();
        assert_eq!(output.exit_code, Some(0));
        assert_eq!(output.stdout, "$HOME; echo pwned|b c");
        assert!(!output.timed_out);
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn stops_a_command_that_runs_too_long() {
        let output = run_command("sleep", &["5".to_string()], Duration::from_millis(200))
            .await
            .unwrap();
        assert!(output.timed_out);
        assert_eq!(output.exit_code, None);
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn returns_the_exit_code_and_error_output() {
        let output = run_command(
            "sh",
            &["-c".to_string(), "echo oops >&2; exit 3".to_string()],
            Duration::from_secs(5),
        )
        .await
        .unwrap();
        assert_eq!(output.exit_code, Some(3));
        assert_eq!(output.stderr, "oops\n");
    }
}
