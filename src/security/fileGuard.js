const path = require('path');
const AppError = require('../utils/AppError');

/** Conservative allow-list for cloud storage uploads. */
const ALLOWED_EXTENSIONS = new Set([
  '.pdf',
  '.txt',
  '.md',
  '.csv',
  '.json',
  '.xml',
  '.doc',
  '.docx',
  '.xls',
  '.xlsx',
  '.ppt',
  '.pptx',
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.svg',
  '.bmp',
  '.heic',
  '.mp3',
  '.wav',
  '.m4a',
  '.ogg',
  '.mp4',
  '.mov',
  '.webm',
  '.mkv',
  '.zip',
  '.rar',
  '.7z',
  '.gz',
  '.tar',
]);

const ALLOWED_MIME_PREFIXES = [
  'image/',
  'audio/',
  'video/',
  'text/',
  'application/pdf',
  'application/json',
  'application/xml',
  'application/zip',
  'application/x-zip-compressed',
  'application/vnd.openxmlformats-officedocument.',
  'application/msword',
  'application/vnd.ms-',
  'application/octet-stream',
];

function assertSafeUpload({ originalName, mimeType, sizeBytes, maxBytes }) {
  const name = String(originalName || '').trim();
  if (!name) {
    throw new AppError('File name is required', 400);
  }

  if (name.includes('\0') || name.includes('..') || /[/\\]/.test(name)) {
    throw new AppError('Invalid file name', 400);
  }

  const ext = path.extname(name).toLowerCase();
  if (ext && !ALLOWED_EXTENSIONS.has(ext)) {
    throw new AppError(`File type "${ext}" is not allowed`, 415);
  }

  const mime = String(mimeType || 'application/octet-stream').toLowerCase();
  const mimeOk = ALLOWED_MIME_PREFIXES.some(
    (prefix) => mime === prefix || mime.startsWith(prefix)
  );
  if (!mimeOk) {
    throw new AppError(`MIME type "${mime}" is not allowed`, 415);
  }

  const size = Number(sizeBytes) || 0;
  if (size <= 0) {
    throw new AppError('Empty files are not allowed', 400);
  }
  if (maxBytes && size > maxBytes) {
    throw new AppError('File is too large', 413);
  }

  return { name, ext, mime, size };
}

module.exports = {
  assertSafeUpload,
  ALLOWED_EXTENSIONS,
};
