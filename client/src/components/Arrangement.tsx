import React, { useState, useCallback } from 'react';
import type { Pattern, ArrangementTrack, PlaybackMode } from '../types';

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
  onToggleTrackMute: (arrTrackId: string) => void;
  onAddTrack: () => void;
  onRemoveTrack: (arrTrackId: string) => void;
  onSetLength: (length: number) => void;
  onSetPlaybackMode: (mode: PlaybackMode) => void;
}

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
  onToggleTrackMute,
  onAddTrack,
  onRemoveTrack,
  onSetLength,
  onSetPlaybackMode,
}) {
  const [dropTarget, setDropTarget] = useState<{ trackId: string; measure: number } | null>(null);

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
          {arrangement.map((arrTrack) => (
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
                const block = arrTrack.blocks.find(
                  (b) => b.startMeasure === m,
                );
                const pattern = block
                  ? patterns.find((p) => p.id === block.patternId)
                  : null;

                const isDropTarget = dropTarget?.trackId === arrTrack.id && dropTarget?.measure === m;

                return (
                  <button
                    key={m}
                    className={`arrangement-cell${block ? ' filled' : ''}${
                      m % 4 === 0 ? ' bar-start' : ''
                    }${isPlaying && playbackMode === 'song' && m === currentMeasure ? ' current' : ''}${isDropTarget ? ' drop-target' : ''}`}
                    style={
                      pattern
                        ? ({
                            '--block-color': pattern.color,
                          } as React.CSSProperties)
                        : undefined
                    }
                    onClick={() =>
                      onToggleBlock(arrTrack.id, m, activePatternId)
                    }
                    onDragOver={(e) => handleDragOver(e, arrTrack.id, m)}
                    onDragLeave={handleDragLeave}
                    onDrop={(e) => handleDrop(e, arrTrack.id, m)}
                    title={pattern ? pattern.name : `Place ${patterns.find(p => p.id === activePatternId)?.name ?? 'pattern'} here`}
                  >
                    {pattern && (
                      <span className="arrangement-block-label">
                        {pattern.name}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
});

export default Arrangement;
