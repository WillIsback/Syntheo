#![forbid(unsafe_code)]

mod attachment_ops;
mod capture_lifecycle_ops;
mod contact_ops;
mod folder_catalog_ops;
mod legacy_voiceprints;
mod managed_settings;
mod pilot_usage_ops;
mod session_audio_ops;
mod session_content_ops;
mod session_hold;
mod session_lifecycle_ops;
mod session_move_ops;
mod session_ops;
mod session_participant_ops;
mod session_purge;
mod session_review_ops;
mod session_transcript_ops;
mod session_types;
mod summary_ops;
mod template_ops;
mod template_types;
mod transcript_batch_ops;
mod transcript_live_ops;
mod webhook_ops;
mod webhook_types;

pub use attachment_ops::*;
pub use capture_lifecycle_ops::*;
pub use contact_ops::*;
pub use folder_catalog_ops::*;
pub use legacy_voiceprints::*;
pub use managed_settings::*;
pub use pilot_usage_ops::*;
pub use session_audio_ops::*;
pub use session_content_ops::*;
pub use session_hold::*;
pub use session_lifecycle_ops::*;
pub use session_move_ops::*;
pub use session_ops::*;
pub use session_participant_ops::*;
pub use session_purge::*;
pub use session_review_ops::*;
pub use session_transcript_ops::*;
pub use session_types::*;
use sha2::{Digest, Sha384};
pub use summary_ops::*;
pub use template_ops::*;
pub use template_types::*;
pub use transcript_batch_ops::*;
pub use transcript_live_ops::*;
pub use webhook_ops::*;
pub use webhook_types::*;

pub const DEFAULT_USER_ID: &str = "00000000-0000-0000-0000-000000000000";

