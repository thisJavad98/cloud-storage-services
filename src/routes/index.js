const express = require('express');
const authRoutes = require('./auth.routes');

const router = express.Router();

router.get('/health', (_req, res) => {
  res.json({
    success: true,
    service: 'cloud-storage-services',
    status: 'ok',
    timestamp: new Date().toISOString(),
  });
});

router.use('/auth', authRoutes);

module.exports = router;
