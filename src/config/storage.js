const fs = require('fs');
const path = require('path');
const config = require('./env');

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

module.exports = {
  getStorageRoot,
  ensureStorageRoot,
  getAvatarsRoot,
  ensureAvatarsRoot,
  absolutePathForKey,
};
