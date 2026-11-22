use std::sync::Arc;
use std::sync::atomic::AtomicUsize;

use super::*;

/// Serveur HTTP local minimal : sert `body`, honore `Range: bytes=N-` si
/// `ranges`, compte les requêtes, et peut rediriger.
struct Server {
    url: String,
    requests: Arc<AtomicUsize>,
}

async fn serve(body: Vec<u8>, ranges: bool, redirect: Option<String>) -> Server {
    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let url = format!("http://{}/file", listener.local_addr().unwrap());
    let requests = Arc::new(AtomicUsize::new(0));
    let count = requests.clone();
    tokio::spawn(async move {
        loop {
            let Ok((mut socket, _)) = listener.accept().await else {
                return;
            };
            count.fetch_add(1, Ordering::SeqCst);
            let body = body.clone();
            let redirect = redirect.clone();
            tokio::spawn(async move {
                let mut request = vec![0u8; 4096];
                let n = socket.read(&mut request).await.unwrap_or(0);
                let request = String::from_utf8_lossy(&request[..n]).to_lowercase();
                if let Some(location) = redirect {
                    let head = format!(
                        "HTTP/1.1 302 Found\r\nlocation: {location}\r\ncontent-length: 0\r\nconnection: close\r\n\r\n"
                    );
                    let _ = socket.write_all(head.as_bytes()).await;
                    return;
                }
                let start = request
                    .lines()
                    .find_map(|l| l.strip_prefix("range: bytes="))
                    .and_then(|r| r.trim().trim_end_matches('-').parse::<usize>().ok())
                    .filter(|_| ranges);
                let (status, part) = match start {
                    Some(start) => ("206 Partial Content", &body[start.min(body.len())..]),
                    None => ("200 OK", &body[..]),
                };
                let head = format!(
                    "HTTP/1.1 {status}\r\ncontent-length: {}\r\nconnection: close\r\n\r\n",
                    part.len()
                );
                let _ = socket.write_all(head.as_bytes()).await;
                let _ = socket.write_all(part).await;
            });
        }
    });
    Server { url, requests }
}

fn body() -> Vec<u8> {
    (0..3 * BLOCK + 123).map(|i| (i % 251) as u8).collect()
}

fn pin(bytes: &[u8]) -> (u64, String) {
    (bytes.len() as u64, hex(Sha256::digest(bytes)))
}

fn fetcher() -> Fetcher {
    Fetcher::new(Duration::from_secs(5), Duration::from_secs(5)).unwrap()
}

#[tokio::test]
async fn downloads_checks_and_renames() {
    let bytes = body();
    let (size, sha) = pin(&bytes);
    let server = serve(bytes.clone(), true, None).await;
    let dir = tempfile::tempdir().unwrap();
    let dest = dir.path().join("sub/model.onnx");
    let mut seen = 0u64;
    fetcher()
        .fetch(
            &server.url,
            &dest,
            Pinned { size, sha256: &sha },
            &AtomicBool::new(false),
            &mut |n| seen += n,
        )
        .await
        .unwrap();
    assert_eq!(std::fs::read(&dest).unwrap(), bytes);
    assert_eq!(seen, size);
    assert!(!part_path(&dest).exists());
    assert!(matches(&dest, Pinned { size, sha256: &sha }));
}

#[tokio::test]
async fn resumes_a_partial_download() {
    let bytes = body();
    let (size, sha) = pin(&bytes);
    let server = serve(bytes.clone(), true, None).await;
    let dir = tempfile::tempdir().unwrap();
    let dest = dir.path().join("model.onnx");
    std::fs::write(part_path(&dest), &bytes[..BLOCK + 7]).unwrap();
    let mut seen = 0u64;
    fetcher()
        .fetch(
            &server.url,
            &dest,
            Pinned { size, sha256: &sha },
            &AtomicBool::new(false),
            &mut |n| seen += n,
        )
        .await
        .unwrap();
    assert_eq!(std::fs::read(&dest).unwrap(), bytes);
    assert_eq!(seen, size, "reprise comptée dans l'avancement");
}

#[tokio::test]
async fn restarts_when_the_server_ignores_the_range() {
    let bytes = body();
    let (size, sha) = pin(&bytes);
    let server = serve(bytes.clone(), false, None).await;
    let dir = tempfile::tempdir().unwrap();
    let dest = dir.path().join("model.onnx");
    std::fs::write(part_path(&dest), &bytes[..100]).unwrap();
    fetcher()
        .fetch(
            &server.url,
            &dest,
            Pinned { size, sha256: &sha },
            &AtomicBool::new(false),
            &mut |_| {},
        )
        .await
        .unwrap();
    assert_eq!(std::fs::read(&dest).unwrap(), bytes);
}

