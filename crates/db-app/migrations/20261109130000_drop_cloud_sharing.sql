-- Syntheo 0.7.0 (issue 460) : le partage de notes, l'espace de travail
-- partagé et le transfert des pièces jointes vers le cloud n'existent plus.
-- Leurs tables locales disparaissent : `shared_session_cache`,
-- `shared_session_attachment_cache`, `session_share_sync_state`,
-- `session_share_activation`, `attachment_transfer_jobs` et
-- `workspace_memberships`. Les notes, leurs pièces jointes et l'espace de
-- travail local (`workspaces`) restent intacts.
--
-- Une version plus ancienne lit et écrit ces tables : la migration n'est pas
-- rétrocompatible.
-- breaking

-- Les index et les déclencheurs de ces tables partent avec elles.
DROP TABLE IF EXISTS shared_session_attachment_cache;
DROP TABLE IF EXISTS shared_session_cache;
DROP TABLE IF EXISTS session_share_sync_state;
DROP TABLE IF EXISTS session_share_activation;
DROP TABLE IF EXISTS attachment_transfer_jobs;
DROP TABLE IF EXISTS workspace_memberships;
