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
//!
//! La barrière ne peut pas geler l'interface :
//! - elle est `async` et n'est appelée que depuis le runtime tokio (commande Tauri `subscribe`,
//!   tâche de diffusion du `LiveQueryRuntime`). Avec sqlx, chaque connexion SQLite exécute ses
//!   requêtes sur son propre fil système : l'attente du verrou (`busy_timeout`) bloque ce fil,
//!   jamais un fil du runtime ni le fil principal ;
//! - la connexion revient toujours au pool : `rollback` en cas de succès ; sinon, abandon de la
//!   `Transaction` ou de la `PoolConnection`, dont le `Drop` programme l'annulation, exécutée par
//!   sqlx au retour de la connexion dans le pool ;
//! - son attente est plafonnée par [`BARRIER_TIMEOUT`], qui couvre aussi l'attente d'une
//!   connexion libre dans le pool, non bornée par le `busy_timeout` de 5 s de `db-core`.

use std::time::Duration;

use sqlx::SqlitePool;

/// Plafond de la barrière, aligné sur le `busy_timeout` de `syntheo_db_core`.
pub(crate) const BARRIER_TIMEOUT: Duration = Duration::from_secs(5);

/// Attend la fin de toute validation dont le crochet a déjà été appelé, au plus
/// [`BARRIER_TIMEOUT`].
///
/// En cas d'échec (base en lecture seule, verrou ou connexion non obtenus à temps…), la fonction
/// rend la main sans erreur : l'appelant lit alors comme auparavant, sans garantie supplémentaire.
pub(crate) async fn wait_for_announced_commits(pool: &SqlitePool) {
    wait_for_announced_commits_within(pool, BARRIER_TIMEOUT).await;
}

async fn wait_for_announced_commits_within(pool: &SqlitePool, limit: Duration) {
    let barrier = async {
        if let Ok(transaction) = pool.begin_with("BEGIN IMMEDIATE").await {
            let _ = transaction.rollback().await;
        }
    };
    let _ = tokio::time::timeout(limit, barrier).await;
}

#[cfg(test)]
mod tests {
    use std::time::Duration;

    use syntheo_db_core::{DbOpenOptions, DbStorage};

    use super::*;

    async fn open_notes_db(
        db_path: &std::path::Path,
        max_connections: u32,
    ) -> (syntheo_db_core::Db, SqlitePool) {
        let db = syntheo_db_core::Db::open(DbOpenOptions {
            storage: DbStorage::Local(db_path),
            journal_mode_wal: true,
            foreign_keys: true,
            max_connections: Some(max_connections),
        })
        .await
        .unwrap();
        let pool = db.pool().clone();
        sqlx::query("CREATE TABLE IF NOT EXISTS notes (id TEXT PRIMARY KEY)")
            .execute(&pool)
            .await
            .unwrap();
        (db, pool)
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn gives_up_without_error_when_the_lock_is_held_and_returns_its_connection() {
        let dir = tempfile::tempdir().unwrap();
        let (_db, pool) = open_notes_db(&dir.path().join("app.db"), 2).await;

        let mut writer = pool.begin_with("BEGIN IMMEDIATE").await.unwrap();
        sqlx::query("INSERT INTO notes (id) VALUES ('note-1')")
            .execute(&mut *writer)
            .await
            .unwrap();

        // Verrou impossible à obtenir : la barrière doit rendre la main au plafond, sans erreur,
        // bien avant le `busy_timeout` de 5 s.
        let started = std::time::Instant::now();
        wait_for_announced_commits_within(&pool, Duration::from_millis(200)).await;
        assert!(
            started.elapsed() < Duration::from_secs(2),
            "la barrière doit respecter son plafond, elle a attendu {:?}",
            started.elapsed()
        );

        writer.commit().await.unwrap();

        // Plus de passages que de connexions : si une barrière abandonnée gardait la sienne, le
        // pool (2 connexions) serait épuisé et ces appels bloqueraient.
        tokio::time::timeout(Duration::from_secs(5), async {
            for _ in 0..4 {
                wait_for_announced_commits(&pool).await;
            }
            let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM notes")
                .fetch_one(&pool)
                .await
                .unwrap();
            assert_eq!(count, 1);
        })
        .await
        .expect("la connexion de la barrière abandonnée doit revenir au pool");
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn returns_without_error_on_a_read_only_database() {
        let dir = tempfile::tempdir().unwrap();
        let db_path = dir.path().join("app.db");
        let (db, _pool) = open_notes_db(&db_path, 1).await;
        db.pool().close().await;

        let read_only = syntheo_db_core::Db::connect_local_read_only(&db_path)
            .await
            .unwrap();
        tokio::time::timeout(
            Duration::from_secs(2),
            wait_for_announced_commits(read_only.pool()),
        )
        .await
        .expect("la barrière doit rendre la main aussitôt sur une base en lecture seule");
        let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM notes")
            .fetch_one(read_only.pool())
            .await
            .unwrap();
        assert_eq!(count, 0);
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn waits_until_the_writing_transaction_has_committed() {
        let dir = tempfile::tempdir().unwrap();
        let (_db, pool) = open_notes_db(&dir.path().join("app.db"), 4).await;

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
