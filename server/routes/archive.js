import fs from 'node:fs/promises';
import path from 'node:path';
import { Router } from 'express';
import { query, transaction } from '../db.js';
import { HttpError, requireText, wrap } from '../lib/http.js';
import { clientIp, recordActivity } from '../lib/activity.js';
import { notifyAdmins } from '../lib/notify.js';
import { requireAdmin, requireAuth } from '../middleware/auth.js';
import { archiveDir, uploadArchive } from '../middleware/upload.js';

const router = Router();

router.use(requireAuth);
router.use(requireAdmin);

function storedPath(storedName) {
  return path.join(archiveDir, path.basename(String(storedName)));
}

async function loadFolder(id) {
  const rows = await query(
    `SELECT f.id, f.parent_id AS parentId, f.name, f.description,
            f.created_at AS createdAt, f.updated_at AS updatedAt,
            u.full_name AS createdByName
       FROM archive_folders f
       LEFT JOIN users u ON u.id = f.created_by
      WHERE f.id = ? LIMIT 1`,
    [id]
  );
  if (!rows.length) throw new HttpError(404, 'Folder not found');
  return rows[0];
}

async function breadcrumbOf(folder) {
  const crumbs = [folder];
  let parentId = folder.parentId;
  // parent_id is app-managed, so a cycle would mean corrupted data — stop anyway.
  for (let depth = 0; parentId && depth < 50; depth += 1) {
    const rows = await query(
      'SELECT id, parent_id AS parentId, name FROM archive_folders WHERE id = ? LIMIT 1',
      [parentId]
    );
    if (!rows.length) break;
    crumbs.unshift(rows[0]);
    parentId = rows[0].parentId;
  }
  return crumbs;
}

async function listSubfolders(parentId) {
  return query(
    `SELECT f.id, f.parent_id AS parentId, f.name, f.description,
            f.created_at AS createdAt, u.full_name AS createdByName,
            (SELECT COUNT(*) FROM archive_folders c WHERE c.parent_id = f.id) AS folderCount,
            (SELECT COUNT(*) FROM archive_files af WHERE af.folder_id = f.id) AS fileCount
       FROM archive_folders f
       LEFT JOIN users u ON u.id = f.created_by
      WHERE f.parent_id <=> ?
      ORDER BY f.name ASC`,
    [parentId]
  );
}

async function listFiles(folderId) {
  return query(
    `SELECT af.id, af.folder_id AS folderId, af.file_name AS fileName, af.mime_type AS mimeType,
            af.size_bytes AS sizeBytes, af.created_at AS createdAt,
            u.full_name AS uploadedByName
       FROM archive_files af
       LEFT JOIN users u ON u.id = af.uploaded_by
      WHERE af.folder_id = ?
      ORDER BY af.file_name ASC`,
    [folderId]
  );
}

async function collectSubtree(rootId) {
  const ids = [rootId];
  let frontier = [rootId];
  while (frontier.length) {
    const placeholders = frontier.map(() => '?').join(',');
    const rows = await query(
      `SELECT id FROM archive_folders WHERE parent_id IN (${placeholders})`,
      frontier
    );
    frontier = rows.map((row) => row.id);
    ids.push(...frontier);
  }
  return ids;
}

async function assertNameAvailable(parentId, name, exceptId = null) {
  const rows = await query(
    'SELECT id FROM archive_folders WHERE parent_id <=> ? AND name = ? AND id <> ? LIMIT 1',
    [parentId, name, exceptId ?? 0]
  );
  if (rows.length) {
    throw new HttpError(409, 'A folder with that name already exists here');
  }
}

// One call renders the whole view: current folder, its path from the root,
// its subfolders and files, plus the totals shown in the hero.
router.get(
  '/browse',
  wrap(async (req, res) => {
    const rawFolderId = req.query.folderId;
    const hasFolder = rawFolderId !== undefined && rawFolderId !== '' && rawFolderId !== null;
    const folder = hasFolder ? await loadFolder(Number(rawFolderId)) : null;

    const [stats] = await query(
      `SELECT (SELECT COUNT(*) FROM archive_folders) AS folderCount,
              (SELECT COUNT(*) FROM archive_files) AS fileCount,
              (SELECT COALESCE(SUM(size_bytes), 0) FROM archive_files) AS totalBytes`
    );

    res.json({
      folder,
      breadcrumb: folder ? await breadcrumbOf(folder) : [],
      folders: await listSubfolders(folder ? folder.id : null),
      files: folder ? await listFiles(folder.id) : [],
      stats: {
        folderCount: Number(stats.folderCount),
        fileCount: Number(stats.fileCount),
        totalBytes: Number(stats.totalBytes),
      },
    });
  })
);

router.post(
  '/folders',
  wrap(async (req, res) => {
    const name = requireText(req.body?.name, 'Folder name', 160);
    const description = String(req.body?.description ?? '').trim().slice(0, 500) || null;

    const rawParent = req.body?.parentId;
    const parentId =
      rawParent === undefined || rawParent === null || rawParent === '' ? null : Number(rawParent);
    if (parentId !== null && !Number.isInteger(parentId)) {
      throw new HttpError(400, 'Parent folder must be a folder id');
    }
    if (parentId !== null) await loadFolder(parentId);

    await assertNameAvailable(parentId, name);

    const result = await query(
      'INSERT INTO archive_folders (parent_id, name, description, created_by) VALUES (?, ?, ?, ?)',
      [parentId, name, description, req.user.id]
    );

    await recordActivity(
      req.user.id,
      'ARCHIVE_FOLDER_CREATED',
      `Created archive folder "${name}"`,
      clientIp(req)
    );

    res.status(201).json({ folder: await loadFolder(result.insertId) });
  })
);

