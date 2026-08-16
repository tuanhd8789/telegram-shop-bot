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

## 4. Automatic SePay payment webhook

`POST /webhooks/sepay` shares the health-check port. Until `SEPAY_WEBHOOK_SECRET` is set, it returns `503` and manual confirmation remains available.

Do not use a SePay API Token for this webhook. Generate a random secret of at least 32 characters locally (or in SePay's HMAC form), then enter the **same value** directly in `.env` and SePay. Never send it through an issue or chat:

```bash
openssl rand -hex 32
```

```dotenv
SEPAY_WEBHOOK_SECRET=uncommitted_HMAC_value
SEPAY_SIGNATURE_TOLERANCE_SECONDS=300
```

Use SePay **Test Mode** first:

1. Configure payment-code recognition with prefix `PAY`, minimum suffix `6`, maximum suffix `6`, and alphanumeric characters.
2. Create a webhook for `https://bottele.dichvuai.top/webhooks/sepay`: incoming transfers, `application/json`, the intended receiving account, and automatic retries.
3. Select `HMAC-SHA256`, enter the secret, skip transactions without a payment code, and filter on prefix `PAY`.
4. Recreate the container after editing `.env`; create an order and simulate the exact `PAY......` code and amount in Test Mode.
5. Confirm SePay receives HTTP `200` with `{"success":true}`, the order moves `pending → paid → delivered`, the customer gets the stock, and replaying the same transaction does not deliver twice.

Test Mode and Live are separate. After successful testing, generate a new Live secret, update `.env`, recreate the container, configure the Live webhook, and send one low-value real transaction. Rotate the secret in both SePay and the server if it is lost or exposed. See [HMAC authentication](https://developer.sepay.vn/vi/sepay-webhooks/xac-thuc), [payload/idempotency](https://developer.sepay.vn/vi/sepay-webhooks/tich-hop-webhook), and [payment-code rules](https://developer.sepay.vn/vi/sepay-webhooks/cau-hinh-ma-thanh-toan).

The bot records only incoming transfers to a configured account. Every valid transfer is persisted and reported to the Telegram admin exactly once, even when its payment code is missing or does not match an order; SQLite enforces a unique SePay transaction ID. Only an exact pending-order code and amount match can pay an order or deliver stock. In-stock orders reserve stock and enter a persistent Telegram delivery queue; failures retry after restart. A fully paid out-of-stock order remains `paid` and alerts the admin instead of silently under-delivering.

## 5. Production updates

Deploy only reviewed code merged to `main` and accepted by CI:

```bash
git pull --ff-only
docker compose build --pull
docker compose up -d
docker compose ps
```

By default, the health endpoint is bound to loopback (`HEALTH_BIND_ADDRESS=127.0.0.1`). When the reverse proxy runs on another host, set this variable to the bot host's private LAN address (for example, `HEALTH_BIND_ADDRESS=10.10.224.35`) and restrict the health port to the proxy host in the firewall; avoid `0.0.0.0` unless it is required. The container runs as UID/GID `10001`, drops Linux capabilities, uses a read-only root filesystem, and stores SQLite in the `bot-data` volume.

The bot receives updates through long polling. Telegram makes long polling and webhooks mutually exclusive; Telegraf removes an existing webhook on startup. Run exactly **one replica** of the `bot` service and do not use `docker compose up --scale bot=...`. See [Telegram Bot API — Getting updates](https://core.telegram.org/bots/api#getting-updates).

## 6. Backup and recovery

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

## 7. Operations

```bash
docker compose logs --tail=200 bot
docker compose restart bot
docker compose down
```

`docker compose down` retains volumes. Do not run it with `--volumes` unless you intentionally want to delete all live data and backups. A webhook `401` usually means the secret, timestamp, NTP, or raw-body signature is wrong; `503` means the secret is not loaded. Never paste `.env` or a full transaction payload into a support ticket.

Vietnamese instructions: [DEPLOYMENT.md](DEPLOYMENT.md).
