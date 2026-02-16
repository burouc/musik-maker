import React, { useMemo } from "react";
import type { PlaybackMode } from "../types";

interface TransportControlsProps {
  isPlaying: boolean;
  bpm: number;
  playbackMode: PlaybackMode;
  currentStep: number;
  currentMeasure: number;
  stepCount: number;
  metronomeEnabled: boolean;
  onTogglePlay: () => void;
  onBpmChange: (bpm: number) => void;
  onToggleMetronome: () => void;
  onClearAll: () => void;
}

/** Ticks per quarter note (standard MIDI PPQ) */
const PPQ = 96;
/** Ticks per 16th note */
const TICKS_PER_SIXTEENTH = PPQ / 4; // 24

/**
 * Convert the current playback position to bars:beats:ticks format.
 * Bars and beats are 1-based (music convention).
 */
function formatBarsBeatsTicks(
  currentStep: number,
  currentMeasure: number,
  playbackMode: PlaybackMode,
): string {
  if (currentStep < 0 && currentMeasure <= 0) {
    return "1:1:00";
  }

  const step = Math.max(0, currentStep);

  // In song mode, measure is tracked separately; in pattern mode it's always 0
  const measure = playbackMode === 'song' ? Math.max(0, currentMeasure) : 0;

  // Total steps from the beginning
  const totalSteps = measure * 16 + step;

  // 4 steps per beat, 4 beats per bar (16 steps per bar)
  const bar = Math.floor(totalSteps / 16) + 1;
  const beat = Math.floor((totalSteps % 16) / 4) + 1;
  const tickStep = totalSteps % 4;
  const ticks = tickStep * TICKS_PER_SIXTEENTH;

  return `${bar}:${beat}:${String(ticks).padStart(2, "0")}`;
}

/**
 * Convert the current playback position to mm:ss format.
 */
function formatTime(
  currentStep: number,
  currentMeasure: number,
  playbackMode: PlaybackMode,
  bpm: number,
): string {
  if (currentStep < 0 && currentMeasure <= 0) {
    return "00:00";
  }

  const step = Math.max(0, currentStep);
  const measure = playbackMode === 'song' ? Math.max(0, currentMeasure) : 0;
  const totalSteps = measure * 16 + step;

  // Each step is a 16th note; duration of one 16th = 60 / bpm / 4
  const secondsPerStep = 60 / bpm / 4;
  const totalSeconds = totalSteps * secondsPerStep;

  const mins = Math.floor(totalSeconds / 60);
  const secs = Math.floor(totalSeconds % 60);

  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

const TransportControls: React.FC<TransportControlsProps> = React.memo(
  ({
    isPlaying,
    bpm,
    playbackMode,
    currentStep,
    currentMeasure,
    stepCount: _stepCount,
    metronomeEnabled,
    onTogglePlay,
    onBpmChange,
    onToggleMetronome,
    onClearAll,
  }) => {
    const handleBpmChange = (
      e: React.ChangeEvent<HTMLInputElement>
    ) => {
      const value = Number(e.target.value);
      onBpmChange(value);
    };

    const barsBeatsTicks = useMemo(
      () => formatBarsBeatsTicks(currentStep, currentMeasure, playbackMode),
      [currentStep, currentMeasure, playbackMode],
    );

    const time = useMemo(
      () => formatTime(currentStep, currentMeasure, playbackMode, bpm),
      [currentStep, currentMeasure, playbackMode, bpm],
    );

    return (
      <div className="transport-controls">
        <button
          className={`transport-btn play-btn${isPlaying ? " playing" : ""}`}
          onClick={onTogglePlay}
        >
          {isPlaying ? "\u23F9 Stop" : "\u25B6 Play"}
        </button>

        <span className="transport-mode-badge">
          {playbackMode === 'pattern' ? 'PAT' : 'SONG'}
        </span>

        <div className="time-display">
          <span className="time-display-bbt">{barsBeatsTicks}</span>
          <span className="time-display-clock">{time}</span>
        </div>

        <div className="bpm-control">
          <label>BPM: {bpm}</label>
          <input
            type="range"
            min={40}
            max={300}
            step={1}
            value={bpm}
            onChange={handleBpmChange}
          />
          <input
            type="number"
            min={40}
            max={300}
            value={bpm}
            onChange={handleBpmChange}
          />
        </div>

        <button
          className={`transport-btn metronome-btn${metronomeEnabled ? " active" : ""}`}
          onClick={onToggleMetronome}
          title="Toggle metronome"
        >
          Metro
        </button>

        <button className="transport-btn clear-btn" onClick={onClearAll}>
          Clear All
        </button>
      </div>
    );
  }
);

TransportControls.displayName = "TransportControls";

export default TransportControls;
