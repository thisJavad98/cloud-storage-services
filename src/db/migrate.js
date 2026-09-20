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
