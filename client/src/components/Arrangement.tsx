import React, { useState, useCallback, useRef } from 'react';
import type { Pattern, ArrangementTrack, ArrangementBlock, AudioClip, AutomationClip, AutomationTarget, PlaybackMode, SampleInstrument } from '../types';

interface ArrangementProps {
  patterns: Pattern[];
  activePatternId: string;
  arrangement: ArrangementTrack[];
  arrangementLength: number;
  playbackMode: PlaybackMode;
  currentMeasure: number;
  isPlaying: boolean;
  loopStart: number | null;
  loopEnd: number | null;
  samples: SampleInstrument[];
  automationTargets: { value: AutomationTarget; label: string }[];
  onToggleBlock: (arrTrackId: string, measure: number, patternId: string) => void;
  onPlaceBlock: (arrTrackId: string, measure: number, patternId: string) => void;
  onResizeBlock: (arrTrackId: string, startMeasure: number, newDuration: number) => void;
  onMoveBlock: (fromTrackId: string, fromStartMeasure: number, toTrackId: string, toStartMeasure: number) => void;
  onToggleTrackMute: (arrTrackId: string) => void;
  onAddTrack: () => void;
  onRemoveTrack: (arrTrackId: string) => void;
  onSetLength: (length: number) => void;
  onSetPlaybackMode: (mode: PlaybackMode) => void;
  onSetLoopStart: (measure: number | null) => void;
  onSetLoopEnd: (measure: number | null) => void;
  onClearLoop: () => void;
  onPlaceAudioClip: (arrTrackId: string, measure: number, sampleId: string) => void;
  onRemoveAudioClip: (arrTrackId: string, clipId: string) => void;
  onMoveAudioClip: (fromTrackId: string, clipId: string, toTrackId: string, toStartMeasure: number) => void;
  onResizeAudioClip: (arrTrackId: string, clipId: string, newDuration: number) => void;
  onPlaceAutomationClip: (arrTrackId: string, measure: number, target: AutomationTarget) => void;
  onRemoveAutomationClip: (arrTrackId: string, clipId: string) => void;
  onMoveAutomationClip: (fromTrackId: string, clipId: string, toTrackId: string, toStartMeasure: number) => void;
  onResizeAutomationClip: (arrTrackId: string, clipId: string, newDuration: number) => void;
  onToggleAutomationClipEnabled: (arrTrackId: string, clipId: string) => void;
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
  loopStart,
  loopEnd,
  samples,
  automationTargets,
  onToggleBlock,
  onPlaceBlock,
  onResizeBlock,
  onMoveBlock,
  onToggleTrackMute,
  onAddTrack,
  onRemoveTrack,
  onSetLength,
  onSetPlaybackMode,
  onSetLoopStart,
  onSetLoopEnd,
  onClearLoop,
  onPlaceAudioClip,
  onRemoveAudioClip,
  onMoveAudioClip,
  onResizeAudioClip,
  onPlaceAutomationClip,
  onRemoveAutomationClip,
  onMoveAutomationClip,
  onResizeAutomationClip,
  onToggleAutomationClipEnabled,
}) {
  const [dropTarget, setDropTarget] = useState<{ trackId: string; measure: number } | null>(null);

  // --- Move/drag state ---
  const [draggingBlock, setDraggingBlock] = useState<{ trackId: string; startMeasure: number } | null>(null);

  const handleBlockDragStart = useCallback((
    e: React.DragEvent,
    trackId: string,
    block: ArrangementBlock,
  ) => {
    e.dataTransfer.setData(
      'application/x-block-move',
      JSON.stringify({ trackId, startMeasure: block.startMeasure }),
    );
    e.dataTransfer.effectAllowed = 'move';
    setDraggingBlock({ trackId, startMeasure: block.startMeasure });
  }, []);

  const handleBlockDragEnd = useCallback(() => {
    setDraggingBlock(null);
  }, []);

  // --- Audio clip drag state ---
  const [draggingClip, setDraggingClip] = useState<{ trackId: string; clipId: string } | null>(null);

  const handleClipDragStart = useCallback((
    e: React.DragEvent,
    trackId: string,
    clip: AudioClip,
  ) => {
    e.dataTransfer.setData(
      'application/x-clip-move',
      JSON.stringify({ trackId, clipId: clip.id }),
    );
    e.dataTransfer.effectAllowed = 'move';
    setDraggingClip({ trackId, clipId: clip.id });
  }, []);

  const handleClipDragEnd = useCallback(() => {
    setDraggingClip(null);
  }, []);

  // --- Automation clip drag state ---
  const [draggingAutoClip, setDraggingAutoClip] = useState<{ trackId: string; clipId: string } | null>(null);

  const handleAutoClipDragStart = useCallback((
    e: React.DragEvent,
    trackId: string,
    clip: AutomationClip,
  ) => {
    e.dataTransfer.setData(
      'application/x-autoclip-move',
      JSON.stringify({ trackId, clipId: clip.id }),
    );
    e.dataTransfer.effectAllowed = 'move';
    setDraggingAutoClip({ trackId, clipId: clip.id });
  }, []);

  const handleAutoClipDragEnd = useCallback(() => {
    setDraggingAutoClip(null);
  }, []);

  // --- Automation clip placement target ---
  const [selectedAutoTarget, setSelectedAutoTarget] = useState<AutomationTarget | ''>('');

  // --- Resize state (shared for blocks, audio clips, and automation clips) ---
  const [resizing, setResizing] = useState<{
    trackId: string;
    startMeasure: number;
    originalDuration: number;
    currentDuration: number;
    clipId?: string;
    autoClipId?: string;
  } | null>(null);
  const resizeStartX = useRef(0);

  const handleDragOver = useCallback((e: React.DragEvent, trackId: string, measure: number) => {
    if (
      e.dataTransfer.types.includes('application/x-pattern-id') ||
      e.dataTransfer.types.includes('application/x-block-move') ||
      e.dataTransfer.types.includes('application/x-clip-move') ||
      e.dataTransfer.types.includes('application/x-autoclip-move') ||
      e.dataTransfer.types.includes('application/x-sample-id')
    ) {
      e.preventDefault();
      e.dataTransfer.dropEffect =
        e.dataTransfer.types.includes('application/x-block-move') ||
        e.dataTransfer.types.includes('application/x-clip-move') ||
        e.dataTransfer.types.includes('application/x-autoclip-move')
          ? 'move'
          : 'copy';
      setDropTarget({ trackId, measure });
    }
  }, []);

  const handleDragLeave = useCallback(() => {
    setDropTarget(null);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent, trackId: string, measure: number) => {
    e.preventDefault();

    // Handle block moves
    const moveData = e.dataTransfer.getData('application/x-block-move');
    if (moveData) {
      const { trackId: fromTrackId, startMeasure } = JSON.parse(moveData);
      onMoveBlock(fromTrackId, startMeasure, trackId, measure);
      setDropTarget(null);
      return;
    }

    // Handle audio clip moves
    const clipMoveData = e.dataTransfer.getData('application/x-clip-move');
    if (clipMoveData) {
      const { trackId: fromTrackId, clipId } = JSON.parse(clipMoveData);
      onMoveAudioClip(fromTrackId, clipId, trackId, measure);
      setDropTarget(null);
      return;
    }

    // Handle automation clip moves
    const autoClipMoveData = e.dataTransfer.getData('application/x-autoclip-move');
    if (autoClipMoveData) {
      const { trackId: fromTrackId, clipId } = JSON.parse(autoClipMoveData);
      onMoveAutomationClip(fromTrackId, clipId, trackId, measure);
      setDropTarget(null);
      return;
    }

    // Handle sample drops (from sample browser)
    const sampleId = e.dataTransfer.getData('application/x-sample-id');
    if (sampleId) {
      onPlaceAudioClip(trackId, measure, sampleId);
      setDropTarget(null);
      return;
    }

    // Handle pattern drops
    const patternId = e.dataTransfer.getData('application/x-pattern-id');
    if (patternId) {
      onPlaceBlock(trackId, measure, patternId);
    }
    setDropTarget(null);
  }, [onPlaceBlock, onMoveBlock, onPlaceAudioClip, onMoveAudioClip, onMoveAutomationClip]);

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

  const handleClipResizeStart = useCallback((
    e: React.MouseEvent,
    trackId: string,
    clip: AudioClip,
  ) => {
    e.preventDefault();
    e.stopPropagation();
    const duration = clip.duration;
    resizeStartX.current = e.clientX;
    setResizing({
      trackId,
      startMeasure: clip.startMeasure,
      originalDuration: duration,
      currentDuration: duration,
      clipId: clip.id,
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
        if (prev && prev.clipId && prev.currentDuration !== prev.originalDuration) {
          onResizeAudioClip(prev.trackId, prev.clipId, prev.currentDuration);
        }
        return null;
      });
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [onResizeAudioClip]);

  const handleAutoClipResizeStart = useCallback((
    e: React.MouseEvent,
    trackId: string,
    clip: AutomationClip,
  ) => {
    e.preventDefault();
    e.stopPropagation();
    const duration = clip.duration;
    resizeStartX.current = e.clientX;
    setResizing({
      trackId,
      startMeasure: clip.startMeasure,
      originalDuration: duration,
      currentDuration: duration,
      autoClipId: clip.id,
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
        if (prev && prev.autoClipId && prev.currentDuration !== prev.originalDuration) {
          onResizeAutomationClip(prev.trackId, prev.autoClipId, prev.currentDuration);
        }
        return null;
      });
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [onResizeAutomationClip]);

  // --- Loop marker interaction ---
  const [settingLoop, setSettingLoop] = useState<'start' | 'end' | null>(null);

  const handleMeasureClick = useCallback((m: number, e: React.MouseEvent) => {
    // Left-click on measure number: set loop start on first click, end on second
    e.preventDefault();
    if (loopStart === null) {
      // No loop yet — set start
      onSetLoopStart(m);
      setSettingLoop('end');
    } else if (settingLoop === 'end') {
      // Setting end point
      if (m > loopStart) {
        onSetLoopEnd(m + 1); // exclusive end
      } else if (m < loopStart) {
        // Clicked before start — swap: new start here, old start becomes end
        onSetLoopEnd(loopStart + 1);
        onSetLoopStart(m);
      }
      setSettingLoop(null);
    } else {
      // Loop already exists — click to move start
      if (m === loopStart && loopEnd !== null) {
        // Click on start marker — clear loop
        onClearLoop();
      } else {
        onSetLoopStart(m);
        setSettingLoop('end');
      }
    }
  }, [loopStart, loopEnd, settingLoop, onSetLoopStart, onSetLoopEnd, onClearLoop]);

  const handleMeasureRightClick = useCallback((_m: number, e: React.MouseEvent) => {
    e.preventDefault();
    if (loopStart !== null && loopEnd !== null) {
      // Clear loop on right-click
      onClearLoop();
      setSettingLoop(null);
    }
  }, [loopStart, loopEnd, onClearLoop]);

  const isInLoop = useCallback((m: number) => {
    if (loopStart === null || loopEnd === null) return false;
    return m >= loopStart && m < loopEnd;
  }, [loopStart, loopEnd]);

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
          {automationTargets.length > 0 && (
            <div className="arrangement-auto-clip-controls">
              <select
                className="arrangement-auto-target-select"
                value={selectedAutoTarget}
                onChange={(e) => setSelectedAutoTarget(e.target.value as AutomationTarget)}
              >
                <option value="">Auto target...</option>
                {automationTargets.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
              {selectedAutoTarget && (
                <button
                  className="arrangement-add-auto-clip-btn"
                  onClick={() => {
                    if (selectedAutoTarget && arrangement.length > 0) {
                      onPlaceAutomationClip(arrangement[0].id, 0, selectedAutoTarget);
                    }
                  }}
                  title="Place automation clip on first track at measure 1"
                >
                  + Auto
                </button>
              )}
            </div>
          )}
          {loopStart !== null && loopEnd !== null && (
            <button
              className="arrangement-clear-loop-btn"
              onClick={() => { onClearLoop(); setSettingLoop(null); }}
              title="Clear loop region"
            >
              Clear Loop
            </button>
          )}
        </div>
      </div>

      <div className="arrangement-grid-wrapper">
        <div className="arrangement-grid">
          {/* Loop region bar */}
          <div className="arrangement-row arrangement-loop-bar">
            <div className="arrangement-track-label loop-bar-label">
              {settingLoop === 'end'
                ? <span className="loop-hint">Click end measure</span>
                : <span className="loop-hint">Loop</span>
              }
            </div>
            {measures.map((m) => {
              const inLoop = isInLoop(m);
              const isStart = m === loopStart;
              const isEnd = loopEnd !== null && m === loopEnd - 1;
              return (
                <div
                  key={m}
                  className={`arrangement-loop-cell${
                    m % 4 === 0 ? ' bar-start' : ''
                  }${inLoop ? ' in-loop' : ''}${isStart ? ' loop-start' : ''}${isEnd ? ' loop-end' : ''}${
                    settingLoop !== null ? ' setting' : ''
                  }`}
                  onClick={(e) => handleMeasureClick(m, e)}
                  onContextMenu={(e) => handleMeasureRightClick(m, e)}
                  title={
                    inLoop
                      ? `Loop measure ${m + 1} (right-click to clear)`
                      : `Click to set loop ${loopStart === null || settingLoop !== 'end' ? 'start' : 'end'}`
                  }
                />
              );
            })}
          </div>

          {/* Measure numbers header */}
          <div className="arrangement-row arrangement-measure-numbers">
            <div className="arrangement-track-label" />
            {measures.map((m) => (
              <div
                key={m}
                className={`arrangement-measure-num${
                  m % 4 === 0 ? ' bar-start' : ''
                }${isPlaying && playbackMode === 'song' && m === currentMeasure ? ' current' : ''}${isInLoop(m) ? ' in-loop' : ''}`}
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
              const dur = resizing?.trackId === arrTrack.id && !resizing.clipId && resizing.startMeasure === block.startMeasure
                ? resizing.currentDuration
                : (block.duration ?? 1);
              for (let i = 1; i < dur; i++) {
                coveredMeasures.add(block.startMeasure + i);
              }
            }
            // Also cover measures occupied by audio clips
            for (const clip of arrTrack.audioClips ?? []) {
              const dur = resizing?.trackId === arrTrack.id && resizing.clipId === clip.id
                ? resizing.currentDuration
                : clip.duration;
              for (let i = 0; i < dur; i++) {
                coveredMeasures.add(clip.startMeasure + i);
              }
            }
            // Also cover measures occupied by automation clips
            for (const aclip of arrTrack.automationClips ?? []) {
              const dur = resizing?.trackId === arrTrack.id && resizing.autoClipId === aclip.id
                ? resizing.currentDuration
                : aclip.duration;
              for (let i = 0; i < dur; i++) {
                coveredMeasures.add(aclip.startMeasure + i);
              }
            }

            // Build a map of clip start measure → clip for rendering
            const clipsByStart = new Map<number, AudioClip>();
            for (const clip of arrTrack.audioClips ?? []) {
              clipsByStart.set(clip.startMeasure, clip);
            }

            // Build a map of automation clip start measure → clip for rendering
            const autoClipsByStart = new Map<number, AutomationClip>();
            for (const aclip of arrTrack.automationClips ?? []) {
              autoClipsByStart.set(aclip.startMeasure, aclip);
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
                  // Check if an audio clip starts here
                  const clip = clipsByStart.get(m);
                  if (clip) {
                    const sample = samples.find((s) => s.id === clip.sampleId);
                    const clipName = sample?.name ?? 'Audio';
                    const duration = resizing?.trackId === arrTrack.id && resizing.clipId === clip.id
                      ? resizing.currentDuration
                      : clip.duration;

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

                    const isDragging =
                      draggingClip?.trackId === arrTrack.id &&
                      draggingClip?.clipId === clip.id;

                    return (
                      <div
                        key={m}
                        draggable
                        className={`arrangement-cell filled arrangement-block-span arrangement-audio-clip${
                          m % 4 === 0 ? ' bar-start' : ''
                        }${isCurrent ? ' current' : ''}${isDragging ? ' dragging' : ''}`}
                        style={{
                          '--block-color': clip.color,
                          width: `${width}px`,
                          minWidth: `${width}px`,
                        } as React.CSSProperties}
                        onClick={(e) => {
                          if (e.shiftKey) {
                            onRemoveAudioClip(arrTrack.id, clip.id);
                          }
                        }}
                        onDragStart={(e) =>
                          handleClipDragStart(e, arrTrack.id, clip)
                        }
                        onDragEnd={handleClipDragEnd}
                        onDragOver={(e) => handleDragOver(e, arrTrack.id, m)}
                        onDragLeave={handleDragLeave}
                        onDrop={(e) => handleDrop(e, arrTrack.id, m)}
                        title={`${clipName} (Shift+click to remove)`}
                      >
                        <span className="arrangement-clip-icon">♪</span>
                        <span className="arrangement-block-label">
                          {clipName}
                        </span>
                        <div
                          className="arrangement-resize-handle"
                          onMouseDown={(e) =>
                            handleClipResizeStart(e, arrTrack.id, clip)
                          }
                        />
                      </div>
                    );
                  }

                  // Check if an automation clip starts here
                  const autoClip = autoClipsByStart.get(m);
                  if (autoClip) {
                    const duration = resizing?.trackId === arrTrack.id && resizing.autoClipId === autoClip.id
                      ? resizing.currentDuration
                      : autoClip.duration;

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

                    const isDragging =
                      draggingAutoClip?.trackId === arrTrack.id &&
                      draggingAutoClip?.clipId === autoClip.id;

                    return (
                      <div
                        key={m}
                        draggable
                        className={`arrangement-cell filled arrangement-block-span arrangement-automation-clip${
                          m % 4 === 0 ? ' bar-start' : ''
                        }${isCurrent ? ' current' : ''}${isDragging ? ' dragging' : ''}${!autoClip.enabled ? ' disabled' : ''}`}
                        style={{
                          '--block-color': autoClip.color,
                          width: `${width}px`,
                          minWidth: `${width}px`,
                        } as React.CSSProperties}
                        onClick={(e) => {
                          if (e.shiftKey) {
                            onRemoveAutomationClip(arrTrack.id, autoClip.id);
                          } else if (e.ctrlKey || e.metaKey) {
                            onToggleAutomationClipEnabled(arrTrack.id, autoClip.id);
                          }
                        }}
                        onDragStart={(e) =>
                          handleAutoClipDragStart(e, arrTrack.id, autoClip)
                        }
                        onDragEnd={handleAutoClipDragEnd}
                        onDragOver={(e) => handleDragOver(e, arrTrack.id, m)}
                        onDragLeave={handleDragLeave}
                        onDrop={(e) => handleDrop(e, arrTrack.id, m)}
                        title={`${autoClip.name}${!autoClip.enabled ? ' (disabled)' : ''} (Shift+click to remove, Ctrl+click to toggle)`}
                      >
                        <span className="arrangement-clip-icon">⟿</span>
                        <span className="arrangement-block-label">
                          {autoClip.name}
                        </span>
                        <div
                          className="arrangement-resize-handle"
                          onMouseDown={(e) =>
                            handleAutoClipResizeStart(e, arrTrack.id, autoClip)
                          }
                        />
                      </div>
                    );
                  }

                  // Skip measures that are covered by a block or clip starting earlier
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
                    const duration = resizing?.trackId === arrTrack.id && !resizing.clipId && resizing.startMeasure === block.startMeasure
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

                    const isDragging =
                      draggingBlock?.trackId === arrTrack.id &&
                      draggingBlock?.startMeasure === m;

                    return (
                      <div
                        key={m}
                        draggable
                        className={`arrangement-cell filled arrangement-block-span${
                          m % 4 === 0 ? ' bar-start' : ''
                        }${isCurrent ? ' current' : ''}${isDragging ? ' dragging' : ''}`}
                        style={{
                          '--block-color': pattern.color,
                          width: `${width}px`,
                          minWidth: `${width}px`,
                        } as React.CSSProperties}
                        onClick={() =>
                          onToggleBlock(arrTrack.id, m, activePatternId)
                        }
                        onDragStart={(e) =>
                          handleBlockDragStart(e, arrTrack.id, block)
                        }
                        onDragEnd={handleBlockDragEnd}
                        onDragOver={(e) => handleDragOver(e, arrTrack.id, m)}
                        onDragLeave={handleDragLeave}
                        onDrop={(e) => handleDrop(e, arrTrack.id, m)}
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
