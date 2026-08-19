# Mô tả sản phẩm và lời nhắn riêng theo stock

## Mô tả công khai và ảnh sản phẩm

Vào **Quản trị → Quản lý sản phẩm → Sửa mô tả & ảnh**, sau đó chọn sản phẩm.

1. Gửi mô tả công khai, tối đa 600 ký tự.
2. Gửi ảnh sản phẩm, gửi `=` để giữ ảnh hiện tại, hoặc `-` để bỏ ảnh.

Có thể gửi ngay một ảnh kèm caption ở bước đầu để cập nhật cả mô tả và ảnh. Gửi `-` ngay bước đầu để xóa cả hai. Bot lưu `file_id` do Telegram cấp, không tải ảnh về máy chủ. Mô tả này tách biệt với cột mô tả Google Sheet nên đồng bộ Sheet không ghi đè.

Khách nhìn thấy mô tả và ảnh sau khi chọn sản phẩm, trước khi chọn số lượng hoặc liên hệ mua.

## Lời nhắn riêng cho từng mã tồn kho

Khi thêm nhiều stock, mỗi dòng dùng định dạng:

```text
dữ liệu stock || lời nhắn riêng cho người mua
```

Ví dụ:

```text
AAAA-BBBB-CCCC || Tải bộ cài tại https://example.com/download và làm theo hướng dẫn trong thư mục.
email@example.com|mat-khau || Đăng nhập lần đầu rồi đổi mật khẩu ngay.
```

Phần trước `||` là key/tài khoản. Phần sau là lời nhắn chỉ đi kèm đúng stock đó. Dòng không có `||` vẫn được chấp nhận và không có lời nhắn riêng.

Để sửa sau khi nhập, vào **Xem tồn kho → chọn sản phẩm → mở chi tiết stock → Sửa lời nhắn**. Gửi `-` để xóa lời nhắn. Stock đã bán bị khóa để bảo toàn lịch sử giao hàng.

Bot ghép lời nhắn vào cả giao tự động qua SePay, xác nhận đơn từ quản trị/AI và giao thủ công. Nội dung stock cùng lời nhắn riêng không xuất hiện trong danh sách công khai, prompt AI hay preview AI.

---

## English

Open **Administration → Product management → Edit description & image**. Send a public description (up to 600 characters), then send a photo, `=` to keep the current image, or `-` to remove it. You may send a photo with a caption in the first step. Sending `-` first clears both fields. Telegram's durable `file_id` is stored; the image is not downloaded to the server, and Sheet synchronization does not overwrite this independent description.

For a stock-specific buyer note, enter one item per line as `stock data || private buyer message`. You may later edit it from **View stock → product → stock details → Edit message**. The note is sent only beside that exact delivered key/account and remains outside public lists and AI context.
