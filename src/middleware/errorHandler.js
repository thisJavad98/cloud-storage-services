const AppError = require('../utils/AppError');
const config = require('../config/env');

function notFound(_req, _res, next) {
  next(new AppError('Route not found', 404));
}

function errorHandler(err, _req, res, _next) {
  const statusCode = err.statusCode || 500;
  const response = {
    success: false,
    message: err.message || 'Internal server error',
  };

  if (err.details) {
    response.errors = err.details;
  }

  if (config.nodeEnv === 'development' && statusCode === 500) {
    response.stack = err.stack;
  }

  if (statusCode >= 500 && config.nodeEnv !== 'test') {
    console.error(err);
  }

  res.status(statusCode).json(response);
}

module.exports = {
  notFound,
  errorHandler,
};
