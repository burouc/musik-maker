import React, { useEffect, useRef, useCallback } from 'react';
import type { InstrumentName, Track, ReverbSettings, DelaySettings, DelaySync } from '../types';
import type AudioEngine from '../audio/AudioEngine';

const DELAY_SYNC_OPTIONS: { value: DelaySync; label: string }[] = [
  { value: '1/4', label: '1/4' },
  { value: '1/8', label: '1/8' },
  { value: '1/16', label: '1/16' },
  { value: '3/16', label: '3/16' },
  { value: '1/4T', label: '1/4T' },
  { value: '1/8T', label: '1/8T' },
];

interface MixerProps {
  tracks: Track[];
  masterVolume: number;
  masterReverb: ReverbSettings;
  masterDelay: DelaySettings;
  audioEngine: AudioEngine;
  onSetVolume: (trackId: InstrumentName, volume: number) => void;
  onSetPan: (trackId: InstrumentName, pan: number) => void;
  onToggleMute: (trackId: InstrumentName) => void;
  onToggleSolo: (trackId: InstrumentName) => void;
  onClearTrack: (trackId: InstrumentName) => void;
  onSetMasterVolume: (volume: number) => void;
  onSetReverbSend: (trackId: InstrumentName, send: number) => void;
  onSetMasterReverb: (params: Partial<ReverbSettings>) => void;
  onSetDelaySend: (trackId: InstrumentName, send: number) => void;
  onSetMasterDelay: (params: Partial<DelaySettings>) => void;
}

/** Number of LED segments in each VU meter */
const METER_SEGMENTS = 12;

/** Threshold where color transitions from green to yellow */
const YELLOW_THRESHOLD = 0.6;

/** Threshold where color transitions from yellow to red */
const RED_THRESHOLD = 0.85;

function segmentColor(index: number, total: number): string {
  const ratio = index / total;
  if (ratio >= RED_THRESHOLD) return '#e94560';
  if (ratio >= YELLOW_THRESHOLD) return '#f5a623';
  return '#22c55e';
}

/**
 * VU meter bar rendered as a stack of LED segments.
 * Uses a canvas-like approach with a ref for direct DOM updates
 * to avoid re-rendering the entire mixer on every animation frame.
 */
const VuMeter: React.FC<{ meterId: string }> = React.memo(({ meterId }) => {
  return (
    <div className="vu-meter" data-meter-id={meterId}>
      {Array.from({ length: METER_SEGMENTS }, (_, i) => {
        const segIndex = METER_SEGMENTS - 1 - i; // top = highest
        return (
          <div
            key={segIndex}
            className="vu-segment"
            data-seg-index={segIndex}
            style={{ '--seg-color': segmentColor(segIndex, METER_SEGMENTS) } as React.CSSProperties}
          />
        );
      })}
    </div>
  );
});
VuMeter.displayName = 'VuMeter';

