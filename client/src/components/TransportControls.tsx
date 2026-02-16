import React from "react";
import type { PlaybackMode } from "../types";

interface TransportControlsProps {
  isPlaying: boolean;
  bpm: number;
  playbackMode: PlaybackMode;
  onTogglePlay: () => void;
  onBpmChange: (bpm: number) => void;
  onClearAll: () => void;
}

const TransportControls: React.FC<TransportControlsProps> = React.memo(
  ({ isPlaying, bpm, playbackMode, onTogglePlay, onBpmChange, onClearAll }) => {
    const handleBpmChange = (
      e: React.ChangeEvent<HTMLInputElement>
    ) => {
      const value = Number(e.target.value);
      onBpmChange(value);
    };

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

        <button className="transport-btn clear-btn" onClick={onClearAll}>
          Clear All
        </button>
      </div>
    );
  }
);

TransportControls.displayName = "TransportControls";

export default TransportControls;
