const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// Ensure data directory exists
const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = new Database(path.join(dataDir, 'shop.db'));

// Enable WAL mode for better performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    telegram_id INTEGER PRIMARY KEY,
    username TEXT,
    full_name TEXT,
    balance INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    emoji TEXT DEFAULT '📦',
    custom_emoji_id TEXT,
    sort_order INTEGER DEFAULT 0,
    image_url TEXT
  );

  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category_id INTEGER,
    name TEXT NOT NULL,
    price INTEGER NOT NULL,
    description TEXT,
    emoji TEXT DEFAULT '📦',
    custom_emoji_id TEXT,
    promotion TEXT,
    contact_only INTEGER DEFAULT 0,
    contact_url TEXT,
    sheet_stock INTEGER DEFAULT 0,
    is_active INTEGER DEFAULT 1,
    FOREIGN KEY (category_id) REFERENCES categories(id)
  );

  CREATE TABLE IF NOT EXISTS stock (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL,
    data TEXT NOT NULL,
    is_sold INTEGER DEFAULT 0,
    sold_to INTEGER,
    sold_at DATETIME,
    FOREIGN KEY (product_id) REFERENCES products(id)
  );

  CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    product_id INTEGER NOT NULL,
    quantity INTEGER NOT NULL,
    total_price INTEGER NOT NULL,
    payment_code TEXT UNIQUE,
    status TEXT DEFAULT 'pending',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    paid_at DATETIME,
    delivered_at DATETIME,
    FOREIGN KEY (user_id) REFERENCES users(telegram_id),
    FOREIGN KEY (product_id) REFERENCES products(id)
  );

  CREATE TABLE IF NOT EXISTS payment_transactions (
    transaction_id TEXT PRIMARY KEY,
    order_id INTEGER,
    topup_id INTEGER,
    transfer_amount INTEGER NOT NULL,
    account_number TEXT NOT NULL,
    gateway TEXT,
    reference_code TEXT,
    payment_code TEXT,
    payload_hash TEXT NOT NULL,
    status TEXT NOT NULL,
    reason TEXT,
    received_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (order_id) REFERENCES orders(id)
  );

  CREATE TABLE IF NOT EXISTS wallet_topups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    amount INTEGER NOT NULL,
    payment_code TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    paid_at DATETIME,
    FOREIGN KEY (user_id) REFERENCES users(telegram_id)
  );

  CREATE TABLE IF NOT EXISTS telegram_jobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    dedupe_key TEXT NOT NULL UNIQUE,
    kind TEXT NOT NULL,
    order_id INTEGER,
    chat_id TEXT NOT NULL,
    payload TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    attempts INTEGER NOT NULL DEFAULT 0,
    next_attempt_at INTEGER NOT NULL DEFAULT 0,
    last_error TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    sent_at DATETIME,
    FOREIGN KEY (order_id) REFERENCES orders(id)
  );

  CREATE TABLE IF NOT EXISTS ai_chat_modes (
    telegram_id INTEGER PRIMARY KEY,
    active INTEGER NOT NULL DEFAULT 0 CHECK (active IN (0, 1)),
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS ai_action_requests (
    id TEXT PRIMARY KEY,
    admin_id INTEGER NOT NULL,
    tool_name TEXT NOT NULL,
    arguments TEXT NOT NULL,
    preview TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending'
      CHECK (status IN ('pending', 'executing', 'completed', 'cancelled', 'expired', 'failed')),
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    decided_at INTEGER,
    backup_name TEXT,
    result TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_telegram_jobs_ready
    ON telegram_jobs(status, next_attempt_at, id);
  CREATE INDEX IF NOT EXISTS idx_ai_action_requests_admin_status
    ON ai_action_requests(admin_id, status, created_at);
`);

// Safe migrations for existing databases
try { db.exec('ALTER TABLE products ADD COLUMN contact_url TEXT'); } catch (e) { /* already exists */ }
try { db.exec('ALTER TABLE products ADD COLUMN sheet_stock INTEGER DEFAULT 0'); } catch (e) { /* already exists */ }
try { db.exec('ALTER TABLE products ADD COLUMN custom_emoji_id TEXT'); } catch (e) { /* already exists */ }
try { db.exec('ALTER TABLE stock ADD COLUMN sold_order_id INTEGER'); } catch (e) { /* already exists */ }
try { db.exec('ALTER TABLE categories ADD COLUMN image_url TEXT'); } catch (e) { /* already exists */ }
try { db.exec('ALTER TABLE categories ADD COLUMN custom_emoji_id TEXT'); } catch (e) { /* already exists */ }
try { db.exec('ALTER TABLE payment_transactions ADD COLUMN topup_id INTEGER'); } catch (e) { /* already exists */ }

// Seed data - only if categories table is empty
const catCount = db.prepare('SELECT COUNT(*) as c FROM categories').get();
if (catCount.c === 0) {
  console.log('📦 Seeding initial data...');

  // Insert categories
  const insertCat = db.prepare('INSERT INTO categories (name, emoji, sort_order) VALUES (?, ?, ?)');
  insertCat.run('ChatGPT', '🤖', 1);
  insertCat.run('Capcut', '🎬', 2);
  insertCat.run('Dịch vụ nâng cấp', '⚡', 3);

  // Insert products
  const insertProd = db.prepare(`
    INSERT INTO products (category_id, name, price, emoji, promotion, contact_only)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  // ChatGPT category (id=1)
  insertProd.run(1, 'ChatGPT Plus 1 tháng bhf', 8000, '📦', '🎁 Mua 10 tặng 2', 0);
  insertProd.run(1, 'ChatGPT Business (5 slot) bhf', 20000, '📦', null, 0);
  insertProd.run(1, 'ChatGPT Plus 1thang full hotmail bhf', 8000, '📦', '🎁 Mua 10 tặng 2', 0);
  insertProd.run(1, 'CHAT GPT GO 1 năm ( KBH )', 55000, '📦', null, 0);
  insertProd.run(1, 'Nâng chính chủ ChatGPT Plus 1 tháng', 15000, '📦', null, 1);
  insertProd.run(1, 'Gia Hạn ChatGPT Plus 1 tháng', 60000, '📦', null, 1);
  insertProd.run(1, 'CDK GPT Plus 12 tháng', 650000, '📦', null, 1);

  // Capcut category (id=2)
  insertProd.run(2, 'Capcut Pro Team 35D bhf', 12000, '📦', null, 0);

  console.log('✅ Seed data created!');
}

module.exports = db;
