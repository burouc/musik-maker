import React from 'react';
import type { InstrumentName, Track } from '../types';

interface StepRowProps {
  track: Track;
  currentStep: number;
  isPlaying: boolean;
  onToggleStep: (trackId: InstrumentName, stepIndex: number) => void;
}

const StepRow = React.memo<StepRowProps>(function StepRow({
  track,
  currentStep,
  isPlaying,
  onToggleStep,
}) {
  return (
    <div className={`step-row${track.muted ? ' muted' : ''}`}>
      <div className="track-label">{track.name}</div>
      <div className="step-cells">
        {track.steps.map((active, stepIndex) => {
          const classes = ['step-cell'];
          if (active) classes.push('active');
          if (isPlaying && stepIndex === currentStep) classes.push('current');
          if (stepIndex % 4 === 0) classes.push('beat-start');

          return (
            <button
              key={stepIndex}
              className={classes.join(' ')}
              onClick={() => onToggleStep(track.id, stepIndex)}
            />
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
  onStepCountChange: (stepCount: number) => void;
}

const StepSequencer = React.memo<StepSequencerProps>(function StepSequencer({
  tracks,
  stepCount,
  currentStep,
  isPlaying,
  onToggleStep,
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
        />
      ))}
    </div>
  );
});

export default StepSequencer;