// Older builds keep running against databases that carry newer migrations, so
// every new migration must be downgrade-safe by default: additive only, new
// columns nullable or with a DEFAULT, no renames or drops of anything older
// builds read or write. If a migration cannot be downgrade-safe, put a
// "-- breaking" line in the leading comment block of its .sql file; older
// builds will then refuse to open the database with an explicit
// "update Syntheo" dialog instead of misbehaving on it.
pub const APP_MIGRATION_STEPS: &[syntheo_db_migrate::MigrationStep] = &[
    syntheo_db_migrate::MigrationStep {
        id: "20260413020000_templates",
        scope: syntheo_db_migrate::MigrationScope::Plain,
        sql: include_str!("../migrations/20260413020000_templates.sql"),
    },
    syntheo_db_migrate::MigrationStep {
        id: "20260414120000_calendars_events",
        scope: syntheo_db_migrate::MigrationScope::Plain,
        sql: include_str!("../migrations/20260414120000_calendars_events.sql"),
    },
    syntheo_db_migrate::MigrationStep {
        id: "20260524000000_default_templates",
        scope: syntheo_db_migrate::MigrationScope::Plain,
        sql: include_str!("../migrations/20260524000000_default_templates.sql"),
    },
    syntheo_db_migrate::MigrationStep {
        id: "20260624000000_repair_templates",
        scope: syntheo_db_migrate::MigrationScope::Plain,
        sql: include_str!("../migrations/20260624000000_repair_templates.sql"),
    },
    syntheo_db_migrate::MigrationStep {
        id: "20260710223922_canonical_data_model",
        scope: syntheo_db_migrate::MigrationScope::Plain,
        sql: include_str!("../migrations/20260710223922_canonical_data_model.sql"),
    },
    syntheo_db_migrate::MigrationStep {
        id: "20260710231809_import_target_audit",
        scope: syntheo_db_migrate::MigrationScope::Plain,
        sql: include_str!("../migrations/20260710231809_import_target_audit.sql"),
    },
    syntheo_db_migrate::MigrationStep {
        id: "20260711000000_calendar_event_tombstones",
        scope: syntheo_db_migrate::MigrationScope::Plain,
        sql: include_str!("../migrations/20260711000000_calendar_event_tombstones.sql"),
    },
    syntheo_db_migrate::MigrationStep {
        id: "20260712170000_template_icons",
        scope: syntheo_db_migrate::MigrationScope::Plain,
        sql: include_str!("../migrations/20260712170000_template_icons.sql"),
    },
    syntheo_db_migrate::MigrationStep {
        id: "20260713164500_repair_empty_session_titles",
        scope: syntheo_db_migrate::MigrationScope::Plain,
        sql: include_str!("../migrations/20260713164500_repair_empty_session_titles.sql"),
    },
    syntheo_db_migrate::MigrationStep {
        id: "20260714120000_search_index_queue",
        scope: syntheo_db_migrate::MigrationScope::Plain,
        sql: include_str!("../migrations/20260714120000_search_index_queue.sql"),
    },
    syntheo_db_migrate::MigrationStep {
        id: "20260714120100_search_index_sessions_triggers",
        scope: syntheo_db_migrate::MigrationScope::CloudsyncAlter {
            table_name: "sessions",
        },
        sql: include_str!("../migrations/20260714120100_search_index_sessions_triggers.sql"),
    },
    syntheo_db_migrate::MigrationStep {
        id: "20260714120200_search_index_session_documents_triggers",
        scope: syntheo_db_migrate::MigrationScope::CloudsyncAlter {
            table_name: "session_documents",
        },
        sql: include_str!(
            "../migrations/20260714120200_search_index_session_documents_triggers.sql"
        ),
    },
    syntheo_db_migrate::MigrationStep {
        id: "20260714120300_search_index_transcripts_triggers",
        scope: syntheo_db_migrate::MigrationScope::CloudsyncAlter {
            table_name: "transcripts",
        },
        sql: include_str!("../migrations/20260714120300_search_index_transcripts_triggers.sql"),
    },
    syntheo_db_migrate::MigrationStep {
        id: "20260714120400_search_index_humans_triggers",
        scope: syntheo_db_migrate::MigrationScope::CloudsyncAlter {
            table_name: "humans",
        },
        sql: include_str!("../migrations/20260714120400_search_index_humans_triggers.sql"),
    },
    syntheo_db_migrate::MigrationStep {
        id: "20260714120500_search_index_organizations_triggers",
        scope: syntheo_db_migrate::MigrationScope::CloudsyncAlter {
            table_name: "organizations",
        },
        sql: include_str!("../migrations/20260714120500_search_index_organizations_triggers.sql"),
    },
    syntheo_db_migrate::MigrationStep {
        id: "20260716120000_personal_workspaces",
        scope: syntheo_db_migrate::MigrationScope::Plain,
        sql: include_str!("../migrations/20260716120000_personal_workspaces.sql"),
    },
    syntheo_db_migrate::MigrationStep {
        id: "20260716130000_cloudsync_session_evictions",
        scope: syntheo_db_migrate::MigrationScope::Plain,
        sql: include_str!("../migrations/20260716130000_cloudsync_session_evictions.sql"),
    },
    syntheo_db_migrate::MigrationStep {
        id: "20260716173000_shared_session_cache",
        scope: syntheo_db_migrate::MigrationScope::Plain,
        sql: include_str!("../migrations/20260716173000_shared_session_cache.sql"),
    },
    syntheo_db_migrate::MigrationStep {
        id: "20260717120000_e2ee_replica",
        scope: syntheo_db_migrate::MigrationScope::Plain,
        sql: include_str!("../migrations/20260717120000_e2ee_replica.sql"),
    },
    syntheo_db_migrate::MigrationStep {
        id: "20260717140000_attachment_local_state",
        scope: syntheo_db_migrate::MigrationScope::Plain,
        sql: include_str!("../migrations/20260717140000_attachment_local_state.sql"),
    },
    syntheo_db_migrate::MigrationStep {
        id: "20260717192000_e2ee_replica_order",
        scope: syntheo_db_migrate::MigrationScope::Plain,
        sql: include_str!("../migrations/20260717192000_e2ee_replica_order.sql"),
    },
    syntheo_db_migrate::MigrationStep {
        id: "20260717193000_e2ee_freshness_witness",
        scope: syntheo_db_migrate::MigrationScope::Plain,
        sql: include_str!("../migrations/20260717193000_e2ee_freshness_witness.sql"),
    },
    syntheo_db_migrate::MigrationStep {
        id: "20260717150000_attachment_transfer_jobs",
        scope: syntheo_db_migrate::MigrationScope::Plain,
        sql: include_str!("../migrations/20260717150000_attachment_transfer_jobs.sql"),
    },
    syntheo_db_migrate::MigrationStep {
        id: "20260717170000_attachment_cloud_sync_intent",
        scope: syntheo_db_migrate::MigrationScope::CloudsyncAlter {
            table_name: "session_attachments",
        },
        sql: include_str!("../migrations/20260717170000_attachment_cloud_sync_intent.sql"),
    },
    syntheo_db_migrate::MigrationStep {
        id: "20260717171000_shared_session_attachment_cache",
        scope: syntheo_db_migrate::MigrationScope::Plain,
        sql: include_str!("../migrations/20260717171000_shared_session_attachment_cache.sql"),
    },
    syntheo_db_migrate::MigrationStep {
        id: "20260717172000_shared_session_cache_attachments",
        scope: syntheo_db_migrate::MigrationScope::Plain,
        sql: include_str!("../migrations/20260717172000_shared_session_cache_attachments.sql"),
    },
    syntheo_db_migrate::MigrationStep {
        id: "20260717190000_shared_session_cache_web_edits",
        scope: syntheo_db_migrate::MigrationScope::Plain,
        sql: include_str!("../migrations/20260717190000_shared_session_cache_web_edits.sql"),
    },
    syntheo_db_migrate::MigrationStep {
        id: "20260717191000_session_share_sync_state",
        scope: syntheo_db_migrate::MigrationScope::Plain,
        sql: include_str!("../migrations/20260717191000_session_share_sync_state.sql"),
    },
    syntheo_db_migrate::MigrationStep {
        id: "20260723120000_e2ee_dirty_rows",
        scope: syntheo_db_migrate::MigrationScope::Plain,
        sql: include_str!("../migrations/20260723120000_e2ee_dirty_rows.sql"),
    },
    syntheo_db_migrate::MigrationStep {
        id: "20260723120100_e2ee_dirty_action_items_triggers",
        scope: syntheo_db_migrate::MigrationScope::CloudsyncAlter {
            table_name: "action_items",
        },
        sql: include_str!("../migrations/20260723120100_e2ee_dirty_action_items_triggers.sql"),
    },
    syntheo_db_migrate::MigrationStep {
        id: "20260723120200_e2ee_dirty_humans_triggers",
        scope: syntheo_db_migrate::MigrationScope::CloudsyncAlter {
            table_name: "humans",
        },
        sql: include_str!("../migrations/20260723120200_e2ee_dirty_humans_triggers.sql"),
    },
    syntheo_db_migrate::MigrationStep {
        id: "20260723120300_e2ee_dirty_organizations_triggers",
        scope: syntheo_db_migrate::MigrationScope::CloudsyncAlter {
            table_name: "organizations",
        },
        sql: include_str!("../migrations/20260723120300_e2ee_dirty_organizations_triggers.sql"),
    },
    syntheo_db_migrate::MigrationStep {
        id: "20260723120400_e2ee_dirty_session_attachments_triggers",
        scope: syntheo_db_migrate::MigrationScope::CloudsyncAlter {
            table_name: "session_attachments",
        },
        sql: include_str!(
            "../migrations/20260723120400_e2ee_dirty_session_attachments_triggers.sql"
        ),
    },
    syntheo_db_migrate::MigrationStep {
        id: "20260723120500_e2ee_dirty_session_documents_triggers",
        scope: syntheo_db_migrate::MigrationScope::CloudsyncAlter {
            table_name: "session_documents",
        },
        sql: include_str!("../migrations/20260723120500_e2ee_dirty_session_documents_triggers.sql"),
    },
    syntheo_db_migrate::MigrationStep {
        id: "20260723120600_e2ee_dirty_session_participants_triggers",
        scope: syntheo_db_migrate::MigrationScope::CloudsyncAlter {
            table_name: "session_participants",
        },
        sql: include_str!(
            "../migrations/20260723120600_e2ee_dirty_session_participants_triggers.sql"
        ),
    },
    syntheo_db_migrate::MigrationStep {
        id: "20260723120700_e2ee_dirty_sessions_triggers",
        scope: syntheo_db_migrate::MigrationScope::CloudsyncAlter {
            table_name: "sessions",
        },
        sql: include_str!("../migrations/20260723120700_e2ee_dirty_sessions_triggers.sql"),
    },
    syntheo_db_migrate::MigrationStep {
        id: "20260723120800_e2ee_dirty_transcripts_triggers",
        scope: syntheo_db_migrate::MigrationScope::CloudsyncAlter {
            table_name: "transcripts",
        },
        sql: include_str!("../migrations/20260723120800_e2ee_dirty_transcripts_triggers.sql"),
    },
    syntheo_db_migrate::MigrationStep {
        id: "20260723120900_e2ee_witness_upload_index",
        scope: syntheo_db_migrate::MigrationScope::Plain,
        sql: include_str!("../migrations/20260723120900_e2ee_witness_upload_index.sql"),
    },
    syntheo_db_migrate::MigrationStep {
        id: "20260725001400_e2ee_witness_pending",
        scope: syntheo_db_migrate::MigrationScope::Plain,
        sql: include_str!("../migrations/20260725001400_e2ee_witness_pending.sql"),
    },
    syntheo_db_migrate::MigrationStep {
        id: "20260725020000_cloudsync_projection_indexes",
        scope: syntheo_db_migrate::MigrationScope::Plain,
        sql: include_str!("../migrations/20260725020000_cloudsync_projection_indexes.sql"),
    },
    syntheo_db_migrate::MigrationStep {
        id: "20260728090000_local_api",
        scope: syntheo_db_migrate::MigrationScope::Plain,
        sql: include_str!("../migrations/20260728090000_local_api.sql"),
    },
    syntheo_db_migrate::MigrationStep {
        id: "20260802120000_voiceprint_exemplars",
        scope: syntheo_db_migrate::MigrationScope::Plain,
        sql: include_str!("../migrations/20260802120000_voiceprint_exemplars.sql"),
    },
    syntheo_db_migrate::MigrationStep {
        id: "20260804110000_session_share_activation",
        scope: syntheo_db_migrate::MigrationScope::Plain,
        sql: include_str!("../migrations/20260804110000_session_share_activation.sql"),
    },
    syntheo_db_migrate::MigrationStep {
        id: "20260810120000_synced_preferences",
        scope: syntheo_db_migrate::MigrationScope::Plain,
        sql: include_str!("../migrations/20260810120000_synced_preferences.sql"),
    },
    syntheo_db_migrate::MigrationStep {
        id: "20260810120100_e2ee_dirty_synced_preferences_triggers",
        scope: syntheo_db_migrate::MigrationScope::CloudsyncAlter {
            table_name: "synced_preferences",
        },
        sql: include_str!(
            "../migrations/20260810120100_e2ee_dirty_synced_preferences_triggers.sql"
        ),
    },
    syntheo_db_migrate::MigrationStep {
        id: "20260810120200_synced_preferences_backfill",
        scope: syntheo_db_migrate::MigrationScope::Plain,
        sql: include_str!("../migrations/20260810120200_synced_preferences_backfill.sql"),
    },
    syntheo_db_migrate::MigrationStep {
        id: "20260810120300_synced_preferences_backfill_legacy",
        scope: syntheo_db_migrate::MigrationScope::Plain,
        sql: include_str!("../migrations/20260810120300_synced_preferences_backfill_legacy.sql"),
    },
    syntheo_db_migrate::MigrationStep {
        id: "20260811090000_voiceprint_candidates",
        scope: syntheo_db_migrate::MigrationScope::Plain,
        sql: include_str!("../migrations/20260811090000_voiceprint_candidates.sql"),
    },
    syntheo_db_migrate::MigrationStep {
        id: "20260811100000_drop_api_keys",
        scope: syntheo_db_migrate::MigrationScope::Plain,
        sql: include_str!("../migrations/20260811100000_drop_api_keys.sql"),
    },
    syntheo_db_migrate::MigrationStep {
        id: "20260812100000_e2ee_reconciliation_queues",
        scope: syntheo_db_migrate::MigrationScope::Plain,
        sql: include_str!("../migrations/20260812100000_e2ee_reconciliation_queues.sql"),
    },
    syntheo_db_migrate::MigrationStep {
        id: "20260812100100_e2ee_replica_reconciliation_triggers",
        scope: syntheo_db_migrate::MigrationScope::CloudsyncAlter {
            table_name: "e2ee_records",
        },
        sql: include_str!("../migrations/20260812100100_e2ee_replica_reconciliation_triggers.sql"),
    },
    syntheo_db_migrate::MigrationStep {
        id: "20260814090000_enterprise_session_delivery",
        scope: syntheo_db_migrate::MigrationScope::Plain,
        sql: include_str!("../migrations/20260814090000_enterprise_session_delivery.sql"),
    },
    syntheo_db_migrate::MigrationStep {
        id: "20260815100000_transcript_content_revision",
        scope: syntheo_db_migrate::MigrationScope::CloudsyncAlter {
            table_name: "transcripts",
        },
        sql: include_str!("../migrations/20260815100000_transcript_content_revision.sql"),
    },
    syntheo_db_migrate::MigrationStep {
        id: "20260815100100_transcript_live_deltas",
        scope: syntheo_db_migrate::MigrationScope::Plain,
        sql: include_str!("../migrations/20260815100100_transcript_live_deltas.sql"),
    },
    syntheo_db_migrate::MigrationStep {
        id: "20260815100200_search_index_acknowledgements",
        scope: syntheo_db_migrate::MigrationScope::Plain,
        sql: include_str!("../migrations/20260815100200_search_index_acknowledgements.sql"),
    },
    syntheo_db_migrate::MigrationStep {
        id: "20260815100300_e2ee_record_payload_hash",
        scope: syntheo_db_migrate::MigrationScope::CloudsyncAlter {
            table_name: "e2ee_records",
        },
        sql: include_str!("../migrations/20260815100300_e2ee_record_payload_hash.sql"),
    },
    syntheo_db_migrate::MigrationStep {
        id: "20260815100400_e2ee_ciphertext_ownership",
        scope: syntheo_db_migrate::MigrationScope::Plain,
        sql: include_str!("../migrations/20260815100400_e2ee_ciphertext_ownership.sql"),
    },
    syntheo_db_migrate::MigrationStep {
        id: "20260816100000_e2ee_replica_payload_hashes",
        scope: syntheo_db_migrate::MigrationScope::Plain,
        sql: include_str!("../migrations/20260816100000_e2ee_replica_payload_hashes.sql"),
    },
    syntheo_db_migrate::MigrationStep {
        id: "20260816100100_e2ee_payload_hash_local_state",
        scope: syntheo_db_migrate::MigrationScope::CloudsyncAlter {
            table_name: "e2ee_records",
        },
        sql: include_str!("../migrations/20260816100100_e2ee_payload_hash_local_state.sql"),
    },
    syntheo_db_migrate::MigrationStep {
        id: "20260820120000_session_locked",
        scope: syntheo_db_migrate::MigrationScope::CloudsyncAlter {
            table_name: "sessions",
        },
        sql: include_str!("../migrations/20260820120000_session_locked.sql"),
    },
    syntheo_db_migrate::MigrationStep {
        id: "20260821140000_session_consent_evidence",
        scope: syntheo_db_migrate::MigrationScope::Plain,
        sql: include_str!("../migrations/20260821140000_session_consent_evidence.sql"),
    },
    syntheo_db_migrate::MigrationStep {
        id: "20260826120000_session_proposals",
        scope: syntheo_db_migrate::MigrationScope::Plain,
        sql: include_str!("../migrations/20260826120000_session_proposals.sql"),
    },
    syntheo_db_migrate::MigrationStep {
        id: "20260830120000_folder_attachments",
        scope: syntheo_db_migrate::MigrationScope::Plain,
        sql: include_str!("../migrations/20260830120000_folder_attachments.sql"),
    },
    syntheo_db_migrate::MigrationStep {
        id: "20260830140000_folders",
        scope: syntheo_db_migrate::MigrationScope::Plain,
        sql: include_str!("../migrations/20260830140000_folders.sql"),
    },
    syntheo_db_migrate::MigrationStep {
        id: "20260830160000_folder_instructions",
        scope: syntheo_db_migrate::MigrationScope::Plain,
        sql: include_str!("../migrations/20260830160000_folder_instructions.sql"),
    },
    syntheo_db_migrate::MigrationStep {
        id: "20260831120000_folder_icons",
        scope: syntheo_db_migrate::MigrationScope::Plain,
        sql: include_str!("../migrations/20260831120000_folder_icons.sql"),
    },
    syntheo_db_migrate::MigrationStep {
        id: "20260903120000_voiceprint_exemplars_isolated_mic",
        scope: syntheo_db_migrate::MigrationScope::Plain,
        sql: include_str!("../migrations/20260903120000_voiceprint_exemplars_isolated_mic.sql"),
    },
    syntheo_db_migrate::MigrationStep {
        id: "20260907120000_session_documents_content_version",
        scope: syntheo_db_migrate::MigrationScope::CloudsyncAlter {
            table_name: "session_documents",
        },
        sql: include_str!("../migrations/20260907120000_session_documents_content_version.sql"),
    },
    syntheo_db_migrate::MigrationStep {
        id: "20260907120100_transcripts_content_version",
        scope: syntheo_db_migrate::MigrationScope::CloudsyncAlter {
            table_name: "transcripts",
        },
        sql: include_str!("../migrations/20260907120100_transcripts_content_version.sql"),
    },
    syntheo_db_migrate::MigrationStep {
        id: "20260907120200_session_content_observations",
        scope: syntheo_db_migrate::MigrationScope::Plain,
        sql: include_str!("../migrations/20260907120200_session_content_observations.sql"),
    },
    syntheo_db_migrate::MigrationStep {
        id: "20260907120300_session_deletion_context",
        scope: syntheo_db_migrate::MigrationScope::CloudsyncAlter {
            table_name: "sessions",
        },
        sql: include_str!("../migrations/20260907120300_session_deletion_context.sql"),
    },
    syntheo_db_migrate::MigrationStep {
        id: "20260907120400_session_local_content_restoration",
        scope: syntheo_db_migrate::MigrationScope::Plain,
        sql: include_str!("../migrations/20260907120400_session_local_content_restoration.sql"),
    },
    syntheo_db_migrate::MigrationStep {
        id: "20260907120500_session_documents_local_restoration",
        scope: syntheo_db_migrate::MigrationScope::CloudsyncAlter {
            table_name: "session_documents",
        },
        sql: include_str!("../migrations/20260907120500_session_documents_local_restoration.sql"),
    },
    syntheo_db_migrate::MigrationStep {
        id: "20260907120600_transcripts_local_restoration",
        scope: syntheo_db_migrate::MigrationScope::CloudsyncAlter {
            table_name: "transcripts",
        },
        sql: include_str!("../migrations/20260907120600_transcripts_local_restoration.sql"),
    },
    syntheo_db_migrate::MigrationStep {
        id: "20260907120700_session_attachments_local_restoration",
        scope: syntheo_db_migrate::MigrationScope::CloudsyncAlter {
            table_name: "session_attachments",
        },
        sql: include_str!("../migrations/20260907120700_session_attachments_local_restoration.sql"),
    },
    syntheo_db_migrate::MigrationStep {
        id: "20260907120800_sessions_local_restoration",
        scope: syntheo_db_migrate::MigrationScope::CloudsyncAlter {
            table_name: "sessions",
        },
        sql: include_str!("../migrations/20260907120800_sessions_local_restoration.sql"),
    },
    syntheo_db_migrate::MigrationStep {
        id: "20260909130000_e2ee_parked_records",
        scope: syntheo_db_migrate::MigrationScope::Plain,
        sql: include_str!("../migrations/20260909130000_e2ee_parked_records.sql"),
    },
    syntheo_db_migrate::MigrationStep {
        id: "20260909140000_e2ee_edit_conflicts",
        scope: syntheo_db_migrate::MigrationScope::Plain,
        sql: include_str!("../migrations/20260909140000_e2ee_edit_conflicts.sql"),
    },
    syntheo_db_migrate::MigrationStep {
        id: "20260909150000_session_document_versions",
        scope: syntheo_db_migrate::MigrationScope::CloudsyncAlter {
            table_name: "session_documents",
        },
        sql: include_str!("../migrations/20260909150000_session_document_versions.sql"),
    },
    syntheo_db_migrate::MigrationStep {
        id: "20260909160000_e2ee_dirty_tags_triggers",
        scope: syntheo_db_migrate::MigrationScope::CloudsyncAlter { table_name: "tags" },
        sql: include_str!("../migrations/20260909160000_e2ee_dirty_tags_triggers.sql"),
    },
    syntheo_db_migrate::MigrationStep {
        id: "20260909160100_e2ee_dirty_session_tags_triggers",
        scope: syntheo_db_migrate::MigrationScope::CloudsyncAlter {
            table_name: "session_tags",
        },
        sql: include_str!("../migrations/20260909160100_e2ee_dirty_session_tags_triggers.sql"),
    },
    syntheo_db_migrate::MigrationStep {
        id: "20260909160200_e2ee_dirty_folders_triggers",
        scope: syntheo_db_migrate::MigrationScope::CloudsyncAlter {
            table_name: "folders",
        },
        sql: include_str!("../migrations/20260909160200_e2ee_dirty_folders_triggers.sql"),
    },
    syntheo_db_migrate::MigrationStep {
        id: "20260909160300_e2ee_dirty_daily_notes_triggers",
        scope: syntheo_db_migrate::MigrationScope::CloudsyncAlter {
            table_name: "daily_notes",
        },
        sql: include_str!("../migrations/20260909160300_e2ee_dirty_daily_notes_triggers.sql"),
    },
    syntheo_db_migrate::MigrationStep {
        id: "20260916043000_local_library_connections",
        scope: syntheo_db_migrate::MigrationScope::CloudsyncAlter {
            table_name: "session_attachments",
        },
        sql: include_str!("../migrations/20260916043000_local_library_connections.sql"),
    },
    syntheo_db_migrate::MigrationStep {
        id: "20260916060000_local_library_write_times",
        scope: syntheo_db_migrate::MigrationScope::Plain,
        sql: include_str!("../migrations/20260916060000_local_library_write_times.sql"),
    },
    syntheo_db_migrate::MigrationStep {
        id: "20260928030000_e2ee_witness_pending_priority",
        scope: syntheo_db_migrate::MigrationScope::Plain,
        sql: include_str!("../migrations/20260928030000_e2ee_witness_pending_priority.sql"),
    },
    syntheo_db_migrate::MigrationStep {
        id: "20260930120000_event_attendance",
        scope: syntheo_db_migrate::MigrationScope::Plain,
        sql: include_str!("../migrations/20260930120000_event_attendance.sql"),
    },
    syntheo_db_migrate::MigrationStep {
        id: "20261002090000_session_share_activation_sync",
        scope: syntheo_db_migrate::MigrationScope::CloudsyncAlter {
            table_name: "sessions",
        },
        sql: include_str!("../migrations/20261002090000_session_share_activation_sync.sql"),
    },
    syntheo_db_migrate::MigrationStep {
        id: "20261005090000_e2ee_cloud_authority",
        scope: syntheo_db_migrate::MigrationScope::Plain,
        sql: include_str!("../migrations/20261005090000_e2ee_cloud_authority.sql"),
    },
    syntheo_db_migrate::MigrationStep {
        id: "20261011120000_managed_app_settings",
        scope: syntheo_db_migrate::MigrationScope::Plain,
        sql: include_str!("../migrations/20261011120000_managed_app_settings.sql"),
    },
    syntheo_db_migrate::MigrationStep {
        id: "20261011120100_local_meeting_purges",
        scope: syntheo_db_migrate::MigrationScope::Plain,
        sql: include_str!("../migrations/20261011120100_local_meeting_purges.sql"),
    },
    syntheo_db_migrate::MigrationStep {
        id: "20261013090000_recording_import_jobs",
        scope: syntheo_db_migrate::MigrationScope::Plain,
        sql: include_str!("../migrations/20261013090000_recording_import_jobs.sql"),
    },
    syntheo_db_migrate::MigrationStep {
        id: "20261024120000_syntheo_templates_fr",
        scope: syntheo_db_migrate::MigrationScope::Plain,
        sql: include_str!("../migrations/20261024120000_syntheo_templates_fr.sql"),
    },
    syntheo_db_migrate::MigrationStep {
        id: "20261101120000_search_index_sessions_projection_columns",
        scope: syntheo_db_migrate::MigrationScope::CloudsyncAlter {
            table_name: "sessions",
        },
        sql: include_str!(
            "../migrations/20261101120000_search_index_sessions_projection_columns.sql"
        ),
    },
    syntheo_db_migrate::MigrationStep {
        id: "20261107120000_notification_detect_off",
        scope: syntheo_db_migrate::MigrationScope::Plain,
        sql: include_str!("../migrations/20261107120000_notification_detect_off.sql"),
    },
    syntheo_db_migrate::MigrationStep {
        id: "20261108120000_session_summary_versions",
        scope: syntheo_db_migrate::MigrationScope::Plain,
        sql: include_str!("../migrations/20261108120000_session_summary_versions.sql"),
    },
    syntheo_db_migrate::MigrationStep {
        id: "20261109120000_drop_calendar",
        scope: syntheo_db_migrate::MigrationScope::Plain,
        sql: include_str!("../migrations/20261109120000_drop_calendar.sql"),
    },
    syntheo_db_migrate::MigrationStep {
        id: "20261109130000_drop_cloud_sharing",
        scope: syntheo_db_migrate::MigrationScope::Plain,
        sql: include_str!("../migrations/20261109130000_drop_cloud_sharing.sql"),
    },
    syntheo_db_migrate::MigrationStep {
        id: "20261109150000_folder_threads",
        scope: syntheo_db_migrate::MigrationScope::Plain,
        sql: include_str!("../migrations/20261109150000_folder_threads.sql"),
    },
    syntheo_db_migrate::MigrationStep {
        id: "20261109180000_folder_thread_agenda",
        scope: syntheo_db_migrate::MigrationScope::Plain,
        sql: include_str!("../migrations/20261109180000_folder_thread_agenda.sql"),
    },
];

