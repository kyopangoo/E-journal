import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { Icon } from '../components/Icons.jsx';
import { DropdownMenu } from '../components/DropdownMenu.jsx';
import {
  EmptyState,
  Hero,
  Loading,
  Notice,
  Panel,
  SectionHead,
  formatDateTime,
} from '../components/ui.jsx';

function formatBytes(bytes) {
  const size = Number(bytes) || 0;
  if (size === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const index = Math.min(Math.floor(Math.log(size) / Math.log(1024)), units.length - 1);
  const value = index === 0 ? size : (size / 1024 ** index).toFixed(1);
  return `${value} ${units[index]}`;
}

export default function ArchivePage() {
  const { folderId } = useParams();
  const navigate = useNavigate();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [showCreateFolder, setShowCreateFolder] = useState(false);
  const [createForm, setCreateForm] = useState({ name: '', description: '' });
  const [savingCreate, setSavingCreate] = useState(false);

  const [editTarget, setEditTarget] = useState(null);
  const [editForm, setEditForm] = useState({ name: '', description: '' });

  const [showUpload, setShowUpload] = useState(false);
  const [uploadFiles, setUploadFiles] = useState([]);
  const [uploading, setUploading] = useState(false);

  const [notice, setNotice] = useState('');

  const currentId = folderId ? Number(folderId) : null;

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await api.get(`/archive/browse${currentId ? `?folderId=${currentId}` : ''}`);
      setData(result);
    } catch (catchError) {
      setError(catchError.message);
    } finally {
      setLoading(false);
    }
  }, [currentId]);

  useEffect(() => {
    load();
    setShowCreateFolder(false);
    setShowUpload(false);
    setEditTarget(null);
    setNotice('');
  }, [load]);

  function flashNotice(message) {
    setNotice(message);
    setTimeout(() => setNotice(''), 4000);
  }

  async function handleCreateFolder(event) {
    event.preventDefault();
    setSavingCreate(true);
    try {
      const payload = { name: createForm.name, parentId: currentId };
      if (createForm.description) payload.description = createForm.description;
      await api.post('/archive/folders', payload);
      const created = createForm.name;
      setCreateForm({ name: '', description: '' });
      setShowCreateFolder(false);
      flashNotice(`Folder "${created}" created`);
      await load();
    } catch (catchError) {
      setError(catchError.message);
    } finally {
      setSavingCreate(false);
    }
  }

  async function handleRename(event) {
    event.preventDefault();
    try {
      await api.patch(`/archive/folders/${editTarget.id}`, editForm);
      setEditTarget(null);
      flashNotice(`Folder renamed to "${editForm.name}"`);
      await load();
    } catch (catchError) {
      setError(catchError.message);
    }
  }

  async function handleDeleteFolder(folder) {
    if (
      !window.confirm(
        `Delete folder "${folder.name}" and everything inside it?\n\nAll nested folders and files will be removed. This cannot be undone.`
      )
    )
      return;
    try {
      await api.del(`/archive/folders/${folder.id}`);
      flashNotice(`Deleted "${folder.name}"`);
      if (currentId === folder.id) navigate('/archive');
      await load();
    } catch (catchError) {
      setError(catchError.message);
    }
  }

  async function handleUpload(event) {
    event.preventDefault();
    if (!uploadFiles.length) return;
    setUploading(true);
    try {
      const formData = new FormData();
      for (const file of uploadFiles) {
        formData.append('files', file);
      }
      const result = await api.upload(`/archive/folders/${currentId}/files`, formData);
      setUploadFiles([]);
      setShowUpload(false);
      flashNotice(`${result.uploaded} file(s) uploaded`);
      await load();
    } catch (catchError) {
      setError(catchError.message);
    } finally {
      setUploading(false);
    }
  }

  async function handleDeleteFile(file) {
    if (!window.confirm(`Delete "${file.fileName}"?`)) return;
    try {
      await api.del(`/archive/files/${file.id}`);
      flashNotice(`Deleted "${file.fileName}"`);
      await load();
    } catch (catchError) {
      setError(catchError.message);
    }
  }

  const folder = data?.folder ?? null;
  const breadcrumb = data?.breadcrumb ?? [];
  const folders = data?.folders ?? [];
  const files = data?.files ?? [];
  const stats = data?.stats ?? { folderCount: 0, fileCount: 0, totalBytes: 0 };
  const parentCrumb = breadcrumb.length > 1 ? breadcrumb[breadcrumb.length - 2] : null;

  return (
    <>
      <Hero
        eyebrow={currentId ? 'Admin / Archive' : 'Admin'}
        title={folder?.name ?? 'Archive'}
        lead={
          folder?.description ??
          'Penyimpanan dokumen guide untuk internal divisi. Buat folder, lalu unggah dokumennya.'
        }
        chips={currentId ? null : ['Admin only', 'Guides', 'Documents']}
        stats={[
          { label: 'folders', value: stats.folderCount },
          { label: 'files', value: stats.fileCount },
          { label: 'total size', value: formatBytes(stats.totalBytes) },
        ]}
        actions={
          <>
            {currentId ? (
              <button
                type="button"
                className="btn btn--primary"
                onClick={() => setShowUpload((open) => !open)}
              >
                <Icon name={showUpload ? 'close' : 'upload'} size={17} />
                {showUpload ? 'Cancel' : 'Upload files'}
              </button>
            ) : null}
            <button
              type="button"
              className="btn btn--accent"
              onClick={() => setShowCreateFolder((open) => !open)}
            >
              <Icon name={showCreateFolder ? 'close' : 'plus'} size={17} />
              {showCreateFolder ? 'Cancel' : 'New folder'}
            </button>
          </>
        }
      />

      <Notice tone="success">{notice}</Notice>
      <Notice tone="error">{error}</Notice>

      {showCreateFolder ? (
        <Panel title="New folder" subtitle={currentId ? `Inside "${folder.name}"` : 'At archive root'}>
          <form onSubmit={handleCreateFolder}>
            <label className="field">
              <span className="field__label">Folder name</span>
              <input
                className="input"
                value={createForm.name}
                onChange={(event) => setCreateForm({ ...createForm, name: event.target.value })}
                placeholder="e.g. Network Troubleshooting Guide"
                maxLength={160}
                required
              />
            </label>

            <label className="field">
              <span className="field__label">Description (optional)</span>
              <textarea
                className="textarea"
                value={createForm.description}
                onChange={(event) =>
                  setCreateForm({ ...createForm, description: event.target.value })
                }
                placeholder="Short summary of what this folder contains"
                rows={2}
              />
            </label>

            <button type="submit" className="btn btn--primary" disabled={savingCreate}>
              {savingCreate ? 'Creating…' : 'Create folder'}
            </button>
          </form>
        </Panel>
      ) : null}

      {showUpload && currentId ? (
        <Panel title="Upload files" subtitle={`Into "${folder.name}"`}>
          <form onSubmit={handleUpload}>
            <p className="meta" style={{ marginBottom: 8 }}>
              Semua tipe file diterima. Maksimal 25 MB per file, sampai 10 file sekaligus.
            </p>
            <label className="file-input">
              <Icon name="upload" size={18} />
              <span className="file-input__name">
                {uploadFiles.length
                  ? `${uploadFiles.length} file dipilih: ${uploadFiles
                      .map((f) => f.name)
                      .join(', ')
                      .slice(0, 160)}`
                  : 'Choose files'}
              </span>
              <input
                type="file"
                multiple
                onChange={(event) => setUploadFiles(Array.from(event.target.files ?? []))}
              />
            </label>

            <button
              type="submit"
              className="btn btn--primary"
              disabled={uploading || !uploadFiles.length}
              style={{ marginTop: 12 }}
            >
              {uploading
                ? 'Uploading…'
                : `Upload${uploadFiles.length ? ` ${uploadFiles.length} file(s)` : ''}`}
            </button>
          </form>
        </Panel>
      ) : null}

      {currentId ? (
        <nav className="crumbs" aria-label="Archive path">
          <button type="button" className="crumbs__item" onClick={() => navigate('/archive')}>
            <Icon name="archive" size={14} />
            Archive
          </button>
          {breadcrumb.map((crumb) => (
            <span key={crumb.id} className="crumbs__wrap">
              <span className="crumbs__sep">/</span>
              {crumb.id === folder.id ? (
                <span className="crumbs__current">{crumb.name}</span>
              ) : (
                <button
                  type="button"
                  className="crumbs__item"
                  onClick={() => navigate(`/archive/${crumb.id}`)}
                >
                  {crumb.name}
                </button>
              )}
            </span>
          ))}
        </nav>
      ) : null}

      {editTarget ? (
        <Panel title="Rename folder" subtitle={`Rename "${editTarget.name}"`}>
          <form onSubmit={handleRename}>
            <label className="field" style={{ maxWidth: 340 }}>
              <span className="field__label">Folder name</span>
              <input
                className="input"
                value={editForm.name}
                onChange={(event) => setEditForm({ ...editForm, name: event.target.value })}
                maxLength={160}
                required
              />
            </label>

            <label className="field" style={{ maxWidth: 340 }}>
              <span className="field__label">Description</span>
              <textarea
                className="textarea"
                value={editForm.description}
                onChange={(event) => setEditForm({ ...editForm, description: event.target.value })}
                rows={2}
              />
            </label>

            <div className="row" style={{ gap: 8, marginTop: 16 }}>
              <button type="submit" className="btn btn--primary">
                Save
              </button>
              <button
                type="button"
                className="btn btn--outline btn--sm"
                onClick={() => setEditTarget(null)}
              >
                Cancel
              </button>
            </div>
          </form>
        </Panel>
      ) : null}

      {loading ? (
        <Loading label="Loading archive" />
      ) : !currentId && folders.length === 0 ? (
        <Panel>
          <EmptyState
            icon="archive"
            title="Archive is empty"
            hint="Create your first folder to start organising guide documents."
          />
        </Panel>
      ) : (
        <>
          {folders.length ? (
            <>
              <SectionHead
                eyebrow="Folders"
                title={`${folders.length} folder${folders.length === 1 ? '' : 's'}`}
                hint={currentId ? 'Open a folder to upload its documents' : 'Top level folders'}
              />
              <div className="folder-grid">
                {folders.map((subfolder, index) => (
                  <article
                    className="folder-card"
                    key={subfolder.id}
                    style={{ animationDelay: `${Math.min(index * 45, 260)}ms` }}
                  >
                    <button
                      type="button"
                      className="folder-card__body"
                      onClick={() => navigate(`/archive/${subfolder.id}`)}
                      title={`Open "${subfolder.name}"`}
                    >
                      <span className="folder-card__mark" aria-hidden="true">
                        <Icon name="folder" size={22} />
                      </span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <h3 className="folder-card__title">{subfolder.name}</h3>
                        {subfolder.description ? (
                          <p className="folder-card__desc">{subfolder.description}</p>
                        ) : null}
                      </div>
                      <div className="folder-card__meta">
                        <span>
                          {subfolder.folderCount} folder{subfolder.folderCount === 1 ? '' : 's'}
                        </span>
                        <span>·</span>
                        <span>
                          {subfolder.fileCount} file{subfolder.fileCount === 1 ? '' : 's'}
                        </span>
                      </div>
                    </button>

                    <div className="folder-card__actions">
                      <DropdownMenu
                        trigger={
                          <button
                            type="button"
                            className="btn btn--outline btn--sm"
                            style={{
                              minWidth: 36,
                              height: 36,
                              padding: 0,
                              justifyContent: 'center',
                            }}
                            aria-label="More actions"
                          >
                            <Icon name="dots" size={20} />
                          </button>
                        }
                        placement="bottom-end"
                      >
                        <button
                          type="button"
                          className="dropdown__item"
                          style={{ display: 'flex', alignItems: 'center', gap: 8 }}
                          onClick={() => {
                            setEditTarget(subfolder);
                            setEditForm({
                              name: subfolder.name,
                              description: subfolder.description ?? '',
                            });
                          }}
                        >
                          <Icon name="edit" size={16} />
                          Rename
                        </button>
                        <button
                          type="button"
                          className="dropdown__item dropdown__item--danger"
                          style={{ display: 'flex', alignItems: 'center', gap: 8 }}
                          onClick={() => handleDeleteFolder(subfolder)}
                        >
                          <Icon name="trash" size={16} />
                          Delete
                        </button>
                      </DropdownMenu>
                    </div>
                  </article>
                ))}
              </div>
            </>
          ) : null}

          {currentId && files.length ? (
            <>
              <SectionHead
                eyebrow="Files"
                title={`${files.length} file${files.length === 1 ? '' : 's'}`}
              />
              <div className="table-wrap panel">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Type</th>
                      <th>Size</th>
                      <th>Uploaded by</th>
                      <th>Date</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {files.map((file) => (
                      <tr key={file.id}>
                        <td style={{ fontWeight: 500 }}>{file.fileName}</td>
                        <td className="meta">{file.mimeType || '—'}</td>
                        <td className="meta" style={{ whiteSpace: 'nowrap' }}>
                          {formatBytes(file.sizeBytes)}
                        </td>
                        <td className="meta">{file.uploadedByName || '—'}</td>
                        <td className="meta" style={{ whiteSpace: 'nowrap' }}>
                          {formatDateTime(file.createdAt)}
                        </td>
                        <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                          <a
                            className="btn btn--ghost btn--sm"
                            href={`/api/archive/files/${file.id}/download`}
                            title="Download"
                          >
                            <Icon name="download" size={14} />
                          </a>
                          <button
                            type="button"
                            className="btn btn--danger btn--sm"
                            onClick={() => handleDeleteFile(file)}
                            title="Delete"
                          >
                            <Icon name="trash" size={14} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : null}

          {currentId && !files.length && !folders.length ? (
            <Panel>
              <EmptyState
                icon="folder"
                title="This folder is empty"
                hint="Use Upload files to add documents, or New folder to nest a subfolder."
              />
            </Panel>
          ) : null}

          {currentId ? (
            <div className="row" style={{ marginTop: 'var(--gap)' }}>
              <button
                type="button"
                className="btn btn--outline btn--sm"
                onClick={() =>
                  navigate(parentCrumb ? `/archive/${parentCrumb.id}` : '/archive')
                }
              >
                <Icon name="back" size={16} />
                Back to {parentCrumb?.name ?? 'Archive'}
              </button>
            </div>
          ) : null}
        </>
      )}
    </>
  );
}
