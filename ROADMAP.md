# Roadmap

## Delivered

- 2026-08-14 — Secure, reproducible container deployment, health checks, CI, and automatic SQLite backups. Implemented in [v1.1.0](CHANGELOG.md#110---2026-08-14).
- 2026-08-15 — Signed SePay payment webhook, exact account/code/amount matching, idempotent transaction processing, atomic stock reservation, and persistent Telegram delivery retries. Implemented in [v1.2.0](CHANGELOG.md#120---2026-08-15).
- 2026-08-16 — Telegram admin notifications for every authenticated incoming transfer, independent of order matching, with transaction-level deduplication. Implemented in [v1.2.1](CHANGELOG.md#121---2026-08-16).
- 2026-08-16 — Permission-scoped customer/admin action menus, guided category/product/stock workflows, and idempotent SePay wallet top-ups. Implemented in [v1.3.0](CHANGELOG.md#130---2026-08-16).
- 2026-08-16 — First-use session initialization for all guided menu actions. Fixed in [v1.3.1](CHANGELOG.md#131---2026-08-16).
- 2026-08-16 — Persistent role-aware Telegram reply keyboard beside the emoji control, with customer actions above admin actions. Implemented in [v1.4.0](CHANGELOG.md#140---2026-08-16).
- 2026-08-16 — Paginated per-stock detail/edit/delete controls and custom emoji category icons. Implemented in [v1.5.0](CHANGELOG.md#150---2026-08-16).
- 2026-08-16 — Price-first product buttons and per-product Telegram custom emoji icons. Implemented in [v1.6.0](CHANGELOG.md#160---2026-08-16).
- 2026-08-17 — Product-generic successful delivery messages with plain admin-authored content and Vietnamese `/hotro` guidance. Implemented in [v1.6.1](CHANGELOG.md#161---2026-08-17).
- 2026-08-17 — Admin-only, read-only AI assistant with a validated OpenAI-compatible provider configuration. Implemented in [v1.7.0](CHANGELOG.md#170---2026-08-17).
- 2026-08-18 — Persistent admin AI chat mode with explicit start/stop controls and a simplified customer keyboard. Implemented in [v1.8.0](CHANGELOG.md#180---2026-08-18).

## Next

- Add role-based administration and an auditable admin-action log.
- Add restore drills and encrypted off-host backup automation for the selected hosting provider.
- Add Vietnamese/English message catalogs editable by shop administrators.
- 2026-08-17 request — Add controlled AI self-configuration using a safe-action allowlist, preview and explicit admin confirmation, audit logs, backup, health check, and automatic rollback.
