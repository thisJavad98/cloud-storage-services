const app = require('./app');
const config = require('./config/env');
const db = require('./config/db');
const migrate = require('./db/migrate');

async function start() {
  await db.ready();
  await migrate();

  app.listen(config.port, () => {
    console.log(`cloud-storage-services listening on http://localhost:${config.port}`);
    console.log(`Health check: http://localhost:${config.port}/api/health`);
  });
}

start().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
