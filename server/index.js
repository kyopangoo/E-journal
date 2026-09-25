import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import { config } from './config.js';
import { closePool } from './db.js';
import { uploadDir } from './middleware/upload.js';
import { requireAuth } from './middleware/auth.js';
import activityRoutes from './routes/activity.js';
import archiveRoutes from './routes/archive.js';
import appearanceRoutes from './routes/appearance.js';
import articleRoutes from './routes/articles.js';
import authRoutes from './routes/auth.js';
import certificationRoutes from './routes/certifications.js';
import dashboardRoutes from './routes/dashboard.js';
import elearningRoutes from './routes/elearning.js';
import forumRoutes from './routes/forum.js';
import notificationRoutes from './routes/notifications.js';
import profileRoutes from './routes/profile.js';
import scheduleRoutes from './routes/schedule.js';
import usersRoutes from './routes/users.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const clientDist = path.join(here, '..', 'client', 'dist');

const app = express();

app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));
app.use(cookieParser());

app.get('/uploads/*', (req, res) => {
  const filePath = path.join(uploadDir, req.params[0]);
  if (filePath.startsWith(uploadDir)) {
    res.sendFile(filePath);
  } else {
    res.status(403).json({ error: 'Forbidden' });
  }
});

app.get('/api/health', (req, res) => {
  res.json({ ok: true, service: 'e-journey', time: new Date().toISOString() });
});

app.use('/api/auth', authRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/appearance', appearanceRoutes);
app.use('/api/forum', forumRoutes);
app.use('/api/schedule', scheduleRoutes);
app.use('/api/elearning', elearningRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/articles', articleRoutes);
app.use('/api/certifications', certificationRoutes);
app.use('/api/archive', archiveRoutes);
app.use('/api/activity', activityRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/notifications', notificationRoutes);

app.use('/api', (req, res) => {
  res.status(404).json({ error: `No API route for ${req.method} ${req.originalUrl}` });
});

if (fs.existsSync(path.join(clientDist, 'index.html'))) {
  app.use(express.static(clientDist));
  app.get('*', (req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

app.use((error, req, res, next) => {
  const status = error.status ?? 500;
  if (status >= 500) console.error(error);
  if (error.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: 'File is larger than the allowed upload size' });
  }
  if (error.code === 'LIMIT_FILE_COUNT') {
    return res.status(413).json({ error: 'Too many files were attached' });
  }
  return res.status(status).json({ error: error.message ?? 'Internal server error' });
});

const server = app.listen(config.port, '0.0.0.0', () => {
  console.log(`E-Journey API listening on http://localhost:${config.port}`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    server.close(async () => {
      await closePool();
      process.exit(0);
    });
  });
}
