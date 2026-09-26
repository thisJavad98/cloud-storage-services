const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const routes = require('./routes');
const { ensureStorageRoot } = require('./config/storage');
const { notFound, errorHandler } = require('./middleware/errorHandler');

const app = express();

app.set('trust proxy', 1);

app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
);
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan('dev'));

app.use(
  '/uploads',
  express.static(ensureStorageRoot(), {
    etag: false,
    lastModified: false,
    setHeaders(res) {
      // Avatars/files must not stick in one device's HTTP cache after another
      // device updates them.
      res.setHeader('Cache-Control', 'private, no-store, no-cache, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    },
  })
);
app.use('/api', routes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;
