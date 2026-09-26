const { body, validationResult } = require('express-validator');
const AppError = require('../utils/AppError');

const signupRules = [
  body('email')
    .trim()
    .isEmail()
    .withMessage('A valid email is required')
    .normalizeEmail(),
  body('password')
    .isString()
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters')
    .matches(/[A-Za-z]/)
    .withMessage('Password must include at least one letter')
    .matches(/\d/)
    .withMessage('Password must include at least one number'),
  body('fullName')
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Full name must be between 2 and 100 characters'),
];

const loginRules = [
  body('email')
    .trim()
    .isEmail()
    .withMessage('A valid email is required')
    .normalizeEmail(),
  body('password')
    .isString()
    .notEmpty()
    .withMessage('Password is required'),
];

const refreshRules = [
  body('refreshToken')
    .isString()
    .notEmpty()
    .withMessage('Refresh token is required'),
];

const updateProfileRules = [
  body('fullName')
    .optional()
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Full name must be between 2 and 100 characters'),
  body('bio')
    .optional({ nullable: true })
    .custom((value) => value === null || typeof value === 'string')
    .withMessage('Bio must be a string or null')
    .customSanitizer((value) => (value === null ? null : String(value).trim()))
    .custom((value) => value === null || value.length <= 280)
    .withMessage('Bio must be at most 280 characters'),
];

const updateFileRules = [
  body('name')
    .optional()
    .trim()
    .isLength({ min: 1, max: 255 })
    .withMessage('File name must be between 1 and 255 characters'),
  body('folderId')
    .optional({ nullable: true })
    .custom((value) => value === null || value === '' || typeof value === 'string')
    .withMessage('folderId must be a string or null'),
];

const createFolderRules = [
  body('name')
    .trim()
    .isLength({ min: 1, max: 255 })
    .withMessage('Folder name must be between 1 and 255 characters'),
  body('parentId')
    .optional({ nullable: true })
    .custom((value) => value === null || value === '' || typeof value === 'string')
    .withMessage('parentId must be a string or null'),
];

const updateFolderRules = [
  body('name')
    .trim()
    .isLength({ min: 1, max: 255 })
    .withMessage('Folder name must be between 1 and 255 characters'),
];

function validate(req, _res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return next(
      new AppError('Validation failed', 422, errors.array().map((e) => ({
        field: e.path,
        message: e.msg,
      })))
    );
  }
  return next();
}

module.exports = {
  signupRules,
  loginRules,
  refreshRules,
  updateProfileRules,
  updateFileRules,
  createFolderRules,
  updateFolderRules,
  validate,
};
