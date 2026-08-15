# Changelog

All notable changes to this project are documented here.

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
