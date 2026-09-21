const multer = require('multer');
const express = require('express');
const authController = require('../controllers/auth.controller');
const { authenticate } = require('../middleware/auth');
const {
  signupRules,
  loginRules,
  updateProfileRules,
  validate,
} = require('../middleware/validate');
const config = require('../config/env');
const AppError = require('../utils/AppError');

const router = express.Router();

const avatarUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: config.maxAvatarBytes,
    files: 1,
  },
  fileFilter(_req, file, cb) {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!allowed.includes(file.mimetype)) {
      return cb(new AppError('Avatar must be a JPEG, PNG, WebP, or GIF image', 400));
    }
    return cb(null, true);
  },
});

function handleAvatarUpload(req, res, next) {
  avatarUpload.single('avatar')(req, res, (error) => {
    if (!error) {
      if (!req.file) {
        return next(new AppError('Avatar image is required', 400));
      }
      return next();
    }

    if (error instanceof multer.MulterError) {
      if (error.code === 'LIMIT_FILE_SIZE') {
        return next(new AppError('Avatar image is too large (max 2MB)', 413));
      }
      return next(new AppError(error.message, 400));
    }

    return next(error);
  });
}

router.post('/signup', signupRules, validate, authController.signup);
router.post('/login', loginRules, validate, authController.login);
router.get('/me', authenticate, authController.me);
router.patch(
  '/me',
  authenticate,
  updateProfileRules,
  validate,
  authController.updateProfile
);
router.post(
  '/avatar',
  authenticate,
  handleAvatarUpload,
  authController.uploadAvatar
);
router.delete('/avatar', authenticate, authController.deleteAvatar);

module.exports = router;
