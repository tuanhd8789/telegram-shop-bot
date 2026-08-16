# Changelog

All notable changes to this project are documented here.

## [1.6.0] - 2026-08-16

### Added

- Per-product Telegram `custom_emoji_id` storage and button rendering.
- Documented Autodesk production mappings using the supplied custom emoji packs.

### Changed

- Product buttons now put the purchasing facts first: `Price | Stock | App name`.
- Contact-only product buttons use `Price | Contact | App name` while preserving the same column order.

## [1.5.0] - 2026-08-16

### Added

- Per-stock administration from `/viewstock` and the reply-keyboard inventory action: paginated detail views plus edit and delete buttons for each unsold stock record.
- Delete confirmation and immutable protection for stock already linked to completed sales.
- Telegram `icon_custom_emoji_id` support for category buttons and matching custom emoji entities in category headings.

### Changed

- Inventory navigation now starts with a product picker and exposes every stock action through contextual buttons.
- Arbitrary category and stock values are HTML-escaped before being rendered in admin messages.

## [1.4.0] - 2026-08-16

### Added

- A persistent Telegram reply keyboard that users open with the keyboard icon beside the emoji button.
- Separate keyboard sections: customer actions are always shown first; administration actions are appended only for `ADMIN_ID`.
- Text-action routing for every reply-keyboard button, including products, categories, wallet top-ups, orders, stock, statistics, users, broadcast, Sheet sync, and settings.

### Changed

- `/start` and `/menu` now install the role-appropriate reply keyboard instead of requiring users to open an inline menu message.

## [1.3.1] - 2026-08-16

### Fixed

- Initialize Telegram sessions for first-time callback users so guided actions such as add stock, create category/product, broadcast, and custom wallet top-up can store their next-step state.

## [1.3.0] - 2026-08-16

### Added

- Button-first customer navigation for all products, categories, wallet top-up, orders, account information, and support.
- A permission-scoped admin action panel with guided category, product, stock, order, user, broadcast, synchronization, and settings flows.
- Category image URLs with emoji fallback; public PNG/JPG URLs can be shown as category cards.
- Preset wallet top-ups of 10,000đ through 500,000đ plus custom amounts.
- Idempotent SePay wallet reconciliation, automatic balance credit, and persistent customer/admin Telegram notifications.

### Changed

- `/menu` now opens the action menu; legacy commands remain available for compatibility.

## [1.2.1] - 2026-08-16

### Fixed

- Notify the configured Telegram admin exactly once for every authenticated incoming transfer to a configured account, including transfers that do not match an order.
- Include the amount, masked receiving account, gateway, payment code, reference, reconciliation result, and SePay transaction ID in the admin notification.
- Keep order fulfillment separate: only an exact pending-order code and amount match can mark an order paid or deliver stock.

## [1.2.0] - 2026-08-15

### Added

- HMAC-SHA256 SePay endpoint at `POST /webhooks/sepay`, including raw-body verification and a five-minute replay window.
- Exact incoming account, payment-code, and amount matching with unique SePay transaction IDs.
- Persistent SQLite Telegram jobs that retry delivery after transient failures or process restarts.
- Test Mode and Live configuration guidance in Vietnamese and English.

### Changed

- Generate SePay-compatible payment codes using the `PAY` prefix and six alphanumeric characters.
- Reserve stock, mark payment, record the transaction, and enqueue delivery in one immediate SQLite transaction.
- Keep automatically paid orders in `paid` until Telegram delivery succeeds; alert the admin instead of under-delivering when stock is insufficient.

## [1.1.3] - 2026-08-15

### Fixed

- Register the complete admin command menu only for the configured admin chat while keeping the public menu unchanged for customers.

## [1.1.2] - 2026-08-15

### Fixed

- Allow the health endpoint's host bind address to be configured for a reverse proxy running on another machine while retaining loopback as the secure default.

## [1.1.1] - 2026-08-15

### Fixed

- Start health checks and automatic backups after Telegram connects instead of waiting for long polling to stop.
- Exit on fatal polling errors so Docker can restart the bot.

## [1.1.0] - 2026-08-14

### Added

- Production Docker image and hardened Docker Compose runtime.
- Telegram-aware `/healthz` endpoint and container health check.
- Automatic SQLite snapshots with configurable schedule and retention.
- CI checks for syntax, unit tests, and production image builds.
- Vietnamese and English deployment, recovery, and secret-rotation guidance.

### Changed

- Startup now fails fast when required Telegram admin or bank settings are missing.
- Startup logs no longer print the receiving bank-account number.
