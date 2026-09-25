import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import multer from 'multer';

const here = path.dirname(fileURLToPath(import.meta.url));

export const uploadDir = path.join(here, '..', 'uploads');
export const certificationDir = path.join(uploadDir, 'certifications');
export const elearningDir = path.join(uploadDir, 'elearning');

// Archive documents are admin-only, so they live outside uploadDir: index.js serves
// /uploads/* straight from disk, and anything under it is reachable without a role check.
export const archiveDir = path.join(here, '..', 'storage', 'archive');

fs.mkdirSync(certificationDir, { recursive: true });
fs.mkdirSync(elearningDir, { recursive: true });
fs.mkdirSync(archiveDir, { recursive: true });

const certificationStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, certificationDir),
  filename: (req, file, cb) => {
    const safeName = file.originalname.replace(/[^\w.-]+/g, '_').slice(-80);
    cb(null, `${Date.now()}-${crypto.randomBytes(4).toString('hex')}-${safeName}`);
  },
});

export const uploadCertification = multer({
  storage: certificationStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
});

const elearningStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, elearningDir),
  filename: (req, file, cb) => {
    const safeName = file.originalname.replace(/[^\w.-]+/g, '_').slice(-80);
    cb(null, `${Date.now()}-${crypto.randomBytes(4).toString('hex')}-${safeName}`);
  },
});

const IMAGE_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const TEXT_MIME = new Set(['text/plain', 'application/octet-stream']);

export const uploadElearningImage = multer({
  storage: elearningStorage,
  limits: { fileSize: 10 * 1024 * 1024, files: 20 },
  fileFilter: (req, file, cb) => {
    const isImage = IMAGE_MIME.has(file.mimetype);
    const isText = TEXT_MIME.has(file.mimetype) || file.originalname.endsWith('.txt');
    
    if (!isImage && !isText) {
      return cb(new Error('Only image files (JPEG, PNG, WEBP, GIF) and text files (.txt) are allowed'));
    }
    // Allow question image fields and generic reply files
    if (/^(question|answer|assignment)_\d+_image(?:_\d+)?$|^(question|answer|assignment)_image$/.test(file.fieldname)) {
      if (isImage) return cb(null, true);
      return cb(new Error('Image fields only accept image files'));
    }
    // Allow files field for replies
    if (file.fieldname === 'files') return cb(null, true);
    if (isImage || isText) return cb(null, true);
    cb(null, false);
  },
});

const archiveStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, archiveDir),
  filename: (req, file, cb) => {
    const safeName = file.originalname.replace(/[^\w.-]+/g, '_').slice(-80);
    cb(null, `${Date.now()}-${crypto.randomBytes(4).toString('hex')}-${safeName}`);
  },
});

// Guide documents come in every format, so there is no extension filter here —
// access is what protects them, enforced by requireAdmin on the archive router.
export const uploadArchive = multer({
  storage: archiveStorage,
  limits: { fileSize: 25 * 1024 * 1024, files: 10 },
});
