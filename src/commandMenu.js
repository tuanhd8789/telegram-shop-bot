const userCommands = [
    { command: 'start', description: '🔄 Bắt đầu / Khởi động lại' },
    { command: 'menu', description: '👤 Thông tin tài khoản' },
    { command: 'product', description: '📦 Danh sách sản phẩm' },
    { command: 'nap', description: '💰 Nạp số dư' },
    { command: 'checkpay', description: '🔍 Kiểm tra thanh toán' },
    { command: 'support', description: '🆘 Hỗ trợ' },
    { command: 'myid', description: '🆔 Lấy ID của bạn' },
];

const adminOnlyCommands = [
    { command: 'admin', description: '🔧 Mở bảng điều khiển admin' },
    { command: 'listproduct', description: '📦 Xem tất cả sản phẩm' },
    { command: 'addproduct', description: '➕ Thêm sản phẩm' },
    { command: 'editprice', description: '💵 Sửa giá sản phẩm' },
    { command: 'editname', description: '✏️ Sửa tên sản phẩm' },
    { command: 'toggleproduct', description: '🔁 Bật hoặc tắt sản phẩm' },
    { command: 'deleteproduct', description: '🗑️ Xóa sản phẩm' },
    { command: 'addcategory', description: '➕ Thêm danh mục' },
    { command: 'addstock', description: '📥 Thêm hàng vào kho' },
    { command: 'viewstock', description: '👁️ Xem kho sản phẩm' },
    { command: 'clearstock', description: '🧹 Xóa kho chưa bán' },
    { command: 'pending', description: '⏳ Xem đơn chờ thanh toán' },
    { command: 'confirm', description: '✅ Xác nhận và giao hàng' },
    { command: 'cancelorder', description: '❌ Hủy đơn hàng' },
    { command: 'orders', description: '📋 Xem đơn gần đây' },
    { command: 'stats', description: '📊 Xem thống kê' },
    { command: 'users', description: '👥 Xem người dùng' },
    { command: 'broadcast', description: '📣 Gửi thông báo' },
    { command: 'sync', description: '🔄 Đồng bộ Google Sheet' },
    { command: 'setbank', description: '🏦 Xem cấu hình ngân hàng' },
    { command: 'setshop', description: '🏪 Xem cấu hình shop' },
];

const adminCommands = [...userCommands, ...adminOnlyCommands];

async function registerCommandMenus(telegram, adminId) {
    await telegram.setMyCommands(userCommands);
    await telegram.setMyCommands(adminCommands, {
        scope: { type: 'chat', chat_id: adminId },
    });
}

module.exports = { userCommands, adminCommands, registerCommandMenus };
