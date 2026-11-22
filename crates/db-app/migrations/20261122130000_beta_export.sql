-- Syntheo 0.8.0 (issue 672) : ce qu'il faut pour l'export pseudonymisé de la
-- bêta, et rien d'autre. Des identifiants de forme contrôlée, des dates, des
-- nombres et des empreintes : aucun texte des notes, aucun terme en clair.
-- Les contraintes CHECK le garantissent. Tables locales à l'appareil,
-- vidées par « Effacer mes mesures ». Migration additive.

-- Rôle des sections mesurées (spec §4, garde-fou Décisions et Actions),
-- déduit du titre du modèle : liste fermée.
ALTER TABLE summary_measurement_sections
  ADD COLUMN role TEXT NOT NULL DEFAULT 'other'
  CHECK (role IN ('decisions', 'actions', 'other'));

-- Inscription à la bêta : pseudonyme aléatoire, effaçable, et date de
-- référence des jours relatifs de l'export. Une seule ligne.
CREATE TABLE IF NOT EXISTS beta_enrollment (
  id           INTEGER PRIMARY KEY NOT NULL CHECK (id = 1),
  pseudonym    TEXT NOT NULL
    CHECK (pseudonym GLOB 'p-[0-9a-f]*' AND length(pseudonym) = 34 AND substr(pseudonym, 3) NOT GLOB '*[^0-9a-f]*'),
  enrolled_at  TEXT NOT NULL
    CHECK (enrolled_at GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T*' AND length(enrolled_at) <= 32 AND enrolled_at NOT GLOB '*[^0-9TZ:.+-]*')
) STRICT;

-- Taux d'abandon (spec §4) : premier export de fichier et premier partage
-- (copie dans le presse-papiers ou envoi par webhook) de chaque synthèse.
-- La génération et la mesure viennent de summary_generated_bodies et de
-- summary_measurements.
CREATE TABLE IF NOT EXISTS beta_summary_events (
  document_id  TEXT PRIMARY KEY NOT NULL
    CHECK (length(document_id) BETWEEN 1 AND 96 AND document_id NOT GLOB '*[^0-9A-Za-z_:-]*'),
  session_id   TEXT NOT NULL
    CHECK (length(session_id) BETWEEN 1 AND 64 AND session_id NOT GLOB '*[^0-9A-Za-z_-]*'),
  exported_at  TEXT
    CHECK (exported_at IS NULL OR (exported_at GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T*' AND length(exported_at) <= 32 AND exported_at NOT GLOB '*[^0-9TZ:.+-]*')),
  shared_at    TEXT
    CHECK (shared_at IS NULL OR (shared_at GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T*' AND length(shared_at) <= 32 AND shared_at NOT GLOB '*[^0-9TZ:.+-]*'))
) STRICT;

-- Suivi des termes corrigés (spec §3) : chaque terme est désigné par
-- l'empreinte SHA-256 de sa forme normalisée, jamais par son texte, et par un
-- index local (t1, t2…) pour l'export.
CREATE TABLE IF NOT EXISTS beta_terms (
  hash                 TEXT PRIMARY KEY NOT NULL
    CHECK (length(hash) = 64 AND hash NOT GLOB '*[^0-9a-f]*'),
  term_index           INTEGER NOT NULL UNIQUE CHECK (term_index > 0),
  first_seen_at        TEXT NOT NULL
    CHECK (first_seen_at GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T*' AND length(first_seen_at) <= 32 AND first_seen_at NOT GLOB '*[^0-9TZ:.+-]*'),
  -- Déjà au dictionnaire à sa première correction : hors de l'étude.
  in_dictionary_first  INTEGER NOT NULL CHECK (in_dictionary_first IN (0, 1)),
  -- Mesure où l'on a constaté le terme au dictionnaire pour la première fois :
  -- il y a été ajouté entre la mesure précédente et celle-ci.
  added_seen_at        TEXT
    CHECK (added_seen_at IS NULL OR (added_seen_at GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T*' AND length(added_seen_at) <= 32 AND added_seen_at NOT GLOB '*[^0-9TZ:.+-]*'))
) STRICT;

-- Erreurs d'un terme par mesure (corrections lexicales vers ce terme).
CREATE TABLE IF NOT EXISTS beta_term_errors (
  measurement_id  TEXT NOT NULL REFERENCES summary_measurements(id) ON DELETE CASCADE,
  term_hash       TEXT NOT NULL REFERENCES beta_terms(hash) ON DELETE CASCADE,
  count           INTEGER NOT NULL CHECK (count > 0),
  PRIMARY KEY (measurement_id, term_hash)
) STRICT;

-- Les erreurs suivent leur mesure, même sans clés étrangères actives.
CREATE TRIGGER IF NOT EXISTS summary_measurements_delete_term_errors
AFTER DELETE ON summary_measurements
BEGIN
  DELETE FROM beta_term_errors WHERE measurement_id = OLD.id;
END;
