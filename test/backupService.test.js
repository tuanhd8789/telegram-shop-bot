const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Database = require('better-sqlite3');
const { positiveNumber, pruneBackups, createBackup } = require('../src/services/backupService');

test('positiveNumber falls back for invalid values', () => {
    assert.equal(positiveNumber('12', 24), 12);
    assert.equal(positiveNumber('0', 24), 24);
    assert.equal(positiveNumber('invalid', 24), 24);
});

test('pruneBackups removes only expired database snapshots', (t) => {
    const backupDir = fs.mkdtempSync(path.join(os.tmpdir(), 'shop-backup-test-'));
    t.after(() => fs.rmSync(backupDir, { recursive: true, force: true }));
    const oldBackup = path.join(backupDir, 'shop-old.db');
    const recentBackup = path.join(backupDir, 'shop-recent.db');
    const unrelated = path.join(backupDir, 'notes.txt');
    fs.writeFileSync(oldBackup, 'old');
    fs.writeFileSync(recentBackup, 'recent');
    fs.writeFileSync(unrelated, 'keep');
    fs.utimesSync(oldBackup, new Date(0), new Date(0));

    pruneBackups(backupDir, 14, 30 * 24 * 60 * 60 * 1000);

    assert.equal(fs.existsSync(oldBackup), false);
    assert.equal(fs.existsSync(recentBackup), true);
    assert.equal(fs.existsSync(unrelated), true);
});

test('createBackup produces a readable SQLite snapshot', async (t) => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'shop-backup-db-test-'));
    t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));
    const source = new Database(path.join(tempDir, 'source.db'));
    t.after(() => source.close());
    source.exec('CREATE TABLE products (name TEXT); INSERT INTO products VALUES (\'demo\');');

    const backupPath = await createBackup(source, path.join(tempDir, 'backups'), 14);
    const backup = new Database(backupPath, { readonly: true });
    t.after(() => backup.close());

    assert.equal(backup.prepare('SELECT name FROM products').pluck().get(), 'demo');
});
