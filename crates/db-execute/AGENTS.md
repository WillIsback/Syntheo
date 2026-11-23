# `db-execute`

## Role

Reusable one-shot SQL execution over `db-core::Db`. Transport-agnostic and non-reactive.

## Owns

- `DbExecutor`, `ProxyQueryMethod`, `ProxyQueryResult`.
- SQL param binding from JSON values.
- JSON-described transactions (`TransactionStatement`), with explicit rollback on error or cancellation; `plugins/db` delegates `execute_transaction` here.
- Named-row and positional-row serialization.

## Does Not Own

- Subscription state, invalidation, dependency analysis.
- Tauri/mobile transport adapters.
