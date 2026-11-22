//! Caractéristiques statiques du poste, lues en quelques millisecondes, sans
//! rien télécharger ni lancer de calcul.

use serde::Serialize;
use std::path::Path;

/// Plan d'alimentation actif, ramené à trois classes.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[cfg_attr(feature = "specta", derive(specta::Type))]
#[serde(rename_all = "snake_case")]
pub enum PowerPlan {
    /// Économie d'énergie (Windows : « Économiseur d'énergie » ou économiseur
    /// de batterie ; Linux : `low-power`, `power-saver`, `quiet`, `cool`).
    PowerSaver,
    Balanced,
    Performance,
    Unknown,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[cfg_attr(feature = "specta", derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub struct Gpu {
    pub name: String,
    /// Mémoire vidéo dédiée, si le système la donne.
    #[cfg_attr(feature = "specta", specta(type = Option<f64>))]
    pub vram_bytes: Option<u64>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[cfg_attr(feature = "specta", derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub struct Hardware {
    pub avx2: bool,
    pub physical_cores: u32,
    pub logical_cores: u32,
    #[cfg_attr(feature = "specta", specta(type = f64))]
    pub total_memory_bytes: u64,
    #[cfg_attr(feature = "specta", specta(type = f64))]
    pub available_memory_bytes: u64,
    /// Espace libre du disque qui porte le dossier de données.
    #[cfg_attr(feature = "specta", specta(type = Option<f64>))]
    pub free_disk_bytes: Option<u64>,
    pub power_plan: PowerPlan,
    /// `Some(true)` sur batterie, `Some(false)` sur secteur, `None` sans
    /// batterie connue (poste fixe).
    pub on_battery: Option<bool>,
    pub gpus: Vec<Gpu>,
}

pub fn read(data_dir: &Path) -> Hardware {
    // Sans accès aux compteurs mémoire, la mémoire vaut 0 : le poste est
    // refusé plutôt que surestimé.
    let (total_memory, available_memory) = match sysinfo::System::new() {
        Ok(mut system) => {
            system.refresh_memory();
            (system.total_memory(), system.available_memory())
        }
        Err(_) => (0, 0),
    };
    let logical = std::thread::available_parallelism().map_or(1, |n| n.get());
    let physical = sysinfo::System::physical_core_count()
        .unwrap_or(logical)
        .max(1);
    Hardware {
        avx2: crate::bench::has_avx2(),
        physical_cores: physical as u32,
        logical_cores: logical as u32,
        total_memory_bytes: total_memory,
        available_memory_bytes: available_memory,
        free_disk_bytes: free_disk(data_dir),
        power_plan: power_plan(),
        on_battery: on_battery(),
        gpus: gpus(),
    }
}

/// Disque dont le point de montage est le plus long préfixe du dossier.
/// `None` : disque introuvable, traité comme un refus, jamais comme accepté.
fn free_disk(dir: &Path) -> Option<u64> {
    let dir = std::fs::canonicalize(dir).unwrap_or_else(|_| dir.to_path_buf());
    let dir = std::path::PathBuf::from(strip_verbatim(&dir.to_string_lossy()));
    let disks = sysinfo::Disks::new_with_refreshed_list().ok()?;
    disks
        .iter()
        .filter(|d| dir.starts_with(d.mount_point()))
        .max_by_key(|d| d.mount_point().as_os_str().len())
        .map(|d| d.available_space())
}

/// Sous Windows, `canonicalize` rend un chemin `\\?\D:\…` ou
/// `\\?\UNC\serveur\partage\…`, que les points de montage (`D:\`) ne
/// préfixent pas : on revient à la forme usuelle.
pub(crate) fn strip_verbatim(path: &str) -> String {
    if let Some(rest) = path.strip_prefix(r"\\?\UNC\") {
        return format!(r"\\{rest}");
    }
    if let Some(rest) = path.strip_prefix(r"\\?\") {
        let bytes = rest.as_bytes();
        if bytes.len() >= 2 && bytes[0].is_ascii_alphabetic() && bytes[1] == b':' {
            return rest.to_owned();
        }
    }
    path.to_owned()
}

/// Classe un nom de profil Linux (`power-profiles-daemon` ou ACPI).
#[cfg_attr(not(target_os = "linux"), allow(dead_code))]
pub(crate) fn linux_profile(name: &str) -> PowerPlan {
    match name.trim() {
        "low-power" | "power-saver" | "quiet" | "cool" => PowerPlan::PowerSaver,
        "balanced" | "balanced-performance" => PowerPlan::Balanced,
        "performance" => PowerPlan::Performance,
        _ => PowerPlan::Unknown,
    }
}

#[cfg(target_os = "linux")]
fn power_plan() -> PowerPlan {
    // power-profiles-daemon écrit le profil ACPI ; on lit la source sans
    // lancer de processus.
    std::fs::read_to_string("/sys/firmware/acpi/platform_profile")
        .map(|p| linux_profile(&p))
        .unwrap_or(PowerPlan::Unknown)
}

#[cfg(target_os = "linux")]
fn on_battery() -> Option<bool> {
    let entries = std::fs::read_dir("/sys/class/power_supply").ok()?;
    let mut mains = None;
    let mut battery = false;
    for entry in entries.flatten() {
        let path = entry.path();
        let kind = std::fs::read_to_string(path.join("type")).unwrap_or_default();
        match kind.trim() {
            "Mains" | "USB" => {
                if std::fs::read_to_string(path.join("online")).is_ok_and(|v| v.trim() == "1") {
                    mains = Some(true);
                } else if mains.is_none() {
                    mains = Some(false);
                }
            }
            // Batterie d'un périphérique (souris, manette, casque) : pas
            // celle du poste.
            "Battery" => {
                let scope = std::fs::read_to_string(path.join("scope")).unwrap_or_default();
                if scope.trim() != "Device" {
                    battery = true;
                }
            }
            _ => {}
        }
    }
    if !battery {
        return None;
    }
    Some(mains != Some(true))
}

#[cfg(target_os = "linux")]
fn gpus() -> Vec<Gpu> {
    // AMD et Intel : mémoire vidéo dans sysfs ; NVIDIA : nom seulement, sans
    // lancer nvidia-smi.
    let mut out = Vec::new();
    if let Ok(entries) = std::fs::read_dir("/sys/class/drm") {
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().into_owned();
            if !name.starts_with("card") || name.contains('-') {
                continue;
            }
            let device = entry.path().join("device");
            let vendor = std::fs::read_to_string(device.join("vendor")).unwrap_or_default();
            let vram = std::fs::read_to_string(device.join("mem_info_vram_total"))
                .ok()
                .and_then(|v| v.trim().parse().ok());
            let vendor = match vendor.trim() {
                "0x10de" => "NVIDIA",
                "0x1002" => "AMD",
                "0x8086" => "Intel",
                _ => continue,
            };
            out.push(Gpu {
                name: vendor.to_owned(),
                vram_bytes: vram,
            });
        }
    }
    out
}

/// Mode d'alimentation de Windows 10 et 11 (surcouche du plan actif), lu par
/// `PowerGetEffectiveOverlayScheme`. Absente du crate `windows`, la fonction
/// est résolue à l'exécution, une seule fois : un import statique empêcherait
/// l'application de démarrer sur un Windows qui ne l'exporte pas. Absente :
/// `None`, et le plan actif décide.
#[cfg(target_os = "windows")]
fn effective_overlay() -> Option<windows::core::GUID> {
    use std::sync::OnceLock;
    use windows::Win32::System::LibraryLoader::{
        GetProcAddress, LOAD_LIBRARY_SEARCH_SYSTEM32, LoadLibraryExW,
    };
    type OverlayFn = unsafe extern "system" fn(*mut windows::core::GUID) -> u32;
    // Adresse de la fonction (0 : absente), résolue une fois.
    static RESOLVED: OnceLock<usize> = OnceLock::new();
    let address = *RESOLVED.get_or_init(|| {
        // SAFETY : chargement de la DLL système depuis System32 seulement ;
        // le module reste chargé pour la durée du processus.
        let Ok(module) = (unsafe {
            LoadLibraryExW(
                windows::core::w!("powrprof.dll"),
                None,
                LOAD_LIBRARY_SEARCH_SYSTEM32,
            )
        }) else {
            return 0;
        };
        // SAFETY : recherche d'un symbole dans un module valide.
        unsafe { GetProcAddress(module, windows::core::s!("PowerGetEffectiveOverlayScheme")) }
            .map_or(0, |f| f as usize)
    });
    if address == 0 {
        return None;
    }
    // SAFETY : adresse non nulle rendue par GetProcAddress pour cette
    // fonction, dont la signature est `DWORD (GUID*)`.
    let function: OverlayFn = unsafe { std::mem::transmute::<usize, OverlayFn>(address) };
    let mut overlay = windows::core::GUID::zeroed();
    // SAFETY : écrit un GUID dans une variable locale.
    (unsafe { function(&mut overlay) } == 0).then_some(overlay)
}

#[cfg(target_os = "windows")]
fn power_plan() -> PowerPlan {
    use windows::Win32::System::Power::{
        GetSystemPowerStatus, PowerGetActiveScheme, SYSTEM_POWER_STATUS,
    };
    // Économiseur de batterie actif : traité comme une économie d'énergie.
    let mut status = SYSTEM_POWER_STATUS::default();
    // SAFETY : appel Win32 sur une structure locale.
    if unsafe { GetSystemPowerStatus(&mut status) }.is_ok() && status.SystemStatusFlag == 1 {
        return PowerPlan::PowerSaver;
    }
    // Mode d'alimentation (« meilleure efficacité énergétique »…) : il prime
    // sur le plan quand il est défini.
    if let Some(overlay) = effective_overlay() {
        let mode = windows_overlay(&format!("{overlay:?}"));
        if mode != PowerPlan::Unknown {
            return mode;
        }
    }
    let mut guid = std::ptr::null_mut();
    // SAFETY : la fonction alloue le GUID, libéré par LocalFree ci-dessous.
    if unsafe { PowerGetActiveScheme(None, &mut guid) }.is_err() || guid.is_null() {
        return PowerPlan::Unknown;
    }
    // SAFETY : pointeur valide rendu par PowerGetActiveScheme.
    let value = unsafe { *guid };
    unsafe {
        let _ = windows::Win32::Foundation::LocalFree(Some(windows::Win32::Foundation::HLOCAL(
            guid.cast(),
        )));
    }
    windows_scheme(&format!("{value:?}"))
}

/// GUID des plans d'alimentation fournis par Windows.
#[cfg_attr(not(target_os = "windows"), allow(dead_code))]
pub(crate) fn windows_scheme(guid: &str) -> PowerPlan {
    match guid.to_ascii_lowercase().as_str() {
        "a1841308-3541-4fab-bc81-f71556f20b4a" => PowerPlan::PowerSaver,
        "381b4222-f694-41f0-9685-ff5bb260df2e" => PowerPlan::Balanced,
        "8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c" | "e9a42b02-d5df-448d-aa00-03f14749eb61" => {
            PowerPlan::Performance
        }
        _ => PowerPlan::Unknown,
    }
}

/// GUID des modes d'alimentation de Windows 10 et 11. Le mode « Équilibré »
/// n'a pas de surcouche (GUID nul) : le plan actif décide alors.
#[cfg_attr(not(target_os = "windows"), allow(dead_code))]
pub(crate) fn windows_overlay(guid: &str) -> PowerPlan {
    match guid.to_ascii_lowercase().as_str() {
        "961cc777-2547-4f9d-8174-7d86181b8a7a" => PowerPlan::PowerSaver,
        "3af9b8d9-7c97-431d-ad78-34a8bfea439f" | "ded574b5-45a0-4f42-8737-46345c09c238" => {
            PowerPlan::Performance
        }
        _ => PowerPlan::Unknown,
    }
}

#[cfg(target_os = "windows")]
fn on_battery() -> Option<bool> {
    use windows::Win32::System::Power::{GetSystemPowerStatus, SYSTEM_POWER_STATUS};
    let mut status = SYSTEM_POWER_STATUS::default();
    // SAFETY : appel Win32 sur une structure locale.
    unsafe { GetSystemPowerStatus(&mut status) }.ok()?;
    // BatteryFlag 128 : pas de batterie système.
    if status.BatteryFlag == 128 {
        return None;
    }
    match status.ACLineStatus {
        0 => Some(true),
        1 => Some(false),
        _ => None,
    }
}

#[cfg(target_os = "windows")]
fn gpus() -> Vec<Gpu> {
    use windows::Win32::Graphics::Dxgi::{
        CreateDXGIFactory1, DXGI_ADAPTER_FLAG_SOFTWARE, IDXGIFactory1,
    };
    let mut out = Vec::new();
    // SAFETY : création de fabrique DXGI, sans état partagé.
    let Ok(factory) = (unsafe { CreateDXGIFactory1::<IDXGIFactory1>() }) else {
        return out;
    };
    for index in 0.. {
        // SAFETY : énumération jusqu'à l'erreur DXGI_ERROR_NOT_FOUND.
        let Ok(adapter) = (unsafe { factory.EnumAdapters1(index) }) else {
            break;
        };
        // SAFETY : adaptateur valide rendu par EnumAdapters1.
        let Ok(desc) = (unsafe { adapter.GetDesc1() }) else {
            continue;
        };
        if desc.Flags & DXGI_ADAPTER_FLAG_SOFTWARE.0 as u32 != 0 {
            continue;
        }
        let end = desc
            .Description
            .iter()
            .position(|&c| c == 0)
            .unwrap_or(desc.Description.len());
        out.push(Gpu {
            name: String::from_utf16_lossy(&desc.Description[..end]),
            vram_bytes: Some(desc.DedicatedVideoMemory as u64),
        });
    }
    out
}

#[cfg(not(any(target_os = "linux", target_os = "windows")))]
fn power_plan() -> PowerPlan {
    PowerPlan::Unknown
}

#[cfg(not(any(target_os = "linux", target_os = "windows")))]
fn on_battery() -> Option<bool> {
    None
}

#[cfg(not(any(target_os = "linux", target_os = "windows")))]
fn gpus() -> Vec<Gpu> {
    Vec::new()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn power_plans_are_classified() {
        assert_eq!(linux_profile("low-power\n"), PowerPlan::PowerSaver);
        assert_eq!(linux_profile("balanced"), PowerPlan::Balanced);
        assert_eq!(linux_profile("performance"), PowerPlan::Performance);
        assert_eq!(linux_profile("custom"), PowerPlan::Unknown);
        assert_eq!(
            windows_scheme("A1841308-3541-4FAB-BC81-F71556F20B4A"),
            PowerPlan::PowerSaver
        );
        assert_eq!(
            windows_scheme("8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c"),
            PowerPlan::Performance
        );
    }

    // Revue 0.8.0 (sonde), constats 1 et 5.
    #[test]
    fn verbatim_prefixes_and_overlays() {
        assert_eq!(
            strip_verbatim(r"\\?\C:\Users\a\AppData"),
            r"C:\Users\a\AppData"
        );
        assert_eq!(strip_verbatim(r"\\?\UNC\srv\share\x"), r"\\srv\share\x");
        assert_eq!(
            strip_verbatim("/home/a/.local/share"),
            "/home/a/.local/share"
        );
        assert_eq!(strip_verbatim(r"\\?\Volume{abc}\x"), r"\\?\Volume{abc}\x");
        assert_eq!(
            windows_overlay("961CC777-2547-4F9D-8174-7D86181B8A7A"),
            PowerPlan::PowerSaver
        );
        assert_eq!(
            windows_overlay("ded574b5-45a0-4f42-8737-46345c09c238"),
            PowerPlan::Performance
        );
        assert_eq!(
            windows_overlay("00000000-0000-0000-0000-000000000000"),
            PowerPlan::Unknown
        );
    }

    #[test]
    fn reads_this_machine_without_failing() {
        let hardware = read(&std::env::temp_dir());
        assert!(hardware.physical_cores >= 1 && hardware.logical_cores >= 1);
        assert!(hardware.total_memory_bytes >= hardware.available_memory_bytes);
    }
}
