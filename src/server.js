const app = require('./app');
const config = require('./config/env');
const db = require('./config/db');
const migrate = require('./db/migrate');
const { blobEnabled, encryptionEnabled } = require('./config/storage');
const filesService = require('./services/files.service');

async function start() {
  await db.ready();
  await migrate();

  if (blobEnabled()) {
    console.log('File storage: Vercel Blob (durable, multi-device safe)');
  } else {
    console.log(
      'File storage: local disk (set BLOB_READ_WRITE_TOKEN for durable multi-device storage)'
    );
    filesService.repairMissingLocalFiles();
  }

  if (encryptionEnabled()) {
    console.log('At-rest encryption: AES-256-GCM enabled (FILE_ENCRYPTION_KEY)');
  } else {
    console.warn(
      'At-rest encryption: OFF — set FILE_ENCRYPTION_KEY (64-char hex) for encrypted storage'
    );
  }

  app.listen(config.port, () => {
    console.log(`cloud-storage-services listening on http://localhost:${config.port}`);
    console.log(`Health check: http://localhost:${config.port}/api/health`);
  });
}

start().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
