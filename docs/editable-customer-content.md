# Editable customer content

Administrators can edit three customer-facing messages from **Administration → Settings** without changing environment files or restarting the bot:

| Setting | Where it appears | Available placeholders | Maximum length |
|---|---|---|---:|
| Greeting | First part of `/start` and `/menu` | `{name}`, `{shop}`, `{support}` | 1,000 |
| Introduction | Second part of `/start` and `/menu` | `{shop}`, `{support}` | 1,500 |
| Support information | `/hotro` and the support button | `{shop}`, `{support}` | 3,500 |

Each value is stored independently in the SQLite `app_settings` table and remains available after a restart. The bot HTML-escapes both administrator-authored text and placeholder values before sending it to Telegram. Unknown placeholder-like text is displayed literally.

**Shop name & contact** remains a separate settings action. Changing these values immediately affects `{shop}` and `{support}` wherever the placeholders are used.

## Hướng dẫn quản trị

1. Mở **Quản trị → Cài đặt**.
2. Chọn **Sửa lời chào**, **Sửa giới thiệu** hoặc **Sửa thông tin hỗ trợ**.
3. Xem nội dung hiện tại và danh sách biến được phép, sau đó gửi nội dung mới. Gõ `/cancel` để hủy.
4. Gửi `/start`, `/menu` hoặc mở **Hỗ trợ** để kiểm tra nội dung đã áp dụng.

Không nhập mã HTML để định dạng: bot sẽ hiển thị dưới dạng văn bản an toàn. Các biến `{name}`, `{shop}`, `{support}` được thay thế tại thời điểm gửi tin nhắn.
