-- Syntheo 0.8.1 (issue 733) : garde-fous de la mesure de la reprise. Des
-- nombres et des codes fermés seulement, contrôlés par CHECK. Colonnes
-- ajoutées, toutes nullables : NULL pour les mesures d'avant la 0.8.1
-- (statut inconnu ; elles sont de la règle 1, donc jamais exportées), et une
-- version plus ancienne de l'application relit la table sans les voir.
-- Migration additive, sans effet sur les lignes existantes.
ALTER TABLE summary_measurements
  ADD COLUMN guard_version INTEGER CHECK (guard_version IS NULL OR guard_version > 0);
ALTER TABLE summary_measurements
  ADD COLUMN status TEXT CHECK (status IS NULL OR status IN ('ok', 'doubtful', 'refused'));
-- Raisons du statut, une colonne 0/1 par code (liste fermée).
ALTER TABLE summary_measurements
  ADD COLUMN reason_entity_left INTEGER CHECK (reason_entity_left IS NULL OR reason_entity_left IN (0, 1));
ALTER TABLE summary_measurements
  ADD COLUMN reason_too_few_words_kept INTEGER CHECK (reason_too_few_words_kept IS NULL OR reason_too_few_words_kept IN (0, 1));
ALTER TABLE summary_measurements
  ADD COLUMN reason_global_alignment INTEGER CHECK (reason_global_alignment IS NULL OR reason_global_alignment IN (0, 1));
ALTER TABLE summary_measurements
  ADD COLUMN reason_unmatched_sections INTEGER CHECK (reason_unmatched_sections IS NULL OR reason_unmatched_sections IN (0, 1));
-- Métriques de contrôle.
ALTER TABLE summary_measurements
  ADD COLUMN generated_kept_words INTEGER CHECK (generated_kept_words IS NULL OR generated_kept_words >= 0);
ALTER TABLE summary_measurements
  ADD COLUMN sections_matched_exact INTEGER CHECK (sections_matched_exact IS NULL OR sections_matched_exact >= 0);
ALTER TABLE summary_measurements
  ADD COLUMN sections_matched_near INTEGER CHECK (sections_matched_near IS NULL OR sections_matched_near >= 0);
ALTER TABLE summary_measurements
  ADD COLUMN deleted_section_words INTEGER CHECK (deleted_section_words IS NULL OR deleted_section_words >= 0);
ALTER TABLE summary_measurements
  ADD COLUMN residual_entities INTEGER CHECK (residual_entities IS NULL OR residual_entities >= 0);
