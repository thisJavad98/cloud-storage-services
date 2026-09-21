const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const config = {
  port: Number(process.env.PORT) || 4000,
  nodeEnv: process.env.NODE_ENV || 'development',
  databaseUrl: process.env.DATABASE_URL || '',
  frontendOrigin: process.env.FRONTEND_ORIGIN || 'http://localhost:3000',
  maxUploadBytes: Number(process.env.MAX_UPLOAD_BYTES) || 104_857_600,
  maxAvatarBytes: Number(process.env.MAX_AVATAR_BYTES) || 2_097_152,
  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET || 'dev-access-secret',
    refreshSecret: process.env.JWT_REFRESH_SECRET || 'dev-refresh-secret',
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '1h',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  },
  defaultStorageQuotaBytes:
    Number(process.env.DEFAULT_STORAGE_QUOTA_BYTES) || 5_368_709_120,
};

module.exports = config;
