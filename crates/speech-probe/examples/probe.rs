//! Sonde en ligne de commande, pour l'étalonnage sur des postes de référence :
//! `cargo run --release -p speech-probe --example probe -- [secondes] [fils]`.
//! N'affiche que des nombres.
fn main() {
    let mut args = std::env::args().skip(1);
    let seconds: f64 = args.next().and_then(|s| s.parse().ok()).unwrap_or(4.0);
    let threads: Option<u32> = args.next().and_then(|s| s.parse().ok());
    let hardware = speech_probe::hardware::read(&std::env::temp_dir());
    let threads = threads.unwrap_or(hardware.physical_cores);
    let cancel = std::sync::atomic::AtomicBool::new(false);
    let bench = speech_probe::bench::run(
        threads,
        std::time::Duration::from_secs_f64(seconds),
        &cancel,
    );
    println!(
        "{}",
        serde_json::json!({ "hardware": hardware, "bench": bench })
    );
}