#[tokio::test]
async fn a_wrong_or_oversized_file_is_refused_and_removed() {
    let bytes = body();
    let (size, _) = pin(&bytes);
    let server = serve(bytes.clone(), true, None).await;
    let dir = tempfile::tempdir().unwrap();
    let dest = dir.path().join("model.onnx");
    let wrong = "0".repeat(64);
    let error = fetcher()
        .fetch(
            &server.url,
            &dest,
            Pinned {
                size,
                sha256: &wrong,
            },
            &AtomicBool::new(false),
            &mut |_| {},
        )
        .await
        .unwrap_err();
    assert!(matches!(error, FetchError::Mismatch), "{error}");
    assert!(!dest.exists() && !part_path(&dest).exists());
    // Plus long que la taille épinglée : coupé avant la fin.
    let (_, sha) = pin(&bytes);
    let error = fetcher()
        .fetch(
            &server.url,
            &dest,
            Pinned {
                size: size - 1,
                sha256: &sha,
            },
            &AtomicBool::new(false),
            &mut |_| {},
        )
        .await
        .unwrap_err();
    assert!(matches!(error, FetchError::Mismatch), "{error}");
    assert!(!dest.exists() && !part_path(&dest).exists());
}

#[tokio::test]
async fn a_corrupt_partial_file_fails_then_the_next_try_succeeds() {
    let bytes = body();
    let (size, sha) = pin(&bytes);
    let server = serve(bytes.clone(), true, None).await;
    let dir = tempfile::tempdir().unwrap();
    let dest = dir.path().join("model.onnx");
    let mut corrupt = bytes[..BLOCK].to_vec();
    corrupt[10] ^= 0xff;
    std::fs::write(part_path(&dest), &corrupt).unwrap();
    let pinned = Pinned { size, sha256: &sha };
    assert!(matches!(
        fetcher()
            .fetch(
                &server.url,
                &dest,
                pinned,
                &AtomicBool::new(false),
                &mut |_| {}
            )
            .await,
        Err(FetchError::Mismatch)
    ));
    fetcher()
        .fetch(
            &server.url,
            &dest,
            pinned,
            &AtomicBool::new(false),
            &mut |_| {},
        )
        .await
        .unwrap();
    assert_eq!(std::fs::read(&dest).unwrap(), bytes);
}

#[tokio::test]
async fn cancelling_keeps_the_partial_file_for_later() {
    let bytes = body();
    let (size, sha) = pin(&bytes);
    let server = serve(bytes.clone(), true, None).await;
    let dir = tempfile::tempdir().unwrap();
    let dest = dir.path().join("model.onnx");
    let cancel = AtomicBool::new(false);
    let error = fetcher()
        .fetch(
            &server.url,
            &dest,
            Pinned { size, sha256: &sha },
            &cancel,
            &mut |_| cancel.store(true, Ordering::Relaxed),
        )
        .await
        .unwrap_err();
    assert!(matches!(error, FetchError::Cancelled));
    assert!(part_path(&dest).exists() && !dest.exists());
}

#[tokio::test]
async fn only_https_is_accepted_even_after_a_redirect() {
    let bytes = body();
    let (size, sha) = pin(&bytes);
    let dir = tempfile::tempdir().unwrap();
    let dest = dir.path().join("model.onnx");
    let pinned = Pinned { size, sha256: &sha };
    for url in [
        "http://example.com/model.onnx",
        "ftp://example.com/m",
        "file:///etc/passwd",
        "pas une adresse",
    ] {
        assert!(
            matches!(
                fetcher()
                    .fetch(url, &dest, pinned, &AtomicBool::new(false), &mut |_| {})
                    .await,
                Err(FetchError::Insecure)
            ),
            "{url}"
        );
    }
    // Redirection vers une adresse http hors boucle locale : pas suivie.
    let server = serve(bytes, true, Some("http://example.com/model.onnx".into())).await;
    let result = fetcher()
        .fetch(
            &server.url,
            &dest,
            pinned,
            &AtomicBool::new(false),
            &mut |_| {},
        )
        .await;
    assert!(result.is_err());
    assert_eq!(server.requests.load(Ordering::SeqCst), 1);
    assert!(!dest.exists());
}

#[test]
fn copies_only_a_matching_regular_file() {
    let bytes = body();
    let (size, sha) = pin(&bytes);
    let dir = tempfile::tempdir().unwrap();
    let source = dir.path().join("source.onnx");
    std::fs::write(&source, &bytes).unwrap();
    let dest = dir.path().join("out/model.onnx");
    let mut seen = 0u64;
    copy_verified(
        &source,
        &dest,
        Pinned { size, sha256: &sha },
        &AtomicBool::new(false),
        &mut |n| seen += n,
    )
    .unwrap();
    assert_eq!(std::fs::read(&dest).unwrap(), bytes);
    assert_eq!(seen, size);
    let wrong = "0".repeat(64);
    let dest2 = dir.path().join("out/other.onnx");
    assert!(matches!(
        copy_verified(
            &source,
            &dest2,
            Pinned {
                size,
                sha256: &wrong
            },
            &AtomicBool::new(false),
            &mut |_| {}
        ),
        Err(FetchError::Mismatch)
    ));
    assert!(!dest2.exists() && !part_path(&dest2).exists());
    #[cfg(unix)]
    {
        let link = dir.path().join("link.onnx");
        std::os::unix::fs::symlink(&source, &link).unwrap();
        assert!(
            copy_verified(
                &link,
                &dest2,
                Pinned { size, sha256: &sha },
                &AtomicBool::new(false),
                &mut |_| {}
            )
            .is_err()
        );
    }
}
