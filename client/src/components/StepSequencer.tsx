import React, { useCallback, useRef } from 'react';
import type { InstrumentName, Track } from '../types';

interface StepRowProps {
  track: Track;
  currentStep: number;
  isPlaying: boolean;
  onToggleStep: (trackId: InstrumentName, stepIndex: number) => void;
  onSetStepVelocity: (trackId: InstrumentName, stepIndex: number, velocity: number) => void;
}

const StepRow = React.memo<StepRowProps>(function StepRow({
  track,
  currentStep,
  isPlaying,
  onToggleStep,
  onSetStepVelocity,
}) {
  const dragRef = useRef<{
    trackId: InstrumentName;
    stepIndex: number;
    startY: number;
    startVelocity: number;
  } | null>(null);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent, stepIndex: number) => {
      const velocity = track.steps[stepIndex];

      if (velocity <= 0) {
        // Step is off — toggle it on
        onToggleStep(track.id, stepIndex);
        return;
      }

      // Step is on — start velocity drag
      dragRef.current = {
        trackId: track.id,
        stepIndex,
        startY: e.clientY,
        startVelocity: velocity,
      };
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    },
    [track.id, track.steps, onToggleStep],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;

      const deltaY = drag.startY - e.clientY;
      // 100px of drag = full velocity range
      const deltaVelocity = deltaY / 100;
      const newVelocity = Math.max(0.05, Math.min(1, drag.startVelocity + deltaVelocity));
      onSetStepVelocity(drag.trackId, drag.stepIndex, newVelocity);
    },
    [onSetStepVelocity],
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;

      // If barely moved, treat as a click to toggle off
      const deltaY = Math.abs(drag.startY - e.clientY);
      if (deltaY < 4) {
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
          const classes = ['step-cell'];
          if (active) classes.push('active');
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
            </button>
          );
        })}
      </div>
    </div>
  );
});

interface StepSequencerProps {
  tracks: Track[];
  stepCount: number;
  currentStep: number;
  isPlaying: boolean;
  onToggleStep: (trackId: InstrumentName, stepIndex: number) => void;
  onSetStepVelocity: (trackId: InstrumentName, stepIndex: number, velocity: number) => void;
  onStepCountChange: (stepCount: number) => void;
}

const StepSequencer = React.memo<StepSequencerProps>(function StepSequencer({
  tracks,
  stepCount,
  currentStep,
  isPlaying,
  onToggleStep,
  onSetStepVelocity,
  onStepCountChange,
}) {
  return (
    <div className="step-sequencer">
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
        />
      ))}
    </div>
  );
});

export default StepSequencer;
