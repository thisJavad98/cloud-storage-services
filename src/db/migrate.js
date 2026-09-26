const fs = require('fs');
const path = require('path');
const db = require('../config/db');

async function migrate() {
  await db.ready();

  const schemaPath = path.join(__dirname, 'schema.sql');
  const reset = process.argv.includes('--reset');

  const tables = [
    'activity_logs',
    'shares',
    'file_versions',
    'files',
    'folders',
    'refresh_tokens',
    'users',
  ];

  if (reset) {
    db.exec('PRAGMA foreign_keys = OFF;');
    for (const table of tables) {
      db.exec(`DROP TABLE IF EXISTS ${table};`);
    }
    db.exec('PRAGMA foreign_keys = ON;');
    console.log('Dropped existing tables.');
  }

  const schema = fs.readFileSync(schemaPath, 'utf8');
  db.exec(schema);

  // Additive column migrations for existing databases
  const userColumns = db
    .prepare('PRAGMA table_info(users)')
    .all()
    .map((row) => row.name);

  if (!userColumns.includes('bio')) {
    db.exec('ALTER TABLE users ADD COLUMN bio TEXT;');
    console.log('Added users.bio column.');
  }

  // Feature flags + DB-level signup guard
  db.exec(`
    CREATE TABLE IF NOT EXISTS app_settings (
      key         TEXT PRIMARY KEY,
      value       TEXT NOT NULL,
      updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );
  `);
  db.prepare(
    "INSERT OR IGNORE INTO app_settings (key, value) VALUES ('signup_enabled', '0')"
  ).run();
  // Keep DB flag aligned with env (signup off unless SIGNUP_ENABLED=true)
  const config = require('../config/env');
  db.prepare(
    `INSERT INTO app_settings (key, value, updated_at)
     VALUES ('signup_enabled', ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
     ON CONFLICT(key) DO UPDATE SET
       value = excluded.value,
       updated_at = excluded.updated_at`
  ).run(config.signupEnabled ? '1' : '0');

  db.exec('DROP TRIGGER IF EXISTS prevent_signup_when_disabled;');
  db.exec(`
    CREATE TRIGGER prevent_signup_when_disabled
    BEFORE INSERT ON users
    WHEN (
      SELECT COALESCE(
        (SELECT value FROM app_settings WHERE key = 'signup_enabled'),
        '0'
      ) = '0'
    )
    BEGIN
      SELECT RAISE(ABORT, 'Signup is disabled');
    END;
  `);

  const tableList = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
    )
    .all()
    .map((row) => row.name);

  console.log('Migration complete. Tables:', tableList.join(', '));
  console.log('Database file:', db.path);
}

if (require.main === module) {
  migrate().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = migrate;
