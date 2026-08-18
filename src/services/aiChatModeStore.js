function createAiChatModeStore(db) {
    const find = db.prepare('SELECT active FROM ai_chat_modes WHERE telegram_id = ?');
    const enable = db.prepare(`
        INSERT INTO ai_chat_modes (telegram_id, active, updated_at)
        VALUES (?, 1, CURRENT_TIMESTAMP)
        ON CONFLICT(telegram_id) DO UPDATE SET active = 1, updated_at = CURRENT_TIMESTAMP
    `);
    const disable = db.prepare('DELETE FROM ai_chat_modes WHERE telegram_id = ?');

    return {
        isActive(telegramId) {
            return find.get(telegramId)?.active === 1;
        },
        setActive(telegramId, active) {
            if (active) enable.run(telegramId);
            else disable.run(telegramId);
        },
    };
}

module.exports = { createAiChatModeStore };
