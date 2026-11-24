const COMMANDS: &[&str] = &[
    "get_git_hash",
    "get_device_info",
    "get_process_memory_bytes",
    "delete_session_folder",
    "audio_open",
    "audio_exist",
    "audio_delete",
    "audio_path",
    "audio_import",
    "reveal_session_in_finder",
];

fn main() {
    // Seul VERGEN_GIT_SHA est lu (get_git_hash). Gix::all() émettait aussi
    // VERGEN_GIT_COMMIT_MESSAGE : un message de squash au-delà de 128 Kio
    // dépasse la taille maximale d'une variable d'environnement sous Linux
    // (MAX_ARG_STRLEN) et rustc ne se lance plus (« Argument list too long »,
    // issue 726).
    let gitcl = vergen_gix::Gix::builder().sha(false).build();
    vergen_gix::Emitter::default()
        .add_instructions(&gitcl)
        .unwrap()
        .emit()
        .unwrap();

    tauri_plugin::Builder::new(COMMANDS).build();
}
