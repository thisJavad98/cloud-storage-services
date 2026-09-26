const authService = require('../services/auth.service');

function requestMeta(req) {
  return {
    ipAddress: req.ip,
    userAgent: req.get('user-agent'),
    deviceInfo: req.get('user-agent'),
  };
}

async function signup(req, res, next) {
  try {
    const result = await authService.signup(req.body, requestMeta(req));
    return res.status(201).json({
      success: true,
      message: 'Account created successfully',
      data: result,
    });
  } catch (error) {
    return next(error);
  }
}

async function login(req, res, next) {
  try {
    const result = await authService.login(req.body, requestMeta(req));
    return res.status(200).json({
      success: true,
      message: 'Login successful',
      data: result,
    });
  } catch (error) {
    return next(error);
  }
}

async function refresh(req, res, next) {
  try {
    const result = await authService.refreshSession(
      req.body?.refreshToken,
      requestMeta(req)
    );
    return res.status(200).json({
      success: true,
      message: 'Session refreshed',
      data: result,
    });
  } catch (error) {
    return next(error);
  }
}

async function me(req, res, next) {
  try {
    const user = authService.getProfile(req.user.id);
    return res.status(200).json({
      success: true,
      data: { user },
    });
  } catch (error) {
    return next(error);
  }
}

async function updateProfile(req, res, next) {
  try {
    const user = authService.updateProfile(
      req.user.id,
      {
        fullName: req.body.fullName,
        bio: req.body.bio,
      },
      requestMeta(req)
    );
    return res.status(200).json({
      success: true,
      message: 'Profile updated successfully',
      data: { user },
    });
  } catch (error) {
    return next(error);
  }
}

async function uploadAvatar(req, res, next) {
  try {
    const user = await authService.updateAvatar(
      req.user.id,
      req.file,
      requestMeta(req)
    );
    return res.status(200).json({
      success: true,
      message: 'Avatar updated successfully',
      data: { user },
    });
  } catch (error) {
    return next(error);
  }
}

async function deleteAvatar(req, res, next) {
  try {
    const user = authService.removeAvatar(req.user.id, requestMeta(req));
    return res.status(200).json({
      success: true,
      message: 'Avatar removed successfully',
      data: { user },
    });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  signup,
  login,
  refresh,
  me,
  updateProfile,
  uploadAvatar,
  deleteAvatar,
};
