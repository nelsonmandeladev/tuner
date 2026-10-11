//! Atomic write batches on the databases opened by tauri-plugin-sql.
//!
//! The plugin's JS API runs every call on its connection pool, so a BEGIN and
//! a COMMIT sent as separate calls can land on different connections. This
//! command runs a whole batch inside one sqlx transaction on the plugin's own
//! pool: all statements commit together, and any error rolls back (the
//! transaction is dropped without commit). The core's `SqlAdapter.transaction`
//! is built on it (docs/DECISIONS.md D3, D4).

use serde::Deserialize;
use serde_json::Value;
use tauri::State;
use tauri_plugin_sql::{DbInstances, DbPool};

#[derive(Deserialize)]
pub struct Statement {
    sql: String,
    #[serde(default)]
    params: Vec<Value>,
}

/// Runs `statements` in one transaction on the database loaded as `db`
/// (the same string passed to `Database.load`, e.g. `sqlite:app.db`).
#[tauri::command]
pub async fn db_batch(
    instances: State<'_, DbInstances>,
    db: String,
    statements: Vec<Statement>,
) -> Result<(), String> {
    let pools = instances.0.read().await;
    let DbPool::Sqlite(pool) = pools
        .get(&db)
        .ok_or_else(|| format!("Database not loaded: {db}"))?;

    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;
    for (index, statement) in statements.iter().enumerate() {
        let mut query = sqlx::query(&statement.sql);
        for value in &statement.params {
            query = match value {
                Value::Null => query.bind(None::<i64>),
                Value::Bool(b) => query.bind(i64::from(*b)),
                // Integers stay integers (the JS plugin binds every number as f64).
                Value::Number(n) => match n.as_i64() {
                    Some(i) => query.bind(i),
                    None => query.bind(n.as_f64().unwrap_or_default()),
                },
                Value::String(s) => query.bind(s.as_str()),
                other => query.bind(other.to_string()),
            };
        }
        query
            .execute(&mut *tx)
            .await
            .map_err(|e| format!("statement {index}: {e}"))?;
    }
    tx.commit().await.map_err(|e| e.to_string())
}
