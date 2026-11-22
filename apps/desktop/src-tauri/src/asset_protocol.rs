// Protocole `asset` de l'application (issue 677).
//
// Il remplace celui de Tauri, qui résout le chemin demandé (lien symbolique,
// existence, forme canonique) avant de le comparer à la portée : sous Windows,
// un chemin réseau serait donc touché, et une connexion SMB ouverte, avant tout
// refus. Ici, un chemin réseau ou de périphérique est refusé d'emblée, sur la
// seule forme de la chaîne, puis le reste suit la logique de Tauri 2.12
// (`tauri/src/protocol/asset.rs`, Apache-2.0 ou MIT) : `SafePathBuf`, portée
// `asset_protocol_scope`, type MIME, requêtes partielles.

use std::borrow::Cow;
use std::io::SeekFrom;

use tauri::http::{Method, Request, Response, StatusCode, header::*};
use tauri::path::SafePathBuf;
use tauri::{Manager, UriSchemeContext, UriSchemeResponder};
use tauri_utils::mime_type::MimeType;
use tokio::fs::File;
use tokio::io::{AsyncReadExt, AsyncSeekExt};

/// Plus grande tranche envoyée par réponse partielle, comme Tauri.
const MAX_RANGE_LEN: u64 = 1000 * 1024;

/// Chemin réseau (`\\serveur\partage`, `//serveur/partage`) ou de
/// périphérique (`\\?\…`, `\\.\…`), sous toutes les combinaisons de barres.
pub(crate) fn is_network_or_device_path(path: &str) -> bool {
    let mut chars = path.chars();
    let is_sep = |c: Option<char>| matches!(c, Some('/' | '\\'));
    if is_sep(chars.next()) && is_sep(chars.next()) {
        return true;
    }
    #[cfg(windows)]
    {
        use std::path::{Component, Path, Prefix};
        if let Some(Component::Prefix(prefix)) = Path::new(path).components().next() {
            return !matches!(prefix.kind(), Prefix::Disk(_));
        }
    }
    false
}

/// Chemin de fichier demandé par une adresse `asset` : chemin de l'URL sans sa
/// première barre, décodé.
fn requested_path(request: &Request<Vec<u8>>) -> String {
    let path = request.uri().path().as_bytes();
    percent_encoding::percent_decode(path.strip_prefix(b"/").unwrap_or(path))
        .decode_utf8_lossy()
        .into_owned()
}

fn window_origin<R: tauri::Runtime>(ctx: &UriSchemeContext<'_, R>) -> String {
    ctx.app_handle()
        .get_webview_window(ctx.webview_label())
        .and_then(|webview| webview.url().ok())
        .map(|url| url.origin().ascii_serialization())
        .unwrap_or_else(|| "null".to_owned())
}

pub fn handle<R: tauri::Runtime>(
    ctx: UriSchemeContext<'_, R>,
    request: Request<Vec<u8>>,
    responder: UriSchemeResponder,
) {
    let scope = ctx.app_handle().asset_protocol_scope();
    let origin = window_origin(&ctx);
    tauri::async_runtime::spawn(async move {
        let response = match get_response(&request, &origin, |path| scope.is_allowed(path)).await {
            Ok(response) => response,
            Err(error) => Response::builder()
                .status(StatusCode::INTERNAL_SERVER_ERROR)
                .header(CONTENT_TYPE, "text/plain")
                .header("Access-Control-Allow-Origin", &origin)
                .body(Cow::Owned(error.to_string().into_bytes()))
                .unwrap(),
        };
        responder.respond(response);
    });
}

fn status(origin: &str, status: StatusCode) -> Response<Cow<'static, [u8]>> {
    Response::builder()
        .status(status)
        .header("Access-Control-Allow-Origin", origin)
        .body(Cow::Borrowed(&[][..]))
        .unwrap()
}