pub fn schema() -> syntheo_db_migrate::DbSchema {
    syntheo_db_migrate::DbSchema {
        steps: APP_MIGRATION_STEPS,
    }
}

/// Local-only workspace identity. It used to be provisioned by the CloudSync
/// binding; Syntheo is fully local, so we keep the same `app_settings` key (many
/// hot SQL paths read it) but create it locally with no account.
pub const LOCAL_WORKSPACE_BINDING_ID: &str = "cloudsync_workspace_binding";

pub async fn ensure_local_workspace_binding(pool: &sqlx::SqlitePool) -> Result<(), sqlx::Error> {
    let workspace_id = uuid::Uuid::new_v4().to_string();
    let value_json = format!("{{\"workspace_id\":\"{workspace_id}\",\"account_user_id\":null}}");
    sqlx::query(
        "INSERT INTO app_settings (id, value_json) VALUES (?, ?)
         ON CONFLICT(id) DO NOTHING",
    )
    .bind(LOCAL_WORKSPACE_BINDING_ID)
    .bind(value_json)
    .execute(pool)
    .await?;
    Ok(())
}

const SHARED_SESSION_CACHE_MIGRATION_VERSION: i64 = 20260716173000;
const LEGACY_SHARED_SESSION_CACHE_CHECKSUM: &str = "4813db532e44e6db8a3ba85e0b248ff99a927ec40b6aa971210452b588bcb2361d3661bd23d045a32ac3a9fcbed99b4a";
const CURRENT_SHARED_SESSION_CACHE_CHECKSUM: &str = "84376d223c0b1ca3298810b101fef7f599d50267dca4e5693feaddd481e4a082b87a12d37360e11b94b3cb39e8c58dee";
const ATTACHMENT_TRANSFER_JOBS_MIGRATION_VERSION: i64 = 20260717150000;
const LEGACY_ATTACHMENT_TRANSFER_JOBS_CHECKSUM: &str = "fd846a54c653d8e737371a950747b442bba2da055566dbcd35907b36fe7829a3a09c81052346bb05100ba71be552efc0";
const CURRENT_ATTACHMENT_TRANSFER_JOBS_CHECKSUM: &str = "9250233e7b51b83bb74ef4e4af159a9c2bbc753ee64751cac8316968b66bb1b2e0e224770d8b63a631350183dc81c2e0";

