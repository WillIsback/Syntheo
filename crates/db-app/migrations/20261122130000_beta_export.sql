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

-- Inscription à la bêta : pseudonyme aléatoire, effaçable, date de référence
-- des jours relatifs de l'export, et clé aléatoire (32 octets) des empreintes
-- de termes, détruite à l'effacement. Une seule ligne.
CREATE TABLE IF NOT EXISTS beta_enrollment (
  id           INTEGER PRIMARY KEY NOT NULL CHECK (id = 1),
  pseudonym    TEXT NOT NULL
    CHECK (pseudonym GLOB 'p-[0-9a-f]*' AND length(pseudonym) = 34 AND substr(pseudonym, 3) NOT GLOB '*[^0-9a-f]*'),
  enrolled_at  TEXT NOT NULL
    CHECK (enrolled_at GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T*' AND length(enrolled_at) <= 32 AND enrolled_at NOT GLOB '*[^0-9TZ:.+-]*'),
  term_key     TEXT NOT NULL
    CHECK (length(term_key) = 64 AND term_key NOT GLOB '*[^0-9a-f]*')
) STRICT;

-- Taux d'abandon (spec §4) : chaque génération d'une synthèse faite pendant
-- que la mesure est active et la personne inscrite (une régénération est une
-- nouvelle ligne), avec le premier export de fichier et le premier partage
-- (copie dans le presse-papiers, envoi par webhook) de cette génération-là.
-- La mesure se rattache à la génération par sa date.
CREATE TABLE IF NOT EXISTS beta_generations (
  id           INTEGER PRIMARY KEY NOT NULL,
  document_id  TEXT NOT NULL
    CHECK (length(document_id) BETWEEN 1 AND 96 AND document_id NOT GLOB '*[^0-9A-Za-z_:-]*'),
  session_id   TEXT NOT NULL
    CHECK (length(session_id) BETWEEN 1 AND 64 AND session_id NOT GLOB '*[^0-9A-Za-z_-]*'),
  generated_at TEXT NOT NULL
    CHECK (generated_at GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T*' AND length(generated_at) <= 32 AND generated_at NOT GLOB '*[^0-9TZ:.+-]*'),
  exported_at  TEXT
    CHECK (exported_at IS NULL OR (exported_at GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T*' AND length(exported_at) <= 32 AND exported_at NOT GLOB '*[^0-9TZ:.+-]*')),
  shared_at    TEXT
    CHECK (shared_at IS NULL OR (shared_at GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T*' AND length(shared_at) <= 32 AND shared_at NOT GLOB '*[^0-9TZ:.+-]*')),
  UNIQUE (document_id, generated_at)
) STRICT;

CREATE INDEX IF NOT EXISTS beta_generations_document
  ON beta_generations (document_id, generated_at);

-- Suivi des termes corrigés (spec §3) : chaque terme est désigné par
-- une empreinte HMAC-SHA-256 à clé locale (beta_enrollment.term_key), jamais
-- par son texte, et par un index local tiré au hasard (t1…t99999) pour
-- l'export.
CREATE TABLE IF NOT EXISTS beta_terms (
  hash                 TEXT PRIMARY KEY NOT NULL
    CHECK (length(hash) = 64 AND hash NOT GLOB '*[^0-9a-f]*'),
  term_index           INTEGER NOT NULL UNIQUE CHECK (term_index BETWEEN 1 AND 99999),
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

-- Un terme sans erreur restante (réunion supprimée) disparaît avec sa
-- dernière erreur : aucune empreinte orpheline.
CREATE TRIGGER IF NOT EXISTS beta_term_errors_delete_orphan_terms
AFTER DELETE ON beta_term_errors
BEGIN
  DELETE FROM beta_terms
  WHERE hash = OLD.term_hash
    AND NOT EXISTS (SELECT 1 FROM beta_term_errors WHERE term_hash = OLD.term_hash);
END;
