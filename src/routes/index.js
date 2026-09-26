const express = require('express');
const authRoutes = require('./auth.routes');
const filesRoutes = require('./files.routes');
const { noStore } = require('../middleware/noStore');

const router = express.Router();

router.use(noStore);

router.get('/health', (_req, res) => {
  res.json({
    success: true,
    service: 'cloud-storage-services',
    status: 'ok',
    timestamp: new Date().toISOString(),
  });
});

router.use('/auth', authRoutes);
router.use('/files', filesRoutes);

module.exports = router;
