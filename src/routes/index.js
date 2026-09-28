const express = require('express');
const authRoutes = require('./auth.routes');
const filesRoutes = require('./files.routes');
const { noStore } = require('../middleware/noStore');

const router = express.Router();

router.use(noStore);

router.get('/health', (_req, res) => {
  const { blobEnabled, encryptionEnabled } = require('../config/storage');
  res.json({
    success: true,
    service: 'cloud-storage-services',
    status: 'ok',
    timestamp: new Date().toISOString(),
    security: {
      atRestEncryption: encryptionEnabled() ? 'aes-256-gcm' : 'off',
      objectStore: blobEnabled() ? 'vercel-blob' : 'local-disk',
      downloads: 'auth-proxied',
    },
  });
});

router.use('/auth', authRoutes);
router.use('/files', filesRoutes);

module.exports = router;
