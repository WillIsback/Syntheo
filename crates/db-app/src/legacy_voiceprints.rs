//! Syntheo ne calcule plus d'empreintes vocales. Les versions héritées
//! d'Syntheo ont pu en enregistrer : les vecteurs sont des secrets du
//! trousseau, ces tables n'en gardent que les coordonnées.

use sqlx::SqlitePool;

/// (table, lecture des coordonnées, suppression)
const LEGACY_TABLES: [(&str, &str, &str); 2] = [
    (
        "voiceprint_exemplars",
        "SELECT keyring_scope, keyring_key FROM voiceprint_exemplars",
        "DROP TABLE IF EXISTS voiceprint_exemplars",
    ),
    (
        "voiceprint_candidates",
        "SELECT keyring_scope, keyring_key FROM voiceprint_candidates",
        "DROP TABLE IF EXISTS voiceprint_candidates",
    ),
];

/// Supprime chaque secret référencé, puis les tables. Si un secret résiste,
/// les tables restent pour que le prochain lancement réessaie.
pub async fn purge_legacy_voiceprints(
    pool: &SqlitePool,
    mut delete_secret: impl FnMut(&str, &str) -> Result<(), String>,
) -> Result<(), String> {
    for (table, select, _) in LEGACY_TABLES {
        let exists: i64 =
            sqlx::query_scalar("SELECT count(*) FROM sqlite_master WHERE type='table' AND name=?")
                .bind(table)
                .fetch_one(pool)
                .await
                .map_err(|error| error.to_string())?;
        if exists == 0 {
            continue;
        }
        let secrets: Vec<(String, String)> = sqlx::query_as(select)
            .fetch_all(pool)
            .await
            .map_err(|error| error.to_string())?;
        for (scope, key) in &secrets {
            delete_secret(scope, key)?;
        }
    }
    for (_, _, drop) in LEGACY_TABLES {
        sqlx::query(drop)
            .execute(pool)
            .await
            .map_err(|error| error.to_string())?;
    }
    Ok(())
}

const VOICEPRINT_EXEMPLARS_VERSION: i64 = 20260802120000;
const VOICEPRINT_EXEMPLARS_REBUILD_VERSION: i64 = 20260903120000;

/// Issue #520 : jusqu'en 0.7.0-3, la purge pouvait courir avec les migrations
/// et supprimer `voiceprint_exemplars` après 20260802120000 mais avant
/// 20260903120000, qui reconstruit cette table. La base restait alors bloquée.
/// On recrée la table vide, dans la forme de 20260802120000, pour que les
/// migrations reprennent ; la purge la retire une fois le démarrage terminé.
/// Sans effet sur une base saine : la table existe, ou 20260903120000 est déjà
/// appliquée (la purge a alors le droit de l'avoir supprimée).
pub(crate) async fn repair_voiceprint_exemplars_dropped_before_rebuild(
    pool: &SqlitePool,
) -> Result<(), sqlx::Error> {
    let mut transaction = pool.begin_with("BEGIN IMMEDIATE").await?;
    let has_migrations: bool = sqlx::query_scalar(
        "SELECT EXISTS(
            SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = '_sqlx_migrations'
         )",
    )
    .fetch_one(&mut *transaction)
    .await?;
    if !has_migrations {
        return transaction.commit().await;
    }

    let broken: bool = sqlx::query_scalar(
        "SELECT
            EXISTS(SELECT 1 FROM _sqlx_migrations WHERE version = ?1 AND success = 1)
            AND NOT EXISTS(SELECT 1 FROM _sqlx_migrations WHERE version = ?2)
            AND NOT EXISTS(
                SELECT 1 FROM sqlite_master
                WHERE type = 'table' AND name = 'voiceprint_exemplars'
            )",
    )
    .bind(VOICEPRINT_EXEMPLARS_VERSION)
    .bind(VOICEPRINT_EXEMPLARS_REBUILD_VERSION)
    .fetch_one(&mut *transaction)
    .await?;
    if broken {
        sqlx::raw_sql(include_str!(
            "../migrations/20260802120000_voiceprint_exemplars.sql"
        ))
        .execute(&mut *transaction)
        .await?;
    }
    transaction.commit().await
}
