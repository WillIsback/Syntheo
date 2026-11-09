-- Syntheo 0.7.0 (issue 502) : modèle de compte rendu par défaut d'un dossier.
-- `template_id` désigne un modèle de `templates` ; vide : pas de modèle propre
-- au dossier (on remonte au dossier parent, puis au réglage global, puis au
-- format libre « Automatique »). La colonne reste sur la ligne du dossier,
-- qui garde son identifiant quand il est renommé.
--
-- Migration additive (nouvelle colonne avec une valeur par défaut) : une
-- version plus ancienne de l'application l'ignore.
ALTER TABLE folders ADD COLUMN template_id TEXT NOT NULL DEFAULT '';
