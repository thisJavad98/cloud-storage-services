const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const routes = require('./routes');
const config = require('./config/env');
const { ensureAvatarsRoot, ensureStorageRoot } = require('./config/storage');
const { notFound, errorHandler } = require('./middleware/errorHandler');
const { createRateLimiter } = require('./middleware/rateLimit');

const app = express();

app.set('trust proxy', 1);

app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    contentSecurityPolicy: false,
    referrerPolicy: { policy: 'no-referrer' },
  })
);

app.use(
  cors({
    origin(origin, callback) {
      // Allow non-browser clients (curl, server-to-server) with no Origin.
      if (!origin) return callback(null, true);
      if (config.corsOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(null, false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    maxAge: 600,
  })
);

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan(config.nodeEnv === 'production' ? 'combined' : 'dev'));

// Global API rate limit (per IP).
app.use(
  '/api',
  createRateLimiter({
    windowMs: 60_000,
    max: 180,
    message: 'Too many API requests, please slow down',
  })
);

// Stricter limit on auth endpoints (brute-force protection).
app.use(
  '/api/auth',
  createRateLimiter({
    windowMs: 15 * 60_000,
    max: 40,
    message: 'Too many auth attempts, please try again later',
  })
);

// Upload/download rate limit.
app.use(
  '/api/files',
  createRateLimiter({
    windowMs: 60_000,
    max: 60,
    message: 'Too many file operations, please try again later',
  })
);

ensureStorageRoot();

// Only avatar images are publicly readable. User file bytes are never static —
// they must go through authenticated /api/files/:id/download (decrypt + stream).
app.use(
  '/uploads/avatars',
  express.static(ensureAvatarsRoot(), {
    etag: false,
    lastModified: false,
    setHeaders(res) {
      res.setHeader('Cache-Control', 'private, no-store, no-cache, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      res.setHeader('X-Content-Type-Options', 'nosniff');
    },
  })
);

app.use('/api', routes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;
