const test = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const { createAiChatModeStore } = require('../src/services/aiChatModeStore');

test('persists AI chat mode until it is explicitly disabled', () => {
    const db = new Database(':memory:');
    db.exec(`
        CREATE TABLE ai_chat_modes (
            telegram_id INTEGER PRIMARY KEY,
            active INTEGER NOT NULL DEFAULT 0 CHECK (active IN (0, 1)),
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);
    const firstInstance = createAiChatModeStore(db);

    assert.equal(firstInstance.isActive(123), false);
    firstInstance.setActive(123, true);
    assert.equal(firstInstance.isActive(123), true);

    const afterRestart = createAiChatModeStore(db);
    assert.equal(afterRestart.isActive(123), true);
    afterRestart.setActive(123, false);
    assert.equal(afterRestart.isActive(123), false);
    db.close();
});
