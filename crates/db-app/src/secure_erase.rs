//! Effacement physique (issues 711 et 712) : une suppression SQLite laisse
//! les octets dans des pages libres du fichier et dans le journal WAL jusqu'à
//! leur réutilisation. `PRAGMA secure_delete` réécrit à zéro le contenu
//! supprimé ; un point de contrôle `TRUNCATE` vide ensuite le journal. Pas de
//! VACUUM : trop coûteux pour une suppression ordinaire.

use sqlx::pool::PoolConnection;
use sqlx::{Sqlite, SqliteConnection, SqlitePool};

/// Connexion dédiée du pool, avec `secure_delete` actif le temps d'une
/// écriture. `release` remet le réglage d'avant avant de rendre la
/// connexion ; si ce n'est pas possible, la connexion est fermée plutôt que
/// rendue au pool avec un réglage inattendu.
pub struct SecureDeleteConnection {
    connection: PoolConnection<Sqlite>,
    previous: i64,
}

impl SecureDeleteConnection {
    pub async fn acquire(pool: &SqlitePool) -> Result<Self, sqlx::Error> {
        let mut connection = pool.acquire().await?;
        let previous: i64 = sqlx::query_scalar("PRAGMA secure_delete")
            .fetch_one(&mut *connection)
            .await?;
        sqlx::query("PRAGMA secure_delete = ON")
            .execute(&mut *connection)
            .await?;
        Ok(Self {
            connection,
            previous,
        })
    }

    pub fn connection(&mut self) -> &mut SqliteConnection {
        &mut self.connection
    }

    pub async fn release(mut self) {
        let restore = sqlx::query(sqlx::AssertSqlSafe(format!(
            "PRAGMA secure_delete = {}",
            i64::from(self.previous != 0)
        )))
        .execute(&mut *self.connection)
        .await;
        if restore.is_err() {
            let _ = self.connection.close().await;
        }
    }
}

/// Vide le journal WAL dans la base puis le tronque. Sans effet hors WAL ;
/// une base occupée (lecture en cours) renvoie `false`, à réessayer plus
/// tard (au balayage suivant).
pub async fn checkpoint_wal(pool: &SqlitePool) -> bool {
    match sqlx::query_as::<_, (i64, i64, i64)>("PRAGMA wal_checkpoint(TRUNCATE)")
        .fetch_one(pool)
        .await
    {
        Ok((busy, _, _)) => busy == 0,
        Err(error) => {
            tracing::warn!("WAL checkpoint failed: {error}");
            false
        }
    }
}

/// Marqueur de `app_settings` posé après le VACUUM unique de la 0.8.1.
pub const SECURE_VACUUM_MARKER_KEY: &str = "secure_vacuum_done";

/// Issue du VACUUM unique.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SecureVacuum {
    /// Déjà fait lors d'un lancement précédent.
    AlreadyDone,
    /// Base reconstruite, marqueur posé.
    Done,
    /// Base occupée : rien n'est changé, réessai au lancement suivant.
    Busy,
}

