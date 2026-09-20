const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const db = require('../config/db');
const { absolutePathForKey, ensureStorageRoot } = require('../config/storage');
const AppError = require('../utils/AppError');

function publicFile(row) {
  if (!row) return null;

  return {
    id: row.id,
    userId: row.user_id,
    folderId: row.folder_id,
    name: row.name,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    storageKey: row.storage_key,
    checksumSha256: row.checksum_sha256,
    version: row.version,
    isTrashed: Boolean(row.is_trashed),
    trashedAt: row.trashed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function publicFolder(row) {
  if (!row) return null;

  return {
    id: row.id,
    userId: row.user_id,
    parentId: row.parent_id,
    name: row.name,
    path: row.path,
    isTrashed: Boolean(row.is_trashed),
    trashedAt: row.trashed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    fileCount: row.file_count != null ? Number(row.file_count) : undefined,
  };
}

function getUserOrThrow(userId) {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  if (!user) {
    throw new AppError('User not found', 404);
  }
  if (!user.is_active) {
    throw new AppError('Account is deactivated', 403);
  }
  return user;
}

function getOwnedFileOrThrow(userId, fileId, { includeTrashed = true } = {}) {
  const file = db
    .prepare('SELECT * FROM files WHERE id = ? AND user_id = ?')
    .get(fileId, userId);

  if (!file) {
    throw new AppError('File not found', 404);
  }

  if (!includeTrashed && file.is_trashed) {
    throw new AppError('File not found', 404);
  }

  return file;
}

function assertFolderOwned(userId, folderId) {
  if (!folderId) return null;

  const folder = db
    .prepare(
      `SELECT * FROM folders
       WHERE id = ? AND user_id = ? AND is_trashed = 0`
    )
    .get(folderId, userId);

  if (!folder) {
    throw new AppError('Folder not found', 404);
  }

  return folder;
}

function findNameConflict(userId, folderId, name, excludeId = null) {
  const row = db
    .prepare(
      `SELECT id FROM files
       WHERE user_id = ?
         AND ((folder_id IS NULL AND ? IS NULL) OR folder_id = ?)
         AND name = ?
         AND is_trashed = 0
         AND (? IS NULL OR id != ?)`
    )
    .get(userId, folderId, folderId, name, excludeId, excludeId);

  return Boolean(row);
}

function sanitizeFileName(name) {
  const cleaned = String(name || '')
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleaned) {
    throw new AppError('File name is required', 400);
  }

  return cleaned.slice(0, 255);
}

function logActivity(userId, action, meta = {}) {
  db.prepare(
    `INSERT INTO activity_logs (id, user_id, action, resource_type, resource_id, ip_address, user_agent, metadata)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    uuidv4(),
    userId,
    action,
    meta.resourceType || 'file',
    meta.resourceId || null,
    meta.ipAddress || null,
    meta.userAgent || null,
    meta.metadata ? JSON.stringify(meta.metadata) : null
  );
}

function removeStoredFile(storageKey) {
  try {
    const absolute = absolutePathForKey(storageKey);
    if (fs.existsSync(absolute)) {
      fs.unlinkSync(absolute);
    }
  } catch {
    // Best-effort cleanup; DB remains source of truth for metadata.
  }
}

function uploadFile(userId, uploaded, options = {}, meta = {}) {
  if (!uploaded || !uploaded.path) {
    throw new AppError('File is required', 400);
  }

  const user = getUserOrThrow(userId);
  const folderId = options.folderId || null;
  assertFolderOwned(userId, folderId);

  const name = sanitizeFileName(options.name || uploaded.originalname);
  const sizeBytes = Number(uploaded.size) || 0;
  const mimeType = uploaded.mimetype || 'application/octet-stream';

  if (findNameConflict(userId, folderId, name)) {
    removeStoredFile(path.basename(uploaded.path));
    throw new AppError('A file with this name already exists in this folder', 409);
  }

  if (user.storage_used_bytes + sizeBytes > user.storage_quota_bytes) {
    removeStoredFile(path.basename(uploaded.path));
    throw new AppError('Storage quota exceeded', 413);
  }

  const fileBuffer = fs.readFileSync(uploaded.path);
  const checksum = crypto.createHash('sha256').update(fileBuffer).digest('hex');
  const fileId = uuidv4();
  const storageKey = path.basename(uploaded.path);
  const now = new Date().toISOString();

  const write = db.transaction(() => {
    db.prepare(
      `INSERT INTO files (
         id, user_id, folder_id, name, mime_type, size_bytes,
         storage_key, checksum_sha256, version, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`
    ).run(
      fileId,
      userId,
      folderId,
      name,
      mimeType,
      sizeBytes,
      storageKey,
      checksum,
      now,
      now
    );

    db.prepare(
      `UPDATE users
       SET storage_used_bytes = storage_used_bytes + ?, updated_at = ?
       WHERE id = ?`
    ).run(sizeBytes, now, userId);
  });

  try {
    write();
  } catch (error) {
    removeStoredFile(storageKey);
    throw error;
  }

  const file = db.prepare('SELECT * FROM files WHERE id = ?').get(fileId);

  logActivity(userId, 'file.upload', {
    resourceId: fileId,
    ipAddress: meta.ipAddress,
    userAgent: meta.userAgent,
    metadata: { name, sizeBytes, mimeType },
  });

  return publicFile(file);
}

function listFiles(userId, query = {}) {
  getUserOrThrow(userId);

  const includeTrashed = query.trashed === true || query.trashed === 'true';
  const folderId = query.folderId === undefined ? undefined : query.folderId || null;
  const search = typeof query.search === 'string' ? query.search.trim() : '';
  const limit = Math.min(Math.max(Number(query.limit) || 50, 1), 200);
  const offset = Math.max(Number(query.offset) || 0, 0);

  const where = ['user_id = ?'];
  const params = [userId];

  if (includeTrashed) {
    where.push('is_trashed = 1');
  } else {
    where.push('is_trashed = 0');
  }

  if (folderId !== undefined) {
    where.push('((folder_id IS NULL AND ? IS NULL) OR folder_id = ?)');
    params.push(folderId, folderId);
  }

  if (search) {
    where.push('LOWER(name) LIKE ?');
    params.push(`%${search.toLowerCase()}%`);
  }

  const rows = db
    .prepare(
      `SELECT * FROM files
       WHERE ${where.join(' AND ')}
       ORDER BY updated_at DESC
       LIMIT ? OFFSET ?`
    )
    .all(...params, limit, offset);

  const total = db
    .prepare(
      `SELECT COUNT(*) AS count FROM files WHERE ${where.join(' AND ')}`
    )
    .get(...params).count;

  return {
    files: rows.map(publicFile),
    pagination: {
      total: Number(total),
      limit,
      offset,
    },
  };
}

function getFile(userId, fileId) {
  return publicFile(getOwnedFileOrThrow(userId, fileId));
}

function getDownloadTarget(userId, fileId) {
  const file = getOwnedFileOrThrow(userId, fileId, { includeTrashed: false });
  const absolutePath = absolutePathForKey(file.storage_key);

  if (!fs.existsSync(absolutePath)) {
    throw new AppError('Stored file content is missing', 404);
  }

  return {
    file: publicFile(file),
    absolutePath,
  };
}

function updateFile(userId, fileId, payload = {}, meta = {}) {
  const file = getOwnedFileOrThrow(userId, fileId, { includeTrashed: false });
  const nextName =
    payload.name !== undefined ? sanitizeFileName(payload.name) : file.name;
  const nextFolderId =
    payload.folderId !== undefined ? payload.folderId || null : file.folder_id;

  assertFolderOwned(userId, nextFolderId);

  if (findNameConflict(userId, nextFolderId, nextName, file.id)) {
    throw new AppError('A file with this name already exists in this folder', 409);
  }

  const now = new Date().toISOString();
  db.prepare(
    `UPDATE files
     SET name = ?, folder_id = ?, updated_at = ?
     WHERE id = ? AND user_id = ?`
  ).run(nextName, nextFolderId, now, fileId, userId);

  const updated = db.prepare('SELECT * FROM files WHERE id = ?').get(fileId);

  logActivity(userId, 'file.update', {
    resourceId: fileId,
    ipAddress: meta.ipAddress,
    userAgent: meta.userAgent,
    metadata: { name: nextName, folderId: nextFolderId },
  });

  return publicFile(updated);
}

function trashFile(userId, fileId, meta = {}) {
  const file = getOwnedFileOrThrow(userId, fileId, { includeTrashed: false });
  const now = new Date().toISOString();

  db.prepare(
    `UPDATE files
     SET is_trashed = 1, trashed_at = ?, updated_at = ?
     WHERE id = ? AND user_id = ?`
  ).run(now, now, fileId, userId);

  logActivity(userId, 'file.trash', {
    resourceId: fileId,
    ipAddress: meta.ipAddress,
    userAgent: meta.userAgent,
  });

  return publicFile(db.prepare('SELECT * FROM files WHERE id = ?').get(fileId));
}

function restoreFile(userId, fileId, meta = {}) {
  const file = getOwnedFileOrThrow(userId, fileId);

  if (!file.is_trashed) {
    throw new AppError('File is not in trash', 400);
  }

  if (findNameConflict(userId, file.folder_id, file.name, file.id)) {
    throw new AppError('A file with this name already exists in this folder', 409);
  }

  const now = new Date().toISOString();
  db.prepare(
    `UPDATE files
     SET is_trashed = 0, trashed_at = NULL, updated_at = ?
     WHERE id = ? AND user_id = ?`
  ).run(now, fileId, userId);

  logActivity(userId, 'file.restore', {
    resourceId: fileId,
    ipAddress: meta.ipAddress,
    userAgent: meta.userAgent,
  });

  return publicFile(db.prepare('SELECT * FROM files WHERE id = ?').get(fileId));
}

function deleteFilePermanent(userId, fileId, meta = {}) {
  const file = getOwnedFileOrThrow(userId, fileId);
  const now = new Date().toISOString();

  const remove = db.transaction(() => {
    db.prepare('DELETE FROM files WHERE id = ? AND user_id = ?').run(fileId, userId);

    if (!file.is_trashed) {
      db.prepare(
        `UPDATE users
         SET storage_used_bytes = MAX(storage_used_bytes - ?, 0), updated_at = ?
         WHERE id = ?`
      ).run(file.size_bytes, now, userId);
    } else {
      // Trashed files still counted in usage until permanently deleted.
      db.prepare(
        `UPDATE users
         SET storage_used_bytes = MAX(storage_used_bytes - ?, 0), updated_at = ?
         WHERE id = ?`
      ).run(file.size_bytes, now, userId);
    }
  });

  remove();
  removeStoredFile(file.storage_key);

  logActivity(userId, 'file.delete', {
    resourceId: fileId,
    ipAddress: meta.ipAddress,
    userAgent: meta.userAgent,
    metadata: { name: file.name, sizeBytes: file.size_bytes },
  });

  return { id: fileId, deleted: true };
}

function listFolders(userId) {
  getUserOrThrow(userId);

  const rows = db
    .prepare(
      `SELECT f.*,
              (
                SELECT COUNT(*) FROM files fi
                WHERE fi.folder_id = f.id
                  AND fi.user_id = f.user_id
                  AND fi.is_trashed = 0
              ) AS file_count
       FROM folders f
       WHERE f.user_id = ? AND f.is_trashed = 0
       ORDER BY f.name ASC`
    )
    .all(userId);

  return rows.map(publicFolder);
}

function createFolder(userId, { name, parentId = null } = {}, meta = {}) {
  getUserOrThrow(userId);
  const folderName = sanitizeFileName(name);
  let parentPath = '/';

  if (parentId) {
    const parent = assertFolderOwned(userId, parentId);
    parentPath = parent.path.endsWith('/') ? parent.path : `${parent.path}/`;
  }

  const existing = db
    .prepare(
      `SELECT id FROM folders
       WHERE user_id = ?
         AND ((parent_id IS NULL AND ? IS NULL) OR parent_id = ?)
         AND name = ?
         AND is_trashed = 0`
    )
    .get(userId, parentId, parentId, folderName);

  if (existing) {
    throw new AppError('A folder with this name already exists', 409);
  }

  const folderId = uuidv4();
  const folderPath = `${parentPath}${folderName}`;
  const now = new Date().toISOString();

  db.prepare(
    `INSERT INTO folders (id, user_id, parent_id, name, path, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(folderId, userId, parentId, folderName, folderPath, now, now);

  logActivity(userId, 'folder.create', {
    resourceType: 'folder',
    resourceId: folderId,
    ipAddress: meta.ipAddress,
    userAgent: meta.userAgent,
    metadata: { name: folderName, parentId },
  });

  return publicFolder(db.prepare('SELECT * FROM folders WHERE id = ?').get(folderId));
}

ensureStorageRoot();

module.exports = {
  uploadFile,
  listFiles,
  getFile,
  getDownloadTarget,
  updateFile,
  trashFile,
  restoreFile,
  deleteFilePermanent,
  listFolders,
  createFolder,
  publicFile,
  publicFolder,
};
