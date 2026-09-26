const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const config = {
  port: Number(process.env.PORT) || 4000,
  nodeEnv: process.env.NODE_ENV || 'development',
  dbPath: process.env.DB_PATH || './data/cloud-storage.db',
  storagePath: process.env.STORAGE_PATH || './uploads',
  maxUploadBytes: Number(process.env.MAX_UPLOAD_BYTES) || 104_857_600,
  maxAvatarBytes: Number(process.env.MAX_AVATAR_BYTES) || 2_097_152,
  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET || 'dev-access-secret',
    refreshSecret: process.env.JWT_REFRESH_SECRET || 'dev-refresh-secret',
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '1h',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  },
  defaultStorageQuotaBytes: Number(process.env.DEFAULT_STORAGE_QUOTA_BYTES) || 5_368_709_120,
  // Signup is off by default; set SIGNUP_ENABLED=true to allow new accounts.
  signupEnabled: String(process.env.SIGNUP_ENABLED || 'false').toLowerCase() === 'true',
  // When set, file/avatar bytes are stored in Vercel Blob (survives deploys & multi-device).
  blobReadWriteToken: process.env.BLOB_READ_WRITE_TOKEN || '',
};

module.exports = config;
