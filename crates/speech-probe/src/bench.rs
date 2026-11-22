//! Micro-banc sans modèle : produit matriciel q8_0 (blocs de 32 entiers 8 bits
//! et une échelle), de forme proche d'une couche de l'encodeur (64 trames,
//! 1024 → 4096), réparti sur autant de fils que de cœurs physiques. Il mesure
//! un débit en milliards de multiplications-additions par seconde (GMAC/s),
//! que `predict` convertit en RTF par moteur. Rien n'est téléchargé, rien
//! n'est écrit.

use std::time::{Duration, Instant};

/// Taille d'un bloc q8_0, comme dans ggml.
const BLOCK: usize = 32;
/// Trames d'une tranche de 560 ms après sous-échantillonnage, arrondi.
const ROWS: usize = 64;
/// Dimensions d'une couche d'avance de l'encodeur (1024 → 4096).
const K: usize = 1024;
const N: usize = 4096;

#[derive(Debug, Clone, Copy, PartialEq, serde::Serialize)]
#[cfg_attr(feature = "specta", derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub struct BenchResult {
    /// Débit soutenu, en GMAC/s.
    pub gmacs: f64,
    pub threads: u32,
    pub seconds: f64,
    /// Noyau utilisé : `avx2` ou `scalar` (sans AVX2, le poste est de toute
    /// façon refusé ; la valeur sert au diagnostic).
    pub kernel: &'static str,
}

struct Quantized {
    values: Vec<i8>,
    scales: Vec<f32>,
}

/// Données déterministes, sans aléa système.
fn quantized(rows: usize, cols: usize, seed: u32) -> Quantized {
    let mut state = seed;
    let mut next = || {
        state = state.wrapping_mul(1_664_525).wrapping_add(1_013_904_223);
        // q8_0 quantifie dans [-127, 127], jamais -128 : le noyau AVX2 de
        // ggml (et celui-ci) suppose cette plage.
        ((state >> 24) as i8).max(-127)
    };
    let values = (0..rows * cols).map(|_| next()).collect();
    let scales = (0..rows * cols / BLOCK)
        .map(|i| 0.01 + (i % 7) as f32 * 0.001)
        .collect();
    Quantized { values, scales }
}

fn dot_scalar(a: &[i8], b: &[i8], sa: &[f32], sb: &[f32]) -> f32 {
    let mut acc = 0.0f32;
    for (block, (x, y)) in a.chunks_exact(BLOCK).zip(b.chunks_exact(BLOCK)).enumerate() {
        let sum: i32 = x.iter().zip(y).map(|(&x, &y)| x as i32 * y as i32).sum();
        acc += sum as f32 * sa[block] * sb[block];
    }
    acc
}

#[cfg(target_arch = "x86_64")]
#[target_feature(enable = "avx2,fma")]
unsafe fn dot_avx2(a: &[i8], b: &[i8], sa: &[f32], sb: &[f32]) -> f32 {
    use std::arch::x86_64::*;
    // Même noyau que ggml (q8_0 · q8_0) : |x| · signe(y, x) en u8 × i8.
    let mut acc = _mm256_setzero_ps();
    let ones = _mm256_set1_epi16(1);
    for block in 0..a.len() / BLOCK {
        // SAFETY : les tranches font un multiple de 32 octets, vérifié par
        // l'appelant ; lectures non alignées.
        let x = unsafe { _mm256_loadu_si256(a.as_ptr().add(block * BLOCK).cast()) };
        let y = unsafe { _mm256_loadu_si256(b.as_ptr().add(block * BLOCK).cast()) };
        let ax = _mm256_sign_epi8(x, x);
        let sy = _mm256_sign_epi8(y, x);
        let dot = _mm256_madd_epi16(_mm256_maddubs_epi16(ax, sy), ones);
        let scale = _mm256_set1_ps(sa[block] * sb[block]);
        acc = _mm256_fmadd_ps(scale, _mm256_cvtepi32_ps(dot), acc);
    }
    let high = _mm256_extractf128_ps(acc, 1);
    let sum = _mm_add_ps(_mm256_castps256_ps128(acc), high);
    let sum = _mm_add_ps(sum, _mm_movehl_ps(sum, sum));
    let sum = _mm_add_ss(sum, _mm_shuffle_ps(sum, sum, 1));
    _mm_cvtss_f32(sum)
}

