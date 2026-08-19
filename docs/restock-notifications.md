# Thông báo sản phẩm có hàng trở lại

Bot tự gửi thông báo cho mọi người dùng đã từng đăng ký bằng `/start` khi một sản phẩm đang hiển thị chuyển từ tồn kho `0` sang lớn hơn `0`.

## Nguồn kích hoạt

- Quản trị viên thêm stock trực tiếp bằng menu **Thêm tồn kho** hoặc lệnh `/addstock`.
- Google Sheet cập nhật tồn kho của một sản phẩm đã tồn tại từ `0` lên số dương.

Sản phẩm mới tạo, sản phẩm đã còn hàng, sản phẩm đang tắt, danh mục đang ẩn và danh mục cha đang ẩn không phát thông báo. Mỗi lần bổ sung thêm cho một sản phẩm vẫn còn hàng cũng không gửi lặp.

## Nội dung khách nhận

Tin nhắn dùng custom emoji của sản phẩm nếu có, kèm tên đã được escape an toàn và số tồn hiện tại. Hai nút nằm cùng một hàng:

- **Xem sản phẩm** mở thẻ chi tiết và bộ chọn số lượng.
- **Mua ngay** đi thẳng vào luồng mua một sản phẩm, sau đó khách chọn ngân hàng nếu shop có nhiều tài khoản nhận.

Việc gửi lỗi tới một tài khoản đã chặn bot không làm dừng các người nhận còn lại. Sau khi thêm kho trực tiếp, quản trị viên thấy số thông báo gửi thành công trên tổng số người đăng ký.

## Kiểm tra sau triển khai

Chọn một sản phẩm đang hết hàng, thêm một stock thử và xác nhận bot chỉ gửi đúng một thông báo. Xóa stock thử để đưa tồn về `0` trước khi lặp lại kịch bản. Không dùng dữ liệu stock thật trong nội dung kiểm thử hoặc nội dung công khai.
