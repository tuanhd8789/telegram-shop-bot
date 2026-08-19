const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { allocateOrderStock, reserveAllocatedStock } = require('./fulfillmentService');

const ACTION_TTL_MS = 10 * 60 * 1000;
const MAX_LIST_ITEMS = 25;

class ActionError extends Error {}

function cleanObject(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new ActionError('Tham số tool phải là một object.');
    }
    return value;
}

function onlyKeys(value, allowed) {
    const object = cleanObject(value);
    const unknown = Object.keys(object).filter((key) => !allowed.includes(key));
    if (unknown.length) throw new ActionError(`Tham số không được hỗ trợ: ${unknown.join(', ')}`);
    return object;
}

function requiredInteger(value, name, { min = 1, max = Number.MAX_SAFE_INTEGER } = {}) {
    if (!Number.isSafeInteger(value) || value < min || value > max) {
        throw new ActionError(`${name} phải là số nguyên từ ${min} đến ${max}.`);
    }
    return value;
}

function optionalInteger(value, name, options) {
    return value == null ? undefined : requiredInteger(value, name, options);
}

function requiredText(value, name, maxLength) {
    const text = typeof value === 'string' ? value.trim() : '';
    if (!text || text.length > maxLength) {
        throw new ActionError(`${name} phải có từ 1 đến ${maxLength} ký tự.`);
    }
    return text;
}

function optionalText(value, name, maxLength, { nullable = false } = {}) {
    if (value === undefined) return undefined;
    if (value === null && nullable) return null;
    return requiredText(value, name, maxLength);
}

function optionalBoolean(value, name) {
    if (value === undefined) return undefined;
    if (typeof value !== 'boolean') throw new ActionError(`${name} phải là true hoặc false.`);
    return value;
}

function optionalCustomEmojiId(value) {
    if (value === undefined) return undefined;
    if (value === null || value === '') return null;
    if (typeof value !== 'string' || !/^\d{5,30}$/.test(value)) {
        throw new ActionError('custom_emoji_id phải là ID số Telegram hợp lệ.');
    }
    return value;
}

function optionalImageUrl(value) {
    if (value === undefined) return undefined;
    if (value === null || value === '') return null;
    const text = requiredText(value, 'image_url', 500);
    let url;
    try {
        url = new URL(text);
    } catch {
        throw new ActionError('image_url phải là URL HTTPS hợp lệ.');
    }
    if (url.protocol !== 'https:' || !/\.(png|jpe?g|webp)$/i.test(url.pathname)) {
        throw new ActionError('image_url chỉ chấp nhận URL HTTPS PNG/JPG/WEBP.');
    }
    return url.toString();
}

function assertExists(row, message) {
    if (!row) throw new ActionError(message);
    return row;
}

function formatMoney(value) {
    return `${Number(value).toLocaleString('vi-VN')}đ`;
}

function stockSnapshot(db, productId) {
    const ids = db.prepare('SELECT id FROM stock WHERE product_id = ? AND is_sold = 0 ORDER BY id')
        .all(productId)
        .map((item) => item.id);
    return {
        stock_count: ids.length,
        stock_fingerprint: crypto.createHash('sha256').update(ids.join(',')).digest('hex'),
    };
}

function assertStockUnchanged(db, args) {
    const current = stockSnapshot(db, args.product_id);
    if (current.stock_count !== args.stock_count || current.stock_fingerprint !== args.stock_fingerprint) {
        throw new ActionError('Tồn kho đã thay đổi sau preview; hãy tạo yêu cầu mới để xác nhận lại.');
    }
}

function jsonSchema(properties = {}, required = []) {
    return {
        type: 'object',
        properties,
        required,
        additionalProperties: false,
    };
}

function tool(name, description, parameters) {
    return { type: 'function', function: { name, description, parameters } };
}

