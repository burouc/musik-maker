import React, { useState, useCallback, useRef } from 'react';
import type { Pattern, ArrangementTrack, ArrangementBlock, PlaybackMode } from '../types';

interface ArrangementProps {
  patterns: Pattern[];
  activePatternId: string;
  arrangement: ArrangementTrack[];
  arrangementLength: number;
  playbackMode: PlaybackMode;
  currentMeasure: number;
  isPlaying: boolean;
  onToggleBlock: (arrTrackId: string, measure: number, patternId: string) => void;
  onPlaceBlock: (arrTrackId: string, measure: number, patternId: string) => void;
  onResizeBlock: (arrTrackId: string, startMeasure: number, newDuration: number) => void;
  onToggleTrackMute: (arrTrackId: string) => void;
  onAddTrack: () => void;
  onRemoveTrack: (arrTrackId: string) => void;
  onSetLength: (length: number) => void;
  onSetPlaybackMode: (mode: PlaybackMode) => void;
}

/** Cell width + gap must match CSS (48px cell + 2px gap) */
const CELL_WIDTH = 48;
const CELL_GAP = 2;
/** Extra left margin on every 4th bar */
const BAR_GROUP_MARGIN = 4;

const Arrangement = React.memo<ArrangementProps>(function Arrangement({
  patterns,
  activePatternId,
  arrangement,
  arrangementLength,
  playbackMode,
  currentMeasure,
  isPlaying,
  onToggleBlock,
  onPlaceBlock,
  onResizeBlock,
  onToggleTrackMute,
  onAddTrack,
  onRemoveTrack,
  onSetLength,
  onSetPlaybackMode,
}) {
  const [dropTarget, setDropTarget] = useState<{ trackId: string; measure: number } | null>(null);

  // --- Resize state ---
  const [resizing, setResizing] = useState<{
    trackId: string;
    startMeasure: number;
    originalDuration: number;
    currentDuration: number;
  } | null>(null);
  const resizeStartX = useRef(0);

  const handleDragOver = useCallback((e: React.DragEvent, trackId: string, measure: number) => {
    if (e.dataTransfer.types.includes('application/x-pattern-id')) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      setDropTarget({ trackId, measure });
    }
  }, []);

  const handleDragLeave = useCallback(() => {
    setDropTarget(null);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent, trackId: string, measure: number) => {
    e.preventDefault();
    const patternId = e.dataTransfer.getData('application/x-pattern-id');
    if (patternId) {
      onPlaceBlock(trackId, measure, patternId);
    }
    setDropTarget(null);
  }, [onPlaceBlock]);

  // --- Resize handlers ---
  const handleResizeStart = useCallback((
    e: React.MouseEvent,
    trackId: string,
    block: ArrangementBlock,
  ) => {
    e.preventDefault();
    e.stopPropagation();
    const duration = block.duration ?? 1;
    resizeStartX.current = e.clientX;
    setResizing({
      trackId,
      startMeasure: block.startMeasure,
      originalDuration: duration,
      currentDuration: duration,
    });

    const handleMouseMove = (ev: MouseEvent) => {
      const dx = ev.clientX - resizeStartX.current;
      const deltaCells = Math.round(dx / (CELL_WIDTH + CELL_GAP));
      const newDuration = Math.max(1, duration + deltaCells);
      setResizing((prev) =>
        prev ? { ...prev, currentDuration: newDuration } : null,
      );
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      setResizing((prev) => {
        if (prev && prev.currentDuration !== prev.originalDuration) {
          onResizeBlock(prev.trackId, prev.startMeasure, prev.currentDuration);
        }
        return null;
      });
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [onResizeBlock]);

  const measures = Array.from({ length: arrangementLength }, (_, i) => i);

  return (
    <div className="arrangement">
      <div className="arrangement-header">
        <div className="arrangement-title">Arrangement</div>
        <div className="arrangement-controls">
          <div className="playback-mode-toggle">
            <button
              className={`mode-btn${playbackMode === 'pattern' ? ' active' : ''}`}
              onClick={() => onSetPlaybackMode('pattern')}
            >
              PAT
            </button>
            <button
              className={`mode-btn${playbackMode === 'song' ? ' active' : ''}`}
              onClick={() => onSetPlaybackMode('song')}
            >
              SONG
            </button>
          </div>
          <div className="arrangement-length-control">
            <label>Bars:</label>
            <input
              type="number"
              min={4}
              max={64}
              value={arrangementLength}
              onChange={(e) => onSetLength(Number(e.target.value))}
            />
          </div>
          <button className="arrangement-add-track-btn" onClick={onAddTrack}>
            + Track
          </button>
        </div>
      </div>

      <div className="arrangement-grid-wrapper">
        <div className="arrangement-grid">
          {/* Measure numbers header */}
          <div className="arrangement-row arrangement-measure-numbers">
            <div className="arrangement-track-label" />
            {measures.map((m) => (
              <div
                key={m}
                className={`arrangement-measure-num${
                  m % 4 === 0 ? ' bar-start' : ''
                }${isPlaying && playbackMode === 'song' && m === currentMeasure ? ' current' : ''}`}
              >
                {m + 1}
              </div>
            ))}
          </div>

          {/* Arrangement tracks */}
          {arrangement.map((arrTrack) => {
            // Build a set of measures covered by multi-cell blocks (non-start cells)
            const coveredMeasures = new Set<number>();
            for (const block of arrTrack.blocks) {
              const dur = resizing?.trackId === arrTrack.id && resizing.startMeasure === block.startMeasure
                ? resizing.currentDuration
                : (block.duration ?? 1);
              for (let i = 1; i < dur; i++) {
                coveredMeasures.add(block.startMeasure + i);
              }
            }

            return (
              <div
                key={arrTrack.id}
                className={`arrangement-row${arrTrack.muted ? ' muted' : ''}`}
              >
                <div className="arrangement-track-label">
                  <button
                    className={`arr-mute-btn${arrTrack.muted ? ' active' : ''}`}
                    onClick={() => onToggleTrackMute(arrTrack.id)}
                  >
                    M
                  </button>
                  <span className="arr-track-name">{arrTrack.name}</span>
                  {arrangement.length > 1 && (
                    <button
                      className="arr-remove-btn"
                      onClick={() => onRemoveTrack(arrTrack.id)}
                      title="Remove track"
                    >
                      x
                    </button>
                  )}
                </div>
                {measures.map((m) => {
                  // Skip measures that are covered by a block starting earlier
                  if (coveredMeasures.has(m)) return null;

                  const block = arrTrack.blocks.find(
                    (b) => b.startMeasure === m,
                  );
                  const pattern = block
                    ? patterns.find((p) => p.id === block.patternId)
                    : null;

                  const isDropTargetCell = dropTarget?.trackId === arrTrack.id && dropTarget?.measure === m;

                  if (block && pattern) {
                    // Render a multi-cell block
                    const duration = resizing?.trackId === arrTrack.id && resizing.startMeasure === block.startMeasure
                      ? resizing.currentDuration
                      : (block.duration ?? 1);

                    // Calculate width: duration cells + gaps between them + any bar-start margins
                    let extraMargin = 0;
                    for (let i = 1; i < duration; i++) {
                      if ((m + i) % 4 === 0) extraMargin += BAR_GROUP_MARGIN;
                    }
                    const width =
                      duration * CELL_WIDTH +
                      (duration - 1) * CELL_GAP +
                      extraMargin;

                    const isCurrent =
                      isPlaying &&
                      playbackMode === 'song' &&
                      currentMeasure >= m &&
                      currentMeasure < m + duration;

                    return (
                      <div
                        key={m}
                        className={`arrangement-cell filled arrangement-block-span${
                          m % 4 === 0 ? ' bar-start' : ''
                        }${isCurrent ? ' current' : ''}`}
                        style={{
                          '--block-color': pattern.color,
                          width: `${width}px`,
                          minWidth: `${width}px`,
                        } as React.CSSProperties}
                        onClick={() =>
                          onToggleBlock(arrTrack.id, m, activePatternId)
                        }
                        title={pattern.name}
                      >
                        <span className="arrangement-block-label">
                          {pattern.name}
                        </span>
                        <div
                          className="arrangement-resize-handle"
                          onMouseDown={(e) =>
                            handleResizeStart(e, arrTrack.id, block)
                          }
                        />
                      </div>
                    );
                  }

                  // Empty cell
                  return (
                    <button
                      key={m}
                      className={`arrangement-cell${
                        m % 4 === 0 ? ' bar-start' : ''
                      }${isPlaying && playbackMode === 'song' && m === currentMeasure ? ' current' : ''}${isDropTargetCell ? ' drop-target' : ''}`}
                      onClick={() =>
                        onToggleBlock(arrTrack.id, m, activePatternId)
                      }
                      onDragOver={(e) => handleDragOver(e, arrTrack.id, m)}
                      onDragLeave={handleDragLeave}
                      onDrop={(e) => handleDrop(e, arrTrack.id, m)}
                      title={`Place ${patterns.find(p => p.id === activePatternId)?.name ?? 'pattern'} here`}
                    />
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
});

export default Arrangement;
