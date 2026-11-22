-- Syntheo 0.8.0 (issue 671) : mesure de la reprise d'une synthèse et matrice
-- de calibrage, pour la bêta interne. Ces tables ne contiennent que des
-- nombres, des identifiants et des dates : aucun texte des notes, aucun
-- titre, aucun extrait. Les contraintes CHECK le garantissent pour les rares
-- colonnes TEXT (identifiants UUID, dates ISO 8601).
--
-- Tables locales à l'appareil, comme `session_summary_versions`.
-- Migration additive : sans effet pour une version plus ancienne, et
-- réversible par `DROP TABLE` des trois tables.
CREATE TABLE IF NOT EXISTS summary_measurements (
  id                    TEXT PRIMARY KEY NOT NULL
    CHECK (length(id) = 36 AND id NOT GLOB '*[^0-9a-f-]*'),
  -- Synthèse mesurée (`session_documents.id`) et sa réunion.
  document_id           TEXT NOT NULL
    CHECK (length(document_id) BETWEEN 1 AND 64 AND document_id NOT GLOB '*[^0-9A-Za-z_-]*'),
  session_id            TEXT NOT NULL
    CHECK (length(session_id) BETWEEN 1 AND 64 AND session_id NOT GLOB '*[^0-9A-Za-z_-]*'),
  rule_version          INTEGER NOT NULL CHECK (rule_version > 0),
  aligned               INTEGER NOT NULL CHECK (aligned IN (0, 1)),
  headings_generated    INTEGER NOT NULL CHECK (headings_generated >= 0),
  headings_matched      INTEGER NOT NULL CHECK (headings_matched >= 0),
  generated_words       INTEGER NOT NULL CHECK (generated_words >= 0),
  added_words           INTEGER NOT NULL CHECK (added_words >= 0),
  deleted_words         INTEGER NOT NULL CHECK (deleted_words >= 0),
  replaced_content      INTEGER NOT NULL CHECK (replaced_content >= 0),
  replaced_lexical      INTEGER NOT NULL CHECK (replaced_lexical >= 0),
  unmatched_sent_words  INTEGER NOT NULL CHECK (unmatched_sent_words >= 0),
  -- Version comparée : le corps produit par Syntheo (`original`, table
  -- `summary_generated_bodies`), ou la synthèse actuelle pour une synthèse
  -- générée avant la 0.8.0 (`current`).
  generated_source      TEXT NOT NULL DEFAULT 'current'
    CHECK (generated_source IN ('original', 'current')),
  measured_at           TEXT NOT NULL
    DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    CHECK (measured_at GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T*' AND length(measured_at) <= 32 AND measured_at NOT GLOB '*[^0-9TZ:.+-]*')
) STRICT;

CREATE INDEX IF NOT EXISTS idx_summary_measurements_document
ON summary_measurements(document_id, measured_at);

-- Compteurs par section, désignée par son rang dans la synthèse générée.
CREATE TABLE IF NOT EXISTS summary_measurement_sections (
  measurement_id    TEXT NOT NULL REFERENCES summary_measurements(id) ON DELETE CASCADE,
  section_index     INTEGER NOT NULL CHECK (section_index >= 0),
  matched           INTEGER NOT NULL CHECK (matched IN (0, 1)),
  generated_words   INTEGER NOT NULL CHECK (generated_words >= 0),
  added_words       INTEGER NOT NULL CHECK (added_words >= 0),
  deleted_words     INTEGER NOT NULL CHECK (deleted_words >= 0),
  replaced_content  INTEGER NOT NULL CHECK (replaced_content >= 0),
  replaced_lexical  INTEGER NOT NULL CHECK (replaced_lexical >= 0),
  PRIMARY KEY (measurement_id, section_index)
) STRICT;

-- Les sections suivent leur mesure, même sans clés étrangères actives (la
-- purge d'une réunion supprime les mesures par `session_id`).
CREATE TRIGGER IF NOT EXISTS summary_measurements_delete_sections
AFTER DELETE ON summary_measurements
BEGIN
  DELETE FROM summary_measurement_sections WHERE measurement_id = OLD.id;
END;

-- Mode Calibrage : matrice d'accord entre la classe automatique et la classe
-- choisie à la main, seulement ses compteurs (jamais les différences ni les
-- étiquettes ligne par ligne).
CREATE TABLE IF NOT EXISTS calibration_results (
  id                        TEXT PRIMARY KEY NOT NULL
    CHECK (length(id) = 36 AND id NOT GLOB '*[^0-9a-f-]*'),
  rule_version              INTEGER NOT NULL CHECK (rule_version > 0),
  auto_content_true_content INTEGER NOT NULL CHECK (auto_content_true_content >= 0),
  auto_content_true_lexical INTEGER NOT NULL CHECK (auto_content_true_lexical >= 0),
  auto_lexical_true_content INTEGER NOT NULL CHECK (auto_lexical_true_content >= 0),
  auto_lexical_true_lexical INTEGER NOT NULL CHECK (auto_lexical_true_lexical >= 0),
  created_at                TEXT NOT NULL
    DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    CHECK (created_at GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T*' AND length(created_at) <= 32 AND created_at NOT GLOB '*[^0-9TZ:.+-]*')
) STRICT;

-- Corps de la synthèse tel que Syntheo l'a produit, avant toute retouche :
-- la « version générée » de la mesure (spec de la bêta, §2). Écrit dans la
-- même transaction que la synthèse générée (`update_generated_summary_body`),
-- remplacé à chaque régénération. Contenu de la note, comme
-- `session_summary_versions` : table locale, purgée avec la réunion (colonne
-- `session_id`), jamais exportée.
CREATE TABLE IF NOT EXISTS summary_generated_bodies (
  document_id   TEXT PRIMARY KEY NOT NULL,
  session_id    TEXT NOT NULL DEFAULT '',
  body_format   TEXT NOT NULL DEFAULT '',
  body          TEXT NOT NULL DEFAULT '',
  generated_at  TEXT NOT NULL DEFAULT ''
) STRICT;
