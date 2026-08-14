const fs = require('fs');
const path = require('path');

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

function positiveNumber(value, fallback) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function pruneBackups(backupDir, retentionDays, now = Date.now()) {
    const cutoff = now - retentionDays * DAY_MS;
    for (const entry of fs.readdirSync(backupDir, { withFileTypes: true })) {
        if (!entry.isFile() || !/^shop-.*\.db$/.test(entry.name)) continue;
        const backupPath = path.join(backupDir, entry.name);
        if (fs.statSync(backupPath).mtimeMs < cutoff) fs.unlinkSync(backupPath);
    }
}

async function createBackup(db, backupDir, retentionDays, now = new Date()) {
    fs.mkdirSync(backupDir, { recursive: true });
    const timestamp = now.toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(backupDir, `shop-${timestamp}.db`);
    await db.backup(backupPath);
    pruneBackups(backupDir, retentionDays, now.getTime());
    return backupPath;
}

function startBackupScheduler(db) {
    const backupDir = process.env.BACKUP_DIR || path.join(__dirname, '..', '..', 'backups');
    const intervalHours = positiveNumber(process.env.BACKUP_INTERVAL_HOURS, 24);
    const retentionDays = positiveNumber(process.env.BACKUP_RETENTION_DAYS, 14);

    let running = false;
    const runBackup = async () => {
        if (running) return;
        running = true;
        try {
            const backupPath = await createBackup(db, backupDir, retentionDays);
            console.log(`💾 Database backup created: ${path.basename(backupPath)}`);
        } catch (error) {
            console.error('⚠️ Database backup failed:', error.message);
        } finally {
            running = false;
        }
    };

    runBackup();
    const timer = setInterval(runBackup, intervalHours * HOUR_MS);
    timer.unref();
    return timer;
}

module.exports = { positiveNumber, pruneBackups, createBackup, startBackupScheduler };
