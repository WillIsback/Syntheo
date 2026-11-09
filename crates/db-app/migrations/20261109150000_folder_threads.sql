-- Syntheo 0.7.0 (issue 496) : « fil rouge » d'un dossier projet. C'est un
-- document (même format que les notes) qui dit où en est le sujet, avec ses
-- décisions, points ouverts et tâches non faites. Il est rédigé à la demande
-- par le modèle local à partir des synthèses des réunions du dossier, puis
-- modifiable par l'utilisateur.
--
-- `folder_threads` garde la version actuelle, une ligne par dossier. Elle est
-- rattachée à `folders.id`, qui ne change pas quand le dossier est renommé.
-- - `body` : le document tel que l'utilisateur le voit, corrections comprises ;
--   une modification à la main ne touche que `body` et `edited_at`.
-- - `generated_json` : les textes que le modèle a écrits et que l'utilisateur
--   n'a pas retouchés, rangés par section. Tout ce qui n'y figure pas est une
--   correction ou un ajout de l'utilisateur, qu'une mise à jour ne réécrit
--   jamais.
-- - `covered_session_ids_json` et `covered_until` : les réunions déjà
--   intégrées et la date de la plus récente. Une mise à jour n'envoie au
--   modèle que les réunions absentes de cette liste, avec le fil rouge actuel.
--
-- `folder_thread_versions` garde les versions remplacées par une mise à jour,
-- comme `session_summary_versions` pour les synthèses.
--
-- Les deux tables restent locales à l'appareil. Migration additive (nouvelles
-- tables) : sans effet pour une version plus ancienne de l'application, et
-- réversible par `DROP TABLE folder_thread_versions; DROP TABLE folder_threads;`.
CREATE TABLE IF NOT EXISTS folder_threads (
  folder_id                 TEXT PRIMARY KEY NOT NULL,
  workspace_id              TEXT NOT NULL DEFAULT '',
  body                      TEXT NOT NULL DEFAULT '',
  generated_json            TEXT NOT NULL DEFAULT '{}',
  covered_session_ids_json  TEXT NOT NULL DEFAULT '[]',
  covered_until             TEXT NOT NULL DEFAULT '',
  version                   INTEGER NOT NULL DEFAULT 1,
  generated_at              TEXT NOT NULL DEFAULT '',
  edited_at                 TEXT NOT NULL DEFAULT '',
  updated_at                TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;

CREATE TABLE IF NOT EXISTS folder_thread_versions (
  id                        TEXT PRIMARY KEY NOT NULL,
  folder_id                 TEXT NOT NULL DEFAULT '',
  version                   INTEGER NOT NULL DEFAULT 1,
  body                      TEXT NOT NULL DEFAULT '',
  generated_json            TEXT NOT NULL DEFAULT '{}',
  covered_session_ids_json  TEXT NOT NULL DEFAULT '[]',
  covered_until             TEXT NOT NULL DEFAULT '',
  generated_at              TEXT NOT NULL DEFAULT '',
  edited_at                 TEXT NOT NULL DEFAULT '',
  superseded_at             TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;

CREATE INDEX IF NOT EXISTS idx_folder_thread_versions_folder
ON folder_thread_versions(folder_id, version);
