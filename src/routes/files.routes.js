const path = require('path');
const multer = require('multer');
const express = require('express');
const { v4: uuidv4 } = require('uuid');
const filesController = require('../controllers/files.controller');
const { authenticate } = require('../middleware/auth');
const {
  updateFileRules,
  createFolderRules,
  updateFolderRules,
  validate,
} = require('../middleware/validate');
const { ensureStorageRoot } = require('../config/storage');
const config = require('../config/env');
const AppError = require('../utils/AppError');

const router = express.Router();

const storage = multer.diskStorage({
  destination(_req, _file, cb) {
    cb(null, ensureStorageRoot());
  },
  filename(_req, file, cb) {
    const ext = path.extname(file.originalname || '').slice(0, 32);
    cb(null, `${uuidv4()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: config.maxUploadBytes,
    files: 1,
  },
});

function handleUpload(req, res, next) {
  upload.single('file')(req, res, (error) => {
    if (!error) {
      if (!req.file) {
        return next(new AppError('File is required', 400));
      }
      return next();
    }

    if (error instanceof multer.MulterError) {
      if (error.code === 'LIMIT_FILE_SIZE') {
        return next(new AppError('File is too large', 413));
      }
      return next(new AppError(error.message, 400));
    }

    return next(error);
  });
}

router.use(authenticate);

router.get('/folders', filesController.listFolders);
router.post('/folders', createFolderRules, validate, filesController.createFolder);
router.get('/folders/:id', filesController.getFolder);
router.patch('/folders/:id', updateFolderRules, validate, filesController.updateFolder);
router.delete('/folders/:id', filesController.removeFolder);

router.get('/search', filesController.search);
router.get('/', filesController.list);
router.post('/', handleUpload, filesController.upload);
router.get('/:id', filesController.getOne);
router.get('/:id/download', filesController.download);
router.patch('/:id', updateFileRules, validate, filesController.update);
router.post('/:id/trash', filesController.trash);
router.post('/:id/restore', filesController.restore);
router.delete('/:id', filesController.remove);

module.exports = router;
