# Hướng dẫn triển khai

Tài liệu này triển khai bot bằng Docker Compose trên một máy Linux có dữ liệu SQLite bền vững, health check và sao lưu tự động.

> [!CAUTION]
> Token bot đã từng được dán vào issue phải được xem là đã lộ. Vào `@BotFather`, dùng `/revoke` cho `@minhbrand_bot`, sau đó lấy token mới bằng `/token`. Không dùng lại token cũ và không ghi token vào Git, ảnh chụp hoặc log hỗ trợ. Telegram xác nhận token có toàn quyền điều khiển bot và [có thể thu hồi bất kỳ lúc nào](https://core.telegram.org/bots/tutorial#obtain-your-bot-token).

## 1. Điều kiện

- Docker Engine 24+ và Docker Compose v2.
- Máy chủ có kết nối HTTPS ra `api.telegram.org`.
- Token Telegram mới, Telegram ID quản trị và thông tin tài khoản nhận VietQR.
- Một thư mục triển khai chỉ người vận hành được truy cập.

## 2. Cấu hình bí mật

```bash
cp .env.example .env
chmod 600 .env
```

Điền tối thiểu `BOT_TOKEN`, `ADMIN_ID`, `BANK_ACCOUNT`, `BANK_ACCOUNT_NAME`, `BANK_BIN`, `BANK_NAME`, `SHOP_NAME` và `SUPPORT_CONTACT`. Không commit `.env`. `ADMIN_ID` phải là ID số của tài khoản quản trị, không phải username.

Kiểm tra cú pháp Compose mà không in giá trị bí mật:

```bash
docker compose config --quiet
```

## 3. Chạy bản thử nghiệm

```bash
docker compose build
docker compose up -d
docker compose ps
curl --fail http://127.0.0.1:3000/healthz
docker compose logs --tail=100 bot
```

Kết quả health check phải là `{"status":"ok"}`. Sau đó mở `@minhbrand_bot`, chạy `/start`, `/myid`, `/product` và kiểm tra quản trị bằng đúng tài khoản có `ADMIN_ID` đã cấu hình. Chỉ đưa vào production sau khi luồng tạo đơn, VietQR và xác nhận giao hàng đã được kiểm tra với giao dịch giá trị nhỏ.

## 4. Production và cập nhật

Đặt thư mục này trên máy chủ production riêng. Chỉ triển khai code đã merge vào `main` và đã qua CI/review:

```bash
git pull --ff-only
docker compose build --pull
docker compose up -d
docker compose ps
```

Compose chỉ công bố health endpoint trên loopback, chạy tiến trình bằng UID/GID `10001`, bỏ Linux capabilities, dùng filesystem chỉ đọc và lưu SQLite trong volume `bot-data`.

Bot nhận cập nhật bằng long polling. Telegram quy định long polling và webhook loại trừ nhau; Telegraf xóa webhook khi khởi động. Chỉ chạy **một replica** của service `bot`, không dùng `docker compose up --scale bot=...`. Xem [Telegram Bot API — Getting updates](https://core.telegram.org/bots/api#getting-updates).

## 5. Sao lưu và khôi phục

Bot tạo một SQLite snapshot khi khởi động, sau đó mỗi `BACKUP_INTERVAL_HOURS` (mặc định 24 giờ), giữ trong `BACKUP_RETENTION_DAYS` (mặc định 14 ngày). Dữ liệu chính và snapshot nằm ở hai Docker volume riêng.

Xuất snapshot định kỳ ra nơi lưu trữ ngoài máy chủ:

```bash
mkdir -p backup-export
docker compose cp bot:/app/backups/. ./backup-export/
```

Nên đồng bộ `backup-export/` sang kho mã hóa ngoài máy chủ và diễn tập khôi phục hàng tháng. Để khôi phục một snapshot đã kiểm tra:

```bash
docker compose stop bot
docker compose cp ./backup-export/shop-TIMESTAMP.db bot:/app/data/shop.db.restore
docker compose run --rm --entrypoint sh bot -c 'rm -f /app/data/shop.db-wal /app/data/shop.db-shm && cp /app/data/shop.db.restore /app/data/shop.db && rm /app/data/shop.db.restore'
docker compose up -d
curl --fail http://127.0.0.1:3000/healthz
```

Khôi phục sẽ thay dữ liệu hiện tại; luôn giữ một bản xuất của volume hiện tại trước khi thực hiện.

## 6. Dừng và xử lý sự cố

```bash
docker compose logs --tail=200 bot
docker compose restart bot
docker compose down
```

`docker compose down` giữ nguyên các volume. Không dùng `docker compose down --volumes` trừ khi chủ động muốn xóa toàn bộ dữ liệu và bản sao lưu.

Các lỗi khởi động thường gặp được báo rõ khi thiếu token, ID quản trị hoặc thông tin ngân hàng. Nếu health check chưa lên, xem log; không dán `.env` vào ticket hỗ trợ.

English instructions: [DEPLOYMENT_EN.md](DEPLOYMENT_EN.md).