#[derive(Debug)]
pub enum AppSchemaError {
    Migrate(syntheo_db_migrate::MigrateError),
    Sqlx(sqlx::Error),
    SharedSessionCacheRepair(&'static str),
    AttachmentTransferJobsRepair(&'static str),
    LegacyMobileSchema(&'static str),
}

impl std::fmt::Display for AppSchemaError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Migrate(error) => write!(f, "{error}"),
            Self::Sqlx(error) => write!(f, "{error}"),
            Self::SharedSessionCacheRepair(error) => write!(f, "{error}"),
            Self::AttachmentTransferJobsRepair(error) => write!(f, "{error}"),
            Self::LegacyMobileSchema(error) => write!(f, "{error}"),
        }
    }
}

impl std::error::Error for AppSchemaError {}

impl From<syntheo_db_migrate::MigrateError> for AppSchemaError {
    fn from(error: syntheo_db_migrate::MigrateError) -> Self {
        Self::Migrate(error)
    }
}

impl From<sqlx::Error> for AppSchemaError {
    fn from(error: sqlx::Error) -> Self {
        Self::Sqlx(error)
    }
}

pub async fn prepare_schema(db: &syntheo_db_core::Db) -> Result<(), AppSchemaError> {
    prepare_schema_with_progress(db, |_| {}).await
}

