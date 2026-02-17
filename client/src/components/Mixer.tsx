import React, { useEffect, useRef, useCallback, useState } from 'react';
import type { InstrumentName, Track, SampleTrack, ReverbSettings, DelaySettings, DelaySync, FilterSettings, FilterType, MasterLimiterSettings, InsertEffectType, InsertEffectParams, InsertEffect, FilterEffectParams, ReverbEffectParams, DelayEffectParams, DistortionEffectParams, DistortionMode, ChorusEffectParams, FlangerEffectParams, PhaserEffectParams, CompressorEffectParams, SendChannel, MixerTrack as MixerTrackType, EQBand, EQBandType } from '../types';
import { MAX_INSERT_EFFECTS, MAX_SEND_CHANNELS, MAX_MIXER_TRACKS } from '../types';
import type AudioEngine from '../audio/AudioEngine';

const DELAY_SYNC_OPTIONS: { value: DelaySync; label: string }[] = [
  { value: '1/4', label: '1/4' },
  { value: '1/8', label: '1/8' },
  { value: '1/16', label: '1/16' },
  { value: '3/16', label: '3/16' },
  { value: '1/4T', label: '1/4T' },
  { value: '1/8T', label: '1/8T' },
];

const FILTER_TYPE_OPTIONS: { value: FilterType; label: string }[] = [
  { value: 'lowpass', label: 'LP' },
  { value: 'highpass', label: 'HP' },
  { value: 'bandpass', label: 'BP' },
];

const INSERT_EFFECT_OPTIONS: { value: InsertEffectType; label: string }[] = [
  { value: 'filter', label: 'Filter' },
  { value: 'reverb', label: 'Reverb' },
  { value: 'delay', label: 'Delay' },
  { value: 'distortion', label: 'Distort' },
  { value: 'chorus', label: 'Chorus' },
  { value: 'compressor', label: 'Compress' },
];

