<p align="center">
  <img src="https://img.icons8.com/fluency/96/telegram-app.png" alt="Telegram Shop Bot" width="96"/>
</p>

<h1 align="center">🤖 Telegram Shop Bot</h1>

<p align="center">
  <strong>Bot bán hàng tự động trên Telegram với thanh toán QR VietQR</strong><br/>
  <em>Auto-selling Telegram bot with VietQR payment, stock management & Google Sheet sync</em>
</p>

<p align="center">
  <b>🇻🇳 Tiếng Việt</b> | <a href="README_EN.md">🇬🇧 English</a>
</p>

<p align="center">
  <a href="#-cài-đặt-nhanh"><img src="https://img.shields.io/badge/Cài_đặt-3_phút-brightgreen?style=for-the-badge" alt="Setup"/></a>
  <a href="https://github.com/kentzu213/telegram-shop-bot/stargazers"><img src="https://img.shields.io/github/stars/kentzu213/telegram-shop-bot?style=for-the-badge&color=yellow" alt="Stars"/></a>
  <a href="https://github.com/kentzu213/telegram-shop-bot/blob/main/LICENSE"><img src="https://img.shields.io/github/license/kentzu213/telegram-shop-bot?style=for-the-badge&color=blue" alt="License"/></a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Node.js-18+-339933?style=flat-square&logo=node.js&logoColor=white" alt="Node.js"/>
  <img src="https://img.shields.io/badge/Telegraf-4.x-229ED9?style=flat-square&logo=telegram&logoColor=white" alt="Telegraf"/>
  <img src="https://img.shields.io/badge/SQLite-3-003B57?style=flat-square&logo=sqlite&logoColor=white" alt="SQLite"/>
  <img src="https://img.shields.io/badge/VietQR-Payment-FF6B35?style=flat-square" alt="VietQR"/>
  <img src="https://img.shields.io/badge/Google_Sheets-Sync-34A853?style=flat-square&logo=googlesheets&logoColor=white" alt="Google Sheets"/>
</p>

---

## ✨ Tính năng nổi bật

| Tính năng | Mô tả |
|-----------|--------|
| 🛒 **Bán hàng tự động** | Khách chọn sản phẩm → thanh toán → nhận hàng tự động |
| 💳 **QR VietQR** | Tạo mã QR thanh toán tức thì, hỗ trợ 40+ ngân hàng VN |
| ⚡ **SePay webhook** | Báo admin mọi giao dịch tiền vào; tự giao hàng khi khớp đúng tài khoản/mã đơn/số tiền |
| 🏦 **2 ngân hàng** | Cho phép khách chọn ngân hàng khi thanh toán |
| 📦 **Quản lý kho** | Thêm/xem/xóa kho hàng, giao tài khoản tự động |
| 📊 **Google Sheet Sync** | Đồng bộ sản phẩm từ Google Sheet (tự động mỗi 5 phút) |
| 🔧 **Admin Panel** | Quản lý đơn hàng, sản phẩm, thống kê doanh thu |
| 📢 **Broadcast** | Gửi thông báo tới tất cả khách hàng |
| 🔄 **Giao hàng thủ công** | Admin cung cấp tài khoản trực tiếp cho sản phẩm hết kho |
| 🧭 **Menu nút ngữ cảnh** | Khách mua hàng/nạp ví bằng nút; admin có bảng thao tác riêng theo quyền |
| 👛 **Ví tự động** | Chọn nhanh số tiền nạp hoặc nhập tùy ý; SePay cộng ví đúng một lần |

## 🔄 Flow mua hàng

```
Khách: /menu → Chọn SP → Chọn SL → Chọn Bank
                        ↓
              Bot tạo QR VietQR → Khách quét mã
                        ↓
       SePay xác thực HMAC và đối chiếu giao dịch
                        ↓
           Bot tự động gửi tài khoản cho khách ✅
```

Nếu chưa cấu hình SePay hoặc đơn thiếu kho, admin vẫn có thể dùng `/confirm`. Xem cấu hình và kiểm thử an toàn trong [hướng dẫn triển khai](DEPLOYMENT.md).

## ⚡ Cài đặt nhanh

> 🚀 Triển khai bằng Docker, health check, sao lưu và quy trình thay token: [Hướng dẫn triển khai](DEPLOYMENT.md)

