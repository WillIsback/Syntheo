use std::sync::Arc;
use std::sync::atomic::AtomicUsize;

use super::*;

/// Comportement du serveur local de test.
#[derive(Clone)]
enum Mode {
    /// Sert le corps ; honore `Range: bytes=N-` (206 avec Content-Range) si
    /// `ranges`.
    Normal { ranges: bool },
    /// 206 avec une plage qui repart de zéro si une plage est demandée,
    /// 200 sinon.
    WrongRange,
    /// 206 au bon octet, total inconnu (`*`).
    UnknownTotal,
    /// 200 sans Content-Length, corps coupé après `n` octets puis fermeture.
    ShortCloseDelimited(usize),
    /// Statut imposé, corps vide.
    Status(&'static str),
    /// Redirection vers `location`.
    Redirect(String),
}

/// Serveur HTTP local minimal, qui compte les requêtes.
struct Server {
    url: String,
    requests: Arc<AtomicUsize>,
}

async fn serve(body: Vec<u8>, ranges: bool, redirect: Option<String>) -> Server {
    match redirect {
        Some(location) => serve_with(body, Mode::Redirect(location)).await,
        None => serve_with(body, Mode::Normal { ranges }).await,
    }
}

async fn serve_with(body: Vec<u8>, mode: Mode) -> Server {
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
            let mode = mode.clone();
            tokio::spawn(async move {
                let mut request = vec![0u8; 4096];
                let n = socket.read(&mut request).await.unwrap_or(0);
                let request = String::from_utf8_lossy(&request[..n]).to_lowercase();
                let start = request
                    .lines()
                    .find_map(|l| l.strip_prefix("range: bytes="))
                    .and_then(|r| r.trim().trim_end_matches('-').parse::<usize>().ok());
                let len = body.len();
                let (head, part): (String, &[u8]) = match &mode {
                    Mode::Redirect(location) => (
                        format!(
                            "HTTP/1.1 302 Found\r\nlocation: {location}\r\ncontent-length: 0\r\nconnection: close\r\n\r\n"
                        ),
                        &[],
                    ),
                    Mode::Status(status) => (
                        format!(
                            "HTTP/1.1 {status}\r\ncontent-length: 0\r\nconnection: close\r\n\r\n"
                        ),
                        &[],
                    ),
                    Mode::WrongRange | Mode::UnknownTotal if start.is_none() => (
                        format!(
                            "HTTP/1.1 200 OK\r\ncontent-length: {len}\r\nconnection: close\r\n\r\n"
                        ),
                        &body[..],
                    ),
                    Mode::UnknownTotal => {
                        let start = start.unwrap_or(0);
                        (
                            format!(
                                "HTTP/1.1 206 Partial Content\r\ncontent-range: bytes {start}-{}/*\r\ncontent-length: {}\r\nconnection: close\r\n\r\n",
                                len - 1,
                                len - start
                            ),
                            &body[start.min(len)..],
                        )
                    }
                    Mode::WrongRange => (
                        format!(
                            "HTTP/1.1 206 Partial Content\r\ncontent-range: bytes 0-{}/{len}\r\ncontent-length: {len}\r\nconnection: close\r\n\r\n",
                            len - 1
                        ),
                        &body[..],
                    ),
                    Mode::ShortCloseDelimited(cut) => (
                        "HTTP/1.1 200 OK\r\nconnection: close\r\n\r\n".to_owned(),
                        &body[..*cut],
                    ),
                    Mode::Normal { ranges } => match start.filter(|_| *ranges) {
                        Some(start) => (
                            format!(
                                "HTTP/1.1 206 Partial Content\r\ncontent-range: bytes {start}-{}/{len}\r\ncontent-length: {}\r\nconnection: close\r\n\r\n",
                                len - 1,
                                len - start
                            ),
                            &body[start.min(len)..],
                        ),
                        None => (
                            format!(
                                "HTTP/1.1 200 OK\r\ncontent-length: {len}\r\nconnection: close\r\n\r\n"
                            ),
                            &body[..],
                        ),
                    },
                };
                let _ = socket.write_all(head.as_bytes()).await;
                let _ = socket.write_all(part).await;
                let _ = socket.shutdown().await;
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
    // Redirection vers une adresse http hors boucle locale : pas suivie,
    // refusée comme adresse non sûre, sans toucher à un `.part` en reprise.
    std::fs::write(part_path(&dest), &bytes[..BLOCK]).unwrap();
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
    assert!(matches!(result, Err(FetchError::Insecure)), "{result:?}");
    assert_eq!(server.requests.load(Ordering::SeqCst), 1);
    assert!(!dest.exists());
    assert_eq!(
        std::fs::metadata(part_path(&dest)).unwrap().len(),
        BLOCK as u64
    );
}

async fn fetch_once(
    url: &str,
    dest: &Path,
    bytes: &[u8],
    cancel: &AtomicBool,
) -> Result<(), FetchError> {
    let (size, sha) = pin(bytes);
    fetcher()
        .fetch(
            url,
            dest,
            Pinned { size, sha256: &sha },
            cancel,
            &mut |_| {},
        )
        .await
}

// Revue, R3 : une plage fausse fait repartir de zéro, sans Range, au lieu
// de bloquer la reprise pour de bon.
#[tokio::test]
async fn a_resume_with_the_wrong_range_starts_over() {
    let bytes = body();
    let server = serve_with(bytes.clone(), Mode::WrongRange).await;
    let dir = tempfile::tempdir().unwrap();
    let dest = dir.path().join("model.onnx");
    std::fs::write(part_path(&dest), &bytes[..BLOCK]).unwrap();
    fetch_once(&server.url, &dest, &bytes, &AtomicBool::new(false))
        .await
        .unwrap();
    assert_eq!(std::fs::read(&dest).unwrap(), bytes);
    assert_eq!(server.requests.load(Ordering::SeqCst), 2);
}

// Total inconnu (« * ») admis quand la plage reprend au bon octet.
#[tokio::test]
async fn a_resume_with_an_unknown_total_is_accepted() {
    let bytes = body();
    let server = serve_with(bytes.clone(), Mode::UnknownTotal).await;
    let dir = tempfile::tempdir().unwrap();
    let dest = dir.path().join("model.onnx");
    std::fs::write(part_path(&dest), &bytes[..BLOCK]).unwrap();
    fetch_once(&server.url, &dest, &bytes, &AtomicBool::new(false))
        .await
        .unwrap();
    assert_eq!(std::fs::read(&dest).unwrap(), bytes);
    assert_eq!(server.requests.load(Ordering::SeqCst), 1);
}

#[tokio::test]
async fn a_body_that_ends_too_early_keeps_the_partial_file() {
    let bytes = body();
    let server = serve_with(bytes.clone(), Mode::ShortCloseDelimited(BLOCK + 5)).await;
    let dir = tempfile::tempdir().unwrap();
    let dest = dir.path().join("model.onnx");
    let result = fetch_once(&server.url, &dest, &bytes, &AtomicBool::new(false)).await;
    assert!(matches!(result, Err(FetchError::Incomplete)), "{result:?}");
    assert_eq!(
        std::fs::read(part_path(&dest)).unwrap(),
        &bytes[..BLOCK + 5]
    );
    let good = serve(bytes.clone(), true, None).await;
    fetch_once(&good.url, &dest, &bytes, &AtomicBool::new(false))
        .await
        .unwrap();
    assert_eq!(std::fs::read(&dest).unwrap(), bytes);
}

#[tokio::test]
async fn other_statuses_are_refused_before_touching_the_partial_file() {
    let bytes = body();
    for status in ["204 No Content", "203 Non-Authoritative Information"] {
        let server = serve_with(bytes.clone(), Mode::Status(status)).await;
        let dir = tempfile::tempdir().unwrap();
        let dest = dir.path().join("model.onnx");
        std::fs::write(part_path(&dest), &bytes[..10]).unwrap();
        let result = fetch_once(&server.url, &dest, &bytes, &AtomicBool::new(false)).await;
        assert!(
            matches!(result, Err(FetchError::Unexpected)),
            "{status}: {result:?}"
        );
        assert_eq!(std::fs::read(part_path(&dest)).unwrap(), &bytes[..10]);
    }
}

#[tokio::test]
async fn a_cancelled_download_sends_nothing() {
    let bytes = body();
    let server = serve(bytes.clone(), true, None).await;
    let dir = tempfile::tempdir().unwrap();
    let dest = dir.path().join("model.onnx");
    let result = fetch_once(&server.url, &dest, &bytes, &AtomicBool::new(true)).await;
    assert!(matches!(result, Err(FetchError::Cancelled)));
    assert_eq!(server.requests.load(Ordering::SeqCst), 0);
}

#[test]
fn content_range_is_parsed_strictly() {
    assert_eq!(
        parse_content_range("bytes 10-99/100"),
        Some((10, Some(100)))
    );
    assert_eq!(parse_content_range("bytes 10-99/*"), Some((10, None)));
    for bad in [
        "bytes */100",
        "bytes 50-10/100",
        "bytes 10-100/100",
        "items 1-2/3",
        "",
    ] {
        assert_eq!(parse_content_range(bad), None, "{bad}");
    }
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

// Revue, R9 : exactement MAX_REDIRECTS redirections suivies, pas une de plus.
#[tokio::test]
async fn follows_at_most_five_redirects() {
    let bytes = body();
    let (size, sha) = pin(&bytes);
    for (hops, ok) in [(MAX_REDIRECTS, true), (MAX_REDIRECTS + 1, false)] {
        let mut url = serve(bytes.clone(), false, None).await.url;
        for _ in 0..hops {
            url = serve(bytes.clone(), false, Some(url)).await.url;
        }
        let dir = tempfile::tempdir().unwrap();
        let dest = dir.path().join("model.onnx");
        let result = fetcher()
            .fetch(
                &url,
                &dest,
                Pinned { size, sha256: &sha },
                &AtomicBool::new(false),
                &mut |_| {},
            )
            .await;
        assert_eq!(result.is_ok(), ok, "{hops} redirections : {result:?}");
    }
}
