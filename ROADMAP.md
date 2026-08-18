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
- 2026-08-18 — Controlled AI administration with function calling, privacy-filtered reads, preview/confirmation, audit, backup, protected secret handoffs, and replay protection. Implemented in [v1.9.0](CHANGELOG.md#190---2026-08-18).
- 2026-08-18 — Dedicated administrator category management with create, rename, reversible visibility, and safe empty-category deletion. Implemented in [v1.10.0](CHANGELOG.md#1100---2026-08-18).
- 2026-08-18 — Durable admin editing for the shop name and Telegram support contact from the Settings menu. Implemented in [v1.11.0](CHANGELOG.md#1110---2026-08-18).
- 2026-08-18 — Compact three-column customer category grid with refresh/back navigation. Implemented in [v1.12.0](CHANGELOG.md#1120---2026-08-18).
- 2026-08-18 — Two-step category/product name and custom-emoji editing, with stock-aware product button colors. Implemented in [v1.13.0](CHANGELOG.md#1130---2026-08-18).
- 2026-08-18 — Two-column customer category grid for wider, more readable buttons. Adjusted in [v1.13.1](CHANGELOG.md#1131---2026-08-18).
- 2026-08-18 — Persistent admin-editable greeting, introduction, and support content with safe placeholders. Implemented in [v1.14.0](CHANGELOG.md#1140---2026-08-18).
- 2026-08-18 — Fail-safe custom emoji rendering for malformed legacy IDs. Fixed in [v1.14.1](CHANGELOG.md#1141---2026-08-18).
- 2026-08-19 — Bounded automatic retry for transient AI provider rate limits and outages. Fixed in [v1.14.2](CHANGELOG.md#1142---2026-08-19).
- 2026-08-19 — Compatibility normalization for provider-injected tool metadata without weakening the AI action allowlist. Fixed in [v1.14.3](CHANGELOG.md#1143---2026-08-19).
- 2026-08-19 — Subtle in-stock category/product buttons using a neutral background and compact green status marker. Adjusted in [v1.14.4](CHANGELOG.md#1144---2026-08-19).
- 2026-08-19 — Collapsible role-aware reply keyboard that no longer interrupts Telegram emoji search. Fixed in [v1.14.5](CHANGELOG.md#1145---2026-08-19).

## Next

- Add role-based administration and an auditable admin-action log.
- Add restore drills and encrypted off-host backup automation for the selected hosting provider.
- Add Vietnamese/English message catalogs editable by shop administrators.
