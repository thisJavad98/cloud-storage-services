const { put, del } = require('@vercel/blob');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const config = require('./env');

function extensionFromName(name, fallback = '') {
  const ext = path.extname(name || '').slice(0, 32);
  return ext || fallback;
}

function buildFilePathname(userId, originalName) {
  const ext = extensionFromName(originalName);
  return `users/${userId}/files/${uuidv4()}${ext}`;
}

function buildAvatarPathname(userId, originalName) {
  const ext = extensionFromName(originalName, '.jpg');
  return `users/${userId}/avatars/${uuidv4()}${ext}`;
}

async function putPublicBlob(pathname, body, contentType) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    throw new Error(
      'BLOB_READ_WRITE_TOKEN is required. Enable Vercel Blob and set the token.'
    );
  }

  return put(pathname, body, {
    access: 'public',
    token: process.env.BLOB_READ_WRITE_TOKEN,
    contentType: contentType || undefined,
    addRandomSuffix: false,
  });
}

async function deleteBlob(urlOrPathname) {
  if (!urlOrPathname) return;

  try {
    await del(urlOrPathname, {
      token: process.env.BLOB_READ_WRITE_TOKEN,
    });
  } catch {
    // Best-effort cleanup; DB remains source of truth for metadata.
  }
}

function isBlobUrl(value) {
  return typeof value === 'string' && /^https?:\/\//i.test(value);
}

module.exports = {
  buildFilePathname,
  buildAvatarPathname,
  putPublicBlob,
  deleteBlob,
  isBlobUrl,
  maxUploadBytes: () => config.maxUploadBytes,
  maxAvatarBytes: () => config.maxAvatarBytes,
};
