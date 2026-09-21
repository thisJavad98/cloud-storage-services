const fs = require('fs');
const path = require('path');
const db = require('../config/db');

async function migrate(options = {}) {
  const quiet = Boolean(options.quiet);
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
    await db.execute('DROP TABLE IF EXISTS activity_logs CASCADE');
    await db.execute('DROP TABLE IF EXISTS shares CASCADE');
    await db.execute('DROP TABLE IF EXISTS file_versions CASCADE');
    await db.execute('DROP TABLE IF EXISTS files CASCADE');
    await db.execute('DROP TABLE IF EXISTS folders CASCADE');
    await db.execute('DROP TABLE IF EXISTS refresh_tokens CASCADE');
    await db.execute('DROP TABLE IF EXISTS users CASCADE');
    if (!quiet) console.log('Dropped existing tables.');
  }

  const schema = fs.readFileSync(schemaPath, 'utf8');
  await db.execute(schema);

  const tableList = await db.many(
    `SELECT table_name AS name
     FROM information_schema.tables
     WHERE table_schema = 'public'
       AND table_type = 'BASE TABLE'
     ORDER BY table_name`
  );

  if (!quiet) {
    console.log(
      'Migration complete. Tables:',
      tableList.map((row) => row.name).join(', ')
    );
  }

  return tables;
}

if (require.main === module) {
  migrate()
    .then(async () => {
      await db.end();
    })
    .catch(async (error) => {
      console.error(error);
      try {
        await db.end();
      } catch (_endError) {
        // ignore
      }
      process.exit(1);
    });
}

module.exports = migrate;
