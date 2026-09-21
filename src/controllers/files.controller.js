const { handleUpload } = require('@vercel/blob/client');
const filesService = require('../services/files.service');
const config = require('../config/env');
const AppError = require('../utils/AppError');

function requestMeta(req) {
  return {
    ipAddress: req.ip,
    userAgent: req.get('user-agent'),
  };
}

function parseClientPayload(raw) {
  if (!raw) return {};
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function toWebRequest(req) {
  const host = req.get('host') || 'localhost';
  const proto = req.get('x-forwarded-proto') || req.protocol || 'https';
  const url = `${proto}://${host}${req.originalUrl || req.url}`;
  const headers = new Headers();

  for (const [key, value] of Object.entries(req.headers)) {
    if (value === undefined) continue;
    headers.set(key, Array.isArray(value) ? value.join(',') : String(value));
  }

  return new Request(url, {
    method: req.method,
    headers,
  });
}

async function blobUpload(req, res, next) {
  try {
    const jsonResponse = await handleUpload({
      body: req.body,
      request: toWebRequest(req),
      onBeforeGenerateToken: async (_pathname, clientPayload) => {
        const payload = parseClientPayload(clientPayload);
        const intent = await filesService.validateUploadIntent(req.user.id, {
          folderId: payload.folderId || null,
          name: payload.name,
          originalName: payload.name,
          sizeBytes: payload.sizeBytes,
        });

        return {
          maximumSizeInBytes: Math.min(
            config.maxUploadBytes,
            intent.maxUploadBytes || config.maxUploadBytes
          ),
          tokenPayload: JSON.stringify({
            userId: req.user.id,
            folderId: intent.folderId,
            name: intent.name,
            ipAddress: req.ip,
            userAgent: req.get('user-agent'),
          }),
          addRandomSuffix: false,
        };
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        const payload = parseClientPayload(tokenPayload);
        if (!payload.userId) return;

        await filesService.registerUploadedFile(
          payload.userId,
          {
            url: blob.url,
            pathname: blob.pathname,
            size: blob.size,
            contentType: blob.contentType,
          },
          {
            folderId: payload.folderId || null,
            name: payload.name,
            mimeType: blob.contentType,
          },
          {
            ipAddress: payload.ipAddress,
            userAgent: payload.userAgent,
          }
        );
      },
    });

    return res.status(200).json(jsonResponse);
  } catch (error) {
    if (error instanceof AppError) {
      return next(error);
    }
    return next(new AppError(error.message || 'Upload failed', 400));
  }
}

async function completeUpload(req, res, next) {
  try {
    const { url, pathname, size, contentType, name, folderId } = req.body || {};

    if (!url && !pathname) {
      throw new AppError('Blob url is required', 400);
    }

    const file = await filesService.registerUploadedFile(
      req.user.id,
      {
        url,
        pathname,
        size,
        contentType,
      },
      {
        folderId: folderId || null,
        name,
        mimeType: contentType,
        sizeBytes: size,
      },
      requestMeta(req)
    );

    return res.status(201).json({
      success: true,
      message: 'File uploaded successfully',
      data: { file },
    });
  } catch (error) {
    return next(error);
  }
}

async function list(req, res, next) {
  try {
    const result = await filesService.listFiles(req.user.id, req.query);
    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    return next(error);
  }
}

async function search(req, res, next) {
  try {
    const result = await filesService.searchLibrary(req.user.id, req.query);
    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    return next(error);
  }
}

async function getOne(req, res, next) {
  try {
    const file = await filesService.getFile(req.user.id, req.params.id);
    return res.status(200).json({
      success: true,
      data: { file },
    });
  } catch (error) {
    return next(error);
  }
}

async function download(req, res, next) {
  try {
    const { downloadUrl } = await filesService.getDownloadTarget(
      req.user.id,
      req.params.id
    );

    return res.redirect(302, downloadUrl);
  } catch (error) {
    return next(error);
  }
}

async function update(req, res, next) {
  try {
    const file = await filesService.updateFile(
      req.user.id,
      req.params.id,
      {
        name: req.body?.name,
        folderId: req.body?.folderId,
      },
      requestMeta(req)
    );

    return res.status(200).json({
      success: true,
      message: 'File updated successfully',
      data: { file },
    });
  } catch (error) {
    return next(error);
  }
}

async function trash(req, res, next) {
  try {
    const file = await filesService.trashFile(
      req.user.id,
      req.params.id,
      requestMeta(req)
    );

    return res.status(200).json({
      success: true,
      message: 'File moved to trash',
      data: { file },
    });
  } catch (error) {
    return next(error);
  }
}

async function restore(req, res, next) {
  try {
    const file = await filesService.restoreFile(
      req.user.id,
      req.params.id,
      requestMeta(req)
    );

    return res.status(200).json({
      success: true,
      message: 'File restored successfully',
      data: { file },
    });
  } catch (error) {
    return next(error);
  }
}

async function remove(req, res, next) {
  try {
    const result = await filesService.deleteFilePermanent(
      req.user.id,
      req.params.id,
      requestMeta(req)
    );

    return res.status(200).json({
      success: true,
      message: 'File permanently deleted',
      data: result,
    });
  } catch (error) {
    return next(error);
  }
}

async function listFolders(req, res, next) {
  try {
    const folders = await filesService.listFolders(req.user.id, req.query);
    return res.status(200).json({
      success: true,
      data: { folders },
    });
  } catch (error) {
    return next(error);
  }
}

async function getFolder(req, res, next) {
  try {
    const folder = await filesService.getFolder(req.user.id, req.params.id);
    return res.status(200).json({
      success: true,
      data: { folder },
    });
  } catch (error) {
    return next(error);
  }
}

async function createFolder(req, res, next) {
  try {
    const folder = await filesService.createFolder(
      req.user.id,
      {
        name: req.body?.name,
        parentId: req.body?.parentId || null,
      },
      requestMeta(req)
    );

    return res.status(201).json({
      success: true,
      message: 'Folder created successfully',
      data: { folder },
    });
  } catch (error) {
    return next(error);
  }
}

async function updateFolder(req, res, next) {
  try {
    const folder = await filesService.updateFolder(
      req.user.id,
      req.params.id,
      { name: req.body?.name },
      requestMeta(req)
    );

    return res.status(200).json({
      success: true,
      message: 'Folder updated successfully',
      data: { folder },
    });
  } catch (error) {
    return next(error);
  }
}

async function removeFolder(req, res, next) {
  try {
    const result = await filesService.deleteFolder(
      req.user.id,
      req.params.id,
      requestMeta(req)
    );

    return res.status(200).json({
      success: true,
      message: 'Folder deleted successfully',
      data: result,
    });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  blobUpload,
  completeUpload,
  list,
  search,
  getOne,
  download,
  update,
  trash,
  restore,
  remove,
  listFolders,
  getFolder,
  createFolder,
  updateFolder,
  removeFolder,
};
