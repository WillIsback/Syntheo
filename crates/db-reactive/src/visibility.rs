//! Barrière de visibilité des écritures annoncées par `ChangeNotifier`.
//!
//! `ChangeNotifier` publie les changements depuis le crochet de validation de SQLite
//! (`sqlite3_commit_hook`). Ce crochet est appelé *avant* que la validation soit réellement
//! effectuée : au moment où l'annonce part, la transaction écrivante n'a pas encore écrit ses
//! pages (et, avec `synchronous=FULL`, ne les a pas encore synchronisées sur disque). Une
//! lecture lancée aussitôt sur une autre connexion du pool voit donc encore l'ancien état.
//!
//! Toute transaction qui écrit détient le verrou d'écriture de la base jusqu'à la fin de sa
//! validation. Prendre ce verrou (`BEGIN IMMEDIATE`) puis l'abandonner aussitôt garantit donc que
//! chaque validation déjà annoncée est terminée et visible par les lectures suivantes.

use sqlx::SqlitePool;

/// Attend la fin de toute validation dont le crochet a déjà été appelé.
///
/// En cas d'échec (base en lecture seule, verrou non obtenu avant le délai d'attente de la
/// connexion…), la fonction rend la main sans erreur : l'appelant lit alors comme auparavant,
/// sans garantie supplémentaire.
pub(crate) async fn wait_for_announced_commits(pool: &SqlitePool) {
    if let Ok(transaction) = pool.begin_with("BEGIN IMMEDIATE").await {
        let _ = transaction.rollback().await;
    }
}

#[cfg(test)]
mod tests {
    use std::time::Duration;

    use syntheo_db_core::{DbOpenOptions, DbStorage};

    use super::*;

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn waits_until_the_writing_transaction_has_committed() {
        let dir = tempfile::tempdir().unwrap();
        let db_path = dir.path().join("app.db");
        let db = syntheo_db_core::Db::open(DbOpenOptions {
            storage: DbStorage::Local(&db_path),
            journal_mode_wal: true,
            foreign_keys: true,
            max_connections: Some(4),
        })
        .await
        .unwrap();
        let pool = db.pool().clone();
        sqlx::query("CREATE TABLE notes (id TEXT PRIMARY KEY)")
            .execute(&pool)
            .await
            .unwrap();

        let mut writer = pool.begin().await.unwrap();
        sqlx::query("INSERT INTO notes (id) VALUES ('note-1')")
            .execute(&mut *writer)
            .await
            .unwrap();

        let barrier_pool = pool.clone();
        let barrier = tokio::spawn(async move { wait_for_announced_commits(&barrier_pool).await });

        tokio::time::sleep(Duration::from_millis(100)).await;
        assert!(
            !barrier.is_finished(),
            "la barrière ne doit pas rendre la main tant que l'écriture n'est pas validée"
        );

        writer.commit().await.unwrap();
        barrier.await.unwrap();

        let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM notes")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(count, 1);
    }
}
