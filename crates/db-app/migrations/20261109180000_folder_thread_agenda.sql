-- Syntheo 0.7.0 (issue 491) : ordre du jour de la prochaine réunion d'un
-- dossier projet. Il vit à côté du fil rouge, dans la même ligne de
-- `folder_threads` (une par dossier, rattachée à `folders.id`, supprimée avec
-- le dossier). Aucune date n'est enregistrée : la prochaine réunion n'en a
-- pas tant que sa note n'est pas préparée.
-- - `agenda_body` : le document de l'ordre du jour (même format que les
--   notes), tel que l'utilisateur l'a laissé ; vide tant qu'aucun ordre du
--   jour n'a été proposé.
-- - `agenda_generated_at` : date de la dernière proposition du modèle local ;
--   `agenda_edited_at` : date de la dernière correction à la main.
--
-- Une ligne peut exister pour l'ordre du jour seul (aucun fil rouge rédigé) :
-- elle garde alors `generated_at = ''`, et la page la traite comme un fil
-- rouge absent.
--
-- Migration additive (nouvelles colonnes avec valeur par défaut) : sans effet
-- pour une version plus ancienne de l'application, qui ignore ces colonnes.
ALTER TABLE folder_threads ADD COLUMN agenda_body TEXT NOT NULL DEFAULT '';
ALTER TABLE folder_threads ADD COLUMN agenda_generated_at TEXT NOT NULL DEFAULT '';
ALTER TABLE folder_threads ADD COLUMN agenda_edited_at TEXT NOT NULL DEFAULT '';