pub async fn prepare_schema_with_progress(
    db: &syntheo_db_core::Db,
    on_migration_progress: impl FnMut(syntheo_db_migrate::MigrationProgress) + Send,
) -> Result<(), AppSchemaError> {
    let templates_missing_before_migration = !templates_table_exists(db.pool()).await?;
    adopt_legacy_mobile_schema_migration(db.pool()).await?;
    repair_legacy_shared_session_cache_migration(db.pool()).await?;
    repair_legacy_attachment_transfer_jobs_migration(db.pool()).await?;
    syntheo_db_migrate::migrate_with_progress(db, schema(), on_migration_progress).await?;
    repair_missing_core_tables(db.pool(), templates_missing_before_migration).await?;
    ensure_local_workspace_binding(db.pool()).await?;
    apply_managed_settings(db.pool()).await?;
    Ok(())
}

const CALENDAR_EVENT_TOMBSTONES_MIGRATION_VERSION: i64 = 20260711000000;
const ATTACHMENT_CLOUD_SYNC_INTENT_MIGRATION_VERSION: i64 = 20260717170000;

async fn adopt_legacy_mobile_schema_migration(
    pool: &sqlx::SqlitePool,
) -> Result<(), AppSchemaError> {
    let mut transaction = pool.begin_with("BEGIN IMMEDIATE").await?;
    let user_version: i64 = sqlx::query_scalar("PRAGMA user_version")
        .fetch_one(&mut *transaction)
        .await?;
    if user_version != 1 {
        transaction.commit().await?;
        return Ok(());
    }

    let has_legacy_schema: bool = sqlx::query_scalar(
        "SELECT EXISTS(
            SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'sessions'
         )",
    )
    .fetch_one(&mut *transaction)
    .await?;
    if !has_legacy_schema {
        transaction.commit().await?;
        return Ok(());
    }

    sqlx::raw_sql(
        "CREATE TABLE IF NOT EXISTS _sqlx_migrations (
            version BIGINT PRIMARY KEY,
            description TEXT NOT NULL,
            installed_on TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            success BOOLEAN NOT NULL,
            checksum BLOB NOT NULL,
            execution_time BIGINT NOT NULL
        );",
    )
    .execute(&mut *transaction)
    .await?;

    let calendar_tombstones_present: bool = sqlx::query_scalar(
        "SELECT
            EXISTS(SELECT 1 FROM pragma_table_info('calendars') WHERE name = 'deleted_at')
            AND EXISTS(SELECT 1 FROM pragma_table_info('events') WHERE name = 'deleted_at')",
    )
    .fetch_one(&mut *transaction)
    .await?;
    if calendar_tombstones_present {
        adopt_legacy_mobile_migration(
            &mut transaction,
            CALENDAR_EVENT_TOMBSTONES_MIGRATION_VERSION,
            "calendar_event_tombstones",
            include_str!("../migrations/20260711000000_calendar_event_tombstones.sql"),
        )
        .await?;
    }

    let attachment_cloud_sync_intent_present: bool = sqlx::query_scalar(
        "SELECT EXISTS(
            SELECT 1 FROM pragma_table_info('session_attachments')
            WHERE name = 'cloud_sync_enabled'
         )",
    )
    .fetch_one(&mut *transaction)
    .await?;
    if attachment_cloud_sync_intent_present {
        adopt_legacy_mobile_migration(
            &mut transaction,
            ATTACHMENT_CLOUD_SYNC_INTENT_MIGRATION_VERSION,
            "attachment_cloud_sync_intent",
            include_str!("../migrations/20260717170000_attachment_cloud_sync_intent.sql"),
        )
        .await?;
    }

    transaction.commit().await?;
    Ok(())
}

