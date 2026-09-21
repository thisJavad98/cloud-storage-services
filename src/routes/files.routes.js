const express = require('express');
const filesController = require('../controllers/files.controller');
const { authenticate } = require('../middleware/auth');
const {
  updateFileRules,
  createFolderRules,
  updateFolderRules,
  validate,
} = require('../middleware/validate');

const router = express.Router();

router.use(authenticate);

router.get('/folders', filesController.listFolders);
router.post('/folders', createFolderRules, validate, filesController.createFolder);
router.get('/folders/:id', filesController.getFolder);
router.patch('/folders/:id', updateFolderRules, validate, filesController.updateFolder);
router.delete('/folders/:id', filesController.removeFolder);

router.get('/search', filesController.search);
router.get('/', filesController.list);
router.post('/upload', filesController.blobUpload);
router.post('/complete', filesController.completeUpload);
router.get('/:id', filesController.getOne);
router.get('/:id/download', filesController.download);
router.patch('/:id', updateFileRules, validate, filesController.update);
router.post('/:id/trash', filesController.trash);
router.post('/:id/restore', filesController.restore);
router.delete('/:id', filesController.remove);

module.exports = router;
