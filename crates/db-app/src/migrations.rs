//! Manifeste des migrations de l'application, dans l'ordre d'application.
//!
//! Chaque étape lit `migrations/<id>.sql` : l'identifiant et le nom du fichier
//! sont toujours identiques.

use syntheo_db_migrate::{MigrationScope, MigrationStep};

macro_rules! migration {
    ($id:literal) => {
        MigrationStep {
            id: $id,
            scope: MigrationScope::Plain,
            sql: include_str!(concat!("../migrations/", $id, ".sql")),
        }
    };
    ($id:literal, cloudsync_alter: $table:literal) => {
        MigrationStep {
            id: $id,
            scope: MigrationScope::CloudsyncAlter { table_name: $table },
            sql: include_str!(concat!("../migrations/", $id, ".sql")),
        }
    };
}

// Older builds keep running against databases that carry newer migrations, so
// every new migration must be downgrade-safe by default: additive only, new
// columns nullable or with a DEFAULT, no renames or drops of anything older
// builds read or write. If a migration cannot be downgrade-safe, put a
// "-- breaking" line in the leading comment block of its .sql file; older
// builds will then refuse to open the database with an explicit
// "update Syntheo" dialog instead of misbehaving on it.
pub const APP_MIGRATION_STEPS: &[MigrationStep] = &[
    migration!("20260413020000_templates"),
    migration!("20260414120000_calendars_events"),
    migration!("20260524000000_default_templates"),
    migration!("20260624000000_repair_templates"),
    migration!("20260710223922_canonical_data_model"),
    migration!("20260710231809_import_target_audit"),
    migration!("20260711000000_calendar_event_tombstones"),
    migration!("20260712170000_template_icons"),
    migration!("20260713164500_repair_empty_session_titles"),
    migration!("20260714120000_search_index_queue"),
    migration!("20260714120100_search_index_sessions_triggers", cloudsync_alter: "sessions"),
    migration!("20260714120200_search_index_session_documents_triggers", cloudsync_alter: "session_documents"),
    migration!("20260714120300_search_index_transcripts_triggers", cloudsync_alter: "transcripts"),
    migration!("20260714120400_search_index_humans_triggers", cloudsync_alter: "humans"),
    migration!("20260714120500_search_index_organizations_triggers", cloudsync_alter: "organizations"),
    migration!("20260716120000_personal_workspaces"),
    migration!("20260716130000_cloudsync_session_evictions"),
    migration!("20260716173000_shared_session_cache"),
    migration!("20260717120000_e2ee_replica"),
    migration!("20260717140000_attachment_local_state"),
    migration!("20260717192000_e2ee_replica_order"),
    migration!("20260717193000_e2ee_freshness_witness"),
    migration!("20260717150000_attachment_transfer_jobs"),
    migration!("20260717170000_attachment_cloud_sync_intent", cloudsync_alter: "session_attachments"),
    migration!("20260717171000_shared_session_attachment_cache"),
    migration!("20260717172000_shared_session_cache_attachments"),
    migration!("20260717190000_shared_session_cache_web_edits"),
    migration!("20260717191000_session_share_sync_state"),
    migration!("20260723120000_e2ee_dirty_rows"),
    migration!("20260723120100_e2ee_dirty_action_items_triggers", cloudsync_alter: "action_items"),
    migration!("20260723120200_e2ee_dirty_humans_triggers", cloudsync_alter: "humans"),
    migration!("20260723120300_e2ee_dirty_organizations_triggers", cloudsync_alter: "organizations"),
    migration!("20260723120400_e2ee_dirty_session_attachments_triggers", cloudsync_alter: "session_attachments"),
    migration!("20260723120500_e2ee_dirty_session_documents_triggers", cloudsync_alter: "session_documents"),
    migration!("20260723120600_e2ee_dirty_session_participants_triggers", cloudsync_alter: "session_participants"),
    migration!("20260723120700_e2ee_dirty_sessions_triggers", cloudsync_alter: "sessions"),
    migration!("20260723120800_e2ee_dirty_transcripts_triggers", cloudsync_alter: "transcripts"),
    migration!("20260723120900_e2ee_witness_upload_index"),
    migration!("20260725001400_e2ee_witness_pending"),
    migration!("20260725020000_cloudsync_projection_indexes"),
    migration!("20260728090000_local_api"),
    migration!("20260802120000_voiceprint_exemplars"),
    migration!("20260804110000_session_share_activation"),
    migration!("20260810120000_synced_preferences"),
    migration!("20260810120100_e2ee_dirty_synced_preferences_triggers", cloudsync_alter: "synced_preferences"),
    migration!("20260810120200_synced_preferences_backfill"),
    migration!("20260810120300_synced_preferences_backfill_legacy"),
    migration!("20260811090000_voiceprint_candidates"),
    migration!("20260811100000_drop_api_keys"),
    migration!("20260812100000_e2ee_reconciliation_queues"),
    migration!("20260812100100_e2ee_replica_reconciliation_triggers", cloudsync_alter: "e2ee_records"),
    migration!("20260814090000_enterprise_session_delivery"),
    migration!("20260815100000_transcript_content_revision", cloudsync_alter: "transcripts"),
    migration!("20260815100100_transcript_live_deltas"),
    migration!("20260815100200_search_index_acknowledgements"),
    migration!("20260815100300_e2ee_record_payload_hash", cloudsync_alter: "e2ee_records"),
    migration!("20260815100400_e2ee_ciphertext_ownership"),
    migration!("20260816100000_e2ee_replica_payload_hashes"),
    migration!("20260816100100_e2ee_payload_hash_local_state", cloudsync_alter: "e2ee_records"),
    migration!("20260820120000_session_locked", cloudsync_alter: "sessions"),
    migration!("20260821140000_session_consent_evidence"),
    migration!("20260826120000_session_proposals"),
    migration!("20260830120000_folder_attachments"),
    migration!("20260830140000_folders"),
    migration!("20260830160000_folder_instructions"),
    migration!("20260831120000_folder_icons"),
    migration!("20260903120000_voiceprint_exemplars_isolated_mic"),
    migration!("20260907120000_session_documents_content_version", cloudsync_alter: "session_documents"),
    migration!("20260907120100_transcripts_content_version", cloudsync_alter: "transcripts"),
    migration!("20260907120200_session_content_observations"),
    migration!("20260907120300_session_deletion_context", cloudsync_alter: "sessions"),
    migration!("20260907120400_session_local_content_restoration"),
    migration!("20260907120500_session_documents_local_restoration", cloudsync_alter: "session_documents"),
    migration!("20260907120600_transcripts_local_restoration", cloudsync_alter: "transcripts"),
    migration!("20260907120700_session_attachments_local_restoration", cloudsync_alter: "session_attachments"),
    migration!("20260907120800_sessions_local_restoration", cloudsync_alter: "sessions"),
    migration!("20260909130000_e2ee_parked_records"),
    migration!("20260909140000_e2ee_edit_conflicts"),
    migration!("20260909150000_session_document_versions", cloudsync_alter: "session_documents"),
    migration!("20260909160000_e2ee_dirty_tags_triggers", cloudsync_alter: "tags"),
    migration!("20260909160100_e2ee_dirty_session_tags_triggers", cloudsync_alter: "session_tags"),
    migration!("20260909160200_e2ee_dirty_folders_triggers", cloudsync_alter: "folders"),
    migration!("20260909160300_e2ee_dirty_daily_notes_triggers", cloudsync_alter: "daily_notes"),
    migration!("20260916043000_local_library_connections", cloudsync_alter: "session_attachments"),
    migration!("20260916060000_local_library_write_times"),
    migration!("20260928030000_e2ee_witness_pending_priority"),
    migration!("20260930120000_event_attendance"),
    migration!("20261002090000_session_share_activation_sync", cloudsync_alter: "sessions"),
    migration!("20261005090000_e2ee_cloud_authority"),
    migration!("20261011120000_managed_app_settings"),
    migration!("20261011120100_local_meeting_purges"),
    migration!("20261013090000_recording_import_jobs"),
    migration!("20261024120000_syntheo_templates_fr"),
    migration!("20261101120000_search_index_sessions_projection_columns", cloudsync_alter: "sessions"),
    migration!("20261107120000_notification_detect_off"),
    migration!("20261108120000_session_summary_versions"),
    migration!("20261109120000_drop_calendar"),
    migration!("20261109130000_drop_cloud_sharing"),
    migration!("20261109150000_folder_threads"),
];