async fn adopt_legacy_mobile_migration(
    transaction: &mut sqlx::Transaction<'_, sqlx::Sqlite>,
    version: i64,
    description: &'static str,
    sql: &'static str,
) -> Result<(), AppSchemaError> {
    let expected_checksum = migration_checksum(sql);
    let existing: Option<(bool, Vec<u8>)> =
        sqlx::query_as("SELECT success, checksum FROM _sqlx_migrations WHERE version = ?")
            .bind(version)
            .fetch_optional(&mut **transaction)
            .await?;
    if let Some((success, checksum)) = existing {
        if !success || checksum != expected_checksum {
            return Err(AppSchemaError::LegacyMobileSchema(
                "legacy mobile migration history contains an unexpected record",
            ));
        }
        return Ok(());
    }

    sqlx::query(
        "INSERT INTO _sqlx_migrations (
            version, description, success, checksum, execution_time
         ) VALUES (?, ?, 1, ?, 0)",
    )
    .bind(version)
    .bind(description)
    .bind(expected_checksum)
    .execute(&mut **transaction)
    .await?;
    Ok(())
}

// Une base créée par une préversion garde l'empreinte d'une ancienne version
// de la migration `attachment_transfer_jobs`. La table est supprimée par
// `20261109130000_drop_cloud_sharing` : il suffit d'enregistrer l'empreinte
// actuelle pour que l'historique des migrations reste cohérent.
async fn repair_legacy_attachment_transfer_jobs_migration(
    pool: &sqlx::SqlitePool,
) -> Result<(), AppSchemaError> {
    if !migration_table_exists(pool).await? {
        return Ok(());
    }

    let checksum =
        applied_migration_checksum_hex(pool, ATTACHMENT_TRANSFER_JOBS_MIGRATION_VERSION).await?;
    match checksum.as_deref() {
        None | Some(CURRENT_ATTACHMENT_TRANSFER_JOBS_CHECKSUM) => return Ok(()),
        Some(LEGACY_ATTACHMENT_TRANSFER_JOBS_CHECKSUM) => {}
        Some(_) => {
            return Err(AppSchemaError::AttachmentTransferJobsRepair(
                "attachment-transfer jobs migration has an unknown checksum",
            ));
        }
    }

    let current_migration_checksum = migration_checksum(include_str!(
        "../migrations/20260717150000_attachment_transfer_jobs.sql"
    ));
    let result = sqlx::query(
        "UPDATE _sqlx_migrations
         SET checksum = ?
         WHERE version = ? AND success = 1 AND lower(hex(checksum)) = ?",
    )
    .bind(current_migration_checksum.as_slice())
    .bind(ATTACHMENT_TRANSFER_JOBS_MIGRATION_VERSION)
    .bind(LEGACY_ATTACHMENT_TRANSFER_JOBS_CHECKSUM)
    .execute(pool)
    .await?;
    if result.rows_affected() != 1 {
        return Err(AppSchemaError::AttachmentTransferJobsRepair(
            "attachment-transfer jobs migration changed during repair",
        ));
    }
    Ok(())
}

