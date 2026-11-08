-- Syntheo 0.6.1 (issue 415) : versions d'une synthèse. Régénérer une synthèse
-- en crée la version suivante ; la précédente est gardée ici, marquée
-- remplacée (`superseded_at`). La ligne de `session_documents` reste toujours
-- la version actuelle, avec le même identifiant : mentions, chat, recherche,
-- notes passées, export, synchronisation de fichiers et chiffrement de bout en
-- bout ne lisent que `session_documents` et ne voient donc jamais une version
-- remplacée.
--
-- Table à part plutôt qu'une colonne sur `session_documents` : une ligne
-- remplacée dans `session_documents` serait synchronisée vers les autres
-- appareils, où une version plus ancienne de l'application l'afficherait comme
-- une synthèse active. Comme `session_document_versions`, cette table reste
-- locale à l'appareil.
--
-- Migration additive (nouvelle table) : sans effet pour une version plus
-- ancienne de l'application, et réversible par
-- `DROP TABLE session_summary_versions;`.
CREATE TABLE IF NOT EXISTS session_summary_versions (
  id                        TEXT PRIMARY KEY NOT NULL,
  workspace_id              TEXT NOT NULL DEFAULT '',
  -- La synthèse actuelle (`session_documents.id`) dont c'est une version.
  document_id               TEXT NOT NULL DEFAULT '',
  session_id                TEXT NOT NULL DEFAULT '',
  version                   INTEGER NOT NULL DEFAULT 1,
  template_id               TEXT NOT NULL DEFAULT '',
  title                     TEXT NOT NULL DEFAULT '',
  body_format               TEXT NOT NULL DEFAULT '',
  body                      TEXT NOT NULL DEFAULT '',
  generation_metadata_json  TEXT NOT NULL DEFAULT '{}',
  generated_at              TEXT NOT NULL DEFAULT '',
  superseded_at             TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;

CREATE INDEX IF NOT EXISTS idx_session_summary_versions_document
ON session_summary_versions(document_id, version);
