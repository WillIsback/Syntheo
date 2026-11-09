use std::process::Stdio;

use tokio::io::BufReader;
use tokio_util::sync::CancellationToken;

use super::{
    ProcessError, read_line_with_limit, read_text_prefix, read_text_with_limit, run_to_string,
    spawn_streaming_lines,
};

#[tokio::test]
async fn bounded_text_rejects_oversized_output() {
    let error = read_text_with_limit(&b"12345"[..], 4)
        .await
        .expect_err("oversized output must fail");
    assert_eq!(error.kind(), std::io::ErrorKind::InvalidData);
}

#[tokio::test]
async fn bounded_line_handles_crlf_and_rejects_oversized_lines() {
    let mut reader = BufReader::new(&b"hello\r\ntoolong\n"[..]);
    assert_eq!(
        read_line_with_limit(&mut reader, 5).await.unwrap(),
        Some("hello".to_string())
    );
    let error = read_line_with_limit(&mut reader, 6)
        .await
        .expect_err("oversized line must fail");
    assert_eq!(error.kind(), std::io::ErrorKind::InvalidData);
}

#[tokio::test]
async fn stderr_reader_drains_but_only_retains_prefix() {
    let output = read_text_prefix(&b"abcdefgh"[..], 4).await.unwrap();
    assert_eq!(output, "abcd\n[process stderr truncated]");
}

#[tokio::test]
#[cfg(unix)]
async fn already_cancelled_processes_are_terminated() {
    let marker = std::env::temp_dir().join(format!(
        "cli-process-cancelled-{}-{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos()
    ));
    let child = delayed_marker_child(&marker);
    let cancellation = CancellationToken::new();
    cancellation.cancel();

    assert!(matches!(
        run_to_string(child, Some(cancellation)).await,
        Err(ProcessError::Cancelled)
    ));
    tokio::time::sleep(std::time::Duration::from_millis(350)).await;
    assert!(!marker.exists());

    let child = delayed_marker_child(&marker);
    let cancellation = CancellationToken::new();
    cancellation.cancel();
    let result =
        spawn_streaming_lines::<String, ProcessError, _>(child, None, Some(cancellation), Ok);
    assert!(matches!(result, Err(ProcessError::Cancelled)));
    tokio::time::sleep(std::time::Duration::from_millis(350)).await;
    assert!(!marker.exists());
}

#[tokio::test]
#[cfg(unix)]
async fn streams_complete_on_eof_and_drain_all_output() {
    let mut command = tokio::process::Command::new("sh");
    command
        .args(["-c", "printf 'one\ntwo\nthree\n'"])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    let child = command.spawn().unwrap();

    let stream = spawn_streaming_lines::<String, ProcessError, _>(child, None, None, Ok).unwrap();
    let lines: Vec<_> = futures_util::StreamExt::collect::<Vec<_>>(stream)
        .await
        .into_iter()
        .map(Result::unwrap)
        .collect();
    assert_eq!(lines, ["one", "two", "three"]);
}

#[tokio::test]
#[cfg(unix)]
async fn dropping_the_stream_handle_kills_the_child() {
    let marker = std::env::temp_dir().join(format!(
        "cli-process-drop-{}-{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos()
    ));
    let child = delayed_marker_child(&marker);

    let stream = spawn_streaming_lines::<String, ProcessError, _>(child, None, None, Ok).unwrap();
    drop(stream);
    tokio::time::sleep(std::time::Duration::from_millis(350)).await;
    assert!(!marker.exists());
}

#[tokio::test]
#[cfg(unix)]
async fn explicit_cancel_kills_the_child_and_ends_the_stream() {
    let marker = std::env::temp_dir().join(format!(
        "cli-process-explicit-cancel-{}-{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos()
    ));
    let child = delayed_marker_child(&marker);

    let mut stream =
        spawn_streaming_lines::<String, ProcessError, _>(child, None, None, Ok).unwrap();
    stream.cancel();
    // Explicit shutdown ends the stream without an error event.
    while futures_util::StreamExt::next(&mut stream)
        .await
        .transpose()
        .unwrap()
        .is_some()
    {}
    tokio::time::sleep(std::time::Duration::from_millis(350)).await;
    assert!(!marker.exists());
}

#[cfg(unix)]
fn delayed_marker_child(marker: &std::path::Path) -> tokio::process::Child {
    let mut command = tokio::process::Command::new("sh");
    command
        .args(["-c", "sleep 0.2; touch \"$1\"", "_"])
        .arg(marker)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    command.spawn().unwrap()
}
