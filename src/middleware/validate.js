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
  validate,
};
