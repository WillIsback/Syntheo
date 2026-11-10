//! Pastille de réunion en calque Wayland (`zwlr_layer_shell_v1`, issue 448).
//!
//! Sous Hyprland, sway ou KDE, une fenêtre ordinaire ne choisit ni sa position ni son
//! empilement : le compositeur la centre, voire la met en mosaïque (issue 416). Un calque est
//! ancré par le compositeur lui-même : en bas au centre, au-dessus des fenêtres, jamais en
//! mosaïque. GNOME (Mutter) ne gère pas ce protocole, et X11 non plus : la fenêtre reste
//! alors ordinaire, avec sa taille fixe et son placement en bas au centre.
//!
//! Un calque ne se déplace pas à la souris : sa position est celle de l'ancrage. La pastille
//! l'annonce au webview (`FloatingBarOverlayLayout::movable`), qui retire alors sa zone de
//! déplacement.

use std::sync::atomic::{AtomicBool, Ordering};

use gtk::prelude::{GtkWindowExt, WidgetExt};
use gtk_layer_shell::{Edge, KeyboardMode, Layer, LayerShell};

/// Espace de noms du calque, pour les règles du compositeur (`layerrule` de Hyprland).
const NAMESPACE: &str = "syntheo-floating-bar";

/// Désactivé en 0.7.0, réactivé en 0.7.1 (issue 533). Sous Hyprland, le calque ne dessinait rien
/// pendant l'écoute et prenait 200 px de haut en pause : le webview n'avait pas de taille demandée
/// (voir `release_webview_size_request` dans `floating_bar.rs`) et la largeur ne suivait pas
/// l'état. Constante gardée comme interrupteur de repli vers la fenêtre ordinaire.
const ENABLED: bool = true;

static ACTIVE: AtomicBool = AtomicBool::new(false);

/// Vrai quand la pastille est un calque : sa position appartient au compositeur.
pub fn is_active() -> bool {
    ACTIVE.load(Ordering::Relaxed)
}

/// Fait de la fenêtre un calque ancré en bas au centre, si le compositeur le permet.
///
/// À appeler sur le fil principal, juste après la création de la fenêtre et avant son premier
/// affichage : GTK ne peut plus changer le rôle d'une surface déjà réalisée.
pub fn try_init(window: &tauri::WebviewWindow<tauri::Wry>, bottom_margin: i32) -> bool {
    if !ENABLED {
        tracing::info!("floating bar: layer-shell disabled, ordinary window used");
        return false;
    }
    if !gtk_layer_shell::is_supported() {
        // Journalisé pour diagnostiquer une pastille invisible sous Wayland : sans calque,
        // c'est la fenêtre ordinaire qui doit s'afficher.
        tracing::info!("floating bar: layer-shell unsupported, ordinary window used");
        return false;
    }
    let gtk_window = match window.gtk_window() {
        Ok(gtk_window) => gtk_window,
        Err(error) => {
            tracing::warn!(%error, "floating bar: GTK window unavailable for layer-shell");
            return false;
        }
    };
    if gtk_window.is_realized() {
        tracing::warn!("floating bar: window already realized, layer-shell skipped");
        return false;
    }

    LayerShell::init_layer_shell(&gtk_window);
    LayerShell::set_namespace(&gtk_window, NAMESPACE);
    LayerShell::set_layer(&gtk_window, Layer::Top);
    LayerShell::set_anchor(&gtk_window, Edge::Bottom, true);
    LayerShell::set_layer_shell_margin(&gtk_window, Edge::Bottom, bottom_margin);
    LayerShell::set_keyboard_mode(&gtk_window, KeyboardMode::None);
    LayerShell::set_exclusive_zone(&gtk_window, 0);
    ACTIVE.store(true, Ordering::Relaxed);
    let (width, height) = gtk_window.size();
    tracing::info!(
        namespace = NAMESPACE,
        bottom_margin,
        width,
        height,
        "floating bar: layer-shell initialized"
    );
    true
}
