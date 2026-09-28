const fs = require('fs');
const path = require('path');
const { put, del } = require('@vercel/blob');
const { v4: uuidv4 } = require('uuid');
const config = require('./env');
const {
  encryptBuffer,
  decryptBuffer,
  encryptionEnabled,
} = require('../security/cryptoAtRest');
const AppError = require('../utils/AppError');

function getStorageRoot() {
  return path.isAbsolute(config.storagePath)
    ? config.storagePath
    : path.join(process.cwd(), config.storagePath);
}

function ensureStorageRoot() {
  const root = getStorageRoot();
  fs.mkdirSync(root, { recursive: true });
  return root;
}

function getAvatarsRoot() {
  return path.join(getStorageRoot(), 'avatars');
}

function ensureAvatarsRoot() {
  const root = getAvatarsRoot();
  fs.mkdirSync(root, { recursive: true });
  return root;
}

function absolutePathForKey(storageKey) {
  const root = ensureStorageRoot();
  const absolute = path.join(root, storageKey);
  const normalizedRoot = path.resolve(root);
  const normalizedFile = path.resolve(absolute);

  if (
    normalizedFile !== normalizedRoot &&
    !normalizedFile.startsWith(`${normalizedRoot}${path.sep}`)
  ) {
    throw new Error('Invalid storage key');
  }

  return absolute;
}

function isRemoteStorageKey(storageKey) {
  return typeof storageKey === 'string' && /^https?:\/\//i.test(storageKey);
}

function blobEnabled() {
  return Boolean(config.blobReadWriteToken);
}

function extensionFromName(name, fallback = '') {
  const ext = path.extname(name || '').slice(0, 32);
  return ext || fallback;
}

async function putPublicBlob(pathname, body, contentType) {
  if (!config.blobReadWriteToken) {
    throw new Error(
      'BLOB_READ_WRITE_TOKEN is required. Enable Vercel Blob and set the token.'
    );
  }

  return put(pathname, body, {
    access: 'public',
    token: config.blobReadWriteToken,
    contentType: contentType || undefined,
    addRandomSuffix: false,
  });
}

/**
 * Persist user file bytes. Content is AES-256-GCM encrypted when
 * FILE_ENCRYPTION_KEY is set. Blob stores ciphertext as application/octet-stream
 * so a leaked URL cannot reveal the original file without the server key.
 */
async function storeUploadedFile({ userId, uploaded, originalName, mimeType }) {
  const ext = extensionFromName(
    originalName || uploaded.originalname || uploaded.filename,
    path.extname(uploaded.filename || uploaded.path || '')
  );

  const plaintext = fs.readFileSync(uploaded.path);
  const payload = encryptBuffer(plaintext);
  const storedMime = encryptionEnabled()
    ? 'application/octet-stream'
    : mimeType || 'application/octet-stream';
  const encSuffix = encryptionEnabled() ? '.enc' : '';

  if (blobEnabled()) {
    const pathname = `users/${userId}/files/${uuidv4()}${ext}${encSuffix}`;
    const blob = await putPublicBlob(pathname, payload, storedMime);

    try {
      fs.unlinkSync(uploaded.path);
    } catch {
      // Temp local file cleanup is best-effort.
    }

    return blob.url;
  }

  if (encryptionEnabled()) {
    const filename = `${uuidv4()}${ext}.enc`;
    const absolute = absolutePathForKey(filename);
    fs.writeFileSync(absolute, payload);

    try {
      fs.unlinkSync(uploaded.path);
    } catch {
      // ignore
    }

    return filename;
  }

  return path.basename(uploaded.path);
}

async function storeUploadedAvatar({ userId, uploaded, mimeType }) {
  const ext = extensionFromName(
    uploaded.originalname || uploaded.filename,
    path.extname(uploaded.filename || uploaded.path || '') || '.jpg'
  );

  if (blobEnabled()) {
    const pathname = `users/${userId}/avatars/${uuidv4()}${ext}`;
    const body = fs.readFileSync(uploaded.path);
    const blob = await putPublicBlob(pathname, body, mimeType);

    try {
      fs.unlinkSync(uploaded.path);
    } catch {
      // ignore
    }

    return blob.url;
  }

  const filename = path.basename(uploaded.filename || uploaded.path);
  return `/uploads/avatars/${filename}`;
}

/**
 * Load stored bytes and decrypt (legacy plaintext passes through).
 */
async function readStoredObject(storageKey) {
  if (!storageKey) {
    throw new AppError('Stored file content is missing', 404);
  }

  let raw;

  if (isRemoteStorageKey(storageKey)) {
    const response = await fetch(storageKey);
    if (!response.ok) {
      throw new AppError('Stored file content is missing', 404);
    }
    raw = Buffer.from(await response.arrayBuffer());
  } else {
    const absolute = absolutePathForKey(storageKey);
    if (!fs.existsSync(absolute)) {
      throw new AppError('Stored file content is missing', 404);
    }
    raw = fs.readFileSync(absolute);
  }

  try {
    return decryptBuffer(raw);
  } catch (error) {
    throw new AppError(
      error.message || 'Failed to decrypt stored file',
      500
    );
  }
}

async function deleteStoredObject(storageKeyOrUrl) {
  if (!storageKeyOrUrl) return;

  if (isRemoteStorageKey(storageKeyOrUrl)) {
    try {
      await del(storageKeyOrUrl, {
        token: config.blobReadWriteToken,
      });
    } catch {
      // Best-effort cleanup; DB remains source of truth for metadata.
    }
    return;
  }

  if (
    typeof storageKeyOrUrl === 'string' &&
    storageKeyOrUrl.startsWith('/uploads/')
  ) {
    const key = storageKeyOrUrl.replace(/^\/uploads\//, '');
    try {
      const absolute = absolutePathForKey(key);
      if (fs.existsSync(absolute)) {
        fs.unlinkSync(absolute);
      }
    } catch {
      // ignore
    }
    return;
  }

  try {
    const absolute = absolutePathForKey(storageKeyOrUrl);
    if (fs.existsSync(absolute)) {
      fs.unlinkSync(absolute);
    }
  } catch {
    // ignore
  }
}

function localContentExists(storageKey) {
  if (!storageKey || isRemoteStorageKey(storageKey)) {
    return true;
  }

  try {
    return fs.existsSync(absolutePathForKey(storageKey));
  } catch {
    return false;
  }
}

module.exports = {
  getStorageRoot,
  ensureStorageRoot,
  getAvatarsRoot,
  ensureAvatarsRoot,
  absolutePathForKey,
  isRemoteStorageKey,
  blobEnabled,
  storeUploadedFile,
  storeUploadedAvatar,
  readStoredObject,
  deleteStoredObject,
  localContentExists,
  encryptionEnabled,
};
