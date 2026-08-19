# Danh mục hai cấp, sản phẩm hot và Combo giá tốt

## Phạm vi dữ liệu

- Danh mục chỉ có tối đa hai cấp. Một danh mục cấp 2 chỉ được chọn danh mục cấp 1 làm cha.
- Sản phẩm có thứ tự riêng trong danh mục. Khi hiển thị toàn shop, bot ưu tiên thứ tự danh mục rồi đến thứ tự sản phẩm.
- Mỗi combo hiện tiêu thụ một stock của từng sản phẩm thành phần cho mỗi combo được mua.
- Tồn combo là số stock chưa bán thấp nhất trong các sản phẩm thành phần. Combo chưa có thành phần luôn hết hàng.

## Quản trị danh mục

Vào **Quản trị → Quản lý danh mục**.

- **Tạo danh mục**: nhập tên, ID custom emoji, rồi ID danh mục cha. Gửi `-` ở bước cha để tạo danh mục cấp 1.
- **Sửa tên & icon**: sau tên và icon, gửi `-` để giữ nguyên cha, `0` để chuyển thành cấp 1, hoặc ID của một danh mục cấp 1.
- **Sắp xếp danh mục**: số nhỏ hơn được hiển thị trước trong cùng cấp.
- Danh mục còn sản phẩm hoặc còn danh mục con không thể bị xóa.

Khách mở danh mục cha sẽ thấy các danh mục con và nút **Xem tất cả sản phẩm**. Khi mở danh mục con, nút quay lại trở về đúng danh mục cha.

## Sắp xếp sản phẩm

Vào **Quản trị → Quản lý sản phẩm → Sắp xếp sản phẩm**, chọn sản phẩm và nhập số thứ tự. Số nhỏ hơn hiển thị trước trong danh mục đó.

## Sản phẩm đang hot

Vào **Quản trị → Quản lý danh mục → Sản phẩm đang hot** để:

- sửa tên và ID custom emoji của mục;
- bấm từng sản phẩm để thêm hoặc bỏ khỏi danh sách hot.

Thao tác này không nhân bản sản phẩm và không tạo kho riêng; tồn kho luôn là tồn của sản phẩm gốc.

## Combo giá tốt

Vào **Quản trị → Quản lý danh mục → Combo giá tốt**.

1. Tạo combo bằng tên, giá và ID custom emoji.
2. Mở combo vừa tạo.
3. Chọn **Sản phẩm thành phần** rồi bấm từng sản phẩm để thêm hoặc bỏ.

Khi khách mua `N` combo, bot giữ đồng thời `N` stock của từng sản phẩm thành phần trong một transaction SQLite. Chỉ khi giữ đủ toàn bộ thành phần bot mới xếp hàng giao. Tin nhắn giao hàng ghi rõ tên sản phẩm cạnh từng key/tài khoản và giữ nguyên lời nhắn riêng của stock đó.

Combo không hỗ trợ giao thủ công thiếu thành phần. Nếu tồn thay đổi giữa lúc tạo đơn và xác nhận thanh toán, hãy bổ sung tồn cho sản phẩm thiếu rồi xác nhận lại; không thay combo bằng dữ liệu thủ công không đối chiếu được.
