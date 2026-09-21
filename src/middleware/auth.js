const db = require('../config/db');
const AppError = require('../utils/AppError');
const { verifyAccessToken } = require('../utils/jwt');

async function authenticate(req, _res, next) {
  const header = req.get('authorization') || '';
  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return next(new AppError('Authentication required', 401));
  }

  try {
    const payload = verifyAccessToken(token);
    const user = await db.one(
      'SELECT id, email, role, is_active FROM users WHERE id = $1',
      [payload.sub]
    );

    if (!user || !user.is_active) {
      return next(new AppError('Invalid or inactive account', 401));
    }

    req.user = {
      id: user.id,
      email: user.email,
      role: user.role,
    };

    return next();
  } catch (_error) {
    return next(new AppError('Invalid or expired token', 401));
  }
}

module.exports = {
  authenticate,
};
