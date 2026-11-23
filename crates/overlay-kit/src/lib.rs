//! Generic, brand-agnostic macOS overlay primitives: non-activating panels,
//! Core Animation reveal/dismiss/fade mechanisms, appearance-aware color
//! helpers and main-thread dispatch. Consumers own app-specific policy such as
//! durations, animation keys, and brand colors. This
//! crate is macOS-only; on other platforms it exposes platform-neutral
//! geometry, layout, placement, and vector-path descriptions.

pub mod geometry;
pub mod layout;
#[cfg(target_os = "macos")]
pub mod macos;
pub mod path;
pub mod placement;
