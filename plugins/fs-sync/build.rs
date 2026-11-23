const COMMANDS: &[&str] = &[
    "deserialize",
    "write_document_batch",
    "list_folders",
    "move_session",
    "create_folder",
    "rename_folder",
    "delete_folder",
    "audio_exist",
    "audio_delete",
    "audio_metadata",
    "audio_import",
    "audio_source_metadata",
    "audio_has_speech",
    "audio_path",
    "audio_copy",
    "session_dir",
    "load_session_content",
    "delete_session_folder",
    "scan_and_read",
    "attachment_save",
    "attachment_list",
    "attachment_read",
    "attachment_remove",
    "folder_attachment_save",
    "folder_attachment_read",
    "folder_attachment_remove",
];

fn main() {
    tauri_plugin::Builder::new(COMMANDS).build();
}
