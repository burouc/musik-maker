import React, { useCallback, useMemo, useRef, useState } from 'react';
import type { SampleInstrument } from '../types';
import { ACCEPTED_SAMPLE_MIME_TYPES } from '../audio/AudioEngine';

/** A virtual folder that groups samples by user-defined folders or a default "All Samples" bucket */
interface SampleFolder {
  name: string;
  samples: SampleInstrument[];
}

interface SampleBrowserProps {
  samples: SampleInstrument[];
  onLoadSample: (file: File) => Promise<SampleInstrument | null>;
  onPreviewSample: (file: File) => Promise<void>;
  onStopPreview: () => void;
  onAssignSample: (sampleId: string) => void;
}

const SampleBrowser = React.memo<SampleBrowserProps>(function SampleBrowser({
  samples,
  onLoadSample,
  onPreviewSample,
  onStopPreview,
  onAssignSample,
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const [folders, setFolders] = useState<Map<string, string>>(new Map()); // sampleId -> folder name
  const [activeFolder, setActiveFolder] = useState<string | null>(null); // null = show all
  const [searchQuery, setSearchQuery] = useState('');
  const [previewingSampleId, setPreviewingSampleId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Build folder structure
  const folderList = useMemo<SampleFolder[]>(() => {
    const folderMap = new Map<string, SampleInstrument[]>();
    const uncategorized: SampleInstrument[] = [];

    for (const sample of samples) {
      const folder = folders.get(sample.id);
      if (folder) {
        const existing = folderMap.get(folder) ?? [];
        existing.push(sample);
        folderMap.set(folder, existing);
      } else {
        uncategorized.push(sample);
      }
    }

    const result: SampleFolder[] = [];
    for (const [name, samps] of folderMap.entries()) {
      result.push({ name, samples: samps });
    }
    result.sort((a, b) => a.name.localeCompare(b.name));

    if (uncategorized.length > 0) {
      result.push({ name: 'Uncategorized', samples: uncategorized });
    }

    return result;
  }, [samples, folders]);

  // Filtered samples for display
  const displaySamples = useMemo(() => {
    let pool: SampleInstrument[];
    if (activeFolder === null) {
      pool = samples;
    } else {
      const folder = folderList.find((f) => f.name === activeFolder);
      pool = folder ? folder.samples : samples;
    }

    if (!searchQuery.trim()) return pool;

    const q = searchQuery.toLowerCase();
    return pool.filter(
      (s) => s.name.toLowerCase().includes(q) || s.fileName.toLowerCase().includes(q),
    );
  }, [samples, activeFolder, folderList, searchQuery]);

  // Load files from file input
  const handleFilesSelected = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0) return;
      setLoading(true);
      const fileArray = Array.from(files);

      // Detect folder name from webkitRelativePath if available
      const folderName =
        fileArray[0]?.webkitRelativePath?.split('/').slice(0, -1).join('/') || null;

      for (const file of fileArray) {
        const sample = await onLoadSample(file);
        if (sample && folderName) {
          // Extract the top-level folder name from the relative path
          const parts = (file as File & { webkitRelativePath?: string }).webkitRelativePath?.split('/');
          const topFolder = parts && parts.length > 1 ? parts[0] : folderName;
          setFolders((prev) => {
            const next = new Map(prev);
            next.set(sample.id, topFolder);
            return next;
          });
        }
      }
      setLoading(false);
    },
    [onLoadSample],
  );

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      handleFilesSelected(e.target.files);
      e.target.value = '';
    },
    [handleFilesSelected],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const files = e.dataTransfer.files;
      if (files.length > 0) {
        handleFilesSelected(files);
      }
    },
    [handleFilesSelected],
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handlePreview = useCallback(
    async (sample: SampleInstrument) => {
      if (previewingSampleId === sample.id) {
        onStopPreview();
        setPreviewingSampleId(null);
      } else {
        // Fetch the blob from the object URL and create a File for preview
        try {
          const response = await fetch(sample.url);
          const blob = await response.blob();
          const file = new File([blob], sample.fileName, { type: blob.type });
          setPreviewingSampleId(sample.id);
          await onPreviewSample(file);
          setPreviewingSampleId(null);
        } catch {
          setPreviewingSampleId(null);
        }
      }
    },
    [previewingSampleId, onPreviewSample, onStopPreview],
  );

  const handleAssign = useCallback(
    (sampleId: string) => {
      onAssignSample(sampleId);
    },
    [onAssignSample],
  );

  // Rename folder
  const [renamingFolder, setRenamingFolder] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  const startRenameFolder = useCallback((folderName: string) => {
    setRenamingFolder(folderName);
    setRenameValue(folderName);
  }, []);

  const confirmRenameFolder = useCallback(() => {
    if (!renamingFolder || !renameValue.trim()) {
      setRenamingFolder(null);
      return;
    }
    const newName = renameValue.trim();
    if (newName !== renamingFolder) {
      setFolders((prev) => {
        const next = new Map(prev);
        for (const [id, folder] of next.entries()) {
          if (folder === renamingFolder) {
            next.set(id, newName);
          }
        }
        return next;
      });
      if (activeFolder === renamingFolder) {
        setActiveFolder(newName);
      }
    }
    setRenamingFolder(null);
  }, [renamingFolder, renameValue, activeFolder]);

  const uniqueFolderNames = useMemo(
    () => folderList.map((f) => f.name),
    [folderList],
  );

  return (
    <div
      className="sample-browser"
      onDrop={handleDrop}
      onDragOver={handleDragOver}
    >
      <div className="sample-browser-header">
        <span className="sample-browser-title">Sample Browser</span>
        <div className="sample-browser-actions">
          <button
            className="sample-browser-add-btn"
            onClick={() => fileInputRef.current?.click()}
            title="Add sample files"
          >
            + Files
          </button>
          <button
            className="sample-browser-add-btn"
            onClick={() => folderInputRef.current?.click()}
            title="Add folder of samples"
          >
            + Folder
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPTED_SAMPLE_MIME_TYPES}
            multiple
            style={{ display: 'none' }}
            onChange={handleFileChange}
          />
          <input
            ref={folderInputRef}
            type="file"
            accept={ACCEPTED_SAMPLE_MIME_TYPES}
            multiple
            {...({ webkitdirectory: '', directory: '' } as React.InputHTMLAttributes<HTMLInputElement>)}
            style={{ display: 'none' }}
            onChange={handleFileChange}
          />
        </div>
      </div>

      <div className="sample-browser-search">
        <input
          type="text"
          className="sample-browser-search-input"
          placeholder="Search samples..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        {searchQuery && (
          <button
            className="sample-browser-search-clear"
            onClick={() => setSearchQuery('')}
          >
            x
          </button>
        )}
      </div>

      <div className="sample-browser-body">
        {/* Folder sidebar */}
        <div className="sample-browser-folders">
          <button
            className={`sample-browser-folder-btn${activeFolder === null ? ' active' : ''}`}
            onClick={() => setActiveFolder(null)}
          >
            All ({samples.length})
          </button>
          {uniqueFolderNames.map((name) => {
            const folder = folderList.find((f) => f.name === name)!;
            return (
              <div key={name} className="sample-browser-folder-item">
                {renamingFolder === name ? (
                  <input
                    className="sample-browser-folder-rename"
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onBlur={confirmRenameFolder}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') confirmRenameFolder();
                      if (e.key === 'Escape') setRenamingFolder(null);
                    }}
                    autoFocus
                  />
                ) : (
                  <button
                    className={`sample-browser-folder-btn${activeFolder === name ? ' active' : ''}`}
                    onClick={() => setActiveFolder(name)}
                    onDoubleClick={() => startRenameFolder(name)}
                    title="Click to select, double-click to rename"
                  >
                    {name} ({folder.samples.length})
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {/* Sample list */}
        <div className="sample-browser-list">
          {loading && <div className="sample-browser-loading">Loading...</div>}
          {!loading && displaySamples.length === 0 && (
            <div className="sample-browser-empty">
              {samples.length === 0
                ? 'Drop audio files here or click "+ Files" to add samples'
                : 'No matching samples'}
            </div>
          )}
          {displaySamples.map((sample) => (
            <div key={sample.id} className="sample-browser-item">
              <button
                className={`sample-browser-preview-btn${previewingSampleId === sample.id ? ' playing' : ''}`}
                onClick={() => handlePreview(sample)}
                title="Preview sample"
              >
                {previewingSampleId === sample.id ? '||' : '\u25B6'}
              </button>
              <span className="sample-browser-item-name" title={sample.fileName}>
                {sample.name}
              </span>
              <span className="sample-browser-item-ext">
                {sample.fileName.split('.').pop()?.toUpperCase()}
              </span>
              <button
                className="sample-browser-assign-btn"
                onClick={() => handleAssign(sample.id)}
                title="Assign to selected sample track"
              >
                Use
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
});

export default SampleBrowser;
