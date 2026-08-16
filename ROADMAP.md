# Roadmap

## Delivered

- 2026-08-14 — Secure, reproducible container deployment, health checks, CI, and automatic SQLite backups. Implemented in [v1.1.0](CHANGELOG.md#110---2026-08-14).
- 2026-08-15 — Signed SePay payment webhook, exact account/code/amount matching, idempotent transaction processing, atomic stock reservation, and persistent Telegram delivery retries. Implemented in [v1.2.0](CHANGELOG.md#120---2026-08-15).
- 2026-08-16 — Telegram admin notifications for every authenticated incoming transfer, independent of order matching, with transaction-level deduplication. Implemented in [v1.2.1](CHANGELOG.md#121---2026-08-16).
- 2026-08-16 — Permission-scoped customer/admin action menus, guided category/product/stock workflows, and idempotent SePay wallet top-ups. Implemented in [v1.3.0](CHANGELOG.md#130---2026-08-16).
- 2026-08-16 — First-use session initialization for all guided menu actions. Fixed in [v1.3.1](CHANGELOG.md#131---2026-08-16).
- 2026-08-16 — Persistent role-aware Telegram reply keyboard beside the emoji control, with customer actions above admin actions. Implemented in [v1.4.0](CHANGELOG.md#140---2026-08-16).

## Next

- Add role-based administration and an auditable admin-action log.
- Add restore drills and encrypted off-host backup automation for the selected hosting provider.
- Add Vietnamese/English message catalogs editable by shop administrators.