/// VACUUM unique au premier lancement de la 0.8.1 (issue 712, passe QA
/// 0.8.1-1). Avant `secure_delete` sur toutes les connexions, une édition ou
/// une mise en pierre tombale laissait l'ancienne version d'une ligne dans
/// l'espace libre de sa page ; une base existante peut donc garder des
/// restes de réunions supprimées et purgées. Le VACUUM réécrit la base page
/// par page sans ces restes, puis le journal WAL est vidé. Le marqueur
/// n'est posé qu'après un VACUUM réussi : base occupée, rien n'est posé.
pub async fn secure_vacuum_once(pool: &SqlitePool) -> Result<SecureVacuum, sqlx::Error> {
    let done: bool = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM app_settings WHERE id = ?)")
        .bind(SECURE_VACUUM_MARKER_KEY)
        .fetch_one(pool)
        .await?;
    if done {
        return Ok(SecureVacuum::AlreadyDone);
    }
    let mut connection = pool.acquire().await?;
    if let Err(error) = sqlx::query("VACUUM").execute(&mut *connection).await {
        if is_busy(&error) {
            return Ok(SecureVacuum::Busy);
        }
        return Err(error);
    }
    drop(connection);
    sqlx::query(
        "INSERT OR REPLACE INTO app_settings (id, value_json)
         VALUES (?, json_object('at', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')))",
    )
    .bind(SECURE_VACUUM_MARKER_KEY)
    .execute(pool)
    .await?;
    checkpoint_wal(pool).await;
    Ok(SecureVacuum::Done)
}

fn is_busy(error: &sqlx::Error) -> bool {
    match error {
        sqlx::Error::Database(database) => {
            // SQLITE_BUSY (5), SQLITE_LOCKED (6) et leurs codes étendus.
            database
                .code()
                .and_then(|code| code.parse::<i64>().ok())
                .is_some_and(|code| matches!(code & 0xff, 5 | 6))
                || database.message().contains("statements in progress")
        }
        _ => false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    async fn local_db(path: &std::path::Path) -> syntheo_db_core::Db {
        let db = syntheo_db_core::Db::open(syntheo_db_core::DbOpenOptions {
            storage: syntheo_db_core::DbStorage::Local(path),
            journal_mode_wal: true,
            foreign_keys: true,
            max_connections: Some(3),
        })
        .await
        .unwrap();
        crate::prepare_schema(&db).await.unwrap();
        db
    }

    fn file_contains(path: &std::path::Path, needle: &str) -> bool {
        let mut bytes = std::fs::read(path).unwrap();
        if let Ok(wal) = std::fs::read(path.with_extension("db-wal")) {
            bytes.extend(wal);
        }
        bytes.windows(needle.len()).any(|w| w == needle.as_bytes())
    }

    // Une base héritée garde des restes d'une ligne supprimée sans
    // `secure_delete` ; le VACUUM unique les efface, une seule fois.
    #[tokio::test]
    async fn the_one_time_vacuum_removes_leftovers_once() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("app.db");
        let db = local_db(&path).await;
        let pool = db.pool();
        let marker = "RESTE-HERITE-5K8P";
        let mut connection = pool.acquire().await.unwrap();
        // Comportement des versions antérieures : pas d'effacement.
        sqlx::query("PRAGMA secure_delete = OFF")
            .execute(&mut *connection)
            .await
            .unwrap();
        sqlx::query("INSERT INTO app_settings (id, value_json) VALUES ('reste', ?)")
            .bind(format!("\"{}\"", format!("{marker} ").repeat(30)))
            .execute(&mut *connection)
            .await
            .unwrap();
        sqlx::query("DELETE FROM app_settings WHERE id = 'reste'")
            .execute(&mut *connection)
            .await
            .unwrap();
        connection.close().await.unwrap();
        checkpoint_wal(pool).await;
        assert!(file_contains(&path, marker));

        assert_eq!(secure_vacuum_once(pool).await.unwrap(), SecureVacuum::Done);
        assert!(!file_contains(&path, marker));
        assert_eq!(
            secure_vacuum_once(pool).await.unwrap(),
            SecureVacuum::AlreadyDone
        );
    }

    // Base occupée (transaction d'écriture ouverte ailleurs) : pas de
    // marqueur, réessai au lancement suivant.
    #[tokio::test]
    async fn a_busy_database_postpones_the_vacuum() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("app.db");
        let db = local_db(&path).await;
        let mut other = sqlx::sqlite::SqliteConnectOptions::new()
            .filename(&path)
            .busy_timeout(std::time::Duration::from_millis(0));
        other = other.pragma("journal_mode", "WAL");
        use sqlx::Connection;
        let mut writer = sqlx::SqliteConnection::connect_with(&other).await.unwrap();
        sqlx::query("BEGIN IMMEDIATE")
            .execute(&mut writer)
            .await
            .unwrap();

        let pool = sqlx::sqlite::SqlitePoolOptions::new()
            .max_connections(1)
            .connect_with(
                sqlx::sqlite::SqliteConnectOptions::new()
                    .filename(&path)
                    .busy_timeout(std::time::Duration::from_millis(50)),
            )
            .await
            .unwrap();
        assert_eq!(secure_vacuum_once(&pool).await.unwrap(), SecureVacuum::Busy);
        sqlx::query("ROLLBACK").execute(&mut writer).await.unwrap();
        let marked: bool =
            sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM app_settings WHERE id = ?)")
                .bind(SECURE_VACUUM_MARKER_KEY)
                .fetch_one(db.pool())
                .await
                .unwrap();
        assert!(!marked);
        assert_eq!(secure_vacuum_once(&pool).await.unwrap(), SecureVacuum::Done);
    }
}
