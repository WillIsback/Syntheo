use sqlx::SqlitePool;

/// Clé locale des empreintes de termes de la bêta (issue 672), en
/// hexadécimal : tirée à l'inscription, détruite à l'effacement. Lecture
/// seule ; `None` sans inscription.
pub async fn get_beta_term_key(pool: &SqlitePool) -> Result<Option<String>, sqlx::Error> {
    sqlx::query_scalar("SELECT term_key FROM beta_enrollment WHERE id = 1")
        .fetch_optional(pool)
        .await
}
