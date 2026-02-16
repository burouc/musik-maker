import React from 'react';
import type { InstrumentName, Track } from '../types';

interface MixerProps {
  tracks: Track[];
  masterVolume: number;
  onSetVolume: (trackId: InstrumentName, volume: number) => void;
  onSetPan: (trackId: InstrumentName, pan: number) => void;
  onToggleMute: (trackId: InstrumentName) => void;
  onToggleSolo: (trackId: InstrumentName) => void;
  onClearTrack: (trackId: InstrumentName) => void;
  onSetMasterVolume: (volume: number) => void;
}

const Mixer: React.FC<MixerProps> = React.memo(({
  tracks,
  masterVolume,
  onSetVolume,
  onSetPan,
  onToggleMute,
  onToggleSolo,
  onClearTrack,
  onSetMasterVolume,
}) => {
  return (
    <div className="mixer">
      {tracks.map((track) => (
        <div key={track.id} className="mixer-channel">
          <label className="mixer-channel-name">{track.name}</label>
          <input
            type="range"
            className="mixer-volume-slider"
            min={0}
            max={1}
            step={0.01}
            value={track.volume}
            onChange={(e) => onSetVolume(track.id, parseFloat(e.target.value))}
          />
          <span className="mixer-volume-display">
            {Math.round(track.volume * 100)}%
          </span>
          <input
            type="range"
            className="mixer-pan-slider"
            min={-1}
            max={1}
            step={0.01}
            value={track.pan}
            onChange={(e) => onSetPan(track.id, parseFloat(e.target.value))}
          />
          <span className="mixer-pan-display">
            {track.pan === 0 ? 'C' : track.pan < 0 ? `L${Math.round(Math.abs(track.pan) * 100)}` : `R${Math.round(track.pan * 100)}`}
          </span>
          <button
            className={`mixer-btn mute-btn${track.muted ? ' active' : ''}`}
            onClick={() => onToggleMute(track.id)}
          >
            M
          </button>
          <button
            className={`mixer-btn solo-btn${track.solo ? ' active' : ''}`}
            onClick={() => onToggleSolo(track.id)}
          >
            S
          </button>
          <button
            className="mixer-btn clear-btn"
            onClick={() => onClearTrack(track.id)}
          >
            CLR
          </button>
        </div>
      ))}

      <div className="mixer-channel mixer-master-channel">
        <label className="mixer-channel-name mixer-master-label">Master</label>
        <input
          type="range"
          className="mixer-volume-slider"
          min={0}
          max={1}
          step={0.01}
          value={masterVolume}
          onChange={(e) => onSetMasterVolume(parseFloat(e.target.value))}
        />
        <span className="mixer-volume-display">
          {Math.round(masterVolume * 100)}%
        </span>
      </div>
    </div>
  );
});

Mixer.displayName = 'Mixer';

export default Mixer;