interface MixerProps {
  tracks: Track[];
  sampleTracks: SampleTrack[];
  masterVolume: number;
  masterReverb: ReverbSettings;
  masterDelay: DelaySettings;
  masterFilter: FilterSettings;
  masterLimiter: MasterLimiterSettings;
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
  onSetFilterSend: (trackId: InstrumentName, send: number) => void;
  onSetMasterFilter: (params: Partial<FilterSettings>) => void;
  onSetMasterLimiter: (params: Partial<MasterLimiterSettings>) => void;
  onSetSampleVolume: (trackId: string, volume: number) => void;
  onSetSamplePan: (trackId: string, pan: number) => void;
  onToggleSampleMute: (trackId: string) => void;
  onToggleSampleSolo: (trackId: string) => void;
  onClearSampleTrack: (trackId: string) => void;
  onSetSampleReverbSend: (trackId: string, send: number) => void;
  onSetSampleDelaySend: (trackId: string, send: number) => void;
  onSetSampleFilterSend: (trackId: string, send: number) => void;
  onAddInsertEffect: (channelId: string, effectType: InsertEffectType) => void;
  onRemoveInsertEffect: (channelId: string, effectId: string) => void;
  onToggleInsertEffect: (channelId: string, effectId: string) => void;
  onUpdateInsertEffectParams: (channelId: string, effectId: string, params: Partial<InsertEffectParams>) => void;
  onMoveInsertEffect: (channelId: string, effectId: string, direction: 'up' | 'down') => void;
  sendChannels: SendChannel[];
  onAddSendChannel: () => void;
  onRemoveSendChannel: (sendChannelId: string) => void;
  onRenameSendChannel: (sendChannelId: string, name: string) => void;
  onSetSendChannelVolume: (sendChannelId: string, volume: number) => void;
  onSetChannelSendLevel: (sourceChannelId: string, sendChannelId: string, level: number) => void;
  onAddSendChannelInsertEffect: (sendChannelId: string, effectType: InsertEffectType) => void;
  onRemoveSendChannelInsertEffect: (sendChannelId: string, effectId: string) => void;
  onToggleSendChannelInsertEffect: (sendChannelId: string, effectId: string) => void;
  onUpdateSendChannelInsertEffectParams: (sendChannelId: string, effectId: string, params: Partial<InsertEffectParams>) => void;
  onMoveSendChannelInsertEffect: (sendChannelId: string, effectId: string, direction: 'up' | 'down') => void;
  mixerTracks: MixerTrackType[];
  onAddMixerTrack: () => void;
  onRemoveMixerTrack: (mixerTrackId: string) => void;
  onRenameMixerTrack: (mixerTrackId: string, name: string) => void;
  onSetMixerTrackVolume: (mixerTrackId: string, volume: number) => void;
  onSetMixerTrackPan: (mixerTrackId: string, pan: number) => void;
  onSetMixerTrackEQBand: (mixerTrackId: string, bandIndex: number, band: EQBand) => void;
  onSetMixerTrackEQEnabled: (mixerTrackId: string, enabled: boolean) => void;
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

/** Compact param editor for a single insert effect */
const InsertEffectEditor: React.FC<{
  effect: InsertEffect;
  channelId: string;
  onToggle: (channelId: string, effectId: string) => void;
  onRemove: (channelId: string, effectId: string) => void;
  onUpdateParams: (channelId: string, effectId: string, params: Partial<InsertEffectParams>) => void;
  onMove: (channelId: string, effectId: string, direction: 'up' | 'down') => void;
}> = React.memo(({ effect, channelId, onToggle, onRemove, onUpdateParams, onMove }) => {
  const [expanded, setExpanded] = useState(false);

  const renderParams = () => {
    switch (effect.effectType) {
      case 'filter': {
        const p = effect.params as FilterEffectParams;
        return (
          <>
            <div className="insert-fx-param">
              <label>Type</label>
              <select
                value={p.type}
                onChange={(e) => onUpdateParams(channelId, effect.id, { type: e.target.value as FilterType })}
              >
                {FILTER_TYPE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
            <div className="insert-fx-param">
              <label>Cutoff</label>
              <input type="range" min={20} max={20000} step={1} value={p.cutoff}
                onChange={(e) => onUpdateParams(channelId, effect.id, { cutoff: parseFloat(e.target.value) })} />
              <span>{p.cutoff >= 1000 ? `${(p.cutoff / 1000).toFixed(1)}k` : Math.round(p.cutoff)}Hz</span>
            </div>
            <div className="insert-fx-param">
              <label>Res</label>
              <input type="range" min={0.1} max={25} step={0.1} value={p.resonance}
                onChange={(e) => onUpdateParams(channelId, effect.id, { resonance: parseFloat(e.target.value) })} />
              <span>{p.resonance.toFixed(1)}</span>
            </div>
          </>
        );
      }
      case 'reverb': {
        const p = effect.params as ReverbEffectParams;
        return (
          <>
            <div className="insert-fx-param">
              <label>Decay</label>
              <input type="range" min={0.1} max={10} step={0.1} value={p.decay}
                onChange={(e) => onUpdateParams(channelId, effect.id, { decay: parseFloat(e.target.value) })} />
              <span>{p.decay.toFixed(1)}s</span>
            </div>
            <div className="insert-fx-param">
              <label>Mix</label>
              <input type="range" min={0} max={1} step={0.01} value={p.mix}
                onChange={(e) => onUpdateParams(channelId, effect.id, { mix: parseFloat(e.target.value) })} />
              <span>{Math.round(p.mix * 100)}%</span>
            </div>
          </>
        );
      }
      case 'delay': {
        const p = effect.params as DelayEffectParams;
        return (
          <>
            <div className="insert-fx-param">
              <label>Time</label>
              <input type="range" min={0.01} max={2} step={0.01} value={p.time}
                onChange={(e) => onUpdateParams(channelId, effect.id, { time: parseFloat(e.target.value) })} />
              <span>{(p.time * 1000).toFixed(0)}ms</span>
            </div>
            <div className="insert-fx-param">
              <label>FB</label>
              <input type="range" min={0} max={0.9} step={0.01} value={p.feedback}
                onChange={(e) => onUpdateParams(channelId, effect.id, { feedback: parseFloat(e.target.value) })} />
              <span>{Math.round(p.feedback * 100)}%</span>
            </div>
            <div className="insert-fx-param">
              <label>Mix</label>
              <input type="range" min={0} max={1} step={0.01} value={p.mix}
                onChange={(e) => onUpdateParams(channelId, effect.id, { mix: parseFloat(e.target.value) })} />
              <span>{Math.round(p.mix * 100)}%</span>
            </div>
          </>
        );
      }
      case 'distortion': {
        const p = effect.params as DistortionEffectParams;
        return (
          <>
            <div className="insert-fx-param">
              <label>Mode</label>
              <select
                value={p.mode || 'distortion'}
                onChange={(e) => onUpdateParams(channelId, effect.id, { mode: e.target.value as DistortionMode })}
              >
                <option value="distortion">Distortion</option>
                <option value="overdrive">Overdrive</option>
                <option value="saturation">Saturation</option>
              </select>
            </div>
            <div className="insert-fx-param">
              <label>Drive</label>
              <input type="range" min={1} max={100} step={1} value={p.drive}
                onChange={(e) => onUpdateParams(channelId, effect.id, { drive: parseFloat(e.target.value) })} />
              <span>{Math.round(p.drive)}</span>
            </div>
            <div className="insert-fx-param">
              <label>Tone</label>
              <input type="range" min={200} max={20000} step={1} value={p.tone ?? 8000}
                onChange={(e) => onUpdateParams(channelId, effect.id, { tone: parseFloat(e.target.value) })} />
              <span>{(p.tone ?? 8000) >= 1000 ? `${((p.tone ?? 8000) / 1000).toFixed(1)}k` : Math.round(p.tone ?? 8000)}Hz</span>
            </div>
            <div className="insert-fx-param">
              <label>Mix</label>
              <input type="range" min={0} max={1} step={0.01} value={p.mix ?? 1}
                onChange={(e) => onUpdateParams(channelId, effect.id, { mix: parseFloat(e.target.value) })} />
              <span>{Math.round((p.mix ?? 1) * 100)}%</span>
            </div>
            <div className="insert-fx-param">
              <label>Out</label>
              <input type="range" min={0} max={1} step={0.01} value={p.outputGain}
                onChange={(e) => onUpdateParams(channelId, effect.id, { outputGain: parseFloat(e.target.value) })} />
              <span>{Math.round(p.outputGain * 100)}%</span>
            </div>
          </>
        );
      }
      case 'chorus': {
        const p = effect.params as ChorusEffectParams;
        return (
          <>
            <div className="insert-fx-param">
              <label>Rate</label>
              <input type="range" min={0.1} max={10} step={0.1} value={p.rate}
                onChange={(e) => onUpdateParams(channelId, effect.id, { rate: parseFloat(e.target.value) })} />
              <span>{p.rate.toFixed(1)}Hz</span>
            </div>
            <div className="insert-fx-param">
              <label>Depth</label>
              <input type="range" min={0} max={1} step={0.01} value={p.depth}
                onChange={(e) => onUpdateParams(channelId, effect.id, { depth: parseFloat(e.target.value) })} />
              <span>{Math.round(p.depth * 100)}%</span>
            </div>
            <div className="insert-fx-param">
              <label>Mix</label>
              <input type="range" min={0} max={1} step={0.01} value={p.mix}
                onChange={(e) => onUpdateParams(channelId, effect.id, { mix: parseFloat(e.target.value) })} />
              <span>{Math.round(p.mix * 100)}%</span>
            </div>
          </>
        );
      }
      case 'flanger': {
        const p = effect.params as FlangerEffectParams;
        return (
          <>
            <div className="insert-fx-param">
              <label>Rate</label>
              <input type="range" min={0.05} max={5} step={0.05} value={p.rate}
                onChange={(e) => onUpdateParams(channelId, effect.id, { rate: parseFloat(e.target.value) })} />
              <span>{p.rate.toFixed(2)}Hz</span>
            </div>
            <div className="insert-fx-param">
              <label>Depth</label>
              <input type="range" min={0} max={1} step={0.01} value={p.depth}
                onChange={(e) => onUpdateParams(channelId, effect.id, { depth: parseFloat(e.target.value) })} />
              <span>{Math.round(p.depth * 100)}%</span>
            </div>
            <div className="insert-fx-param">
              <label>Feedback</label>
              <input type="range" min={-0.95} max={0.95} step={0.01} value={p.feedback}
                onChange={(e) => onUpdateParams(channelId, effect.id, { feedback: parseFloat(e.target.value) })} />
              <span>{Math.round(p.feedback * 100)}%</span>
            </div>
            <div className="insert-fx-param">
              <label>Mix</label>
              <input type="range" min={0} max={1} step={0.01} value={p.mix}
                onChange={(e) => onUpdateParams(channelId, effect.id, { mix: parseFloat(e.target.value) })} />
              <span>{Math.round(p.mix * 100)}%</span>
            </div>
          </>
        );
      }
      case 'phaser': {
        const p = effect.params as PhaserEffectParams;
        return (
          <>
            <div className="insert-fx-param">
              <label>Rate</label>
              <input type="range" min={0.05} max={10} step={0.05} value={p.rate}
                onChange={(e) => onUpdateParams(channelId, effect.id, { rate: parseFloat(e.target.value) })} />
              <span>{p.rate.toFixed(2)}Hz</span>
            </div>
            <div className="insert-fx-param">
              <label>Depth</label>
              <input type="range" min={0} max={1} step={0.01} value={p.depth}
                onChange={(e) => onUpdateParams(channelId, effect.id, { depth: parseFloat(e.target.value) })} />
              <span>{Math.round(p.depth * 100)}%</span>
            </div>
            <div className="insert-fx-param">
              <label>Feedback</label>
              <input type="range" min={-0.95} max={0.95} step={0.01} value={p.feedback}
                onChange={(e) => onUpdateParams(channelId, effect.id, { feedback: parseFloat(e.target.value) })} />
              <span>{Math.round(p.feedback * 100)}%</span>
            </div>
            <div className="insert-fx-param">
              <label>Stages</label>
              <select value={p.stages}
                onChange={(e) => onUpdateParams(channelId, effect.id, { stages: parseInt(e.target.value) })}>
                <option value={2}>2</option>
                <option value={4}>4</option>
                <option value={6}>6</option>
                <option value={8}>8</option>
                <option value={12}>12</option>
              </select>
            </div>
            <div className="insert-fx-param">
              <label>Mix</label>
              <input type="range" min={0} max={1} step={0.01} value={p.mix}
                onChange={(e) => onUpdateParams(channelId, effect.id, { mix: parseFloat(e.target.value) })} />
              <span>{Math.round(p.mix * 100)}%</span>
            </div>
          </>
        );
      }
      case 'compressor': {
        const p = effect.params as CompressorEffectParams;
        return (
          <>
            <div className="insert-fx-param">
              <label>Thresh</label>
              <input type="range" min={-60} max={0} step={0.5} value={p.threshold}
                onChange={(e) => onUpdateParams(channelId, effect.id, { threshold: parseFloat(e.target.value) })} />
              <span>{p.threshold.toFixed(1)}dB</span>
            </div>
            <div className="insert-fx-param">
              <label>Ratio</label>
              <input type="range" min={1} max={20} step={0.5} value={p.ratio}
                onChange={(e) => onUpdateParams(channelId, effect.id, { ratio: parseFloat(e.target.value) })} />
              <span>{p.ratio.toFixed(1)}:1</span>
            </div>
            <div className="insert-fx-param">
              <label>Attack</label>
              <input type="range" min={0.001} max={1} step={0.001} value={p.attack}
                onChange={(e) => onUpdateParams(channelId, effect.id, { attack: parseFloat(e.target.value) })} />
              <span>{(p.attack * 1000).toFixed(0)}ms</span>
            </div>
            <div className="insert-fx-param">
              <label>Release</label>
              <input type="range" min={0.01} max={1} step={0.01} value={p.release}
                onChange={(e) => onUpdateParams(channelId, effect.id, { release: parseFloat(e.target.value) })} />
              <span>{(p.release * 1000).toFixed(0)}ms</span>
            </div>
            <div className="insert-fx-param">
              <label>Gain</label>
              <input type="range" min={0} max={40} step={0.5} value={p.gain}
                onChange={(e) => onUpdateParams(channelId, effect.id, { gain: parseFloat(e.target.value) })} />
              <span>{p.gain > 0 ? '+' : ''}{p.gain.toFixed(1)}dB</span>
            </div>
          </>
        );
      }
    }
  };

  return (
    <div className={`insert-fx-slot${effect.enabled ? '' : ' bypassed'}`}>
      <div className="insert-fx-header">
        <button
          className={`insert-fx-power${effect.enabled ? ' active' : ''}`}
          onClick={() => onToggle(channelId, effect.id)}
          title={effect.enabled ? 'Bypass' : 'Enable'}
        />
        <button
          className="insert-fx-name"
          onClick={() => setExpanded(!expanded)}
          title="Expand/collapse parameters"
        >
          {effect.effectType.charAt(0).toUpperCase() + effect.effectType.slice(1)}
        </button>
        <div className="insert-fx-actions">
          <button onClick={() => onMove(channelId, effect.id, 'up')} title="Move up">^</button>
          <button onClick={() => onMove(channelId, effect.id, 'down')} title="Move down">v</button>
          <button onClick={() => onRemove(channelId, effect.id)} title="Remove">x</button>
        </div>
      </div>
      {expanded && (
        <div className="insert-fx-params">
          {renderParams()}
        </div>
      )}
    </div>
  );
});
InsertEffectEditor.displayName = 'InsertEffectEditor';

/** Insert effect chain rack for a mixer channel */
const InsertEffectRack: React.FC<{
  channelId: string;
  effects: InsertEffect[];
  onAdd: (channelId: string, effectType: InsertEffectType) => void;
  onRemove: (channelId: string, effectId: string) => void;
  onToggle: (channelId: string, effectId: string) => void;
  onUpdateParams: (channelId: string, effectId: string, params: Partial<InsertEffectParams>) => void;
  onMove: (channelId: string, effectId: string, direction: 'up' | 'down') => void;
}> = React.memo(({ channelId, effects, onAdd, onRemove, onToggle, onUpdateParams, onMove }) => {
  const [showAddMenu, setShowAddMenu] = useState(false);

  return (
    <div className="insert-fx-rack">
      <div className="insert-fx-rack-header">
        <span className="insert-fx-rack-label">INSERT FX</span>
        <span className="insert-fx-rack-count">{effects.length}/{MAX_INSERT_EFFECTS}</span>
      </div>
      <div className="insert-fx-slots">
        {effects.map((fx) => (
          <InsertEffectEditor
            key={fx.id}
            effect={fx}
            channelId={channelId}
            onToggle={onToggle}
            onRemove={onRemove}
            onUpdateParams={onUpdateParams}
            onMove={onMove}
          />
        ))}
        {effects.length < MAX_INSERT_EFFECTS && (
          <div className="insert-fx-add-wrapper">
            <button
              className="insert-fx-add-btn"
              onClick={() => setShowAddMenu(!showAddMenu)}
            >
              + Add FX
            </button>
            {showAddMenu && (
              <div className="insert-fx-add-menu">
                {INSERT_EFFECT_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    className="insert-fx-add-option"
                    onClick={() => {
                      onAdd(channelId, opt.value);
                      setShowAddMenu(false);
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
});
InsertEffectRack.displayName = 'InsertEffectRack';

const EQ_BAND_TYPE_OPTIONS: { value: EQBandType; label: string }[] = [
  { value: 'lowshelf', label: 'Low Shelf' },
  { value: 'peaking', label: 'Peak' },
  { value: 'highshelf', label: 'High Shelf' },
];

const EQ_BAND_LABELS = ['Low', 'Mid', 'High'];

/** Compact 3-band parametric EQ editor for a mixer track */
const MixerTrackEQ: React.FC<{
  mixerTrackId: string;
  bands: EQBand[];
  enabled: boolean;
  onSetBand: (mixerTrackId: string, bandIndex: number, band: EQBand) => void;
  onSetEnabled: (mixerTrackId: string, enabled: boolean) => void;
}> = React.memo(({ mixerTrackId, bands, enabled, onSetBand, onSetEnabled }) => {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className={`mixer-eq${enabled ? '' : ' bypassed'}`}>
      <div className="mixer-eq-header">
        <button
          className={`mixer-eq-power${enabled ? ' active' : ''}`}
          onClick={() => onSetEnabled(mixerTrackId, !enabled)}
          title={enabled ? 'Bypass EQ' : 'Enable EQ'}
        />
        <button
          className="mixer-eq-label"
          onClick={() => setExpanded(!expanded)}
          title="Expand/collapse EQ"
        >
          EQ
        </button>
      </div>
      {expanded && (
        <div className="mixer-eq-bands">
          {bands.map((band, i) => (
            <div key={i} className={`mixer-eq-band${band.enabled ? '' : ' bypassed'}`}>
              <div className="mixer-eq-band-header">
                <button
                  className={`mixer-eq-band-power${band.enabled ? ' active' : ''}`}
                  onClick={() => onSetBand(mixerTrackId, i, { ...band, enabled: !band.enabled })}
                  title={band.enabled ? 'Disable band' : 'Enable band'}
                />
                <span className="mixer-eq-band-label">{EQ_BAND_LABELS[i] ?? `Band ${i + 1}`}</span>
              </div>
              <div className="mixer-eq-band-param">
                <label>Type</label>
                <select
                  value={band.type}
                  onChange={(e) => onSetBand(mixerTrackId, i, { ...band, type: e.target.value as EQBandType })}
                >
                  {EQ_BAND_TYPE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
              <div className="mixer-eq-band-param">
                <label>Freq</label>
                <input
                  type="range"
                  min={20}
                  max={20000}
                  step={1}
                  value={band.frequency}
                  onChange={(e) => onSetBand(mixerTrackId, i, { ...band, frequency: parseFloat(e.target.value) })}
                />
                <span>{band.frequency >= 1000 ? `${(band.frequency / 1000).toFixed(1)}k` : Math.round(band.frequency)}Hz</span>
              </div>
              <div className="mixer-eq-band-param">
                <label>Gain</label>
                <input
                  type="range"
                  min={-24}
                  max={24}
                  step={0.5}
                  value={band.gain}
                  onChange={(e) => onSetBand(mixerTrackId, i, { ...band, gain: parseFloat(e.target.value) })}
                />
                <span>{band.gain > 0 ? '+' : ''}{band.gain.toFixed(1)}dB</span>
              </div>
              <div className="mixer-eq-band-param">
                <label>Q</label>
                <input
                  type="range"
                  min={0.1}
                  max={18}
                  step={0.1}
                  value={band.q}
                  onChange={(e) => onSetBand(mixerTrackId, i, { ...band, q: parseFloat(e.target.value) })}
                />
                <span>{band.q.toFixed(1)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
});
MixerTrackEQ.displayName = 'MixerTrackEQ';

const Mixer: React.FC<MixerProps> = ({
  tracks,
  sampleTracks,
  masterVolume,
  masterReverb,
  masterDelay,
  masterFilter,
  masterLimiter,
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
  onSetFilterSend,
  onSetMasterFilter,
  onSetMasterLimiter,
  onSetSampleVolume,
  onSetSamplePan,
  onToggleSampleMute,
  onToggleSampleSolo,
  onClearSampleTrack,
  onSetSampleReverbSend,
  onSetSampleDelaySend,
  onSetSampleFilterSend,
  onAddInsertEffect,
  onRemoveInsertEffect,
  onToggleInsertEffect,
  onUpdateInsertEffectParams,
  onMoveInsertEffect,
  sendChannels,
  onAddSendChannel,
  onRemoveSendChannel,
  onRenameSendChannel: _onRenameSendChannel,
  onSetSendChannelVolume,
  onSetChannelSendLevel,
  onAddSendChannelInsertEffect,
  onRemoveSendChannelInsertEffect,
  onToggleSendChannelInsertEffect,
  onUpdateSendChannelInsertEffectParams,
  onMoveSendChannelInsertEffect,
  mixerTracks,
  onAddMixerTrack,
  onRemoveMixerTrack,
  onRenameMixerTrack: _onRenameMixerTrack,
  onSetMixerTrackVolume,
  onSetMixerTrackPan,
  onSetMixerTrackEQBand,
  onSetMixerTrackEQEnabled,
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

      let level: number;
      if (id === 'master') {
        level = audioEngine.getMasterLevel();
      } else if (id.startsWith('send-')) {
        level = audioEngine.getSendChannelLevel(id);
      } else if (id.startsWith('mixer-')) {
        level = audioEngine.getMixerTrackLevel(id);
      } else if (id.startsWith('strack-')) {
        level = audioEngine.getSampleChannelLevel(id);
      } else {
        level = audioEngine.getChannelLevel(id as InstrumentName);
      }

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
          <label className="mixer-filter-label">FLT</label>
          <input
            type="range"
            className="mixer-filter-slider"
            min={0}
            max={1}
            step={0.01}
            value={track.filterSend}
            onChange={(e) => onSetFilterSend(track.id, parseFloat(e.target.value))}
          />
          <span className="mixer-filter-display">
            {Math.round(track.filterSend * 100)}%
          </span>
          {sendChannels.map((sc) => (
            <React.Fragment key={sc.id}>
              <label className="mixer-send-label">{sc.name.length > 6 ? sc.name.slice(0, 6) : sc.name}</label>
              <input
                type="range"
                className="mixer-send-slider"
                min={0}
                max={1}
                step={0.01}
                value={track.sends?.[sc.id] ?? 0}
                onChange={(e) => onSetChannelSendLevel(track.id, sc.id, parseFloat(e.target.value))}
              />
              <span className="mixer-send-display">
                {Math.round((track.sends?.[sc.id] ?? 0) * 100)}%
              </span>
            </React.Fragment>
          ))}
          <InsertEffectRack
            channelId={track.id}
            effects={track.insertEffects ?? []}
            onAdd={onAddInsertEffect}
            onRemove={onRemoveInsertEffect}
            onToggle={onToggleInsertEffect}
            onUpdateParams={onUpdateInsertEffectParams}
            onMove={onMoveInsertEffect}
          />
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

      {sampleTracks.map((track) => (
        <div key={track.id} className="mixer-channel sample-mixer-channel">
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
              onChange={(e) => onSetSampleVolume(track.id, parseFloat(e.target.value))}
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
            onChange={(e) => onSetSamplePan(track.id, parseFloat(e.target.value))}
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
            onChange={(e) => onSetSampleReverbSend(track.id, parseFloat(e.target.value))}
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
            onChange={(e) => onSetSampleDelaySend(track.id, parseFloat(e.target.value))}
          />
          <span className="mixer-delay-display">
            {Math.round(track.delaySend * 100)}%
          </span>
          <label className="mixer-filter-label">FLT</label>
          <input
            type="range"
            className="mixer-filter-slider"
            min={0}
            max={1}
            step={0.01}
            value={track.filterSend}
            onChange={(e) => onSetSampleFilterSend(track.id, parseFloat(e.target.value))}
          />
          <span className="mixer-filter-display">
            {Math.round(track.filterSend * 100)}%
          </span>
          {sendChannels.map((sc) => (
            <React.Fragment key={sc.id}>
              <label className="mixer-send-label">{sc.name.length > 6 ? sc.name.slice(0, 6) : sc.name}</label>
              <input
                type="range"
                className="mixer-send-slider"
                min={0}
                max={1}
                step={0.01}
                value={track.sends?.[sc.id] ?? 0}
                onChange={(e) => onSetChannelSendLevel(track.id, sc.id, parseFloat(e.target.value))}
              />
              <span className="mixer-send-display">
                {Math.round((track.sends?.[sc.id] ?? 0) * 100)}%
              </span>
            </React.Fragment>
          ))}
          <InsertEffectRack
            channelId={track.id}
            effects={track.insertEffects ?? []}
            onAdd={onAddInsertEffect}
            onRemove={onRemoveInsertEffect}
            onToggle={onToggleInsertEffect}
            onUpdateParams={onUpdateInsertEffectParams}
            onMove={onMoveInsertEffect}
          />
          <button
            className={`mixer-btn mute-btn${track.muted ? ' active' : ''}`}
            onClick={() => onToggleSampleMute(track.id)}
          >
            M
          </button>
          <button
            className={`mixer-btn solo-btn${track.solo ? ' active' : ''}`}
            onClick={() => onToggleSampleSolo(track.id)}
          >
            S
          </button>
          <button
            className="mixer-btn clear-btn"
            onClick={() => onClearSampleTrack(track.id)}
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

      <div className="mixer-channel mixer-limiter-channel">
        <label className="mixer-channel-name mixer-limiter-title">Limiter</label>
        <div className="mixer-limiter-params">
          <div className="mixer-limiter-param">
            <label>
              <input
                type="checkbox"
                checked={masterLimiter.enabled}
                onChange={(e) => onSetMasterLimiter({ enabled: e.target.checked })}
              />
              {' '}Enabled
            </label>
          </div>
          <div className="mixer-limiter-param">
            <label>Ceil</label>
            <input
              type="range"
              min={-24}
              max={0}
              step={0.1}
              value={masterLimiter.threshold}
              onChange={(e) => onSetMasterLimiter({ threshold: parseFloat(e.target.value) })}
            />
            <span>{masterLimiter.threshold.toFixed(1)} dB</span>
          </div>
          <div className="mixer-limiter-param">
            <label>Release</label>
            <input
              type="range"
              min={0.01}
              max={1}
              step={0.01}
              value={masterLimiter.release}
              onChange={(e) => onSetMasterLimiter({ release: parseFloat(e.target.value) })}
            />
            <span>{Math.round(masterLimiter.release * 1000)}ms</span>
          </div>
        </div>
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

      <div className="mixer-channel mixer-filter-channel">
        <label className="mixer-channel-name mixer-filter-title">Filter</label>
        <div className="mixer-filter-params">
          <div className="mixer-filter-param">
            <label>Type</label>
            <select
              className="mixer-filter-type-select"
              value={masterFilter.type}
              onChange={(e) => onSetMasterFilter({ type: e.target.value as FilterType })}
            >
              {FILTER_TYPE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
          <div className="mixer-filter-param">
            <label>Cutoff</label>
            <input
              type="range"
              min={20}
              max={20000}
              step={1}
              value={masterFilter.cutoff}
              onChange={(e) => onSetMasterFilter({ cutoff: parseFloat(e.target.value) })}
            />
            <span>{masterFilter.cutoff >= 1000 ? `${(masterFilter.cutoff / 1000).toFixed(1)}k` : `${Math.round(masterFilter.cutoff)}`}Hz</span>
          </div>
          <div className="mixer-filter-param">
            <label>Resonance</label>
            <input
              type="range"
              min={0.1}
              max={25}
              step={0.1}
              value={masterFilter.resonance}
              onChange={(e) => onSetMasterFilter({ resonance: parseFloat(e.target.value) })}
            />
            <span>{masterFilter.resonance.toFixed(1)}</span>
          </div>
        </div>
      </div>

      {sendChannels.map((sc) => (
        <div key={sc.id} className="mixer-channel mixer-send-channel">
          <label className="mixer-channel-name mixer-send-title">{sc.name}</label>
          <div className="mixer-meter-and-slider">
            <VuMeter meterId={sc.id} />
            <input
              type="range"
              className="mixer-volume-slider"
              min={0}
              max={1}
              step={0.01}
              value={sc.volume}
              onChange={(e) => onSetSendChannelVolume(sc.id, parseFloat(e.target.value))}
            />
          </div>
          <span className="mixer-volume-display">
            {Math.round(sc.volume * 100)}%
          </span>
          <InsertEffectRack
            channelId={sc.id}
            effects={sc.insertEffects ?? []}
            onAdd={(channelId, effectType) => onAddSendChannelInsertEffect(channelId, effectType)}
            onRemove={(channelId, effectId) => onRemoveSendChannelInsertEffect(channelId, effectId)}
            onToggle={(channelId, effectId) => onToggleSendChannelInsertEffect(channelId, effectId)}
            onUpdateParams={(channelId, effectId, params) => onUpdateSendChannelInsertEffectParams(channelId, effectId, params)}
            onMove={(channelId, effectId, direction) => onMoveSendChannelInsertEffect(channelId, effectId, direction)}
          />
          <button
            className="mixer-btn clear-btn"
            onClick={() => onRemoveSendChannel(sc.id)}
            title="Remove send channel"
          >
            DEL
          </button>
        </div>
      ))}

      {sendChannels.length < MAX_SEND_CHANNELS && (
        <div className="mixer-channel mixer-add-send-channel">
          <button
            className="mixer-add-send-btn"
            onClick={onAddSendChannel}
            title="Add FX bus send channel"
          >
            + FX Bus
          </button>
        </div>
      )}

      {mixerTracks.map((mt) => (
        <div key={mt.id} className="mixer-channel mixer-track-channel">
          <label className="mixer-channel-name mixer-track-title">{mt.name}</label>
          <div className="mixer-meter-and-slider">
            <VuMeter meterId={mt.id} />
            <input
              type="range"
              className="mixer-volume-slider"
              min={0}
              max={1}
              step={0.01}
              value={mt.volume}
              onChange={(e) => onSetMixerTrackVolume(mt.id, parseFloat(e.target.value))}
            />
          </div>
          <span className="mixer-volume-display">
            {Math.round(mt.volume * 100)}%
          </span>
          <input
            type="range"
            className="mixer-pan-slider"
            min={-1}
            max={1}
            step={0.01}
            value={mt.pan}
            onChange={(e) => onSetMixerTrackPan(mt.id, parseFloat(e.target.value))}
          />
          <span className="mixer-pan-display">
            {mt.pan === 0 ? 'C' : mt.pan < 0 ? `L${Math.round(Math.abs(mt.pan) * 100)}` : `R${Math.round(mt.pan * 100)}`}
          </span>
          <MixerTrackEQ
            mixerTrackId={mt.id}
            bands={mt.eqBands}
            enabled={mt.eqEnabled}
            onSetBand={onSetMixerTrackEQBand}
            onSetEnabled={onSetMixerTrackEQEnabled}
          />
          <button
            className="mixer-btn clear-btn"
            onClick={() => onRemoveMixerTrack(mt.id)}
            title="Remove mixer track"
          >
            DEL
          </button>
        </div>
      ))}

      {mixerTracks.length < MAX_MIXER_TRACKS && (
        <div className="mixer-channel mixer-add-track-channel">
          <button
            className="mixer-add-send-btn"
            onClick={onAddMixerTrack}
            title="Add mixer track"
          >
            + Mixer Track
          </button>
        </div>
      )}
    </div>
  );
};

Mixer.displayName = 'Mixer';

export default Mixer;
