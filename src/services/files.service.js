const { v4: uuidv4 } = require('uuid');
const db = require('../config/db');
const config = require('../config/env');
const { deleteBlob } = require('../config/storage');
const AppError = require('../utils/AppError');

function toIso(value) {
  if (!value) return value;
  if (value instanceof Date) return value.toISOString();
  return value;
}

function publicFile(row) {
  if (!row) return null;

  return {
    id: row.id,
    userId: row.user_id,
    folderId: row.folder_id,
    name: row.name,
    mimeType: row.mime_type,
    sizeBytes: Number(row.size_bytes),
    storageKey: row.storage_key,
    checksumSha256: row.checksum_sha256,
    version: row.version,
    isTrashed: Boolean(row.is_trashed),
    trashedAt: toIso(row.trashed_at),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
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
    trashedAt: toIso(row.trashed_at),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
    fileCount: row.file_count != null ? Number(row.file_count) : undefined,
  };
}

async function getUserOrThrow(userId) {
  const user = await db.one('SELECT * FROM users WHERE id = $1', [userId]);
  if (!user) {
    throw new AppError('User not found', 404);
  }
  if (!user.is_active) {
    throw new AppError('Account is deactivated', 403);
  }
  return user;
}

async function getOwnedFileOrThrow(userId, fileId, { includeTrashed = true } = {}) {
  const file = await db.one(
    'SELECT * FROM files WHERE id = $1 AND user_id = $2',
    [fileId, userId]
  );

  if (!file) {
    throw new AppError('File not found', 404);
  }

  if (!includeTrashed && file.is_trashed) {
    throw new AppError('File not found', 404);
  }

  return file;
}

async function assertFolderOwned(userId, folderId) {
  if (!folderId) return null;

  const folder = await db.one(
    `SELECT * FROM folders
     WHERE id = $1 AND user_id = $2 AND is_trashed = FALSE`,
    [folderId, userId]
  );

  if (!folder) {
    throw new AppError('Folder not found', 404);
  }

  return folder;
}

