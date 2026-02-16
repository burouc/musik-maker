import React, { useCallback, useMemo, useRef, useState } from 'react';
import type { InstrumentName, Track, SampleTrack, SampleInstrument, SamplePlaybackMode } from '../types';
import { ACCEPTED_SAMPLE_MIME_TYPES } from '../audio/AudioEngine';

/** Zoom presets: label and corresponding min-width for step cells (px) */
const ZOOM_LEVELS = [
  { label: 'XS', minWidth: 16, maxWidth: 24 },
  { label: 'S', minWidth: 22, maxWidth: 36 },
  { label: 'M', minWidth: 28, maxWidth: 48 },
  { label: 'L', minWidth: 40, maxWidth: 64 },
  { label: 'XL', minWidth: 56, maxWidth: 80 },
] as const;

const DEFAULT_ZOOM_INDEX = 2; // 'M' — matches the existing min-width: 28px

/** Steps at or below this velocity are rendered as ghost notes (visually dimmed) */
const GHOST_NOTE_THRESHOLD = 0.5;

interface StepRowProps {
  track: Track;
  currentStep: number;
  isPlaying: boolean;
  onToggleStep: (trackId: InstrumentName, stepIndex: number) => void;
  onSetStepVelocity: (trackId: InstrumentName, stepIndex: number, velocity: number) => void;
  onSetStepPitch: (trackId: InstrumentName, stepIndex: number, pitch: number) => void;
}

