const express = require('express');
const authController = require('../controllers/auth.controller');
const { authenticate } = require('../middleware/auth');
const { signupRules, loginRules, validate } = require('../middleware/validate');

const router = express.Router();

router.post('/signup', signupRules, validate, authController.signup);
router.post('/login', loginRules, validate, authController.login);
router.get('/me', authenticate, authController.me);

module.exports = router;
