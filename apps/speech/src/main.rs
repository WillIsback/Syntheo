//! `syntheo-speech --models <dossier> [--engine parakeet] [--threads N]
//! [--max-sessions N]`
//!
//! Lancé par l'application, jamais par la personne :
//! 1. lit le jeton du lancement sur la première ligne de l'entrée standard ;
//! 2. charge le moteur ;
//! 3. écoute sur `127.0.0.1`, sur un port libre ;
//! 4. annonce `{"event":"listening","port":N,"protocol":1}` sur la sortie
//!    standard ;
//! 5. s'arrête quand l'entrée standard se ferme, c'est-à-dire quand
//!    l'application se termine, même brutalement.

use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;

use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};

use syntheo_speech::auth::Token;
use syntheo_speech::engine::Engine;
use syntheo_speech::server::{self, ServerConfig};

/// Version du protocole entre l'application et le module.
const PROTOCOL: u32 = 1;
/// Délai pour recevoir le jeton.
const TOKEN_TIMEOUT: Duration = Duration::from_secs(10);

struct Args {
    models: PathBuf,
    engine: String,
    threads: usize,
    max_sessions: usize,
}

fn parse_args() -> Result<Args, String> {
    let mut args = std::env::args().skip(1);
    let mut models = None;
    let mut engine = "parakeet".to_owned();
    let mut threads = std::thread::available_parallelism()
        .map_or(2, |n| n.get() / 2)
        .max(1);
    let mut max_sessions = 4;
    while let Some(arg) = args.next() {
        let mut value = || {
            args.next()
                .ok_or_else(|| format!("missing value for {arg}"))
        };
        match arg.as_str() {
            "--models" => models = Some(PathBuf::from(value()?)),
            "--engine" => engine = value()?,
            "--threads" => threads = value()?.parse().map_err(|_| "invalid --threads")?,
            "--max-sessions" => {
                max_sessions = value()?.parse().map_err(|_| "invalid --max-sessions")?
            }
            _ => return Err(format!("unknown argument {arg}")),
        }
    }
    Ok(Args {
        models: models.ok_or("missing --models")?,
        engine,
        threads,
        max_sessions,
    })
}

fn load_engine(args: &Args) -> Result<Arc<dyn Engine>, String> {
    match args.engine.as_str() {
        #[cfg(feature = "parakeet")]
        "parakeet" => syntheo_speech::parakeet::ParakeetEngine::load(&args.models, args.threads)
            .map(|engine| Arc::new(engine) as Arc<dyn Engine>)
            .map_err(|error| error.to_string()),
        #[cfg(feature = "fake-engine")]
        "fake" => Ok(Arc::new(syntheo_speech::fake::FakeEngine) as Arc<dyn Engine>),
        _ => Err("unsupported engine".to_owned()),
    }
}

/// Windows : les bibliothèques chargées dynamiquement (ONNX Runtime et ses
/// fournisseurs) ne sont cherchées que dans le dossier du binaire et dans
/// System32, jamais dans le dossier courant ni le PATH.
#[cfg(windows)]
fn restrict_dll_search() {
    const LOAD_LIBRARY_SEARCH_APPLICATION_DIR: u32 = 0x0000_0200;
    const LOAD_LIBRARY_SEARCH_SYSTEM32: u32 = 0x0000_0800;
    unsafe extern "system" {
        fn SetDefaultDllDirectories(flags: u32) -> i32;
    }
    // SAFETY : appel Win32 sans pointeur, avant tout chargement dynamique.
    let ok = unsafe {
        SetDefaultDllDirectories(LOAD_LIBRARY_SEARCH_APPLICATION_DIR | LOAD_LIBRARY_SEARCH_SYSTEM32)
    };
    if ok == 0 {
        server::log("stopped: dll search path not restricted");
        std::process::exit(1);
    }
}

#[tokio::main]
async fn main() {
    #[cfg(windows)]
    restrict_dll_search();
    let code = run().await.map_or_else(
        |error| {
            server::log(&format!("stopped: {error}"));
            1
        },
        |()| 0,
    );
    std::process::exit(code);
}

async fn run() -> Result<(), String> {
    let args = parse_args()?;
    let mut stdin = BufReader::new(tokio::io::stdin());
    let mut line = String::new();
    tokio::time::timeout(TOKEN_TIMEOUT, stdin.read_line(&mut line))
        .await
        .map_err(|_| "no token on standard input")?
        .map_err(|_| "no token on standard input")?;
    let token = Token::from_hex(&line).map_err(|_| "invalid token")?;
    line.clear();

    let engine = {
        let started = std::time::Instant::now();
        let engine = load_engine(&args)?;
        server::log(&format!(
            "engine loaded in {:.1} s",
            started.elapsed().as_secs_f64()
        ));
        engine
    };
    let listener = tokio::net::TcpListener::bind(("127.0.0.1", 0))
        .await
        .map_err(|_| "cannot listen on the loopback")?;
    let port = listener
        .local_addr()
        .map_err(|_| "cannot listen on the loopback")?
        .port();
    let mut stdout = tokio::io::stdout();
    let announce = format!(
        "{}\n",
        serde_json::json!({"event": "listening", "port": port, "protocol": PROTOCOL})
    );
    stdout
        .write_all(announce.as_bytes())
        .await
        .map_err(|_| "stdout closed")?;
    stdout.flush().await.map_err(|_| "stdout closed")?;

    // Fin de l'entrée standard : l'application est partie.
    let parent_gone = async move {
        let mut buffer = [0u8; 256];
        while let Ok(read) = tokio::io::AsyncReadExt::read(&mut stdin, &mut buffer).await {
            if read == 0 {
                break;
            }
        }
    };
    let config = ServerConfig {
        token,
        max_sessions: args.max_sessions,
    };
    server::serve(listener, config, engine, parent_gone).await;
    server::log("stopped: standard input closed");
    Ok(())
}
