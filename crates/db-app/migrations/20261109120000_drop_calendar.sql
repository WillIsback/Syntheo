-- Syntheo 0.7.0 (issue 465) : le calendrier est supprimé. Les tables
-- `calendars` et `events` disparaissent, ainsi que les colonnes de `sessions`
-- qui reliaient une note à un événement (`event_id`, `event_json`). Les notes
-- elles-mêmes restent intactes. `external_event_id` et `external_provider`
-- sont gardées : l'import de réunions (Teams, etc.) s'en sert pour ne pas
-- importer deux fois la même réunion ; `series_id` aussi (CLI, MCP, export).
--
-- Une version plus ancienne lit et écrit ces colonnes et ces tables : la
-- migration n'est pas rétrocompatible.
-- breaking

-- La note de bienvenue était repérée par `event_json.tracking_id` ; le
-- marqueur passe dans `metadata_json.welcome_note`.
UPDATE sessions
SET metadata_json = json_set(
  CASE
    WHEN json_valid(metadata_json) AND json_type(metadata_json) = 'object' THEN metadata_json
    ELSE '{}'
  END,
  '$.welcome_note',
  json_extract(event_json, '$.tracking_id')
)
WHERE json_valid(event_json)
  AND json_type(event_json) = 'object'
  AND json_extract(event_json, '$.tracking_id') = 'syntheo-onboarding-demo-v1';

-- SQLite refuse DROP COLUMN sur une colonne indexée ou lue par un
-- déclencheur : l'index sur `event_id` part d'abord, et le déclencheur de
-- recherche est recréé sans `event_json`.
DROP INDEX IF EXISTS idx_sessions_event_id;

DROP TRIGGER IF EXISTS search_index_sessions_update;
CREATE TRIGGER IF NOT EXISTS search_index_sessions_update
AFTER UPDATE ON sessions
WHEN NEW.deleted_at IS NOT OLD.deleted_at
  OR NEW.title IS NOT OLD.title
  OR NEW.created_at IS NOT OLD.created_at
  OR NEW.source_apps_json IS NOT OLD.source_apps_json
  OR NEW.locked IS NOT OLD.locked
  OR NEW.workspace_id IS NOT OLD.workspace_id
  OR NEW.id IS NOT OLD.id
BEGIN
  INSERT INTO search_index_dirty (entity_type, entity_id)
  VALUES ('session', OLD.id)
  ON CONFLICT (entity_type, entity_id) DO UPDATE SET
    generation = search_index_dirty.generation + 1,
    queued_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now');

  INSERT INTO search_index_dirty (entity_type, entity_id)
  SELECT 'session', NEW.id
  WHERE NEW.id <> OLD.id
  ON CONFLICT (entity_type, entity_id) DO UPDATE SET
    generation = search_index_dirty.generation + 1,
    queued_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now');
END;

ALTER TABLE sessions DROP COLUMN event_id;
ALTER TABLE sessions DROP COLUMN event_json;

-- Les index `idx_events_*` et `idx_calendars_provider` partent avec leur table.
DROP TABLE IF EXISTS events;
DROP TABLE IF EXISTS calendars;

-- Réglages qui ne servaient qu'au calendrier (événements ignorés, dossiers
-- automatiques des séries récurrentes).
DELETE FROM app_settings
WHERE id IN (
  'ignored_events',
  'ignored_recurring_series',
  'auto_add_series_folders',
  'auto_add_series_folders_declined'
);