const StepRow = React.memo<StepRowProps>(function StepRow({
  track,
  currentStep,
  isPlaying,
  onToggleStep,
  onSetStepVelocity,
  onSetStepPitch,
}) {
  const dragRef = useRef<{
    trackId: InstrumentName;
    stepIndex: number;
    startY: number;
    startVelocity: number;
    mode: 'velocity' | 'pitch';
    startPitch: number;
  } | null>(null);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent, stepIndex: number) => {
      const velocity = track.steps[stepIndex];

      if (velocity <= 0) {
        // Step is off — toggle it on
        onToggleStep(track.id, stepIndex);
        return;
      }

      const isPitchMode = e.shiftKey;

      // Step is on — start velocity or pitch drag
      dragRef.current = {
        trackId: track.id,
        stepIndex,
        startY: e.clientY,
        startVelocity: velocity,
        mode: isPitchMode ? 'pitch' : 'velocity',
        startPitch: track.pitches[stepIndex],
      };
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    },
    [track.id, track.steps, track.pitches, onToggleStep],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;

      const deltaY = drag.startY - e.clientY;

      if (drag.mode === 'pitch') {
        // 8px per semitone
        const deltaSemitones = Math.round(deltaY / 8);
        const newPitch = Math.max(-12, Math.min(12, drag.startPitch + deltaSemitones));
        onSetStepPitch(drag.trackId, drag.stepIndex, newPitch);
      } else {
        // 100px of drag = full velocity range
        const deltaVelocity = deltaY / 100;
        const newVelocity = Math.max(0.05, Math.min(1, drag.startVelocity + deltaVelocity));
        onSetStepVelocity(drag.trackId, drag.stepIndex, newVelocity);
      }
    },
    [onSetStepVelocity, onSetStepPitch],
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;

      // If barely moved, treat as a click to toggle off
      const deltaY = Math.abs(drag.startY - e.clientY);
      if (deltaY < 4 && drag.mode === 'velocity') {
        onToggleStep(drag.trackId, drag.stepIndex);
      }

      dragRef.current = null;
    },
    [onToggleStep],
  );

  return (
    <div className={`step-row${track.muted ? ' muted' : ''}`}>
      <div className="track-label">{track.name}</div>
      <div className="step-cells">
        {track.steps.map((velocity, stepIndex) => {
          const active = velocity > 0;
          const pitch = track.pitches[stepIndex];
          const classes = ['step-cell'];
          if (active) classes.push('active');
          if (active && velocity <= GHOST_NOTE_THRESHOLD) classes.push('ghost');
          if (isPlaying && stepIndex === currentStep) classes.push('current');
          if (stepIndex % 4 === 0) classes.push('beat-start');

          return (
            <button
              key={stepIndex}
              className={classes.join(' ')}
              onPointerDown={(e) => handlePointerDown(e, stepIndex)}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              style={
                active
                  ? { '--step-velocity': velocity } as React.CSSProperties
                  : undefined
              }
            >
              {active && (
                <span
                  className="step-velocity-bar"
                  style={{ height: `${velocity * 100}%` }}
                />
              )}
              {active && pitch !== 0 && (
                <span className="step-pitch-label">
                  {pitch > 0 ? `+${pitch}` : pitch}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
});

interface SampleStepRowProps {
  track: SampleTrack;
  samples: SampleInstrument[];
  currentStep: number;
  isPlaying: boolean;
  onToggleStep: (trackId: string, stepIndex: number) => void;
  onSetStepVelocity: (trackId: string, stepIndex: number, velocity: number) => void;
  onSetStepPitch: (trackId: string, stepIndex: number, pitch: number) => void;
  onSetSample: (trackId: string, sampleId: string | null) => void;
  onSetPlaybackMode: (trackId: string, mode: SamplePlaybackMode) => void;
  onLoadSample: (file: File) => Promise<SampleInstrument | null>;
  onPreviewSample: (file: File) => Promise<void>;
  onStopPreview: () => void;
  onRemoveTrack: (trackId: string) => void;
}

const SampleStepRow = React.memo<SampleStepRowProps>(function SampleStepRow({
  track,
  samples,
  currentStep,
  isPlaying,
  onToggleStep,
  onSetStepVelocity,
  onSetStepPitch,
  onSetSample,
  onSetPlaybackMode,
  onLoadSample,
  onPreviewSample,
  onStopPreview,
  onRemoveTrack,
}) {
  const dragRef = useRef<{
    trackId: string;
    stepIndex: number;
    startY: number;
    startVelocity: number;
    mode: 'velocity' | 'pitch';
    startPitch: number;
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [isPreviewing, setIsPreviewing] = useState(false);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent, stepIndex: number) => {
      const velocity = track.steps[stepIndex];
      if (velocity <= 0) {
        onToggleStep(track.id, stepIndex);
        return;
      }
      const isPitchMode = e.shiftKey;
      dragRef.current = {
        trackId: track.id,
        stepIndex,
        startY: e.clientY,
        startVelocity: velocity,
        mode: isPitchMode ? 'pitch' : 'velocity',
        startPitch: track.pitches[stepIndex],
      };
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    },
    [track.id, track.steps, track.pitches, onToggleStep],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      const deltaY = drag.startY - e.clientY;
      if (drag.mode === 'pitch') {
        const deltaSemitones = Math.round(deltaY / 8);
        const newPitch = Math.max(-12, Math.min(12, drag.startPitch + deltaSemitones));
        onSetStepPitch(drag.trackId, drag.stepIndex, newPitch);
      } else {
        const deltaVelocity = deltaY / 100;
        const newVelocity = Math.max(0.05, Math.min(1, drag.startVelocity + deltaVelocity));
        onSetStepVelocity(drag.trackId, drag.stepIndex, newVelocity);
      }
    },
    [onSetStepVelocity, onSetStepPitch],
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      const deltaY = Math.abs(drag.startY - e.clientY);
      if (deltaY < 4 && drag.mode === 'velocity') {
        onToggleStep(drag.trackId, drag.stepIndex);
      }
      dragRef.current = null;
    },
    [onToggleStep],
  );

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      setPendingFile(file);
      setIsPreviewing(false);
      // Reset input so same file can be re-selected
      e.target.value = '';
    },
    [],
  );

  const handlePreviewPlay = useCallback(async () => {
    if (!pendingFile) return;
    setIsPreviewing(true);
    await onPreviewSample(pendingFile);
  }, [pendingFile, onPreviewSample]);

  const handlePreviewStop = useCallback(() => {
    setIsPreviewing(false);
    onStopPreview();
  }, [onStopPreview]);

  const handlePreviewConfirm = useCallback(async () => {
    if (!pendingFile) return;
    onStopPreview();
    const sample = await onLoadSample(pendingFile);
    if (sample) {
      onSetSample(track.id, sample.id);
    }
    setPendingFile(null);
    setIsPreviewing(false);
  }, [pendingFile, track.id, onLoadSample, onSetSample, onStopPreview]);

  const handlePreviewCancel = useCallback(() => {
    onStopPreview();
    setPendingFile(null);
    setIsPreviewing(false);
  }, [onStopPreview]);

  const currentSample = samples.find((s) => s.id === track.sampleId);

  return (
    <div className={`step-row sample-step-row${track.muted ? ' muted' : ''}`}>
      <div className="track-label sample-track-label">
        <span className="sample-track-name" title={currentSample?.fileName ?? 'No sample'}>
          {currentSample?.name ?? track.name}
        </span>
        <span className="sample-track-controls">
          <button
            className={`sample-mode-btn${track.playbackMode === 'loop' ? ' loop-active' : ''}`}
            onClick={() => onSetPlaybackMode(track.id, track.playbackMode === 'oneshot' ? 'loop' : 'oneshot')}
            title={track.playbackMode === 'oneshot' ? 'One-shot (click for loop)' : 'Looping (click for one-shot)'}
          >
            {track.playbackMode === 'loop' ? '⟳' : '▶'}
          </button>
          <button
            className="sample-load-btn"
            onClick={() => fileInputRef.current?.click()}
            title="Load audio file"
          >
            +
          </button>
          {samples.length > 0 && (
            <select
              className="sample-select"
              value={track.sampleId ?? ''}
              onChange={(e) => onSetSample(track.id, e.target.value || null)}
              title="Select sample"
            >
              <option value="">--</option>
              {samples.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          )}
          <button
            className="sample-remove-btn"
            onClick={() => onRemoveTrack(track.id)}
            title="Remove track"
          >
            ×
          </button>
        </span>
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPTED_SAMPLE_MIME_TYPES}
          style={{ display: 'none' }}
          onChange={handleFileChange}
        />
      </div>
      {pendingFile && (
        <div className="sample-preview-bar">
          <span className="sample-preview-name" title={pendingFile.name}>
            {pendingFile.name}
          </span>
          <button
            className="sample-preview-btn"
            onClick={isPreviewing ? handlePreviewStop : handlePreviewPlay}
            title={isPreviewing ? 'Stop preview' : 'Preview sample'}
          >
            {isPreviewing ? '\u25A0' : '\u25B6'}
          </button>
          <button
            className="sample-preview-btn confirm"
            onClick={handlePreviewConfirm}
            title="Load sample"
          >
            \u2713
          </button>
          <button
            className="sample-preview-btn cancel"
            onClick={handlePreviewCancel}
            title="Cancel"
          >
            \u2717
          </button>
        </div>
      )}
      <div className="step-cells">
        {track.steps.map((velocity, stepIndex) => {
          const active = velocity > 0;
          const pitch = track.pitches[stepIndex];
          const classes = ['step-cell'];
          if (active) classes.push('active');
          if (active && velocity <= GHOST_NOTE_THRESHOLD) classes.push('ghost');
          if (isPlaying && stepIndex === currentStep) classes.push('current');
          if (stepIndex % 4 === 0) classes.push('beat-start');

          return (
            <button
              key={stepIndex}
              className={classes.join(' ')}
              onPointerDown={(e) => handlePointerDown(e, stepIndex)}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              style={
                active
                  ? { '--step-velocity': velocity } as React.CSSProperties
                  : undefined
              }
            >
              {active && (
                <span
                  className="step-velocity-bar"
                  style={{ height: `${velocity * 100}%` }}
                />
              )}
              {active && pitch !== 0 && (
                <span className="step-pitch-label">
                  {pitch > 0 ? `+${pitch}` : pitch}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
});

interface StepSequencerProps {
  tracks: Track[];
  sampleTracks: SampleTrack[];
  samples: SampleInstrument[];
  stepCount: number;
  currentStep: number;
  isPlaying: boolean;
  onToggleStep: (trackId: InstrumentName, stepIndex: number) => void;
  onSetStepVelocity: (trackId: InstrumentName, stepIndex: number, velocity: number) => void;
  onSetStepPitch: (trackId: InstrumentName, stepIndex: number, pitch: number) => void;
  onStepCountChange: (stepCount: number) => void;
  onToggleSampleStep: (trackId: string, stepIndex: number) => void;
  onSetSampleStepVelocity: (trackId: string, stepIndex: number, velocity: number) => void;
  onSetSampleStepPitch: (trackId: string, stepIndex: number, pitch: number) => void;
  onSetSampleTrackSample: (trackId: string, sampleId: string | null) => void;
  onSetSampleTrackPlaybackMode: (trackId: string, mode: SamplePlaybackMode) => void;
  onLoadSample: (file: File) => Promise<SampleInstrument | null>;
  onPreviewSample: (file: File) => Promise<void>;
  onStopPreview: () => void;
  onAddSampleTrack: () => void;
  onRemoveSampleTrack: (trackId: string) => void;
}

const StepSequencer = React.memo<StepSequencerProps>(function StepSequencer({
  tracks,
  sampleTracks,
  samples,
  stepCount,
  currentStep,
  isPlaying,
  onToggleStep,
  onSetStepVelocity,
  onSetStepPitch,
  onStepCountChange,
  onToggleSampleStep,
  onSetSampleStepVelocity,
  onSetSampleStepPitch,
  onSetSampleTrackSample,
  onSetSampleTrackPlaybackMode,
  onLoadSample,
  onPreviewSample,
  onStopPreview,
  onAddSampleTrack,
  onRemoveSampleTrack,
}) {
  const [zoomIndex, setZoomIndex] = useState(DEFAULT_ZOOM_INDEX);

  const zoomStyle = useMemo(
    () =>
      ({
        '--step-min-width': `${ZOOM_LEVELS[zoomIndex].minWidth}px`,
        '--step-max-width': `${ZOOM_LEVELS[zoomIndex].maxWidth}px`,
      }) as React.CSSProperties,
    [zoomIndex],
  );

  return (
    <div className="step-sequencer" style={zoomStyle}>
      <div className="step-sequencer-toolbar">
        <label className="step-count-label">
          Steps:
          <input
            type="number"
            className="step-count-input"
            min={1}
            max={64}
            value={stepCount}
            onChange={(e) => onStepCountChange(Number(e.target.value))}
          />
        </label>
        <div className="step-zoom-control">
          <span className="step-zoom-label">Zoom:</span>
          <div className="step-zoom-buttons">
            {ZOOM_LEVELS.map((level, i) => (
              <button
                key={level.label}
                className={`step-zoom-btn${i === zoomIndex ? ' active' : ''}`}
                onClick={() => setZoomIndex(i)}
                title={`Zoom ${level.label}`}
              >
                {level.label}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="step-header">
        <div className="track-label" />
        <div className="step-cells">
          {Array.from({ length: stepCount }, (_, i) => (
            <div
              key={i}
              className={`step-number${i % 4 === 0 ? ' beat-start' : ''}`}
            >
              {i + 1}
            </div>
          ))}
        </div>
      </div>
      {tracks.map((track) => (
        <StepRow
          key={track.id}
          track={track}
          currentStep={currentStep}
          isPlaying={isPlaying}
          onToggleStep={onToggleStep}
          onSetStepVelocity={onSetStepVelocity}
          onSetStepPitch={onSetStepPitch}
        />
      ))}
      {sampleTracks.map((track) => (
        <SampleStepRow
          key={track.id}
          track={track}
          samples={samples}
          currentStep={currentStep}
          isPlaying={isPlaying}
          onToggleStep={onToggleSampleStep}
          onSetStepVelocity={onSetSampleStepVelocity}
          onSetStepPitch={onSetSampleStepPitch}
          onSetSample={onSetSampleTrackSample}
          onSetPlaybackMode={onSetSampleTrackPlaybackMode}
          onLoadSample={onLoadSample}
          onPreviewSample={onPreviewSample}
          onStopPreview={onStopPreview}
          onRemoveTrack={onRemoveSampleTrack}
        />
      ))}
      <button className="add-sample-track-btn" onClick={onAddSampleTrack}>
        + Sample Track
      </button>
    </div>
  );
});

export default StepSequencer;