// Même cas pour `shared_session_cache` : l'ancienne table n'a pas la même
// forme. Elle est recréée vide dans sa forme actuelle, pour que les
// migrations suivantes s'appliquent, puis `20261109130000_drop_cloud_sharing`
// la supprime.
async fn repair_legacy_shared_session_cache_migration(
    pool: &sqlx::SqlitePool,
) -> Result<(), AppSchemaError> {
    if !migration_table_exists(pool).await? {
        return Ok(());
    }

    let checksum =
        applied_migration_checksum_hex(pool, SHARED_SESSION_CACHE_MIGRATION_VERSION).await?;
    match checksum.as_deref() {
        None | Some(CURRENT_SHARED_SESSION_CACHE_CHECKSUM) => return Ok(()),
        Some(LEGACY_SHARED_SESSION_CACHE_CHECKSUM) => {}
        Some(_) => {
            return Err(AppSchemaError::SharedSessionCacheRepair(
                "shared-session cache migration has an unknown checksum",
            ));
        }
    }

    let current_sql = include_str!("../migrations/20260716173000_shared_session_cache.sql");
    let mut transaction = pool.begin_with("BEGIN IMMEDIATE").await?;
    sqlx::query("DROP TABLE IF EXISTS shared_session_cache")
        .execute(&mut *transaction)
        .await?;
    sqlx::raw_sql(current_sql)
        .execute(&mut *transaction)
        .await?;
    let result = sqlx::query(
        "UPDATE _sqlx_migrations
         SET checksum = ?
         WHERE version = ? AND success = 1 AND lower(hex(checksum)) = ?",
    )
    .bind(migration_checksum(current_sql).as_slice())
    .bind(SHARED_SESSION_CACHE_MIGRATION_VERSION)
    .bind(LEGACY_SHARED_SESSION_CACHE_CHECKSUM)
    .execute(&mut *transaction)
    .await?;
    if result.rows_affected() != 1 {
        return Err(AppSchemaError::SharedSessionCacheRepair(
            "legacy shared-session cache migration changed during repair",
        ));
    }

    transaction.commit().await?;
    Ok(())
}

