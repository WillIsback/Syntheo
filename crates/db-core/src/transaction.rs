//! Aides de transaction partagées par les plugins qui écrivent dans la base
//! (`session`, `template`, `contacts`).

use chrono::SecondsFormat;
use sqlx::{Sqlite, Transaction};

/// Horodatage ISO 8601 en millisecondes, au format de `Date.toISOString()`.
pub fn js_iso8601_timestamp() -> String {
    chrono::Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true)
}

/// Annule la transaction et rend le message d'une instruction qui n'a pas
/// touché le nombre de lignes attendu.
pub async fn rollback_row_count_mismatch(
    transaction: Transaction<'_, Sqlite>,
    statement_index: usize,
    actual: u64,
    expected: u64,
) -> String {
    let _ = transaction.rollback().await;
    format!("transaction statement {statement_index} affected {actual} rows; expected {expected}")
}

/// Annule la transaction et rend `error` tel quel.
pub async fn rollback_error(transaction: Transaction<'_, Sqlite>, error: String) -> String {
    let _ = transaction.rollback().await;
    error
}
