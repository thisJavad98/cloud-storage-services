const filesService = require('../services/files.service');

function requestMeta(req) {
  return {
    ipAddress: req.ip,
    userAgent: req.get('user-agent'),
  };
}

async function upload(req, res, next) {
  try {
    const file = filesService.uploadFile(
      req.user.id,
      req.file,
      {
        name: req.body?.name,
        folderId: req.body?.folderId || null,
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
    const result = filesService.listFiles(req.user.id, req.query);
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
    const result = filesService.searchLibrary(req.user.id, req.query);
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
    const file = filesService.getFile(req.user.id, req.params.id);
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
    const { file, absolutePath } = filesService.getDownloadTarget(
      req.user.id,
      req.params.id
    );

    return res.download(absolutePath, file.name, (error) => {
      if (error && !res.headersSent) {
        next(error);
      }
    });
  } catch (error) {
    return next(error);
  }
}

async function update(req, res, next) {
  try {
    const file = filesService.updateFile(
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
    const file = filesService.trashFile(
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
    const file = filesService.restoreFile(
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
    const result = filesService.deleteFilePermanent(
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
    const folders = filesService.listFolders(req.user.id, req.query);
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
    const folder = filesService.getFolder(req.user.id, req.params.id);
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
    const folder = filesService.createFolder(
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
    const folder = filesService.updateFolder(
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
    const result = filesService.deleteFolder(
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
  upload,
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
