-- Syntheo 0.6.0 (issue 407) : l'invite « Êtes-vous en réunion ? » est désormais
-- désactivée par défaut (`notification_detect = false`, issue 349). Les
-- formulaires de réglages enregistrent toutes leurs valeurs à chaque
-- modification : un `true` stocké est donc le plus souvent l'ancien défaut, pas
-- un choix. On le repasse à `false`, une seule fois : la ligne de cette
-- migration dans la table des migrations sert de marqueur, si bien qu'une
-- réactivation ultérieure n'est jamais écrasée.
--
-- Seul le réglage `notification_detect` est écrit. Les documents hérités
-- (`legacy_settings_document`, `legacy_main_values_document`) restent intacts :
-- quand ils portent l'ancien `true` sans ligne directe, une ligne directe
-- `false` le masque, comme le fait la lecture des réglages. Un JSON hérité
-- invalide est ignoré (CASE garantit l'ordre d'évaluation). Les réglages imposés
-- par l'administrateur (`managed_app_settings`) ne sont jamais touchés.
UPDATE app_settings
SET
  value_json = 'false',
  updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE id = 'notification_detect'
  AND CASE
    WHEN json_valid(value_json) THEN json_type(value_json)
  END = 'true'
  AND NOT EXISTS (
    SELECT 1 FROM managed_app_settings AS managed
    WHERE managed.id = 'notification_detect'
  );

WITH legacy AS (
  SELECT
    (
      SELECT CASE
        WHEN json_valid(value_json) THEN json_type(value_json, '$.notification.detect')
      END
      FROM app_settings
      WHERE id = 'legacy_settings_document'
    ) AS settings_type,
    (
      SELECT CASE
        WHEN json_valid(value_json) THEN json_type(value_json, '$.notification_detect')
      END
      FROM app_settings
      WHERE id = 'legacy_main_values_document'
    ) AS main_type
)
INSERT INTO app_settings (id, value_json)
SELECT 'notification_detect', 'false'
FROM legacy
WHERE NOT EXISTS (
    SELECT 1 FROM app_settings WHERE id = 'notification_detect'
  )
  AND NOT EXISTS (
    SELECT 1 FROM managed_app_settings AS managed
    WHERE managed.id = 'notification_detect'
  )
  AND CASE
    WHEN legacy.settings_type IS NOT NULL THEN legacy.settings_type = 'true'
    ELSE legacy.main_type IS 'true'
  END;