function createToolRegistry({ db, config, telegram, syncFromSheet }) {
    const hasComboSchema = Boolean(db.prepare(
        "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'combos'"
    ).get());
    const orderComboFields = hasComboSchema
        ? 'o.combo_id, COALESCE(c.name, p.name) product_name'
        : 'NULL combo_id, p.name product_name';
    const comboJoin = hasComboSchema ? 'LEFT JOIN combos c ON c.id = o.combo_id' : '';
    const positiveId = { type: 'integer', minimum: 1 };
    const shortText = { type: 'string', minLength: 1, maxLength: 200 };
    const tools = [
        tool('get_shop_overview', 'Xem thống kê tổng quan và cấu hình không chứa bí mật.', jsonSchema()),
        tool('list_categories', 'Liệt kê danh mục sản phẩm.', jsonSchema()),
        tool('list_products', 'Liệt kê tối đa 25 sản phẩm; có thể lọc theo danh mục và trạng thái.', jsonSchema({
            category_id: positiveId,
            include_inactive: { type: 'boolean' },
        })),
        tool('get_product', 'Xem chi tiết an toàn của một sản phẩm.', jsonSchema({ product_id: positiveId }, ['product_id'])),
        tool('get_stock_summary', 'Xem số lượng tồn kho; không trả nội dung hàng hóa.', jsonSchema({ product_id: positiveId })),
        tool('list_stock_items', 'Liệt kê ID stock chưa bán để quản trị; không trả nội dung stock.', jsonSchema({
            product_id: positiveId,
            limit: { type: 'integer', minimum: 1, maximum: 25 },
        }, ['product_id'])),
        tool('list_orders', 'Liệt kê đơn hàng đã loại bỏ thông tin định danh khách hàng.', jsonSchema({
            status: { type: 'string', enum: ['pending', 'paid', 'delivered', 'cancelled'] },
            limit: { type: 'integer', minimum: 1, maximum: 25 },
        })),
        tool('get_order', 'Xem một đơn hàng không kèm dữ liệu định danh khách hàng.', jsonSchema({ order_id: positiveId }, ['order_id'])),
        tool('get_ai_action_history', 'Xem audit log các hành động AI gần đây.', jsonSchema({
            limit: { type: 'integer', minimum: 1, maximum: 20 },
        })),
        tool('create_category', 'Đề xuất tạo danh mục; bắt buộc admin xác nhận.', jsonSchema({
            name: shortText,
            emoji: { type: 'string', maxLength: 16 },
            custom_emoji_id: { type: ['string', 'null'] },
            image_url: { type: ['string', 'null'], maxLength: 500 },
        }, ['name'])),
        tool('update_category', 'Đề xuất sửa danh mục; bắt buộc admin xác nhận.', jsonSchema({
            category_id: positiveId,
            name: shortText,
            emoji: { type: 'string', maxLength: 16 },
            custom_emoji_id: { type: ['string', 'null'] },
            image_url: { type: ['string', 'null'], maxLength: 500 },
            sort_order: { type: 'integer', minimum: 0, maximum: 10000 },
        }, ['category_id'])),
        tool('delete_category', 'Đề xuất xóa danh mục rỗng; bắt buộc admin xác nhận.', jsonSchema({ category_id: positiveId }, ['category_id'])),
        tool('create_product', 'Đề xuất tạo sản phẩm; bắt buộc admin xác nhận.', jsonSchema({
            category_id: positiveId,
            name: shortText,
            price: { type: 'integer', minimum: 1, maximum: 1000000000 },
            emoji: { type: 'string', maxLength: 16 },
            custom_emoji_id: { type: ['string', 'null'] },
            promotion: { type: ['string', 'null'], maxLength: 300 },
            contact_only: { type: 'boolean' },
            contact_url: { type: ['string', 'null'], maxLength: 500 },
        }, ['category_id', 'name', 'price'])),
        tool('update_product', 'Đề xuất sửa thuộc tính sản phẩm; bắt buộc admin xác nhận.', jsonSchema({
            product_id: positiveId,
            category_id: positiveId,
            name: shortText,
            price: { type: 'integer', minimum: 1, maximum: 1000000000 },
            emoji: { type: 'string', maxLength: 16 },
            custom_emoji_id: { type: ['string', 'null'] },
            promotion: { type: ['string', 'null'], maxLength: 300 },
            contact_only: { type: 'boolean' },
            contact_url: { type: ['string', 'null'], maxLength: 500 },
            is_active: { type: 'boolean' },
        }, ['product_id'])),
        tool('delete_product', 'Đề xuất xóa sản phẩm chưa từng có đơn; bắt buộc admin xác nhận.', jsonSchema({ product_id: positiveId }, ['product_id'])),
        tool('clear_unsold_stock', 'Đề xuất xóa toàn bộ stock chưa bán của sản phẩm.', jsonSchema({ product_id: positiveId }, ['product_id'])),
        tool('delete_stock_item', 'Đề xuất xóa một stock chưa bán theo ID; không đọc nội dung stock.', jsonSchema({ stock_id: positiveId }, ['stock_id'])),
        tool('prepare_add_stock', 'Mở luồng nhập stock bảo mật ngoài AI sau khi admin xác nhận.', jsonSchema({ product_id: positiveId }, ['product_id'])),
        tool('prepare_edit_stock', 'Mở luồng sửa stock bảo mật ngoài AI sau khi admin xác nhận.', jsonSchema({ stock_id: positiveId }, ['stock_id'])),
        tool('cancel_order', 'Đề xuất hủy một đơn pending; bắt buộc admin xác nhận.', jsonSchema({ order_id: positiveId }, ['order_id'])),
        tool('confirm_order', 'Đề xuất xác nhận và giao đơn; thiếu stock sẽ chuyển sang nhập giao hàng bảo mật.', jsonSchema({ order_id: positiveId }, ['order_id'])),
        tool('broadcast', 'Đề xuất gửi thông báo văn bản tới toàn bộ người dùng.', jsonSchema({ message: { type: 'string', minLength: 1, maxLength: 3000 } }, ['message'])),
        tool('sync_sheet', 'Đề xuất đồng bộ sản phẩm từ Google Sheet đã cấu hình.', jsonSchema()),
    ];

    const read = {
        get_shop_overview(args) {
            onlyKeys(args, []);
            const stats = {
                users: db.prepare('SELECT COUNT(*) count FROM users').get().count,
                delivered_orders: db.prepare("SELECT COUNT(*) count FROM orders WHERE status = 'delivered'").get().count,
                pending_orders: db.prepare("SELECT COUNT(*) count FROM orders WHERE status = 'pending'").get().count,
                revenue: db.prepare("SELECT COALESCE(SUM(total_price), 0) total FROM orders WHERE status = 'delivered'").get().total,
                unsold_stock: db.prepare('SELECT COUNT(*) count FROM stock WHERE is_sold = 0').get().count,
            };
            return {
                shop_name: config.SHOP_NAME,
                support_contact: config.SUPPORT_CONTACT,
                banks: [config.BANK?.NAME, config.BANK2?.NAME].filter(Boolean),
                google_sheet_enabled: Boolean(process.env.GOOGLE_SHEET_ID),
                stats,
            };
        },
        list_categories(args) {
            onlyKeys(args, []);
            return db.prepare(`
                SELECT c.id, c.name, c.emoji, c.custom_emoji_id, c.sort_order, c.image_url, c.is_active,
                  (SELECT COUNT(*) FROM products p WHERE p.category_id = c.id) product_count
                FROM categories c ORDER BY c.sort_order, c.id
            `).all();
        },
        list_products(args) {
            const value = onlyKeys(args, ['category_id', 'include_inactive']);
            const categoryId = optionalInteger(value.category_id, 'category_id');
            const includeInactive = optionalBoolean(value.include_inactive, 'include_inactive') || false;
            return db.prepare(`
                SELECT p.id, p.category_id, p.name, p.price, p.emoji, p.custom_emoji_id,
                  p.promotion, p.contact_only, p.is_active,
                  (SELECT COUNT(*) FROM stock s WHERE s.product_id = p.id AND s.is_sold = 0) stock_count
                FROM products p
                WHERE (? IS NULL OR p.category_id = ?) AND (? = 1 OR p.is_active = 1)
                ORDER BY p.category_id, p.id LIMIT ${MAX_LIST_ITEMS}
            `).all(categoryId ?? null, categoryId ?? null, includeInactive ? 1 : 0);
        },
        get_product(args) {
            const value = onlyKeys(args, ['product_id']);
            const id = requiredInteger(value.product_id, 'product_id');
            return assertExists(db.prepare(`
                SELECT p.id, p.category_id, p.name, p.price, p.emoji, p.custom_emoji_id,
                  p.promotion, p.contact_only, p.contact_url, p.is_active,
                  (SELECT COUNT(*) FROM stock s WHERE s.product_id = p.id AND s.is_sold = 0) stock_count,
                  (SELECT COUNT(*) FROM orders o WHERE o.product_id = p.id) order_count
                FROM products p WHERE p.id = ?
            `).get(id), 'Sản phẩm không tồn tại.');
        },
        get_stock_summary(args) {
            const value = onlyKeys(args, ['product_id']);
            const id = optionalInteger(value.product_id, 'product_id');
            if (id) assertExists(db.prepare('SELECT id FROM products WHERE id = ?').get(id), 'Sản phẩm không tồn tại.');
            return db.prepare(`
                SELECT p.id product_id, p.name,
                  SUM(CASE WHEN s.is_sold = 0 THEN 1 ELSE 0 END) unsold,
                  SUM(CASE WHEN s.is_sold = 1 THEN 1 ELSE 0 END) sold
                FROM products p LEFT JOIN stock s ON s.product_id = p.id
                WHERE (? IS NULL OR p.id = ?)
                GROUP BY p.id ORDER BY p.id LIMIT ${MAX_LIST_ITEMS}
            `).all(id ?? null, id ?? null);
        },
        list_stock_items(args) {
            const value = onlyKeys(args, ['product_id', 'limit']);
            const productId = requiredInteger(value.product_id, 'product_id');
            const limit = optionalInteger(value.limit, 'limit', { min: 1, max: 25 }) || 20;
            assertExists(db.prepare('SELECT id FROM products WHERE id = ?').get(productId), 'Sản phẩm không tồn tại.');
            return db.prepare('SELECT id, product_id FROM stock WHERE product_id = ? AND is_sold = 0 ORDER BY id LIMIT ?')
                .all(productId, limit);
        },
        list_orders(args) {
            const value = onlyKeys(args, ['status', 'limit']);
            const allowedStatuses = ['pending', 'paid', 'delivered', 'cancelled'];
            const status = value.status === undefined ? undefined : requiredText(value.status, 'status', 20);
            if (status && !allowedStatuses.includes(status)) throw new ActionError('Trạng thái đơn không hợp lệ.');
            const limit = optionalInteger(value.limit, 'limit', { min: 1, max: 25 }) || 20;
            return db.prepare(`
                SELECT o.id, o.product_id, ${orderComboFields}, o.quantity, o.total_price,
                  o.status, o.created_at, o.paid_at, o.delivered_at
                FROM orders o JOIN products p ON p.id = o.product_id
                ${comboJoin}
                WHERE (? IS NULL OR o.status = ?) ORDER BY o.created_at DESC LIMIT ?
            `).all(status ?? null, status ?? null, limit);
        },
        get_order(args) {
            const value = onlyKeys(args, ['order_id']);
            const id = requiredInteger(value.order_id, 'order_id');
            return assertExists(db.prepare(`
                SELECT o.id, o.product_id, ${orderComboFields}, o.quantity, o.total_price,
                  o.status, o.created_at, o.paid_at, o.delivered_at
                FROM orders o JOIN products p ON p.id = o.product_id
                ${comboJoin} WHERE o.id = ?
            `).get(id), 'Đơn hàng không tồn tại.');
        },
        get_ai_action_history(args) {
            const value = onlyKeys(args, ['limit']);
            const limit = optionalInteger(value.limit, 'limit', { min: 1, max: 20 }) || 10;
            return db.prepare(`
                SELECT id, tool_name, preview, status, created_at, decided_at, result
                FROM ai_action_requests ORDER BY created_at DESC LIMIT ?
            `).all(limit);
        },
    };

    function categoryValues(args, update = false) {
        const allowed = ['category_id', 'name', 'emoji', 'custom_emoji_id', 'image_url', 'sort_order'];
        const value = onlyKeys(args, update ? allowed : allowed.filter((key) => key !== 'category_id' && key !== 'sort_order'));
        const result = {
            category_id: update ? requiredInteger(value.category_id, 'category_id') : undefined,
            name: update ? optionalText(value.name, 'name', 100) : requiredText(value.name, 'name', 100),
            emoji: optionalText(value.emoji, 'emoji', 16),
            custom_emoji_id: optionalCustomEmojiId(value.custom_emoji_id),
            image_url: optionalImageUrl(value.image_url),
            sort_order: optionalInteger(value.sort_order, 'sort_order', { min: 0, max: 10000 }),
        };
        if (update && Object.values(result).filter((item) => item !== undefined).length === 1) {
            throw new ActionError('Cần ít nhất một trường danh mục để cập nhật.');
        }
        return result;
    }

    function productValues(args, update = false) {
        const allowed = ['product_id', 'category_id', 'name', 'price', 'emoji', 'custom_emoji_id', 'promotion', 'contact_only', 'contact_url', 'is_active'];
        const value = onlyKeys(args, update ? allowed : allowed.filter((key) => key !== 'product_id' && key !== 'is_active'));
        const result = {
            product_id: update ? requiredInteger(value.product_id, 'product_id') : undefined,
            category_id: update ? optionalInteger(value.category_id, 'category_id') : requiredInteger(value.category_id, 'category_id'),
            name: update ? optionalText(value.name, 'name', 200) : requiredText(value.name, 'name', 200),
            price: value.price === undefined ? undefined : requiredInteger(value.price, 'price', { min: 1, max: 1000000000 }),
            emoji: optionalText(value.emoji, 'emoji', 16),
            custom_emoji_id: optionalCustomEmojiId(value.custom_emoji_id),
            promotion: optionalText(value.promotion, 'promotion', 300, { nullable: true }),
            contact_only: optionalBoolean(value.contact_only, 'contact_only'),
            contact_url: optionalText(value.contact_url, 'contact_url', 500, { nullable: true }),
            is_active: optionalBoolean(value.is_active, 'is_active'),
        };
        if (!update) result.price = requiredInteger(value.price, 'price', { min: 1, max: 1000000000 });
        if (update && Object.values(result).filter((item) => item !== undefined).length === 1) {
            throw new ActionError('Cần ít nhất một trường sản phẩm để cập nhật.');
        }
        return result;
    }

    const actions = {
        create_category: {
            validate: (args) => categoryValues(args),
            preview: (args) => `Tạo danh mục “${args.name}”${args.emoji ? ` với icon ${args.emoji}` : ''}.`,
            execute(args) {
                const sortOrder = db.prepare('SELECT COALESCE(MAX(sort_order), 0) + 1 value FROM categories').get().value;
                const result = db.prepare(`
                    INSERT INTO categories (name, emoji, custom_emoji_id, sort_order, image_url)
                    VALUES (?, ?, ?, ?, ?)
                `).run(args.name, args.emoji || '📦', args.custom_emoji_id ?? null, sortOrder, args.image_url ?? null);
                return { message: `Đã tạo danh mục #${result.lastInsertRowid}: ${args.name}.` };
            },
        },
        update_category: {
            validate(args) {
                const value = categoryValues(args, true);
                assertExists(db.prepare('SELECT id FROM categories WHERE id = ?').get(value.category_id), 'Danh mục không tồn tại.');
                return value;
            },
            preview: (args) => `Cập nhật danh mục #${args.category_id}: ${JSON.stringify(Object.fromEntries(Object.entries(args).filter(([key]) => key !== 'category_id')))}.`,
            execute(args) {
                const fields = Object.entries(args).filter(([key, value]) => key !== 'category_id' && value !== undefined);
                const result = db.prepare(`UPDATE categories SET ${fields.map(([key]) => `${key} = ?`).join(', ')} WHERE id = ?`)
                    .run(...fields.map(([, value]) => value), args.category_id);
                if (result.changes !== 1) throw new ActionError('Danh mục đã bị xóa hoặc thay đổi.');
                return { message: `Đã cập nhật danh mục #${args.category_id}.` };
            },
        },
        delete_category: {
            validate(args) {
                const value = onlyKeys(args, ['category_id']);
                const categoryId = requiredInteger(value.category_id, 'category_id');
                const category = assertExists(db.prepare('SELECT id, name FROM categories WHERE id = ?').get(categoryId), 'Danh mục không tồn tại.');
                const count = db.prepare('SELECT COUNT(*) count FROM products WHERE category_id = ?').get(categoryId).count;
                if (count) throw new ActionError(`Danh mục còn ${count} sản phẩm nên không thể xóa.`);
                return { category_id: categoryId, category_name: category.name };
            },
            preview: (args) => `Xóa danh mục rỗng #${args.category_id} “${args.category_name}”.`,
            execute(args) {
                if (db.prepare('DELETE FROM categories WHERE id = ?').run(args.category_id).changes !== 1) {
                    throw new ActionError('Danh mục đã bị xóa hoặc không còn rỗng.');
                }
                return { message: `Đã xóa danh mục #${args.category_id}.` };
            },
        },
        create_product: {
            validate(args) {
                const value = productValues(args);
                assertExists(db.prepare('SELECT id FROM categories WHERE id = ?').get(value.category_id), 'Danh mục không tồn tại.');
                return value;
            },
            preview: (args) => `Tạo sản phẩm “${args.name}” trong danh mục #${args.category_id}, giá ${formatMoney(args.price)}.`,
            execute(args) {
                const result = db.prepare(`
                    INSERT INTO products (category_id, name, price, emoji, custom_emoji_id, promotion, contact_only, contact_url)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                `).run(args.category_id, args.name, args.price, args.emoji || '📦', args.custom_emoji_id ?? null,
                    args.promotion ?? null, args.contact_only ? 1 : 0, args.contact_url ?? null);
                return { message: `Đã tạo sản phẩm #${result.lastInsertRowid}: ${args.name}.` };
            },
        },
        update_product: {
            validate(args) {
                const value = productValues(args, true);
                assertExists(db.prepare('SELECT id FROM products WHERE id = ?').get(value.product_id), 'Sản phẩm không tồn tại.');
                if (value.category_id) assertExists(db.prepare('SELECT id FROM categories WHERE id = ?').get(value.category_id), 'Danh mục không tồn tại.');
                return value;
            },
            preview: (args) => `Cập nhật sản phẩm #${args.product_id}: ${JSON.stringify(Object.fromEntries(Object.entries(args).filter(([key]) => key !== 'product_id')))}.`,
            execute(args) {
                const fields = Object.entries(args)
                    .filter(([key, value]) => key !== 'product_id' && value !== undefined)
                    .map(([key, value]) => [key, typeof value === 'boolean' ? Number(value) : value]);
                const result = db.prepare(`UPDATE products SET ${fields.map(([key]) => `${key} = ?`).join(', ')} WHERE id = ?`)
                    .run(...fields.map(([, value]) => value), args.product_id);
                if (result.changes !== 1) throw new ActionError('Sản phẩm đã bị xóa hoặc thay đổi.');
                return { message: `Đã cập nhật sản phẩm #${args.product_id}.` };
            },
        },
        delete_product: {
            validate(args) {
                const value = onlyKeys(args, ['product_id']);
                const productId = requiredInteger(value.product_id, 'product_id');
                const product = assertExists(db.prepare('SELECT id, name FROM products WHERE id = ?').get(productId), 'Sản phẩm không tồn tại.');
                const orders = db.prepare('SELECT COUNT(*) count FROM orders WHERE product_id = ?').get(productId).count;
                if (orders) throw new ActionError(`Sản phẩm đã có ${orders} đơn nên không thể xóa; hãy tắt sản phẩm.`);
                return { product_id: productId, product_name: product.name, ...stockSnapshot(db, productId) };
            },
            preview: (args) => `Xóa sản phẩm #${args.product_id} “${args.product_name}” và ${args.stock_count} stock chưa bán.`,
            execute(args) {
                assertStockUnchanged(db, args);
                db.prepare('DELETE FROM stock WHERE product_id = ? AND is_sold = 0').run(args.product_id);
                if (db.prepare('DELETE FROM products WHERE id = ?').run(args.product_id).changes !== 1) {
                    throw new ActionError('Sản phẩm đã bị xóa hoặc phát sinh tham chiếu mới.');
                }
                return { message: `Đã xóa sản phẩm #${args.product_id}.` };
            },
        },
        clear_unsold_stock: {
            validate(args) {
                const value = onlyKeys(args, ['product_id']);
                const productId = requiredInteger(value.product_id, 'product_id');
                const product = assertExists(db.prepare('SELECT id, name FROM products WHERE id = ?').get(productId), 'Sản phẩm không tồn tại.');
                const snapshot = stockSnapshot(db, productId);
                return { product_id: productId, product_name: product.name,
                    count: snapshot.stock_count, stock_count: snapshot.stock_count,
                    stock_fingerprint: snapshot.stock_fingerprint };
            },
            preview: (args) => `Xóa ${args.count} stock chưa bán của #${args.product_id} “${args.product_name}”.`,
            execute(args) {
                assertStockUnchanged(db, args);
                const result = db.prepare('DELETE FROM stock WHERE product_id = ? AND is_sold = 0').run(args.product_id);
                return { message: `Đã xóa ${result.changes} stock chưa bán của sản phẩm #${args.product_id}.` };
            },
        },
        delete_stock_item: {
            validate(args) {
                const value = onlyKeys(args, ['stock_id']);
                const stockId = requiredInteger(value.stock_id, 'stock_id');
                const item = assertExists(db.prepare('SELECT id, product_id, is_sold FROM stock WHERE id = ?').get(stockId), 'Stock không tồn tại.');
                if (item.is_sold) throw new ActionError('Stock đã bán được khóa để giữ lịch sử.');
                return { stock_id: stockId, product_id: item.product_id };
            },
            preview: (args) => `Xóa stock chưa bán #${args.stock_id} của sản phẩm #${args.product_id}; nội dung stock không được gửi tới AI.`,
            execute(args) {
                const result = db.prepare('DELETE FROM stock WHERE id = ? AND is_sold = 0').run(args.stock_id);
                if (result.changes !== 1) throw new ActionError('Stock đã thay đổi hoặc không còn tồn tại.');
                return { message: `Đã xóa stock #${args.stock_id}.` };
            },
        },
        prepare_add_stock: {
            backup: false,
            validate(args) {
                const value = onlyKeys(args, ['product_id']);
                const productId = requiredInteger(value.product_id, 'product_id');
                const product = assertExists(db.prepare('SELECT id, name FROM products WHERE id = ?').get(productId), 'Sản phẩm không tồn tại.');
                return { product_id: productId, product_name: product.name };
            },
            preview: (args) => `Mở bước nhập stock bảo mật cho #${args.product_id} “${args.product_name}”; nội dung tiếp theo không gửi qua AI.`,
            execute: async (args) => {
                assertExists(db.prepare('SELECT id FROM products WHERE id = ?').get(args.product_id), 'Sản phẩm không còn tồn tại.');
                return {
                    message: `Hãy gửi nội dung stock cho “${args.product_name}”, mỗi mặt hàng một dòng. Gõ /cancel để hủy.`,
                    interaction: { type: 'add_stock', productId: args.product_id },
                };
            },
        },
        prepare_edit_stock: {
            backup: false,
            validate(args) {
                const value = onlyKeys(args, ['stock_id']);
                const stockId = requiredInteger(value.stock_id, 'stock_id');
                const item = assertExists(db.prepare('SELECT id, product_id, is_sold FROM stock WHERE id = ?').get(stockId), 'Stock không tồn tại.');
                if (item.is_sold) throw new ActionError('Stock đã bán được khóa để giữ lịch sử.');
                return { stock_id: stockId, product_id: item.product_id };
            },
            preview: (args) => `Mở bước sửa bảo mật cho stock #${args.stock_id}; nội dung hiện tại và nội dung mới không gửi tới AI.`,
            execute: async (args) => {
                const item = assertExists(db.prepare('SELECT is_sold FROM stock WHERE id = ?').get(args.stock_id), 'Stock không còn tồn tại.');
                if (item.is_sold) throw new ActionError('Stock đã được bán sau preview.');
                return {
                    message: `Hãy gửi nội dung mới cho stock #${args.stock_id}. Gõ /cancel để hủy.`,
                    interaction: { type: 'edit_stock', stockId: args.stock_id },
                };
            },
        },
        cancel_order: {
            validate(args) {
                const value = onlyKeys(args, ['order_id']);
                const orderId = requiredInteger(value.order_id, 'order_id');
                const order = assertExists(db.prepare('SELECT id, status FROM orders WHERE id = ?').get(orderId), 'Đơn hàng không tồn tại.');
                if (order.status !== 'pending') throw new ActionError(`Chỉ hủy được đơn pending; đơn đang ở trạng thái ${order.status}.`);
                return { order_id: orderId };
            },
            preview: (args) => `Hủy đơn pending #${args.order_id}.`,
            execute(args) {
                const result = db.prepare("UPDATE orders SET status = 'cancelled' WHERE id = ? AND status = 'pending'").run(args.order_id);
                if (result.changes !== 1) throw new ActionError('Đơn đã thay đổi trạng thái, không hủy.');
                return { message: `Đã hủy đơn #${args.order_id}.` };
            },
        },
        confirm_order: {
            validate(args) {
                const value = onlyKeys(args, ['order_id']);
                const orderId = requiredInteger(value.order_id, 'order_id');
                const order = assertExists(db.prepare(`
                    SELECT o.id, o.status, o.product_id, ${orderComboFields}, o.quantity, o.user_id
                    FROM orders o JOIN products p ON p.id = o.product_id
                    ${comboJoin} WHERE o.id = ?
                `).get(orderId), 'Đơn hàng không tồn tại.');
                if (!['pending', 'paid'].includes(order.status)) throw new ActionError(`Đơn đang ở trạng thái ${order.status}.`);
                return { order_id: orderId, status: order.status, product_id: order.product_id, combo_id: order.combo_id, quantity: order.quantity,
                    user_id: order.user_id, product_name: order.product_name };
            },
            preview: (args) => `Xác nhận đơn #${args.order_id}: ${args.product_name} × ${args.quantity}. Nếu thiếu kho, bot chuyển sang bước giao hàng bảo mật.`,
            execute(args) {
                const existingJob = db.prepare('SELECT status FROM telegram_jobs WHERE dedupe_key = ?')
                    .get(`order:${args.order_id}:delivery`);
                if (existingJob) throw new ActionError(`Đơn đã có job giao hàng trạng thái ${existingJob.status}.`);
                const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(args.order_id);
                const allocation = allocateOrderStock(db, { ...order, product_name: args.product_name });
                if (allocation.success) {
                    if (args.status === 'pending') {
                        const paid = db.prepare(`
                            UPDATE orders SET status = 'paid', paid_at = CURRENT_TIMESTAMP
                            WHERE id = ? AND status = 'pending'
                        `).run(args.order_id);
                        if (paid.changes !== 1) throw new ActionError('Đơn đã thay đổi trạng thái.');
                    }
                    reserveAllocatedStock(db, order, allocation.items);
                    db.prepare(`
                        INSERT INTO telegram_jobs (dedupe_key, kind, order_id, chat_id, payload)
                        VALUES (?, 'customer_delivery', ?, ?, ?)
                    `).run(
                        `order:${args.order_id}:delivery`,
                        args.order_id,
                        String(args.user_id),
                        JSON.stringify({
                            orderId: args.order_id,
                            productName: args.product_name,
                            quantity: args.quantity,
                            items: allocation.items.map((item) => ({
                                productName: item.productName,
                                data: item.data,
                                buyerMessage: item.buyer_message || null,
                            })),
                        })
                    );
                    return { message: `Đã xác nhận và xếp hàng giao đơn #${args.order_id}; worker sẽ tự retry nếu Telegram tạm lỗi.` };
                }
                if (args.combo_id) {
                    throw new ActionError(`Combo không còn đủ thành phần; tối đa ${allocation.available} lượt mua. Không thể giao thủ công combo.`);
                }
                if (args.status === 'pending') {
                    const paid = db.prepare("UPDATE orders SET status = 'paid', paid_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'pending'").run(args.order_id);
                    if (paid.changes !== 1) throw new ActionError('Đơn đã thay đổi trạng thái.');
                }
                return {
                    message: `Đơn #${args.order_id} đã ghi nhận thanh toán. Hãy gửi đúng ${args.quantity} dòng dữ liệu giao hàng; nội dung không qua AI.`,
                    interaction: { type: 'manual_delivery', orderId: args.order_id, userId: args.user_id,
                        productName: args.product_name, quantity: args.quantity },
                };
            },
        },
        broadcast: {
            backup: false,
            validate(args) {
                const value = onlyKeys(args, ['message']);
                const recipientCount = db.prepare('SELECT COUNT(*) count FROM users').get().count;
                return { message: requiredText(value.message, 'message', 3000), recipient_count: recipientCount };
            },
            preview(args) {
                return `Gửi thông báo tới ${args.recipient_count} người dùng:\n\n${args.message}`;
            },
            async execute(args) {
                const users = db.prepare('SELECT telegram_id FROM users ORDER BY telegram_id').all();
                if (users.length !== args.recipient_count) {
                    throw new ActionError('Danh sách người nhận đã thay đổi sau preview; hãy tạo yêu cầu broadcast mới.');
                }
                let sent = 0;
                let failed = 0;
                for (const user of users) {
                    try {
                        await telegram.sendMessage(user.telegram_id, args.message);
                        sent += 1;
                    } catch {
                        failed += 1;
                    }
                }
                return { message: `Broadcast hoàn tất: ${sent} thành công, ${failed} thất bại.` };
            },
        },
        sync_sheet: {
            validate(args) {
                onlyKeys(args, []);
                if (!process.env.GOOGLE_SHEET_ID) throw new ActionError('Google Sheet chưa được cấu hình.');
                return {};
            },
            preview: () => 'Đồng bộ sản phẩm từ Google Sheet đã cấu hình; dữ liệu sản phẩm hiện tại có thể thay đổi.',
            async execute() {
                const result = await syncFromSheet();
                if (!result || result.error) throw new ActionError(result?.error || 'Đồng bộ thất bại.');
                return { message: `Đồng bộ thành công: ${result.updated} cập nhật, ${result.added} thêm mới, tổng ${result.total}.` };
            },
        },
    };

    return { tools, read, actions };
}