pub(crate) async fn get_response(
    request: &Request<Vec<u8>>,
    origin: &str,
    is_allowed: impl FnOnce(&SafePathBuf) -> bool,
) -> Result<Response<Cow<'static, [u8]>>, Box<dyn std::error::Error + Send + Sync>> {
    let path = requested_path(request);

    // Avant toute résolution du chemin : aucun accès au système de fichiers.
    if path.contains('\0') || is_network_or_device_path(&path) {
        tracing::warn!("asset_protocol_network_path_refused");
        return Ok(status(origin, StatusCode::FORBIDDEN));
    }

    let Ok(safe_path) = SafePathBuf::new(path.clone().into()) else {
        return Ok(status(origin, StatusCode::FORBIDDEN));
    };
    if !is_allowed(&safe_path) {
        return Ok(status(origin, StatusCode::FORBIDDEN));
    }

    let mut file = match File::open(&safe_path).await {
        Ok(file) => file,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
            return Ok(status(origin, StatusCode::NOT_FOUND));
        }
        Err(e) if e.kind() == std::io::ErrorKind::PermissionDenied => {
            return Ok(status(origin, StatusCode::FORBIDDEN));
        }
        Err(e) => return Err(e.into()),
    };

    let len = file.metadata().await?.len();
    let nbytes = len.min(8192);
    let mut magic = Vec::with_capacity(nbytes as usize);
    (&mut file).take(nbytes).read_to_end(&mut magic).await?;
    file.rewind().await?;
    let mime_type = MimeType::parse(&magic, &path);

    let resp = Response::builder()
        .header("Access-Control-Allow-Origin", origin)
        .header(CONTENT_TYPE, &mime_type);

    let range = request
        .headers()
        .get(RANGE)
        .and_then(|value| value.to_str().ok());
    if let Some(range) = range {
        // Une seule tranche est servie ; une demande de plusieurs tranches
        // reçoit la première (le lecteur média n'en demande qu'une).
        let first = http_range::HttpRange::parse(range, len)
            .ok()
            .and_then(|ranges| ranges.first().copied());
        let Some(first) = first.filter(|r| r.length > 0 && r.start < len) else {
            return Ok(Response::builder()
                .status(StatusCode::RANGE_NOT_SATISFIABLE)
                .header("Access-Control-Allow-Origin", origin)
                .header(CONTENT_RANGE, format!("bytes */{len}"))
                .body(Cow::Borrowed(&[][..]))?);
        };
        let start = first.start;
        let end = start + first.length.min(MAX_RANGE_LEN).min(len - start) - 1;
        let mut buf = Vec::with_capacity((end + 1 - start) as usize);
        file.seek(SeekFrom::Start(start)).await?;
        file.take(end + 1 - start).read_to_end(&mut buf).await?;
        return Ok(resp
            .status(StatusCode::PARTIAL_CONTENT)
            .header(ACCEPT_RANGES, "bytes")
            .header(ACCESS_CONTROL_EXPOSE_HEADERS, "content-range")
            .header(CONTENT_RANGE, format!("bytes {start}-{end}/{len}"))
            .header(CONTENT_LENGTH, end + 1 - start)
            .body(Cow::Owned(buf))?);
    }

    if request.method() == Method::HEAD {
        return Ok(resp
            .header(CONTENT_LENGTH, len)
            .body(Cow::Borrowed(&[][..]))?);
    }

    let buf = if len <= 8192 {
        magic
    } else {
        let mut buf = Vec::with_capacity(len as usize);
        file.read_to_end(&mut buf).await?;
        buf
    };
    Ok(resp.header(CONTENT_LENGTH, len).body(Cow::Owned(buf))?)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn request(path: &str, range: Option<&str>) -> Request<Vec<u8>> {
        let encoded =
            percent_encoding::utf8_percent_encode(path, percent_encoding::NON_ALPHANUMERIC);
        let mut builder = Request::builder().uri(format!("asset://localhost/{encoded}"));
        if let Some(range) = range {
            builder = builder.header(RANGE, range);
        }
        builder.body(Vec::new()).unwrap()
    }

    fn run(request: &Request<Vec<u8>>, allowed: bool) -> (Response<Cow<'static, [u8]>>, bool) {
        let mut asked = false;
        let response = tauri::async_runtime::block_on(get_response(request, "null", |_| {
            asked = true;
            allowed
        }))
        .unwrap();
        (response, asked)
    }

    #[test]
    fn network_and_device_paths_are_detected() {
        for path in [
            r"\\server\share\image.png",
            "//server/share/image.png",
            r"\/server\share",
            r"/\server/share",
            r"\\?\UNC\server\share\image.png",
            r"\\?\C:\Users\image.png",
            r"\\.\pipe\name",
        ] {
            assert!(is_network_or_device_path(path), "{path}");
        }
        for path in [
            "/home/user/.local/share/syntheo/image.png",
            r"C:\Users\user\AppData\Roaming\image.png",
            "C:/Users/user/image.png",
        ] {
            assert!(!is_network_or_device_path(path), "{path}");
        }
    }

    // Le chemin réseau est refusé sans que la portée soit consultée : rien
    // n'est résolu ni ouvert, même si la portée l'autoriserait.
    #[test]
    fn network_path_is_refused_before_the_scope_is_consulted() {
        for path in [r"\\192.0.2.1\share\a.png", "//192.0.2.1/share/a.png"] {
            let (response, asked) = run(&request(path, None), true);
            assert_eq!(response.status(), StatusCode::FORBIDDEN, "{path}");
            assert!(!asked, "{path}");
        }
    }

    // Sous Windows, un vrai chemin réseau vers ce poste (partage administratif
    // `\\localhost\C$`) : il est joignable, la portée l'accepterait, et il
    // est pourtant refusé sans être ouvert.
    #[cfg(windows)]
    #[test]
    fn reachable_windows_network_path_is_refused() {
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("image.png");
        std::fs::write(&file, b"png").unwrap();
        let local = file.to_string_lossy().into_owned();
        let (drive, rest) = local.split_once(":\\").unwrap();
        let unc = format!(r"\\localhost\{drive}$\{rest}");
        if std::fs::metadata(&unc).is_err() {
            eprintln!("partage administratif injoignable, essai sauté : {unc}");
            return;
        }
        let (response, asked) = run(&request(&unc, None), true);
        assert_eq!(response.status(), StatusCode::FORBIDDEN);
        assert!(!asked);
        let (response, _) = run(&request(&local, None), true);
        assert_eq!(response.status(), StatusCode::OK);
    }

    #[test]
    fn allowed_local_file_is_served_whole_or_in_part() {
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("note.txt");
        std::fs::write(&file, "0123456789").unwrap();
        let path = file.to_string_lossy().into_owned();

        let (response, asked) = run(&request(&path, None), true);
        assert!(asked);
        assert_eq!(response.status(), StatusCode::OK);
        assert_eq!(response.body().as_ref(), b"0123456789");

        let (response, _) = run(&request(&path, Some("bytes=2-4")), true);
        assert_eq!(response.status(), StatusCode::PARTIAL_CONTENT);
        assert_eq!(response.body().as_ref(), b"234");
        assert_eq!(response.headers()[CONTENT_RANGE], "bytes 2-4/10");

        let (response, _) = run(&request(&path, None), false);
        assert_eq!(response.status(), StatusCode::FORBIDDEN);
    }
}