const Mixer: React.FC<MixerProps> = ({
  tracks,
  masterVolume,
  masterReverb,
  masterDelay,
  audioEngine,
  onSetVolume,
  onSetPan,
  onToggleMute,
  onToggleSolo,
  onClearTrack,
  onSetMasterVolume,
  onSetReverbSend,
  onSetMasterReverb,
  onSetDelaySend,
  onSetMasterDelay,
}) => {
  const rafRef = useRef<number>(0);
  const mixerRef = useRef<HTMLDivElement>(null);

  // Animation loop: read levels from audio engine, update DOM directly
  const animate = useCallback(() => {
    const container = mixerRef.current;
    if (!container) {
      rafRef.current = requestAnimationFrame(animate);
      return;
    }

    const meters = container.querySelectorAll<HTMLDivElement>('.vu-meter');
    meters.forEach((meter) => {
      const id = meter.dataset.meterId;
      if (!id) return;

      const level = id === 'master'
        ? audioEngine.getMasterLevel()
        : audioEngine.getChannelLevel(id as InstrumentName);

      const segments = meter.querySelectorAll<HTMLDivElement>('.vu-segment');
      segments.forEach((seg) => {
        const idx = Number(seg.dataset.segIndex);
        const threshold = idx / METER_SEGMENTS;
        seg.classList.toggle('lit', level > threshold);
      });
    });

    rafRef.current = requestAnimationFrame(animate);
  }, [audioEngine]);

  useEffect(() => {
    rafRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafRef.current);
  }, [animate]);

  return (
    <div className="mixer" ref={mixerRef}>
      {tracks.map((track) => (
        <div key={track.id} className="mixer-channel">
          <label className="mixer-channel-name">{track.name}</label>
          <div className="mixer-meter-and-slider">
            <VuMeter meterId={track.id} />
            <input
              type="range"
              className="mixer-volume-slider"
              min={0}
              max={1}
              step={0.01}
              value={track.volume}
              onChange={(e) => onSetVolume(track.id, parseFloat(e.target.value))}
            />
          </div>
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
          <label className="mixer-reverb-label">REV</label>
          <input
            type="range"
            className="mixer-reverb-slider"
            min={0}
            max={1}
            step={0.01}
            value={track.reverbSend}
            onChange={(e) => onSetReverbSend(track.id, parseFloat(e.target.value))}
          />
          <span className="mixer-reverb-display">
            {Math.round(track.reverbSend * 100)}%
          </span>
          <label className="mixer-delay-label">DLY</label>
          <input
            type="range"
            className="mixer-delay-slider"
            min={0}
            max={1}
            step={0.01}
            value={track.delaySend}
            onChange={(e) => onSetDelaySend(track.id, parseFloat(e.target.value))}
          />
          <span className="mixer-delay-display">
            {Math.round(track.delaySend * 100)}%
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
        <div className="mixer-meter-and-slider">
          <VuMeter meterId="master" />
          <input
            type="range"
            className="mixer-volume-slider"
            min={0}
            max={1}
            step={0.01}
            value={masterVolume}
            onChange={(e) => onSetMasterVolume(parseFloat(e.target.value))}
          />
        </div>
        <span className="mixer-volume-display">
          {Math.round(masterVolume * 100)}%
        </span>
      </div>

      <div className="mixer-channel mixer-reverb-channel">
        <label className="mixer-channel-name mixer-reverb-title">Reverb</label>
        <div className="mixer-reverb-params">
          <div className="mixer-reverb-param">
            <label>Decay</label>
            <input
              type="range"
              min={0.1}
              max={10}
              step={0.1}
              value={masterReverb.decay}
              onChange={(e) => onSetMasterReverb({ decay: parseFloat(e.target.value) })}
            />
            <span>{masterReverb.decay.toFixed(1)}s</span>
          </div>
          <div className="mixer-reverb-param">
            <label>Pre-Delay</label>
            <input
              type="range"
              min={0}
              max={0.1}
              step={0.001}
              value={masterReverb.preDelay}
              onChange={(e) => onSetMasterReverb({ preDelay: parseFloat(e.target.value) })}
            />
            <span>{Math.round(masterReverb.preDelay * 1000)}ms</span>
          </div>
          <div className="mixer-reverb-param">
            <label>Damping</label>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={masterReverb.damping}
              onChange={(e) => onSetMasterReverb({ damping: parseFloat(e.target.value) })}
            />
            <span>{Math.round(masterReverb.damping * 100)}%</span>
          </div>
        </div>
      </div>

      <div className="mixer-channel mixer-delay-channel">
        <label className="mixer-channel-name mixer-delay-title">Delay</label>
        <div className="mixer-delay-params">
          <div className="mixer-delay-param">
            <label>Sync</label>
            <select
              className="mixer-delay-sync-select"
              value={masterDelay.sync}
              onChange={(e) => onSetMasterDelay({ sync: e.target.value as DelaySync })}
            >
              {DELAY_SYNC_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
          <div className="mixer-delay-param">
            <label>Feedback</label>
            <input
              type="range"
              min={0}
              max={0.9}
              step={0.01}
              value={masterDelay.feedback}
              onChange={(e) => onSetMasterDelay({ feedback: parseFloat(e.target.value) })}
            />
            <span>{Math.round(masterDelay.feedback * 100)}%</span>
          </div>
          <div className="mixer-delay-param">
            <label>Mix</label>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={masterDelay.mix}
              onChange={(e) => onSetMasterDelay({ mix: parseFloat(e.target.value) })}
            />
            <span>{Math.round(masterDelay.mix * 100)}%</span>
          </div>
        </div>
      </div>
    </div>
  );
};

Mixer.displayName = 'Mixer';

export default Mixer;