function createAiActionGateway({
    db,
    config,
    telegram,
    syncFromSheet = async () => ({ error: 'Google Sheet unavailable' }),
    now = () => Date.now(),
    ttlMs = ACTION_TTL_MS,
    backupDir = process.env.BACKUP_DIR || path.join(__dirname, '..', '..', 'backups'),
    backupDatabase,
}) {
    const registry = createToolRegistry({ db, config, telegram, syncFromSheet });
    const createBackup = backupDatabase || (async (requestId) => {
        fs.mkdirSync(backupDir, { recursive: true });
        const timestamp = new Date(now()).toISOString().replace(/[:.]/g, '-');
        const backupPath = path.join(backupDir, `pre-ai-${requestId}-${timestamp}.db`);
        await db.backup(backupPath);
        return path.basename(backupPath);
    });

    function expirePending(adminId) {
        db.prepare(`
            UPDATE ai_action_requests SET status = 'expired', decided_at = ?
            WHERE admin_id = ? AND status = 'pending' AND expires_at <= ?
        `).run(now(), adminId, now());
    }

    function getTools() {
        return registry.tools;
    }

    function runRead(name, args) {
        const handler = registry.read[name];
        if (!handler) throw new ActionError('Tool đọc không tồn tại.');
        return handler(args);
    }

    function prepare(name, rawArgs, adminId) {
        const action = registry.actions[name];
        if (!action) throw new ActionError('Hành động không nằm trong allowlist.');
        const args = action.validate(rawArgs);
        const preview = action.preview(args);
        const id = crypto.randomBytes(8).toString('hex');
        const createdAt = now();
        expirePending(adminId);
        db.prepare(`
            INSERT INTO ai_action_requests
              (id, admin_id, tool_name, arguments, preview, status, created_at, expires_at)
            VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)
        `).run(id, adminId, name, JSON.stringify(args), preview, createdAt, createdAt + ttlMs);
        return { id, name, preview, expiresAt: createdAt + ttlMs };
    }

    function cancel(id, adminId) {
        expirePending(adminId);
        const result = db.prepare(`
            UPDATE ai_action_requests SET status = 'cancelled', decided_at = ?, result = 'Admin cancelled'
            WHERE id = ? AND admin_id = ? AND status = 'pending'
        `).run(now(), id, adminId);
        if (result.changes !== 1) throw new ActionError('Yêu cầu không còn chờ xác nhận hoặc không thuộc admin này.');
        return { message: `Đã hủy yêu cầu AI ${id}.` };
    }

    async function confirm(id, adminId) {
        expirePending(adminId);
        const claimed = db.prepare(`
            UPDATE ai_action_requests SET status = 'executing', decided_at = ?
            WHERE id = ? AND admin_id = ? AND status = 'pending' AND expires_at > ?
        `).run(now(), id, adminId, now());
        if (claimed.changes !== 1) throw new ActionError('Yêu cầu đã hết hạn, đã xử lý hoặc không thuộc admin này.');

        const request = db.prepare('SELECT * FROM ai_action_requests WHERE id = ?').get(id);
        const action = registry.actions[request.tool_name];
        if (!action) throw new ActionError('Hành động không còn nằm trong allowlist.');

        let backupName = null;
        try {
            if (action.backup !== false) backupName = await createBackup(id);
            const args = JSON.parse(request.arguments);
            const run = () => action.execute(args);
            let result;
            if (action.execute.constructor.name === 'AsyncFunction') {
                result = await run();
            } else {
                result = db.transaction(() => {
                    const value = run();
                    const foreignKeys = db.pragma('foreign_key_check');
                    if (foreignKeys.length) throw new ActionError('Kiểm tra khóa ngoại thất bại.');
                    return value;
                }).immediate();
            }
            const foreignKeys = db.pragma('foreign_key_check');
            if (foreignKeys.length) throw new ActionError('Kiểm tra khóa ngoại sau hành động thất bại.');
            if (db.pragma('quick_check', { simple: true }) !== 'ok') {
                throw new ActionError('SQLite quick_check sau hành động thất bại.');
            }
            db.prepare(`
                UPDATE ai_action_requests
                SET status = 'completed', backup_name = ?, result = ?
                WHERE id = ? AND status = 'executing'
            `).run(backupName, String(result.message || 'Completed').slice(0, 1000), id);
            return { ...result, backupName };
        } catch (error) {
            db.prepare(`
                UPDATE ai_action_requests
                SET status = 'failed', backup_name = ?, result = ?
                WHERE id = ? AND status = 'executing'
            `).run(backupName, String(error.message || error).slice(0, 1000), id);
            throw error;
        }
    }

    function isReadTool(name) {
        return Boolean(registry.read[name]);
    }

    function isWriteTool(name) {
        return Boolean(registry.actions[name]);
    }

    return { cancel, confirm, getTools, isReadTool, isWriteTool, prepare, runRead };
}

module.exports = { ActionError, createAiActionGateway };