async fn migration_table_exists(pool: &sqlx::SqlitePool) -> Result<bool, sqlx::Error> {
    sqlx::query_scalar(
        "SELECT EXISTS(
            SELECT 1 FROM sqlite_master
            WHERE type = 'table' AND name = '_sqlx_migrations'
        )",
    )
    .fetch_one(pool)
    .await
}

async fn applied_migration_checksum_hex(
    pool: &sqlx::SqlitePool,
    version: i64,
) -> Result<Option<String>, sqlx::Error> {
    sqlx::query_scalar(
        "SELECT lower(hex(checksum))
         FROM _sqlx_migrations
         WHERE version = ? AND success = 1",
    )
    .bind(version)
    .fetch_optional(pool)
    .await
}

fn migration_checksum(sql: &str) -> Vec<u8> {
    Sha384::digest(sql.as_bytes()).to_vec()
}

#[cfg(test)]
fn checksum_hex(checksum: &[u8]) -> String {
    use std::fmt::Write as _;

    checksum.iter().fold(
        String::with_capacity(checksum.len() * 2),
        |mut hex, byte| {
            write!(hex, "{byte:02x}").expect("writing to a string cannot fail");
            hex
        },
    )
}

async fn templates_table_exists(pool: &sqlx::SqlitePool) -> Result<bool, sqlx::Error> {
    sqlx::query_scalar(
        "SELECT EXISTS(
            SELECT 1
            FROM sqlite_master
            WHERE type = 'table' AND name = 'templates'
        )",
    )
    .fetch_one(pool)
    .await
}

async fn repair_missing_core_tables(
    pool: &sqlx::SqlitePool,
    templates_missing_before_migration: bool,
) -> Result<(), sqlx::Error> {
    if !templates_table_exists(pool).await? {
        sqlx::query(include_str!("../migrations/20260413020000_templates.sql"))
            .execute(pool)
            .await?;
    }

    let has_icon_json = sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS(SELECT 1 FROM pragma_table_info('templates') WHERE name = 'icon_json')",
    )
    .fetch_one(pool)
    .await?;
    if !has_icon_json {
        sqlx::query(include_str!(
            "../migrations/20260712170000_template_icons.sql"
        ))
        .execute(pool)
        .await?;
    }

    if templates_missing_before_migration {
        sqlx::query(include_str!(
            "../migrations/20260524000000_default_templates.sql"
        ))
        .execute(pool)
        .await?;
    }

    Ok(())
}

#[cfg(test)]
mod schema_tests;
