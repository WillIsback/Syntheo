use std::sync::OnceLock;

use tauri::{Result, Wry, image::Image, tray::TrayIcon};

pub enum TrayIconState {
    Default,
    Degraded,
}

pub const RECORDING_FRAMES: &[&[u8]] = &[
    include_bytes!("../icons/tray_recording_0.png"),
    include_bytes!("../icons/tray_recording_1.png"),
    include_bytes!("../icons/tray_recording_2.png"),
];

/// Les mêmes images recolorées pour un panneau clair (issue 739), écrites
/// une fois au build : sous Linux, l'animation les lie telles quelles, sans
/// réencoder de PNG. Égales à `for_light_background` des originales (test).
pub const DARK_RECORDING_FRAMES_PNG: &[&[u8]] = &[
    include_bytes!("../icons/tray_recording_0_dark.png"),
    include_bytes!("../icons/tray_recording_1_dark.png"),
    include_bytes!("../icons/tray_recording_2_dark.png"),
];

static DECODED_RECORDING_FRAMES: OnceLock<Vec<Image<'static>>> = OnceLock::new();
static DARK_RECORDING_FRAMES: OnceLock<Vec<Image<'static>>> = OnceLock::new();

/// Couleur des pixels blancs de l'icône sur une zone de notification claire
/// (issue 721) : gris foncé du texte de Windows en thème clair.
const DARK_GLYPH: [u8; 3] = [0x1f, 0x1f, 0x1f];

impl TrayIconState {
    /// Icône adaptée au fond de la zone de notification : les icônes sont
    /// blanches (icônes « modèle » de macOS), recolorées en gris foncé sur un
    /// fond clair (issue 721).
    pub fn to_image(&self) -> Result<Image<'static>> {
        let image = match self {
            TrayIconState::Default => {
                Image::from_bytes(include_bytes!("../icons/tray_default.png"))
            }
            TrayIconState::Degraded => {
                Image::from_bytes(include_bytes!("../icons/tray_degraded.png"))
            }
        }?;
        Ok(if tray_on_light_background() {
            for_light_background(&image)
        } else {
            image
        })
    }
}

/// Recolore en gris foncé les pixels presque blancs, transparence gardée ;
/// les pixels de couleur (l'orange de l'état dégradé) ne changent pas.
pub fn for_light_background(image: &Image<'_>) -> Image<'static> {
    let mut rgba = image.rgba().to_vec();
    for pixel in rgba.chunks_exact_mut(4) {
        if pixel[..3].iter().all(|channel| *channel >= 0xc8) {
            pixel[..3].copy_from_slice(&DARK_GLYPH);
        }
    }
    Image::new_owned(rgba, image.width(), image.height())
}

/// Zone de notification sur fond clair : sous Windows, barre des tâches en
/// thème clair (`SystemUsesLightTheme`, distinct du thème des applications) ;
/// sous Linux, schéma clair du portail hors GNOME (issue 739). Sous macOS,
/// l'icône blanche est gardée (icône « modèle »).
pub fn tray_on_light_background() -> bool {
    #[cfg(target_os = "windows")]
    {
        windows_taskbar_is_light()
    }
    #[cfg(target_os = "linux")]
    {
        crate::linux_theme::is_light()
    }
    #[cfg(not(any(target_os = "windows", target_os = "linux")))]
    {
        false
    }
}

#[cfg(target_os = "windows")]
fn windows_taskbar_is_light() -> bool {
    use windows::Win32::Foundation::ERROR_SUCCESS;
    use windows::Win32::System::Registry::{HKEY_CURRENT_USER, RRF_RT_REG_DWORD, RegGetValueW};
    use windows::core::w;

    let mut value: u32 = 0;
    let mut size = std::mem::size_of::<u32>() as u32;
    // SAFETY: lecture d'un DWORD dans un tampon de 4 octets dont la taille est
    // donnée ; aucune autre mémoire n'est touchée.
    let status = unsafe {
        RegGetValueW(
            HKEY_CURRENT_USER,
            w!("Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize"),
            w!("SystemUsesLightTheme"),
            RRF_RT_REG_DWORD,
            None,
            Some((&mut value as *mut u32).cast()),
            Some(&mut size),
        )
    };
    status == ERROR_SUCCESS && value == 1
}

/// Image de l'animation d'enregistrement. Les PNG ne sont décodés qu'une fois
/// par processus, et recolorés une fois pour un fond clair ; l'image renvoyée
/// emprunte les pixels du cache.
pub fn recording_frame(frame: usize) -> Result<Image<'static>> {
    let frames = decoded_frames(&DECODED_RECORDING_FRAMES, false)?;
    let frames = if tray_on_light_background() {
        decoded_frames(&DARK_RECORDING_FRAMES, true)?
    } else {
        frames
    };
    let image = &frames[frame % frames.len()];
    Ok(Image::new(image.rgba(), image.width(), image.height()))
}

