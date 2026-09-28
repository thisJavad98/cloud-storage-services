const crypto = require('crypto');
const config = require('../config/env');

const MAGIC = Buffer.from('CSENC1'); // Cloud Storage ENCrypted v1
const IV_LEN = 12;
const TAG_LEN = 16;

function encryptionEnabled() {
  return Boolean(config.fileEncryptionKey);
}

function getMasterKey() {
  const raw = config.fileEncryptionKey;
  if (!raw) {
    throw new Error('FILE_ENCRYPTION_KEY is not configured');
  }

  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    return Buffer.from(raw, 'hex');
  }

  // Derive a stable 32-byte key from any passphrase.
  return crypto.createHash('sha256').update(String(raw), 'utf8').digest();
}

/**
 * Encrypt plaintext with AES-256-GCM.
 * Layout: MAGIC(6) | IV(12) | AUTH_TAG(16) | CIPHERTEXT
 */
function encryptBuffer(plaintext) {
  if (!encryptionEnabled()) {
    return Buffer.isBuffer(plaintext) ? plaintext : Buffer.from(plaintext);
  }

  const key = getMasterKey();
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([
    cipher.update(Buffer.isBuffer(plaintext) ? plaintext : Buffer.from(plaintext)),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return Buffer.concat([MAGIC, iv, tag, encrypted]);
}

function isEncryptedPayload(buffer) {
  return (
    Buffer.isBuffer(buffer) &&
    buffer.length >= MAGIC.length + IV_LEN + TAG_LEN &&
    buffer.subarray(0, MAGIC.length).equals(MAGIC)
  );
}

/**
 * Decrypt AES-256-GCM payload. Legacy (unencrypted) buffers pass through.
 */
function decryptBuffer(payload) {
  const buffer = Buffer.isBuffer(payload) ? payload : Buffer.from(payload);

  if (!isEncryptedPayload(buffer)) {
    return buffer;
  }

  if (!encryptionEnabled()) {
    throw new Error(
      'Encrypted file found but FILE_ENCRYPTION_KEY is not configured'
    );
  }

  const key = getMasterKey();
  const iv = buffer.subarray(MAGIC.length, MAGIC.length + IV_LEN);
  const tag = buffer.subarray(
    MAGIC.length + IV_LEN,
    MAGIC.length + IV_LEN + TAG_LEN
  );
  const ciphertext = buffer.subarray(MAGIC.length + IV_LEN + TAG_LEN);

  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);

  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

function sha256Hex(buffer) {
  return crypto
    .createHash('sha256')
    .update(Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer))
    .digest('hex');
}

module.exports = {
  encryptionEnabled,
  encryptBuffer,
  decryptBuffer,
  isEncryptedPayload,
  sha256Hex,
  MAGIC,
};
