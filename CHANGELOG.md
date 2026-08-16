# Changelog

All notable changes to this project are documented here.

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
