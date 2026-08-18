# Trợ lý AI có hành động cho admin

## Phạm vi v1.9.0

Chỉ tài khoản Telegram có ID khớp `ADMIN_ID` được dùng `/ai` và chế độ **Chat với AI**. AI có một registry tool cố định; model không nhận shell, SQL tùy ý, file `.env`, token, secret hoặc quyền deploy.

Tool đọc chạy ngay và chỉ trả dữ liệu đã lọc. Tool ghi luôn tạo bản xem trước với nút **Xác nhận/Hủy**, có hạn 10 phút và không thay đổi dữ liệu trước khi admin xác nhận. Yêu cầu và kết quả được lưu trong `ai_action_requests` làm audit log bền vững.

Nội dung hội thoại không được lưu. Chế độ bật/tắt chat vẫn được giữ trong SQLite qua restart.

## Luồng nghiệp vụ

1. Admin mô tả yêu cầu bằng tiếng Việt.
2. Provider chọn một tool trong allowlist và gửi tham số có cấu trúc.
3. Tool đọc được chạy ngay; dữ liệu kết quả được trả lại model để soạn câu trả lời có căn cứ.
4. Tool ghi chỉ tạo preview và mã audit. Mỗi yêu cầu chỉ được có một thay đổi ghi.
5. Admin bấm **Xác nhận** hoặc **Hủy**. Callback kiểm tra lại `ADMIN_ID`, trạng thái, hạn dùng và khóa chống replay.
6. Với thay đổi SQLite, bot tạo snapshot `pre-ai-*.db`, chạy thao tác có transaction/kiểm tra khóa ngoại rồi cập nhật audit log.
7. Các bước cần dữ liệu riêng như nội dung stock hoặc giao hàng thủ công sẽ tắt chế độ AI và chuyển sang form bảo mật của bot; dữ liệu đó không gửi tới provider.

## Tool được cấp

### Đọc tự động

- Tổng quan shop và thống kê.
- Danh mục, sản phẩm và số lượng tồn kho.
- ID stock chưa bán, không có nội dung stock.
- Đơn hàng đã bỏ Telegram ID, tên khách và mã thanh toán.
- Lịch sử hành động AI gần đây.

### Ghi sau xác nhận

- Tạo, sửa hoặc xóa danh mục rỗng.
- Tạo, sửa, bật/tắt hoặc xóa sản phẩm chưa có đơn.
- Xóa một stock chưa bán hoặc dọn toàn bộ stock chưa bán.
- Mở luồng thêm/sửa stock bảo mật.
- Hủy đơn pending; xác nhận/giao đơn hoặc chuyển sang giao thủ công bảo mật khi thiếu kho.
- Broadcast văn bản sau khi xem trước số người nhận và nội dung.
- Đồng bộ Google Sheet đã cấu hình.

Thông tin ngân hàng đầy đủ, thay đổi `.env`, secret, nội dung stock, dữ liệu định danh khách hàng, shell, SQL tùy ý và deploy luôn nằm ngoài allowlist. Tên shop/hỗ trợ hiện lấy từ biến môi trường nên AI chỉ được đọc; thay đổi chúng vẫn dùng quy trình cấu hình/deploy của người vận hành.

## Ví dụ sử dụng

```text
Cho tôi biết sản phẩm Autodesk nào đang hết kho
Đổi giá sản phẩm #9 thành 650000
Tắt sản phẩm #10
Mở bước thêm stock cho sản phẩm #9
Hủy đơn #123
Gửi thông báo “Shop bảo trì lúc 22:00” cho toàn bộ khách
```

Các yêu cầu đọc trả kết quả ngay. Yêu cầu ghi hiện preview; chỉ nút **Xác nhận** mới thực thi.

## Cấu hình provider

```dotenv
AI_ENABLED=true
AI_BASE_URL=http://host.docker.internal:7317/v1
AI_API_KEY=khong_gui_qua_chat_va_khong_commit
AI_MODEL=ten_model_tai_provider
AI_API_MODE=chat_completions
AI_TIMEOUT_MS=45000
AI_MAX_TOKENS=700
```

Provider phải tương thích OpenAI Chat Completions và hỗ trợ `tools`/`tool_calls`. Chỉ lưu API key trong `.env` của server và giữ file ở quyền `600`.

Nếu provider chạy trong một Docker Compose project khác, nối qua network nội bộ:

```dotenv
AI_BASE_URL=http://provider-container:provider-port/v1
AI_PROVIDER_NETWORK=provider_compose_network
```

```bash
docker compose -f compose.yaml -f compose.ai-provider.yaml config --quiet
docker compose -f compose.yaml -f compose.ai-provider.yaml up -d --build
```

## Kiểm tra và khôi phục

- Xem audit bằng cách hỏi AI “xem lịch sử hành động AI” hoặc truy vấn bảng `ai_action_requests` khi xử lý sự cố.
- Request `pending` tự hết hạn sau 10 phút; callback đã dùng không thể chạy lại.
- Snapshot trước hành động DB nằm trong volume backup. Làm theo [hướng dẫn khôi phục](../DEPLOYMENT.md#6-sao-lưu-và-khôi-phục) nếu cần phục hồi thủ công.
- Broadcast và tin nhắn đã gửi là side effect bên ngoài, không thể thu hồi bằng restore database; luôn đọc kỹ preview trước khi xác nhận.

Thiết kế dùng [Chat Completions API](https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create), [function calling](https://developers.openai.com/api/docs/guides/function-calling) và lớp kiểm soát phía backend; model không tự quyết định quyền.