async function findNameConflict(userId, folderId, name, excludeId = null) {
  const row = await db.one(
    `SELECT id FROM files
     WHERE user_id = $1
       AND folder_id IS NOT DISTINCT FROM $2
       AND name = $3
       AND is_trashed = FALSE
       AND ($4::text IS NULL OR id != $4)`,
    [userId, folderId, name, excludeId]
  );

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

async function logActivity(userId, action, meta = {}) {
  await db.execute(
    `INSERT INTO activity_logs (id, user_id, action, resource_type, resource_id, ip_address, user_agent, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      uuidv4(),
      userId,
      action,
      meta.resourceType || 'file',
      meta.resourceId || null,
      meta.ipAddress || null,
      meta.userAgent || null,
      meta.metadata ? JSON.stringify(meta.metadata) : null,
    ]
  );
}

async function removeStoredFile(storageKey) {
  await deleteBlob(storageKey);
}

async function validateUploadIntent(userId, options = {}) {
  const user = await getUserOrThrow(userId);
  const folderId = options.folderId || null;
  await assertFolderOwned(userId, folderId);

  const name = sanitizeFileName(options.name || options.originalName || 'upload');
  const sizeBytes = Number(options.sizeBytes) || 0;

  if (await findNameConflict(userId, folderId, name)) {
    throw new AppError('A file with this name already exists in this folder', 409);
  }

  if (sizeBytes > 0 && Number(user.storage_used_bytes) + sizeBytes > Number(user.storage_quota_bytes)) {
    throw new AppError('Storage quota exceeded', 413);
  }

  const remaining =
    Number(user.storage_quota_bytes) - Number(user.storage_used_bytes);

  return {
    user,
    folderId,
    name,
    remainingBytes: Math.max(remaining, 0),
    maxUploadBytes: Math.min(config.maxUploadBytes, Math.max(remaining, 0)),
  };
}

async function registerUploadedFile(userId, blobMeta = {}, options = {}, meta = {}) {
  if (!blobMeta.url && !blobMeta.pathname) {
    throw new AppError('Uploaded blob is required', 400);
  }

  const storageKey = blobMeta.url || blobMeta.pathname;
  const existing = await db.one(
    'SELECT * FROM files WHERE storage_key = $1',
    [storageKey]
  );
  if (existing) {
    return publicFile(existing);
  }

  const intent = await validateUploadIntent(userId, {
    folderId: options.folderId,
    name: options.name || blobMeta.pathname,
    sizeBytes: blobMeta.size || options.sizeBytes || 0,
    originalName: options.name,
  });

  const sizeBytes = Number(blobMeta.size) || Number(options.sizeBytes) || 0;
  const mimeType =
    blobMeta.contentType || options.mimeType || 'application/octet-stream';
  const fileId = uuidv4();

  if (Number(intent.user.storage_used_bytes) + sizeBytes > Number(intent.user.storage_quota_bytes)) {
    await removeStoredFile(storageKey);
    throw new AppError('Storage quota exceeded', 413);
  }

  try {
    await db.transaction(async (tx) => {
      await tx.execute(
        `INSERT INTO files (
           id, user_id, folder_id, name, mime_type, size_bytes,
           storage_key, checksum_sha256, version
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 1)`,
        [
          fileId,
          userId,
          intent.folderId,
          intent.name,
          mimeType,
          sizeBytes,
          storageKey,
          options.checksumSha256 || null,
        ]
      );

      await tx.execute(
        `UPDATE users
         SET storage_used_bytes = storage_used_bytes + $1, updated_at = NOW()
         WHERE id = $2`,
        [sizeBytes, userId]
      );
    });
  } catch (error) {
    await removeStoredFile(storageKey);
    throw error;
  }

  const file = await db.one('SELECT * FROM files WHERE id = $1', [fileId]);

  await logActivity(userId, 'file.upload', {
    resourceId: fileId,
    ipAddress: meta.ipAddress,
    userAgent: meta.userAgent,
    metadata: { name: intent.name, sizeBytes, mimeType },
  });

  return publicFile(file);
}

async function listFiles(userId, query = {}) {
  await getUserOrThrow(userId);

  const includeTrashed = query.trashed === true || query.trashed === 'true';
  let folderId;
  if (query.folderId === undefined) {
    folderId = undefined;
  } else if (
    query.folderId === null ||
    query.folderId === '' ||
    query.folderId === 'null' ||
    query.folderId === 'root'
  ) {
    folderId = null;
  } else {
    folderId = query.folderId;
    await assertFolderOwned(userId, folderId);
  }

  const search = typeof query.search === 'string' ? query.search.trim() : '';
  const mimeType =
    typeof query.mimeType === 'string' ? query.mimeType.trim().toLowerCase() : '';
  const minSizeRaw = query.minSize;
  const maxSizeRaw = query.maxSize;
  const minSize =
    minSizeRaw !== undefined && minSizeRaw !== '' && Number.isFinite(Number(minSizeRaw))
      ? Math.max(Number(minSizeRaw), 0)
      : null;
  const maxSize =
    maxSizeRaw !== undefined && maxSizeRaw !== '' && Number.isFinite(Number(maxSizeRaw))
      ? Math.max(Number(maxSizeRaw), 0)
      : null;
  const limit = Math.min(Math.max(Number(query.limit) || 50, 1), 200);
  const offset = Math.max(Number(query.offset) || 0, 0);

  const where = ['user_id = $1'];
  const params = [userId];

  if (includeTrashed) {
    where.push('is_trashed = TRUE');
  } else {
    where.push('is_trashed = FALSE');
  }

  if (folderId !== undefined) {
    params.push(folderId);
    where.push(`folder_id IS NOT DISTINCT FROM $${params.length}`);
  }

  if (search) {
    params.push(`%${search.toLowerCase()}%`);
    where.push(`LOWER(name) LIKE $${params.length}`);
  }

  if (mimeType) {
    if (mimeType.endsWith('/')) {
      params.push(`${mimeType}%`);
      where.push(`LOWER(mime_type) LIKE $${params.length}`);
    } else {
      params.push(mimeType);
      where.push(`LOWER(mime_type) = $${params.length}`);
    }
  }

  if (minSize !== null) {
    params.push(minSize);
    where.push(`size_bytes >= $${params.length}`);
  }

  if (maxSize !== null) {
    params.push(maxSize);
    where.push(`size_bytes <= $${params.length}`);
  }

  const whereSql = where.join(' AND ');
  const limitParam = params.length + 1;
  const offsetParam = params.length + 2;

  const rows = await db.many(
    `SELECT * FROM files
     WHERE ${whereSql}
     ORDER BY updated_at DESC
     LIMIT $${limitParam} OFFSET $${offsetParam}`,
    [...params, limit, offset]
  );

  const totalRow = await db.one(
    `SELECT COUNT(*)::int AS count FROM files WHERE ${whereSql}`,
    params
  );

  return {
    files: rows.map(publicFile),
    pagination: {
      total: Number(totalRow.count),
      limit,
      offset,
    },
  };
}

async function getFile(userId, fileId) {
  return publicFile(await getOwnedFileOrThrow(userId, fileId));
}

async function getDownloadTarget(userId, fileId) {
  const file = await getOwnedFileOrThrow(userId, fileId, { includeTrashed: false });

  if (!file.storage_key) {
    throw new AppError('Stored file content is missing', 404);
  }

  return {
    file: publicFile(file),
    downloadUrl: file.storage_key,
  };
}

async function updateFile(userId, fileId, payload = {}, meta = {}) {
  const file = await getOwnedFileOrThrow(userId, fileId, { includeTrashed: false });
  const nextName =
    payload.name !== undefined ? sanitizeFileName(payload.name) : file.name;
  const nextFolderId =
    payload.folderId !== undefined ? payload.folderId || null : file.folder_id;

  await assertFolderOwned(userId, nextFolderId);

  if (await findNameConflict(userId, nextFolderId, nextName, file.id)) {
    throw new AppError('A file with this name already exists in this folder', 409);
  }

  await db.execute(
    `UPDATE files
     SET name = $1, folder_id = $2, updated_at = NOW()
     WHERE id = $3 AND user_id = $4`,
    [nextName, nextFolderId, fileId, userId]
  );

  const updated = await db.one('SELECT * FROM files WHERE id = $1', [fileId]);

  await logActivity(userId, 'file.update', {
    resourceId: fileId,
    ipAddress: meta.ipAddress,
    userAgent: meta.userAgent,
    metadata: { name: nextName, folderId: nextFolderId },
  });

  return publicFile(updated);
}

async function trashFile(userId, fileId, meta = {}) {
  await getOwnedFileOrThrow(userId, fileId, { includeTrashed: false });

  await db.execute(
    `UPDATE files
     SET is_trashed = TRUE, trashed_at = NOW(), updated_at = NOW()
     WHERE id = $1 AND user_id = $2`,
    [fileId, userId]
  );

  await logActivity(userId, 'file.trash', {
    resourceId: fileId,
    ipAddress: meta.ipAddress,
    userAgent: meta.userAgent,
  });

  return publicFile(await db.one('SELECT * FROM files WHERE id = $1', [fileId]));
}

async function restoreFile(userId, fileId, meta = {}) {
  const file = await getOwnedFileOrThrow(userId, fileId);

  if (!file.is_trashed) {
    throw new AppError('File is not in trash', 400);
  }

  if (await findNameConflict(userId, file.folder_id, file.name, file.id)) {
    throw new AppError('A file with this name already exists in this folder', 409);
  }

  await db.execute(
    `UPDATE files
     SET is_trashed = FALSE, trashed_at = NULL, updated_at = NOW()
     WHERE id = $1 AND user_id = $2`,
    [fileId, userId]
  );

  await logActivity(userId, 'file.restore', {
    resourceId: fileId,
    ipAddress: meta.ipAddress,
    userAgent: meta.userAgent,
  });

  return publicFile(await db.one('SELECT * FROM files WHERE id = $1', [fileId]));
}

async function deleteFilePermanent(userId, fileId, meta = {}) {
  const file = await getOwnedFileOrThrow(userId, fileId);

  await db.transaction(async (tx) => {
    await tx.execute('DELETE FROM files WHERE id = $1 AND user_id = $2', [
      fileId,
      userId,
    ]);

    await tx.execute(
      `UPDATE users
       SET storage_used_bytes = GREATEST(storage_used_bytes - $1, 0), updated_at = NOW()
       WHERE id = $2`,
      [file.size_bytes, userId]
    );
  });

  await removeStoredFile(file.storage_key);

  await logActivity(userId, 'file.delete', {
    resourceId: fileId,
    ipAddress: meta.ipAddress,
    userAgent: meta.userAgent,
    metadata: { name: file.name, sizeBytes: Number(file.size_bytes) },
  });

  return { id: fileId, deleted: true };
}

async function listFolders(userId, query = {}) {
  await getUserOrThrow(userId);

  const where = ['f.user_id = $1', 'f.is_trashed = FALSE', "f.path != '/'"];
  const params = [userId];

  if (query.parentId !== undefined) {
    if (
      query.parentId === null ||
      query.parentId === '' ||
      query.parentId === 'null' ||
      query.parentId === 'root'
    ) {
      where.push('f.parent_id IS NULL');
    } else {
      await assertFolderOwned(userId, query.parentId);
      params.push(query.parentId);
      where.push(`f.parent_id = $${params.length}`);
    }
  }

  const search = typeof query.search === 'string' ? query.search.trim() : '';
  if (search) {
    params.push(`%${search.toLowerCase()}%`);
    where.push(`LOWER(f.name) LIKE $${params.length}`);
  }

  const rows = await db.many(
    `SELECT f.*,
            (
              SELECT COUNT(*)::int FROM files fi
              WHERE fi.folder_id = f.id
                AND fi.user_id = f.user_id
                AND fi.is_trashed = FALSE
            ) AS file_count
     FROM folders f
     WHERE ${where.join(' AND ')}
     ORDER BY f.name ASC`,
    params
  );

  return rows.map(publicFolder);
}

async function searchLibrary(userId, query = {}) {
  const rawQ =
    typeof query.q === 'string'
      ? query.q
      : typeof query.search === 'string'
        ? query.search
        : '';
  const search = String(rawQ || '').trim();
  const scope = ['all', 'files', 'folders'].includes(query.scope)
    ? query.scope
    : 'all';
  const limit = Math.min(Math.max(Number(query.limit) || 50, 1), 200);

  const fileQuery = {
    search,
    folderId: query.folderId,
    mimeType: query.mimeType,
    minSize: query.minSize,
    maxSize: query.maxSize,
    trashed: query.trashed,
    limit,
    offset: query.offset,
  };

  const folderQuery = {
    search,
  };
  if (query.parentId !== undefined) {
    folderQuery.parentId = query.parentId;
  }

  let files = [];
  let pagination = {
    total: 0,
    limit,
    offset: Math.max(Number(query.offset) || 0, 0),
  };
  let folders = [];

  if (scope === 'all' || scope === 'files') {
    const result = await listFiles(userId, fileQuery);
    files = result.files;
    pagination = result.pagination;
  }

  if (scope === 'all' || scope === 'folders') {
    folders = (await listFolders(userId, folderQuery)).slice(0, limit);
  }

  return {
    files,
    folders,
    pagination,
  };
}

async function getFolder(userId, folderId) {
  await getUserOrThrow(userId);

  const folder = await db.one(
    `SELECT f.*,
            (
              SELECT COUNT(*)::int FROM files fi
              WHERE fi.folder_id = f.id
                AND fi.user_id = f.user_id
                AND fi.is_trashed = FALSE
            ) AS file_count
     FROM folders f
     WHERE f.id = $1 AND f.user_id = $2 AND f.is_trashed = FALSE`,
    [folderId, userId]
  );

  if (!folder || folder.path === '/') {
    throw new AppError('Folder not found', 404);
  }

  return publicFolder(folder);
}

async function updateFolder(userId, folderId, payload = {}, meta = {}) {
  const folder = await getFolder(userId, folderId);
  const nextName =
    payload.name !== undefined ? sanitizeFileName(payload.name) : folder.name;

  const existing = await db.one(
    `SELECT id FROM folders
     WHERE user_id = $1
       AND parent_id IS NOT DISTINCT FROM $2
       AND name = $3
       AND is_trashed = FALSE
       AND id != $4`,
    [userId, folder.parentId, nextName, folderId]
  );

  if (existing) {
    throw new AppError('A folder with this name already exists', 409);
  }

  let parentPath = '/';
  if (folder.parentId) {
    const parent = await assertFolderOwned(userId, folder.parentId);
    parentPath = parent.path.endsWith('/') ? parent.path : `${parent.path}/`;
  }

  const nextPath = `${parentPath}${nextName}`;

  await db.execute(
    `UPDATE folders
     SET name = $1, path = $2, updated_at = NOW()
     WHERE id = $3 AND user_id = $4`,
    [nextName, nextPath, folderId, userId]
  );

  await logActivity(userId, 'folder.update', {
    resourceType: 'folder',
    resourceId: folderId,
    ipAddress: meta.ipAddress,
    userAgent: meta.userAgent,
    metadata: { name: nextName },
  });

  return getFolder(userId, folderId);
}

async function deleteFolder(userId, folderId, meta = {}) {
  const folder = await getFolder(userId, folderId);

  const childFolders = await db.many(
    `SELECT id FROM folders
     WHERE user_id = $1 AND parent_id = $2 AND is_trashed = FALSE`,
    [userId, folderId]
  );

  if (childFolders.length > 0) {
    throw new AppError('Folder has subfolders. Remove them first.', 400);
  }

  const filesInFolder = await db.many(
    `SELECT id FROM files
     WHERE user_id = $1 AND folder_id = $2 AND is_trashed = FALSE`,
    [userId, folderId]
  );

  await db.transaction(async (tx) => {
    for (const file of filesInFolder) {
      await tx.execute(
        `UPDATE files
         SET is_trashed = TRUE, trashed_at = NOW(), updated_at = NOW()
         WHERE id = $1 AND user_id = $2`,
        [file.id, userId]
      );
    }

    await tx.execute(
      `UPDATE folders
       SET is_trashed = TRUE, trashed_at = NOW(), updated_at = NOW()
       WHERE id = $1 AND user_id = $2`,
      [folderId, userId]
    );
  });

  await logActivity(userId, 'folder.delete', {
    resourceType: 'folder',
    resourceId: folderId,
    ipAddress: meta.ipAddress,
    userAgent: meta.userAgent,
    metadata: { name: folder.name, trashedFiles: filesInFolder.length },
  });

  return { id: folderId, deleted: true, trashedFiles: filesInFolder.length };
}

async function createFolder(userId, { name, parentId = null } = {}, meta = {}) {
  await getUserOrThrow(userId);
  const folderName = sanitizeFileName(name);
  let parentPath = '/';
  let resolvedParentId = parentId || null;

  if (resolvedParentId) {
    const parent = await assertFolderOwned(userId, resolvedParentId);
    if (parent.path === '/') {
      resolvedParentId = null;
      parentPath = '/';
    } else {
      parentPath = parent.path.endsWith('/') ? parent.path : `${parent.path}/`;
    }
  }

  const existing = await db.one(
    `SELECT id FROM folders
     WHERE user_id = $1
       AND parent_id IS NOT DISTINCT FROM $2
       AND name = $3
       AND is_trashed = FALSE
       AND path != '/'`,
    [userId, resolvedParentId, folderName]
  );

  if (existing) {
    throw new AppError('A folder with this name already exists', 409);
  }

  const folderId = uuidv4();
  const folderPath = `${parentPath}${folderName}`;

  await db.execute(
    `INSERT INTO folders (id, user_id, parent_id, name, path)
     VALUES ($1, $2, $3, $4, $5)`,
    [folderId, userId, resolvedParentId, folderName, folderPath]
  );

  await logActivity(userId, 'folder.create', {
    resourceType: 'folder',
    resourceId: folderId,
    ipAddress: meta.ipAddress,
    userAgent: meta.userAgent,
    metadata: { name: folderName, parentId: resolvedParentId },
  });

  return getFolder(userId, folderId);
}

module.exports = {
  validateUploadIntent,
  registerUploadedFile,
  listFiles,
  searchLibrary,
  getFile,
  getDownloadTarget,
  updateFile,
  trashFile,
  restoreFile,
  deleteFilePermanent,
  listFolders,
  getFolder,
  createFolder,
  updateFolder,
  deleteFolder,
  publicFile,
  publicFolder,
  sanitizeFileName,
};
