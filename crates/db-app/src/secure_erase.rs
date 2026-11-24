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
