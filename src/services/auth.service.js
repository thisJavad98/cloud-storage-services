const { v4: uuidv4 } = require('uuid');
const db = require('../config/db');
const config = require('../config/env');
const AppError = require('../utils/AppError');
const { hashPassword, comparePassword } = require('../utils/password');
const {
  signAccessToken,
  signRefreshToken,
  hashToken,
  refreshExpiryDate,
} = require('../utils/jwt');

function publicUser(row) {
  if (!row) return null;

  return {
    id: row.id,
    email: row.email,
    fullName: row.full_name,
    avatarUrl: row.avatar_url,
    role: row.role,
    storageQuotaBytes: row.storage_quota_bytes,
    storageUsedBytes: row.storage_used_bytes,
    isActive: Boolean(row.is_active),
    emailVerifiedAt: row.email_verified_at,
    lastLoginAt: row.last_login_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function createTokenPair(user, meta = {}) {
  const accessToken = signAccessToken({
    sub: user.id,
    email: user.email,
    role: user.role,
  });

  const refreshToken = signRefreshToken({
    sub: user.id,
    type: 'refresh',
  });

  const tokenId = uuidv4();
  db.prepare(
    `INSERT INTO refresh_tokens (id, user_id, token_hash, device_info, ip_address, expires_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(
    tokenId,
    user.id,
    hashToken(refreshToken),
    meta.deviceInfo || null,
    meta.ipAddress || null,
    refreshExpiryDate()
  );

  return { accessToken, refreshToken };
}

function logActivity(userId, action, meta = {}) {
  db.prepare(
    `INSERT INTO activity_logs (id, user_id, action, resource_type, resource_id, ip_address, user_agent, metadata)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    uuidv4(),
    userId,
    action,
    meta.resourceType || null,
    meta.resourceId || null,
    meta.ipAddress || null,
    meta.userAgent || null,
    meta.metadata ? JSON.stringify(meta.metadata) : null
  );
}

async function signup({ email, password, fullName }, meta = {}) {
  const normalizedEmail = email.trim().toLowerCase();

  const existing = db
    .prepare('SELECT id FROM users WHERE email = ?')
    .get(normalizedEmail);

  if (existing) {
    throw new AppError('Email is already registered', 409);
  }

  const userId = uuidv4();
  const passwordHash = await hashPassword(password);
  const now = new Date().toISOString();

  const insertUser = db.transaction(() => {
    db.prepare(
      `INSERT INTO users (
         id, email, password_hash, full_name, storage_quota_bytes, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(
      userId,
      normalizedEmail,
      passwordHash,
      fullName.trim(),
      config.defaultStorageQuotaBytes,
      now,
      now
    );

    // Create a root folder marker path for the user
    db.prepare(
      `INSERT INTO folders (id, user_id, parent_id, name, path)
       VALUES (?, ?, NULL, ?, ?)`
    ).run(uuidv4(), userId, 'My Drive', '/');
  });

  insertUser();

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  const tokens = createTokenPair(user, meta);

  logActivity(userId, 'auth.signup', {
    ipAddress: meta.ipAddress,
    userAgent: meta.userAgent,
  });

  return {
    user: publicUser(user),
    ...tokens,
  };
}

async function login({ email, password }, meta = {}) {
  const normalizedEmail = email.trim().toLowerCase();
  const user = db
    .prepare('SELECT * FROM users WHERE email = ?')
    .get(normalizedEmail);

  if (!user) {
    throw new AppError('Invalid email or password', 401);
  }

  if (!user.is_active) {
    throw new AppError('Account is deactivated', 403);
  }

  const valid = await comparePassword(password, user.password_hash);
  if (!valid) {
    throw new AppError('Invalid email or password', 401);
  }

  const now = new Date().toISOString();
  db.prepare(
    `UPDATE users SET last_login_at = ?, updated_at = ? WHERE id = ?`
  ).run(now, now, user.id);

  const refreshed = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id);
  const tokens = createTokenPair(refreshed, meta);

  logActivity(user.id, 'auth.login', {
    ipAddress: meta.ipAddress,
    userAgent: meta.userAgent,
  });

  return {
    user: publicUser(refreshed),
    ...tokens,
  };
}

function getProfile(userId) {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);

  if (!user) {
    throw new AppError('User not found', 404);
  }

  return publicUser(user);
}

module.exports = {
  signup,
  login,
  getProfile,
  publicUser,
};
