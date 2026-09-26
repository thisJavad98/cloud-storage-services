const path = require('path');
const multer = require('multer');
const express = require('express');
const { v4: uuidv4 } = require('uuid');
const authController = require('../controllers/auth.controller');
const { authenticate } = require('../middleware/auth');
const {
  signupRules,
  loginRules,
  refreshRules,
  updateProfileRules,
  validate,
} = require('../middleware/validate');
const { ensureAvatarsRoot } = require('../config/storage');
const config = require('../config/env');
const AppError = require('../utils/AppError');

const router = express.Router();

const avatarStorage = multer.diskStorage({
  destination(_req, _file, cb) {
    cb(null, ensureAvatarsRoot());
  },
  filename(_req, file, cb) {
    const ext = path.extname(file.originalname || '').slice(0, 32) || '.jpg';
    cb(null, `${uuidv4()}${ext}`);
  },
});

const avatarUpload = multer({
  storage: avatarStorage,
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

function rejectIfSignupDisabled(_req, _res, next) {
  if (!config.signupEnabled) {
    return next(new AppError('Signup is disabled. New accounts cannot be created.', 403));
  }
  return next();
}

router.post(
  '/signup',
  rejectIfSignupDisabled,
  signupRules,
  validate,
  authController.signup
);
router.post('/login', loginRules, validate, authController.login);
router.post('/refresh', refreshRules, validate, authController.refresh);
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