fn decoded_frames(
    cache: &'static OnceLock<Vec<Image<'static>>>,
    light: bool,
) -> Result<&'static Vec<Image<'static>>> {
    if let Some(frames) = cache.get() {
        return Ok(frames);
    }
    let decoded = RECORDING_FRAMES
        .iter()
        .map(|bytes| {
            let image = Image::from_bytes(bytes)?;
            Ok(if light {
                for_light_background(&image)
            } else {
                image
            })
        })
        .collect::<Result<Vec<_>>>()?;
    Ok(cache.get_or_init(|| decoded))
}

/// Affiche une image de l'animation d'enregistrement. À appeler sur le thread
/// principal.
pub fn show_recording_frame(tray: &TrayIcon<Wry>, frame: usize) -> Result<()> {
    #[cfg(target_os = "linux")]
    if crate::linux_frames::show_frame(tray, frame)? {
        return Ok(());
    }
    tray.set_icon(Some(recording_frame(frame)?))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn recording_frames_are_decoded_once() {
        for frame in 0..RECORDING_FRAMES.len() {
            let first = recording_frame(frame).unwrap();
            let second = recording_frame(frame).unwrap();
            assert_eq!(first.rgba().as_ptr(), second.rgba().as_ptr());
            assert_eq!(
                first.rgba().len(),
                (first.width() * first.height() * 4) as usize
            );
        }
        let wrapped = recording_frame(RECORDING_FRAMES.len()).unwrap();
        assert_eq!(
            wrapped.rgba().as_ptr(),
            recording_frame(0).unwrap().rgba().as_ptr()
        );
    }

    // Issue 739 : les images d'enregistrement pour panneau clair, écrites au
    // build, sont exactement la recoloration du code ; l'animation Linux les
    // affiche sans réencoder.
    #[test]
    fn baked_dark_recording_frames_match_the_recoloring() {
        assert_eq!(DARK_RECORDING_FRAMES_PNG.len(), RECORDING_FRAMES.len());
        for (original, dark) in RECORDING_FRAMES.iter().zip(DARK_RECORDING_FRAMES_PNG) {
            let expected = for_light_background(&Image::from_bytes(original).unwrap());
            let baked = Image::from_bytes(dark).unwrap();
            assert_eq!(baked.width(), expected.width());
            assert_eq!(baked.height(), expected.height());
            assert_eq!(baked.rgba(), expected.rgba());
        }
    }

    // Issue 721 : sur un fond clair, le blanc devient gris foncé, la
    // transparence et la couleur de l'état dégradé sont gardées.
    #[test]
    fn white_glyphs_turn_dark_on_a_light_background() {
        let image = Image::new_owned(
            vec![
                255, 255, 255, 255, // blanc opaque
                250, 250, 250, 128, // blanc semi-transparent
                255, 140, 0, 255, // orange de l'état dégradé
                0, 0, 0, 0, // transparent
            ],
            4,
            1,
        );
        let dark = for_light_background(&image);
        assert_eq!(
            dark.rgba(),
            [
                0x1f, 0x1f, 0x1f, 255, 0x1f, 0x1f, 0x1f, 128, 255, 140, 0, 255, 0, 0, 0, 0
            ]
        );
        for icon in [TrayIconState::Default, TrayIconState::Degraded] {
            let original = icon.to_image().unwrap();
            let adapted = for_light_background(&original);
            assert_eq!(adapted.width(), original.width());
            // Aucun pixel opaque presque blanc ne reste.
            assert!(
                adapted
                    .rgba()
                    .chunks_exact(4)
                    .all(|p| p[3] == 0 || !p[..3].iter().all(|c| *c >= 0xc8))
            );
        }
    }

    #[test]
    fn other_platforms_keep_the_white_icon() {
        #[cfg(not(target_os = "windows"))]
        assert!(!tray_on_light_background());
    }
}
