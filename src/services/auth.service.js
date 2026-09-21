const { v4: uuidv4 } = require('uuid');
const db = require('../config/db');
const config = require('../config/env');
const { putPublicBlob, deleteBlob, buildAvatarPathname, isBlobUrl } = require('../config/storage');
const AppError = require('../utils/AppError');
const { hashPassword, comparePassword } = require('../utils/password');
const {
  signAccessToken,
  signRefreshToken,
  hashToken,
  refreshExpiryDate,
} = require('../utils/jwt');

const ALLOWED_AVATAR_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
]);

function toIso(value) {
  if (!value) return value;
  if (value instanceof Date) return value.toISOString();
  return value;
}

function publicUser(row) {
  if (!row) return null;

  return {
    id: row.id,
    email: row.email,
    fullName: row.full_name,
    avatarUrl: row.avatar_url,
    bio: row.bio || null,
    role: row.role,
    storageQuotaBytes: Number(row.storage_quota_bytes),
    storageUsedBytes: Number(row.storage_used_bytes),
    isActive: Boolean(row.is_active),
    emailVerifiedAt: toIso(row.email_verified_at),
    lastLoginAt: toIso(row.last_login_at),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

async function deleteAvatarBlob(avatarUrl) {
  if (!avatarUrl || typeof avatarUrl !== 'string') return;
  if (!isBlobUrl(avatarUrl) && !avatarUrl.startsWith('/uploads/avatars/')) {
    return;
  }
  await deleteBlob(avatarUrl);
}

async function createTokenPair(user, meta = {}) {
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
  await db.execute(
    `INSERT INTO refresh_tokens (id, user_id, token_hash, device_info, ip_address, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      tokenId,
      user.id,
      hashToken(refreshToken),
      meta.deviceInfo || null,
      meta.ipAddress || null,
      refreshExpiryDate(),
    ]
  );

  return { accessToken, refreshToken };
}

async function logActivity(userId, action, meta = {}) {
  await db.execute(
    `INSERT INTO activity_logs (id, user_id, action, resource_type, resource_id, ip_address, user_agent, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      uuidv4(),
      userId,
      action,
      meta.resourceType || null,
      meta.resourceId || null,
      meta.ipAddress || null,
      meta.userAgent || null,
      meta.metadata ? JSON.stringify(meta.metadata) : null,
    ]
  );
}

async function signup({ email, password, fullName }, meta = {}) {
  const normalizedEmail = email.trim().toLowerCase();

  const existing = await db.one('SELECT id FROM users WHERE email = $1', [
    normalizedEmail,
  ]);

  if (existing) {
    throw new AppError('Email is already registered', 409);
  }

  const userId = uuidv4();
  const passwordHash = await hashPassword(password);

  await db.transaction(async (tx) => {
    await tx.execute(
      `INSERT INTO users (
         id, email, password_hash, full_name, storage_quota_bytes
       ) VALUES ($1, $2, $3, $4, $5)`,
      [
        userId,
        normalizedEmail,
        passwordHash,
        fullName.trim(),
        config.defaultStorageQuotaBytes,
      ]
    );

    await tx.execute(
      `INSERT INTO folders (id, user_id, parent_id, name, path)
       VALUES ($1, $2, NULL, $3, $4)`,
      [uuidv4(), userId, 'My Drive', '/']
    );
  });

  const user = await db.one('SELECT * FROM users WHERE id = $1', [userId]);
  const tokens = await createTokenPair(user, meta);

  await logActivity(userId, 'auth.signup', {
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
  const user = await db.one('SELECT * FROM users WHERE email = $1', [
    normalizedEmail,
  ]);

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

  await db.execute(
    `UPDATE users SET last_login_at = NOW(), updated_at = NOW() WHERE id = $1`,
    [user.id]
  );

  const refreshed = await db.one('SELECT * FROM users WHERE id = $1', [user.id]);
  const tokens = await createTokenPair(refreshed, meta);

  await logActivity(user.id, 'auth.login', {
    ipAddress: meta.ipAddress,
    userAgent: meta.userAgent,
  });

  return {
    user: publicUser(refreshed),
    ...tokens,
  };
}

async function getProfile(userId) {
  const user = await db.one('SELECT * FROM users WHERE id = $1', [userId]);

  if (!user) {
    throw new AppError('User not found', 404);
  }

  return publicUser(user);
}

async function updateProfile(userId, { fullName, bio }, meta = {}) {
  const user = await db.one('SELECT * FROM users WHERE id = $1', [userId]);

  if (!user) {
    throw new AppError('User not found', 404);
  }

  const nextFullName =
    fullName !== undefined ? String(fullName).trim() : user.full_name;
  const nextBio =
    bio !== undefined
      ? bio === null || bio === ''
        ? null
        : String(bio).trim()
      : user.bio;

  if (!nextFullName || nextFullName.length < 2 || nextFullName.length > 100) {
    throw new AppError('Full name must be between 2 and 100 characters', 422);
  }

  if (nextBio !== null && nextBio.length > 280) {
    throw new AppError('Bio must be at most 280 characters', 422);
  }

  await db.execute(
    `UPDATE users SET full_name = $1, bio = $2, updated_at = NOW() WHERE id = $3`,
    [nextFullName, nextBio, userId]
  );

  await logActivity(userId, 'auth.profile_update', {
    ipAddress: meta.ipAddress,
    userAgent: meta.userAgent,
  });

  return getProfile(userId);
}

async function updateAvatar(userId, file, meta = {}) {
  const user = await db.one('SELECT * FROM users WHERE id = $1', [userId]);

  if (!user) {
    throw new AppError('User not found', 404);
  }

  if (!file) {
    throw new AppError('Avatar image is required', 400);
  }

  if (!ALLOWED_AVATAR_MIME.has(file.mimetype)) {
    throw new AppError('Avatar must be a JPEG, PNG, WebP, or GIF image', 400);
  }

  const pathname = buildAvatarPathname(userId, file.originalname || file.filename);
  const blob = await putPublicBlob(
    pathname,
    file.buffer,
    file.mimetype || 'application/octet-stream'
  );

  const previousAvatar = user.avatar_url;

  await db.execute(
    `UPDATE users SET avatar_url = $1, updated_at = NOW() WHERE id = $2`,
    [blob.url, userId]
  );

  if (previousAvatar && previousAvatar !== blob.url) {
    await deleteAvatarBlob(previousAvatar);
  }

  await logActivity(userId, 'auth.avatar_update', {
    ipAddress: meta.ipAddress,
    userAgent: meta.userAgent,
  });

  return getProfile(userId);
}

async function removeAvatar(userId, meta = {}) {
  const user = await db.one('SELECT * FROM users WHERE id = $1', [userId]);

  if (!user) {
    throw new AppError('User not found', 404);
  }

  if (!user.avatar_url) {
    return publicUser(user);
  }

  const previousAvatar = user.avatar_url;

  await db.execute(
    `UPDATE users SET avatar_url = NULL, updated_at = NOW() WHERE id = $1`,
    [userId]
  );

  await deleteAvatarBlob(previousAvatar);

  await logActivity(userId, 'auth.avatar_remove', {
    ipAddress: meta.ipAddress,
    userAgent: meta.userAgent,
  });

  return getProfile(userId);
}

module.exports = {
  signup,
  login,
  getProfile,
  updateProfile,
  updateAvatar,
  removeAvatar,
  publicUser,
};
