# Deployment guide

This guide deploys the bot with Docker Compose on a Linux host, with persistent SQLite data, a health check, and automatic backups.

> [!CAUTION]
> Any bot token pasted into an issue must be treated as exposed. In `@BotFather`, run `/revoke` for `@minhbrand_bot`, then obtain a new token with `/token`. Never reuse the old token or include the replacement in Git, screenshots, or support logs. Telegram confirms that a token gives control of the bot and [can be revoked at any time](https://core.telegram.org/bots/tutorial#obtain-your-bot-token).

## 1. Prerequisites

- Docker Engine 24+ and Docker Compose v2.
- Outbound HTTPS access to `api.telegram.org`.
- A new Telegram token, numeric admin ID, and VietQR receiving-account details.
- A deployment directory accessible only to operators.

## 2. Secret configuration

```bash
cp .env.example .env
chmod 600 .env
```

Set at least `BOT_TOKEN`, `ADMIN_ID`, `BANK_ACCOUNT`, `BANK_ACCOUNT_NAME`, `BANK_BIN`, `BANK_NAME`, `SHOP_NAME`, and `SUPPORT_CONTACT`. Never commit `.env`.

Validate Compose syntax without printing resolved secret values:

```bash
docker compose config --quiet
```

## 3. Staging smoke test

```bash
docker compose build
docker compose up -d
docker compose ps
curl --fail http://127.0.0.1:3000/healthz
docker compose logs --tail=100 bot
```

The health response must be `{"status":"ok"}`. In `@minhbrand_bot`, test `/start`, `/myid`, `/product`, and an admin action from the configured admin account. Verify order creation, VietQR, payment confirmation, and delivery with a low-value transaction before production promotion.

## 4. Production updates

Deploy only reviewed code merged to `main` and accepted by CI:

```bash
git pull --ff-only
docker compose build --pull
docker compose up -d
docker compose ps
```

The health endpoint is bound to loopback only. The container runs as UID/GID `10001`, drops Linux capabilities, uses a read-only root filesystem, and stores SQLite in the `bot-data` volume.

The bot receives updates through long polling. Telegram makes long polling and webhooks mutually exclusive; Telegraf removes an existing webhook on startup. Run exactly **one replica** of the `bot` service and do not use `docker compose up --scale bot=...`. See [Telegram Bot API — Getting updates](https://core.telegram.org/bots/api#getting-updates).

## 5. Backup and recovery

The bot creates one SQLite snapshot on startup and then every `BACKUP_INTERVAL_HOURS` (24 by default), retaining snapshots for `BACKUP_RETENTION_DAYS` (14 by default). Primary data and backups use separate Docker volumes.

Regularly export snapshots to encrypted off-host storage:

```bash
mkdir -p backup-export
docker compose cp bot:/app/backups/. ./backup-export/
```

Test restoration monthly. To restore a verified snapshot:

```bash
docker compose stop bot
docker compose cp ./backup-export/shop-TIMESTAMP.db bot:/app/data/shop.db.restore
docker compose run --rm --entrypoint sh bot -c 'rm -f /app/data/shop.db-wal /app/data/shop.db-shm && cp /app/data/shop.db.restore /app/data/shop.db && rm /app/data/shop.db.restore'
docker compose up -d
curl --fail http://127.0.0.1:3000/healthz
```

Restoration replaces current data. Export the current volume first.

## 6. Operations

```bash
docker compose logs --tail=200 bot
docker compose restart bot
docker compose down
```

`docker compose down` retains volumes. Do not run it with `--volumes` unless you intentionally want to delete all live data and backups. Never paste `.env` into a support ticket.

Vietnamese instructions: [DEPLOYMENT.md](DEPLOYMENT.md).