### Yêu cầu
- [Node.js](https://nodejs.org/) v18 trở lên
- Telegram Bot Token (từ [@BotFather](https://t.me/BotFather))
- Tài khoản ngân hàng (hỗ trợ [VietQR](https://vietqr.io/))

### 1️⃣ Clone & cài đặt

```bash
git clone https://github.com/kentzu213/telegram-shop-bot.git
cd telegram-shop-bot
npm install
```

### 2️⃣ Tạo Bot Telegram

1. Mở Telegram → tìm [@BotFather](https://t.me/BotFather) → gửi `/newbot`
2. Đặt tên bot → nhận **Bot Token**
3. Gửi `/myid` cho [@userinfobot](https://t.me/userinfobot) → nhận **Telegram ID**

### 3️⃣ Cấu hình

```bash
cp .env.example .env
```

Mở `.env` và điền thông tin:

```env
# Token từ @BotFather
BOT_TOKEN=1234567890:ABCdefGhIjKlMnOpQrS

# Telegram ID của admin
ADMIN_ID=123456789

# Ngân hàng (tra mã BIN: https://www.vietqr.io/danh-sach-ngan-hang)
BANK_BIN=970422
BANK_ACCOUNT=1234567890
BANK_ACCOUNT_NAME=NGUYEN VAN A
BANK_NAME=MB

# Thông tin shop
SHOP_NAME=My Shop
SUPPORT_CONTACT=@your_username
```

### 4️⃣ Chạy bot

```bash
npm start
```

> 💡 Dev mode (auto-restart): `npm run dev`

## 📋 Danh sách lệnh

<details>
<summary><b>👤 Lệnh người dùng</b></summary>

| Lệnh | Mô tả |
|-------|--------|
| `/start` | 🔄 Bắt đầu / Khởi động lại |
| `/menu` | 🧭 Mở menu nút ngữ cảnh |
| `/product` | 📦 Danh sách sản phẩm |
| `/nap [số tiền]` | 💰 Nạp số dư |
| `/checkpay` | 🔍 Kiểm tra thanh toán |
| `/hotro` | 🆘 Hỗ trợ (`/support` vẫn tương thích) |
| `/myid` | 🆔 Lấy Telegram ID |

</details>

<details>
<summary><b>🔧 Lệnh Admin</b></summary>

| Lệnh | Mô tả |
|-------|--------|
| `/admin` | 📊 Admin panel tổng quan |
| `/ai câu hỏi` | 🤖 Hỏi trợ lý AI chỉ dành cho admin |
| **Sản phẩm** | |
| `/listproduct` | Xem tất cả sản phẩm |
| `/addproduct catID \| tên \| giá` | Thêm sản phẩm mới |
| `/editprice ID giá` | Sửa giá |
| `/editname ID tên` | Sửa tên |
| `/toggleproduct ID` | Bật/tắt sản phẩm |
| `/deleteproduct ID` | Xóa sản phẩm |
| `/addcategory tên \| emoji` | Thêm danh mục |
| **Kho hàng** | |
| `/addstock ID` | Thêm tài khoản vào kho |
| `/viewstock ID` | Xem chi tiết, sửa hoặc xóa từng stock chưa bán |
| `/clearstock ID` | Xóa kho chưa bán |
| **Đơn hàng** | |
| `/confirm orderID` | ✅ Xác nhận & giao hàng |
| `/pending` | Xem đơn chờ |
| `/cancelorder orderID` | Hủy đơn |
| `/orders` | Đơn hàng gần đây |
| **Khác** | |
| `/stats` | Thống kê chi tiết |
| `/users` | Danh sách users |
| `/broadcast` | Gửi thông báo all users |
| `/sync` | Đồng bộ Google Sheet |
| `/setbank` | Xem thông tin ngân hàng |
| `/setshop` | Xem/sửa thông tin shop |

</details>

Bot đăng ký menu lệnh quản trị riêng cho chat có `ADMIN_ID`; tài khoản khác chỉ thấy các lệnh khách hàng. Admin cần mở chat riêng với bot và gửi `/start` ít nhất một lần để Telegram nhận diện chat.

Trợ lý `/ai` có tool đọc dữ liệu đã lọc và một allowlist hành động quản trị. Mọi thao tác ghi đều hiện preview **Xác nhận/Hủy**, có hạn dùng, audit log và snapshot trước khi đổi SQLite; stock secret, dữ liệu khách hàng, shell, SQL tùy ý và deploy không được cấp cho AI. Admin có thể bấm **Chat với AI** để chuyển mọi tin nhắn text sang AI cho đến khi bấm **Dừng chat với AI**. Xem [hướng dẫn AI cho admin](docs/admin-ai.md).

## 🧭 Menu bàn phím không cần gõ lệnh

Gửi `/start` hoặc `/menu` một lần để bot cài bàn phím cố định. Sau đó bấm biểu tượng **bàn phím bốn ô cạnh nút emoji** để ẩn/hiện menu:

- Khách hàng thấy thẳng các nút sản phẩm, danh mục, nạp ví, đơn hàng, tài khoản và hỗ trợ; không còn nút tiêu đề **KHÁCH HÀNG**.
- Chỉ đúng `ADMIN_ID` mới có thêm phần **QUẢN TRỊ** ở dưới, bao gồm hai nút bật/tắt chat AI và các nghiệp vụ quản trị khác.
- Mỗi reply-keyboard button được nối trực tiếp vào action hoặc màn hình nút ngữ cảnh tiếp theo; không yêu cầu nhập lệnh.
- Tạo danh mục là hội thoại hai bước: nhập tên, sau đó gửi emoji hoặc URL ảnh PNG/JPG công khai. Telegram không hiển thị SVG tùy biến ngay trên inline button; ảnh URL được dùng làm ảnh đầu danh mục, còn nút dùng emoji.
- **Quản trị → Quản lý danh mục** có các nút tạo, sửa tên & icon, ẩn/hiện và xóa. Luồng sửa nhận tên mới trước, sau đó nhận ID custom emoji; tên và icon chỉ được lưu cùng lúc khi ID hợp lệ. Danh mục ẩn biến mất khỏi menu danh mục của khách nhưng vẫn giữ sản phẩm/lịch sử và vẫn xuất hiện trong trang quản trị để bật lại. Xóa yêu cầu xác nhận và chỉ áp dụng cho danh mục rỗng.
- **Quản trị → Cài đặt → Sửa thông tin** cho phép admin gửi một dòng theo mẫu `Tên shop | @tai_khoan_ho_tro`. Tên shop và liên hệ hỗ trợ được áp dụng ngay, lưu trong SQLite và còn nguyên sau khi bot khởi động lại; thông tin ngân hàng và secret không thuộc luồng này. `/setshop` vẫn dùng được và lưu vào cùng nơi.
- Danh mục được cấu hình `custom_emoji_id` sẽ dùng icon custom emoji trên nút và tiêu đề. Trong **Xem tồn kho**, chọn từng stock để xem chi tiết, sửa hoặc xóa; stock đã bán được khóa để giữ nguyên lịch sử đơn hàng.
- Menu danh mục khách hàng hiển thị theo lưới tối đa 2 cột, giữ icon riêng của từng danh mục và có nút **Làm mới**/**Quay lại** ở cuối. Nút xanh khi có ít nhất một sản phẩm đang bật còn stock cục bộ hoặc stock Sheet; nút đỏ khi toàn bộ sản phẩm đang bật hết hàng.
- Nút sản phẩm hiển thị theo thứ tự **Giá | Tồn kho | Tên app**, dùng `products.custom_emoji_id` làm icon riêng, màu xanh khi còn hàng và màu đỏ khi hết hàng. **Quản trị → Quản lý sản phẩm → Sửa tên & icon** cũng dùng luồng hai bước. Xem [hướng dẫn custom emoji](docs/product-custom-emojis.md).
- Các lệnh cũ vẫn được giữ để tương thích và xử lý sự cố.

## 👛 Nạp tiền vào ví

Nút **Nạp tiền vào ví** cung cấp các mức 10.000đ, 50.000đ, 100.000đ, 200.000đ, 300.000đ, 500.000đ và lựa chọn nhập số khác. Mỗi yêu cầu tạo một mã `PAY......` riêng. SePay chỉ cộng ví khi đúng tài khoản nhận, đúng mã và đúng số tiền; webhook lặp không cộng hai lần. Khách và admin đều nhận thông báo sau khi cộng thành công.

## 📦 Thêm hàng vào kho

Cách chính: **Quản trị → Thêm tồn kho → chọn sản phẩm → gửi dữ liệu**, mỗi mặt hàng một dòng. Lệnh dưới đây chỉ là đường dự phòng:

```bash
# Bước 1: Gửi lệnh với product ID
/addstock 1

# Bước 2: Gửi danh sách tài khoản (mỗi dòng 1 cái)
email1@example.com|password1|extra_info1
email2@example.com|password2|extra_info2
```

## 📊 Google Sheet Sync (tùy chọn)

Đồng bộ danh sách sản phẩm tự động từ Google Sheet:

| Cột | Nội dung |
|-----|----------|
| A | ID |
| B | Tên sản phẩm |
| C | Giá bán |
| D | Đơn vị |
| E | Số lượng trong kho |
| F | Còn hàng (TRUE/FALSE) |
| G | Link liên hệ (Zalo...) |
| H | Ghi chú / Khuyến mãi |

**Cách setup:**
1. **File → Chia sẻ → Xuất bản lên web → Xuất bản**
2. Copy Sheet ID từ URL: `docs.google.com/spreadsheets/d/[SHEET_ID]/edit`
3. Thêm vào `.env`:
```env
GOOGLE_SHEET_ID=your_sheet_id
SHEET_SYNC_INTERVAL=5
```

## 🏦 Hỗ trợ 2 ngân hàng

Thêm ngân hàng thứ 2 vào `.env` để khách được chọn:

```env
BANK2_BIN=970436
BANK2_ACCOUNT=9876543210
BANK2_ACCOUNT_NAME=NGUYEN VAN A
BANK2_NAME=VCB
```

## 🛠 Tech Stack

| Công nghệ | Mô tả |
|-----------|--------|
| [Node.js](https://nodejs.org/) | Runtime JavaScript |
| [Telegraf v4](https://github.com/telegraf/telegraf) | Telegram Bot Framework |
| [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) | SQLite database |
| [VietQR API](https://vietqr.io/) | Tạo mã QR thanh toán |
| [nanoid](https://github.com/ai/nanoid) | Tạo mã thanh toán unique |

## 📁 Cấu trúc dự án

```
telegram-shop-bot/
├── .env.example          # Mẫu cấu hình (copy → .env)
├── package.json          # Dependencies
├── LICENSE               # MIT License
├── data/                 # SQLite database (tự tạo)
└── src/
    ├── bot.js            # 🚀 Entry point
    ├── config.js         # ⚙️ Load cấu hình từ .env
    ├── database.js       # 💾 Schema + seed data
    ├── commands/          # 📋 Lệnh user
    │   ├── start.js
    │   ├── menu.js
    │   ├── product.js
    │   ├── nap.js
    │   ├── checkpay.js
    │   ├── support.js
    │   └── myid.js
    ├── handlers/          # ⚡ Xử lý callback & admin
    │   ├── adminActions.js
    │   ├── paymentConfirm.js
    │   ├── productSelect.js
    │   └── quantitySelect.js
    ├── services/          # 🔧 Business logic
    │   ├── orderService.js
    │   ├── paymentService.js
    │   ├── productService.js
    │   ├── sheetSync.js
    │   └── userService.js
    └── utils/             # 🎨 Keyboard & messages
        ├── keyboard.js
        └── messages.js
```

## 📞 Liên hệ & Hỗ trợ

Nếu cần hỗ trợ cài đặt, tùy chỉnh, hoặc có câu hỏi:

| Kênh | Liên hệ |
|------|---------|
| 💬 **Telegram** | [@kentng](https://t.me/kentng) |
| 📱 **Nhóm Zalo** | [Tham gia nhóm chat](https://zalo.me/g/agaxxc699) |
| 🐛 **Bug Report** | [Mở Issue](https://github.com/kentzu213/telegram-shop-bot/issues) |

## 🤝 Đóng góp

Pull requests luôn được chào đón! Với thay đổi lớn, vui lòng mở issue trước.

## 📄 License

[MIT](LICENSE) © 2026 [kentzu213](https://github.com/kentzu213)

## 📚 Tài liệu dự án

- [🚀 Triển khai và vận hành](DEPLOYMENT.md)
- [🧾 Changelog](CHANGELOG.md)
- [🗺️ Roadmap](ROADMAP.md)

---

<p align="center">
  Nếu project hữu ích, hãy ⭐ <b>star</b> repo nhé!<br/>
  💬 Liên hệ: <a href="https://t.me/kentng">@kentng</a> | 📱 <a href="https://zalo.me/g/agaxxc699">Nhóm Zalo</a>
</p>