/// AVX2 et FMA disponibles sur ce processeur.
pub fn has_avx2() -> bool {
    #[cfg(target_arch = "x86_64")]
    {
        std::arch::is_x86_feature_detected!("avx2") && std::arch::is_x86_feature_detected!("fma")
    }
    #[cfg(not(target_arch = "x86_64"))]
    {
        false
    }
}

fn dot(avx2: bool, a: &[i8], b: &[i8], sa: &[f32], sb: &[f32]) -> f32 {
    #[cfg(target_arch = "x86_64")]
    if avx2 {
        // SAFETY : AVX2 et FMA détectés à l'exécution.
        return unsafe { dot_avx2(a, b, sa, sb) };
    }
    let _ = avx2;
    dot_scalar(a, b, sa, sb)
}

/// Lance le micro-banc pendant environ `duration` (3 à 5 s conseillé), sur
/// `threads` fils. Une passe d'échauffement courte précède la mesure.
pub fn run(threads: u32, duration: Duration) -> BenchResult {
    let threads = threads.max(1) as usize;
    let avx2 = has_avx2();
    let activations = quantized(ROWS, K, 7);
    let weights = quantized(N, K, 11);
    let per_thread = N.div_ceil(threads);
    let pass = |deadline: Instant| -> u64 {
        std::thread::scope(|scope| {
            let handles: Vec<_> = (0..threads)
                .map(|t| {
                    let (activations, weights) = (&activations, &weights);
                    scope.spawn(move || {
                        let rows = (t * per_thread)..((t + 1) * per_thread).min(N);
                        let mut macs = 0u64;
                        let mut sink = 0.0f32;
                        while Instant::now() < deadline {
                            for n in rows.clone() {
                                let w = &weights.values[n * K..(n + 1) * K];
                                let sw = &weights.scales[n * K / BLOCK..(n + 1) * K / BLOCK];
                                for r in 0..ROWS {
                                    let a = &activations.values[r * K..(r + 1) * K];
                                    let sa =
                                        &activations.scales[r * K / BLOCK..(r + 1) * K / BLOCK];
                                    sink += dot(avx2, a, w, sa, sw);
                                }
                            }
                            macs += (rows.len() * ROWS * K) as u64;
                        }
                        std::hint::black_box(sink);
                        macs
                    })
                })
                .collect();
            handles.into_iter().map(|h| h.join().unwrap_or(0)).sum()
        })
    };
    pass(Instant::now() + duration.min(Duration::from_millis(300)));
    let start = Instant::now();
    let macs = pass(start + duration);
    let seconds = start.elapsed().as_secs_f64();
    BenchResult {
        gmacs: macs as f64 / seconds / 1e9,
        threads: threads as u32,
        seconds,
        kernel: if avx2 { "avx2" } else { "scalar" },
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn avx2_kernel_matches_the_scalar_one() {
        let a = quantized(1, K, 3);
        let b = quantized(1, K, 5);
        let scalar = dot_scalar(&a.values, &b.values, &a.scales, &b.scales);
        let fast = dot(has_avx2(), &a.values, &b.values, &a.scales, &b.scales);
        assert!(
            (scalar - fast).abs() <= scalar.abs() * 1e-4 + 1e-3,
            "{scalar} {fast}"
        );
    }

    #[test]
    fn a_short_run_reports_a_positive_rate() {
        let result = run(2, Duration::from_millis(200));
        assert!(result.gmacs > 0.0);
        assert_eq!(result.threads, 2);
    }
}
