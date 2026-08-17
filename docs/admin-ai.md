# Trợ lý AI cho admin

## Phạm vi v1.7.0

Chỉ tài khoản Telegram có ID khớp `ADMIN_ID` được dùng `/ai <câu hỏi>`. Yêu cầu từ tài khoản khác bị từ chối trước khi bot gọi provider.

Mỗi câu hỏi là một phiên độc lập. AI không có lịch sử hội thoại, tool, quyền đọc database, shell, file `.env`, token hay quyền khởi động lại bot.

## Cấu hình

```dotenv
AI_ENABLED=true
AI_BASE_URL=http://host.docker.internal:7317/v1
AI_API_KEY=khong_gui_qua_chat_va_khong_commit
AI_MODEL=ten_model_tai_provider
AI_API_MODE=chat_completions
AI_TIMEOUT_MS=45000
AI_MAX_TOKENS=700
```

Nếu provider không nằm trên Docker host, thay `AI_BASE_URL` bằng URL HTTPS nội bộ hoặc công khai phù hợp. Chỉ lưu API key trong `.env` của server và giữ file ở quyền `600`.

## Cách dùng hiện tại

```text
/ai Viết cho tôi đề xuất đổi tên shop và nội dung hỗ trợ
```

AI chỉ trả về đề xuất. Admin tự kiểm tra và dùng các lệnh quản trị hiện có để áp dụng.

## Thiết kế tự cấu hình an toàn cho giai đoạn sau

Không cấp shell hay database trực tiếp cho model. Bot sẽ chỉ công bố một allowlist thao tác hẹp như `set_shop_name`, `set_support_contact`, `set_product_active` và `set_product_price`.

Luồng ghi bắt buộc:

1. AI tạo đề xuất có tham số cấu trúc.
2. Backend kiểm tra quyền, kiểu dữ liệu và giới hạn nghiệp vụ.
3. Bot hiện bản xem trước/diff và mã yêu cầu có thời hạn.
4. Admin bấm xác nhận; bot sao lưu rồi mới ghi theo transaction.
5. Bot ghi audit log, chạy health check và tự rollback nếu kiểm tra thất bại.

Secret, bot token, thông tin ngân hàng đầy đủ, dữ liệu khách hàng, shell và SQL tùy ý sẽ không nằm trong allowlist.

Thiết kế này bám theo [Chat Completions API](https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create), [function calling](https://developers.openai.com/api/docs/guides/function-calling) và [safety best practices](https://developers.openai.com/api/docs/guides/safety-best-practices) của OpenAI.
