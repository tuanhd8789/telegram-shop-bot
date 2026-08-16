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

## 4. SePay webhook tự động xác nhận

Endpoint `POST /webhooks/sepay` dùng chung cổng với health check. Khi chưa có `SEPAY_WEBHOOK_SECRET`, endpoint trả `503` và thanh toán vẫn ở chế độ xác nhận thủ công.

Không dùng SePay API Token cho webhook. Tạo một secret ngẫu nhiên tối thiểu 32 ký tự ngay trên terminal hoặc trong màn hình HMAC của SePay, sau đó nhập **cùng một giá trị** trực tiếp vào `.env` và SePay; không gửi qua issue/chat:

```bash
openssl rand -hex 32
```

Trong `.env`:

```dotenv
SEPAY_WEBHOOK_SECRET=gia_tri_HMAC_khong_duoc_commit
SEPAY_SIGNATURE_TOLERANCE_SECONDS=300
```

Kiểm thử trước bằng **Test Mode** của SePay:

1. Trong Test Mode, cấu hình nhận diện mã thanh toán: tiền tố `PAY`, hậu tố tối thiểu `6`, tối đa `6`, loại `Số và chữ`.
2. Tạo webhook với URL `https://bottele.dichvuai.top/webhooks/sepay`, sự kiện `Có tiền vào`, `application/json`, chọn đúng tài khoản nhận và bật tự động gửi lại.
3. Chọn xác thực `HMAC-SHA256`, nhập secret ở trên; bật bỏ qua giao dịch không có mã và lọc tiền tố `PAY`.
4. Recreate container sau khi sửa `.env`, tạo một đơn trong bot, rồi mô phỏng đúng mã `PAY......` và đúng số tiền trong Test Mode.
5. Xác nhận SePay nhận HTTP `200` với `{"success":true}`, đơn chuyển `pending → paid → delivered`, khách nhận đúng hàng và replay cùng transaction không giao lần hai.

Test Mode và Live là hai cấu hình tách biệt. Sau khi test đạt, tạo secret Live mới, thay secret trong `.env`, recreate container, cấu hình lại webhook Live rồi thử một giao dịch giá trị nhỏ. Secret bị quên/lộ phải được rotate ở cả SePay và server. Xem [xác thực HMAC](https://developer.sepay.vn/vi/sepay-webhooks/xac-thuc), [payload/idempotency](https://developer.sepay.vn/vi/sepay-webhooks/tich-hop-webhook) và [cấu trúc mã thanh toán](https://developer.sepay.vn/vi/sepay-webhooks/cau-hinh-ma-thanh-toan).

Bot chỉ ghi nhận giao dịch `in` gửi vào đúng tài khoản đã cấu hình. Mỗi giao dịch hợp lệ đều được lưu và báo admin trên Telegram đúng một lần, kể cả khi không có hoặc không khớp mã đơn; `transaction_id` là duy nhất trong SQLite. Chỉ giao dịch khớp chính xác mã đơn đang chờ và số tiền mới được dùng để thanh toán/giao hàng. Đơn đủ kho được giữ hàng và đưa vào hàng đợi Telegram bền vững; gửi lỗi sẽ retry sau restart. Đơn đã trả đủ nhưng thiếu kho ở trạng thái `paid` và báo admin, không tự hoàn tiền hoặc giao thiếu.

## 5. Production và cập nhật

Đặt thư mục này trên máy chủ production riêng. Chỉ triển khai code đã merge vào `main` và đã qua CI/review:

```bash
git pull --ff-only
docker compose build --pull
docker compose up -d
docker compose ps
```

Mặc định Compose chỉ công bố health endpoint trên loopback (`HEALTH_BIND_ADDRESS=127.0.0.1`). Nếu reverse proxy chạy trên máy khác, đặt biến này thành IP LAN của máy bot (ví dụ `HEALTH_BIND_ADDRESS=10.10.224.35`) và chỉ cho phép IP máy proxy truy cập cổng health qua firewall; tránh `0.0.0.0` nếu không cần thiết. Container vẫn chạy bằng UID/GID `10001`, bỏ Linux capabilities, dùng filesystem chỉ đọc và lưu SQLite trong volume `bot-data`.

Bot nhận cập nhật bằng long polling. Telegram quy định long polling và webhook loại trừ nhau; Telegraf xóa webhook khi khởi động. Chỉ chạy **một replica** của service `bot`, không dùng `docker compose up --scale bot=...`. Xem [Telegram Bot API — Getting updates](https://core.telegram.org/bots/api#getting-updates).

## 6. Sao lưu và khôi phục

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

## 7. Dừng và xử lý sự cố

```bash
docker compose logs --tail=200 bot
docker compose restart bot
docker compose down
```

`docker compose down` giữ nguyên các volume. Không dùng `docker compose down --volumes` trừ khi chủ động muốn xóa toàn bộ dữ liệu và bản sao lưu.

Các lỗi khởi động thường gặp được báo rõ khi thiếu token, ID quản trị, thông tin ngân hàng hoặc HMAC secret quá ngắn. Nếu webhook trả `401`, kiểm tra secret, đồng hồ/NTP và raw-body signature; nếu trả `503`, secret chưa được nạp vào container. Không dán `.env` hoặc payload giao dịch đầy đủ vào ticket hỗ trợ.

English instructions: [DEPLOYMENT_EN.md](DEPLOYMENT_EN.md).