router.patch(
  '/folders/:id',
  wrap(async (req, res) => {
    const folder = await loadFolder(Number(req.params.id));
    const name = requireText(req.body?.name, 'Folder name', 160);
    const description = String(req.body?.description ?? '').trim().slice(0, 500) || null;

    await assertNameAvailable(folder.parentId, name, folder.id);

    await query('UPDATE archive_folders SET name = ?, description = ? WHERE id = ?', [
      name,
      description,
      folder.id,
    ]);

    await recordActivity(
      req.user.id,
      'ARCHIVE_FOLDER_RENAMED',
      `Renamed archive folder "${folder.name}" to "${name}"`,
      clientIp(req)
    );

    res.json({ folder: await loadFolder(folder.id) });
  })
);

// Deleting a folder removes every nested folder and file with it, on disk as well
// as in the database — the FK cascade only covers the rows.
router.delete(
  '/folders/:id',
  wrap(async (req, res) => {
    const folder = await loadFolder(Number(req.params.id));
    const ids = await collectSubtree(folder.id);
    const placeholders = ids.map(() => '?').join(',');

    const files = await query(
      `SELECT stored_name AS storedName FROM archive_files WHERE folder_id IN (${placeholders})`,
      ids
    );

    await query(`DELETE FROM archive_folders WHERE id IN (${placeholders})`, ids);
    await Promise.all(
      files.map((file) => fs.unlink(storedPath(file.storedName)).catch(() => {}))
    );

    await recordActivity(
      req.user.id,
      'ARCHIVE_FOLDER_DELETED',
      `Deleted archive folder "${folder.name}" with ${files.length} file(s)`,
      clientIp(req)
    );

    res.json({ ok: true, removedFolders: ids.length, removedFiles: files.length });
  })
);

router.post(
  '/folders/:id/files',
  uploadArchive.array('files', 10),
  wrap(async (req, res) => {
    const folder = await loadFolder(Number(req.params.id));
    const uploaded = req.files ?? [];
    if (!uploaded.length) throw new HttpError(400, 'Choose at least one file to upload');

    try {
      await transaction(async (connection) => {
        for (const file of uploaded) {
          await connection.execute(
            `INSERT INTO archive_files
               (folder_id, file_name, stored_name, mime_type, size_bytes, uploaded_by)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [
              folder.id,
              file.originalname.slice(0, 255),
              file.filename,
              file.mimetype || null,
              file.size,
              req.user.id,
            ]
          );
        }
      });
    } catch (error) {
      // The rows rolled back, so drop the bytes multer already wrote.
      await Promise.all(
        uploaded.map((file) => fs.unlink(storedPath(file.filename)).catch(() => {}))
      );
      throw error;
    }

    await recordActivity(
      req.user.id,
      'ARCHIVE_FILE_UPLOADED',
      `Uploaded ${uploaded.length} file(s) to archive folder "${folder.name}": ${uploaded
        .map((file) => file.originalname)
        .join(', ')}`,
      clientIp(req)
    );

    await notifyAdmins(req.user.id, {
      type: 'archive.file.uploaded',
      entityType: 'archive_folder',
      entityId: folder.id,
      title: `${req.user.fullName} uploaded ${uploaded.length} file${
        uploaded.length === 1 ? '' : 's'
      } to the archive`,
      body: `${folder.name} · ${uploaded.map((file) => file.originalname).join(', ')}`,
      link: `/archive/${folder.id}`,
    });

    res.status(201).json({ files: await listFiles(folder.id), uploaded: uploaded.length });
  })
);

router.delete(
  '/files/:id',
  wrap(async (req, res) => {
    const id = Number(req.params.id);
    const rows = await query(
      'SELECT id, file_name AS fileName, stored_name AS storedName FROM archive_files WHERE id = ? LIMIT 1',
      [id]
    );
    if (!rows.length) throw new HttpError(404, 'File not found');

    await query('DELETE FROM archive_files WHERE id = ?', [id]);
    await fs.unlink(storedPath(rows[0].storedName)).catch(() => {});

    await recordActivity(
      req.user.id,
      'ARCHIVE_FILE_DELETED',
      `Deleted archive file "${rows[0].fileName}"`,
      clientIp(req)
    );

    res.json({ ok: true });
  })
);

router.get(
  '/files/:id/download',
  wrap(async (req, res) => {
    const id = Number(req.params.id);
    const rows = await query(
      'SELECT file_name AS fileName, stored_name AS storedName FROM archive_files WHERE id = ? LIMIT 1',
      [id]
    );
    if (!rows.length) throw new HttpError(404, 'File not found');

    const absolute = storedPath(rows[0].storedName);
    try {
      await fs.access(absolute);
    } catch {
      throw new HttpError(410, 'That file is no longer on the server');
    }

    res.download(absolute, rows[0].fileName);
  })
);

export default router;
