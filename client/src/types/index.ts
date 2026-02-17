export type InstrumentName =
  | 'kick'
  | 'snare'
  | 'hihat'
  | 'clap'
  | 'openhat'
  | 'percussion';

export interface Track {
  id: InstrumentName;
  name: string;
  /** Per-step velocity: 0 = off, 0.01–1.0 = on with that velocity */
  steps: number[];
  /** Per-step pitch offset in semitones (−12 to +12, default 0) */
  pitches: number[];
  volume: number;
  /** Stereo pan position: −1 (full left) to +1 (full right), 0 = center */
  pan: number;
  muted: boolean;
  solo: boolean;
  /** Reverb send level: 0 (dry) to 1 (full send) */
  reverbSend: number;
  /** Delay send level: 0 (dry) to 1 (full send) */
  delaySend: number;
  /** Filter send level: 0 (dry) to 1 (full send) */
  filterSend: number;
  /** Insert effect chain (up to 8 effects) */
  insertEffects: InsertEffect[];
  /** Per-send-channel send levels: { sendChannelId: 0–1 } */
  sends: Record<string, number>;
  /** ID of the mixer track this channel routes to (null = direct to master) */
  mixerTrackId: string | null;
}

export interface Pattern {
  id: string;
  name: string;
  color: string;
  /** Number of steps in this pattern (1–64, default 16) */
  stepCount: number;
  tracks: Track[];
  /** Sample-based tracks in this pattern */
  sampleTracks: SampleTrack[];
  pianoRoll: PianoRollData;
  /** Synth voice settings for this pattern's piano roll */
  synthSettings: SynthSettings;
}

export interface ArrangementBlock {
  patternId: string;
  /** Measure index (0-based) where this block starts */
  startMeasure: number;
  /** Duration in measures (default 1) */
  duration: number;
}

export interface ArrangementTrack {
  id: string;
  name: string;
  blocks: ArrangementBlock[];
  muted: boolean;
}

/** Piano roll editing tool */
export type PianoRollTool = 'draw' | 'select' | 'slice' | 'paint' | 'erase';

/** Snap-to-grid resolution for the piano roll */
export type SnapResolution = '1/4' | '1/8' | '1/16' | '1/32' | '1/4T' | '1/8T' | '1/16T';

/** Piano-roll note names (sharps only, no enharmonic flats) */
export type NoteName =
  | 'C'
  | 'C#'
  | 'D'
  | 'D#'
  | 'E'
  | 'F'
  | 'F#'
  | 'G'
  | 'G#'
  | 'A'
  | 'A#'
  | 'B';

/** A single note placed on the piano roll grid */
export interface PianoNote {
  id: string;
  /** MIDI note number (e.g. 60 = C4) */
  pitch: number;
  /** Step position (0-based, same resolution as drum sequencer) */
  step: number;
  /** Duration in steps (default 1) */
  duration: number;
  /** Velocity 0–1 */
  velocity: number;
}

/** Piano roll data stored per pattern */
export interface PianoRollData {
  notes: PianoNote[];
}

/** Reverb parameters for a mixer channel */
export interface ReverbSettings {
  /** Send level: 0 (dry) to 1 (full send) */
  send: number;
  /** Decay time in seconds (0.1–10) */
  decay: number;
  /** Pre-delay in seconds (0–0.1) */
  preDelay: number;
  /** High-frequency damping: 0 (bright) to 1 (dark) */
  damping: number;
}

/** Tempo-synced delay note division */
export type DelaySync = '1/4' | '1/8' | '1/16' | '3/16' | '1/4T' | '1/8T';

/** Delay parameters for the master delay effect */
export interface DelaySettings {
  /** Send level: 0 (dry) to 1 (full send) */
  send: number;
  /** Tempo-synced note division */
  sync: DelaySync;
  /** Feedback amount: 0 (single echo) to 0.9 (long trail) */
  feedback: number;
  /** Wet/dry mix: 0 (fully dry) to 1 (fully wet) */
  mix: number;
}

/** Filter type for the master filter effect */
export type FilterType = 'lowpass' | 'highpass' | 'bandpass';

/** Available insert effect types for mixer channel effect slots */
export type InsertEffectType = 'filter' | 'reverb' | 'delay' | 'distortion' | 'chorus' | 'flanger' | 'phaser' | 'compressor';

/** Maximum number of insert effect slots per mixer channel */
export const MAX_INSERT_EFFECTS = 8;

/** Maximum number of user-defined send channels (FX buses) */
export const MAX_SEND_CHANNELS = 4;

/** Maximum number of mixer tracks */
export const MAX_MIXER_TRACKS = 16;

/** A user-defined send/FX bus channel */
export interface SendChannel {
  /** Unique identifier */
  id: string;
  /** Display name (e.g. "FX Bus 1") */
  name: string;
  /** Bus output volume: 0–1 */
  volume: number;
  /** Insert effect chain on this send bus */
  insertEffects: InsertEffect[];
}

/** A single band of a parametric EQ */
export interface EQBand {
  /** Whether this band is active */
  enabled: boolean;
  /** Center frequency in Hz (20–20000) */
  frequency: number;
  /** Gain in dB (−24 to +24) */
  gain: number;
  /** Q factor / bandwidth (0.1–18) */
  q: number;
  /** Filter type for this band */
  type: EQBandType;
}

/** EQ band filter type */
export type EQBandType = 'lowshelf' | 'peaking' | 'highshelf';

/** Default 3-band EQ settings */
export const DEFAULT_EQ_BANDS: EQBand[] = [
  { enabled: true, frequency: 200, gain: 0, q: 1, type: 'lowshelf' },
  { enabled: true, frequency: 1000, gain: 0, q: 1, type: 'peaking' },
  { enabled: true, frequency: 5000, gain: 0, q: 1, type: 'highshelf' },
];

/** A numbered mixer track that channels can be routed to */
export interface MixerTrack {
  /** Unique identifier (e.g. "mixer-1") */
  id: string;
  /** Display name (e.g. "Mixer 1") */
  name: string;
  /** Output volume: 0–1 */
  volume: number;
  /** Stereo pan position: −1 (full left) to +1 (full right), 0 = center */
  pan: number;
  /** 3-band parametric EQ */
  eqBands: EQBand[];
  /** Whether the EQ is enabled (global bypass) */
  eqEnabled: boolean;
}

/** Parameters for each insert effect type */
export interface FilterEffectParams {
  type: FilterType;
  cutoff: number;
  resonance: number;
}

export interface ReverbEffectParams {
  decay: number;
  preDelay: number;
  damping: number;
  mix: number;
}

export interface DelayEffectParams {
  time: number;
  feedback: number;
  mix: number;
}

/** Distortion algorithm / character */
export type DistortionMode = 'distortion' | 'overdrive' | 'saturation';

export interface DistortionEffectParams {
  /** Distortion algorithm */
  mode: DistortionMode;
  /** Drive amount: 0–100 */
  drive: number;
  /** Tone control (post-distortion LP filter): 200–20000 Hz */
  tone: number;
  /** Wet/dry mix: 0–1 */
  mix: number;
  /** Output gain: 0–1 */
  outputGain: number;
}

export interface ChorusEffectParams {
  /** LFO rate in Hz (0.1–10) */
  rate: number;
  /** Depth of modulation (0–1) */
  depth: number;
  /** Wet/dry mix (0–1) */
  mix: number;
}

export interface FlangerEffectParams {
  /** LFO rate in Hz (0.05–5) */
  rate: number;
  /** Depth of modulation (0–1) */
  depth: number;
  /** Feedback amount (−0.95 to 0.95, negative = inverted) */
  feedback: number;
  /** Wet/dry mix (0–1) */
  mix: number;
}

export interface PhaserEffectParams {
  /** LFO rate in Hz (0.05–10) */
  rate: number;
  /** Depth of modulation (0–1) */
  depth: number;
  /** Feedback amount (−0.95 to 0.95) */
  feedback: number;
  /** Number of all-pass stages: 2, 4, 6, 8, or 12 */
  stages: number;
  /** Wet/dry mix (0–1) */
  mix: number;
}

export interface CompressorEffectParams {
  /** Threshold in dB (−60 to 0) */
  threshold: number;
  /** Compression ratio (1–20) */
  ratio: number;
  /** Attack time in seconds (0.001–1) */
  attack: number;
  /** Release time in seconds (0.01–1) */
  release: number;
  /** Makeup gain in dB (0–40) */
  gain: number;
}

export type InsertEffectParams =
  | FilterEffectParams
  | ReverbEffectParams
  | DelayEffectParams
  | DistortionEffectParams
  | ChorusEffectParams
  | FlangerEffectParams
  | PhaserEffectParams
  | CompressorEffectParams;

/** A single insert effect slot on a mixer channel */
export interface InsertEffect {
  /** Unique identifier */
  id: string;
  /** Effect type */
  effectType: InsertEffectType;
  /** Whether this effect is active (bypassed if false) */
  enabled: boolean;
  /** Effect-specific parameters */
  params: InsertEffectParams;
}

/** Default parameters for each effect type */
export const DEFAULT_EFFECT_PARAMS: Record<InsertEffectType, InsertEffectParams> = {
  filter: { type: 'lowpass', cutoff: 8000, resonance: 1 } as FilterEffectParams,
  reverb: { decay: 2, preDelay: 0.01, damping: 0.3, mix: 0.5 } as ReverbEffectParams,
  delay: { time: 0.25, feedback: 0.3, mix: 0.3 } as DelayEffectParams,
  distortion: { mode: 'distortion', drive: 20, tone: 8000, mix: 1, outputGain: 0.7 } as DistortionEffectParams,
  chorus: { rate: 1.5, depth: 0.5, mix: 0.5 } as ChorusEffectParams,
  flanger: { rate: 0.5, depth: 0.7, feedback: 0.5, mix: 0.5 } as FlangerEffectParams,
  phaser: { rate: 0.5, depth: 0.7, feedback: 0.5, stages: 4, mix: 0.5 } as PhaserEffectParams,
  compressor: { threshold: -24, ratio: 4, attack: 0.003, release: 0.25, gain: 0 } as CompressorEffectParams,
};

/** Master bus limiter settings */
export interface MasterLimiterSettings {
  /** Whether the limiter is enabled */
  enabled: boolean;
  /** Threshold in dB (−24 to 0) */
  threshold: number;
  /** Release time in seconds (0.01–1) */
  release: number;
}

/** Default master limiter settings */
export const DEFAULT_MASTER_LIMITER: MasterLimiterSettings = {
  enabled: true,
  threshold: -1,
  release: 0.1,
};

/** Filter parameters for the master filter effect */
export interface FilterSettings {
  /** Send level: 0 (dry) to 1 (full send) */
  send: number;
  /** Filter type: lowpass, highpass, or bandpass */
  type: FilterType;
  /** Cutoff frequency in Hz (20–20000) */
  cutoff: number;
  /** Resonance (Q factor): 0.1–25 */
  resonance: number;
}

/** Oscillator waveform type for the synth engine */
export type OscillatorType = 'sine' | 'sawtooth' | 'square' | 'triangle';

/** LFO waveform shape */
export type LfoWaveform = 'sine' | 'sawtooth' | 'square' | 'triangle';

/** LFO modulation routing target */
export type LfoTarget = 'pitch' | 'filter' | 'volume' | 'pan';

/** LFO settings for the synth engine */
export interface LfoSettings {
  /** Whether the LFO is active */
  enabled: boolean;
  /** LFO waveform shape */
  waveform: LfoWaveform;
  /** LFO rate in Hz (0.05–20) */
  rate: number;
  /** Modulation depth (0–1) */
  depth: number;
  /** Modulation target */
  target: LfoTarget;
}

/** Synth settings stored per pattern (controls the piano roll synth voice) */
export interface SynthSettings {
  /** Primary oscillator waveform */
  oscType: OscillatorType;
  /** Oscillator 1 octave offset (−2 to +2) */
  oscOctave: number;
  /** Secondary oscillator waveform */
  osc2Type: OscillatorType;
  /** Detune amount for oscillator 2 in cents (0–100) */
  osc2Detune: number;
  /** Oscillator 2 octave offset (−2 to +2) */
  osc2Octave: number;
  /** Mix balance between osc1 and osc2: 0 = osc1 only, 1 = osc2 only */
  osc2Mix: number;
  /** Third oscillator waveform */
  osc3Type: OscillatorType;
  /** Detune amount for oscillator 3 in cents (0–100) */
  osc3Detune: number;
  /** Oscillator 3 octave offset (−2 to +2) */
  osc3Octave: number;
  /** Oscillator 3 enabled */
  osc3Enabled: boolean;
  /** Oscillator 3 mix level (0–1) */
  osc3Mix: number;
  /** Filter cutoff frequency in Hz (20–20000) */
  filterCutoff: number;
  /** Filter resonance (Q factor): 0.1–25 */
  filterResonance: number;
  /** Amplitude envelope attack time in seconds (0.001–2) */
  ampAttack: number;
  /** Amplitude envelope decay time in seconds (0.001–2) */
  ampDecay: number;
  /** Amplitude envelope sustain level (0–1) */
  ampSustain: number;
  /** Amplitude envelope release time in seconds (0.001–2) */
  ampRelease: number;
  /** Filter envelope attack time in seconds (0.001–2) */
  filterEnvAttack: number;
  /** Filter envelope decay time in seconds (0.001–2) */
  filterEnvDecay: number;
  /** Filter envelope sustain level (0–1, proportion of envelope amount) */
  filterEnvSustain: number;
  /** Filter envelope release time in seconds (0.001–2) */
  filterEnvRelease: number;
  /** Filter envelope modulation amount in semitones of cutoff (0–100), controls how far above the base cutoff the envelope sweeps */
  filterEnvAmount: number;
  /** LFO 1 settings */
  lfo1: LfoSettings;
  /** LFO 2 settings (second independent LFO) */
  lfo2: LfoSettings;
}

/** Supported audio file formats for sample loading */
export type SampleFormat = 'wav' | 'mp3' | 'ogg';

/** Sample playback mode: one-shot plays once, loop repeats continuously */
export type SamplePlaybackMode = 'oneshot' | 'loop';

/** A loaded audio sample that can be used as an instrument */
export interface SampleInstrument {
  /** Unique identifier for this sample */
  id: string;
  /** Display name (derived from filename) */
  name: string;
  /** The decoded AudioBuffer (not serializable, managed by AudioEngine) */
  /** Object URL for the loaded file (used as a key to retrieve the buffer) */
  url: string;
  /** Original filename */
  fileName: string;
}

/** A sample-based track in the step sequencer */
export interface SampleTrack {
  id: string;
  name: string;
  /** Reference to a loaded sample instrument */
  sampleId: string | null;
  /** Playback mode: 'oneshot' plays the sample once, 'loop' repeats it */
  playbackMode: SamplePlaybackMode;
  /** Per-step velocity: 0 = off, 0.01–1.0 = on with that velocity */
  steps: number[];
  /** Per-step pitch offset in semitones (−12 to +12, default 0) */
  pitches: number[];
  volume: number;
  /** Stereo pan position: −1 (full left) to +1 (full right), 0 = center */
  pan: number;
  muted: boolean;
  solo: boolean;
  /** Reverb send level: 0 (dry) to 1 (full send) */
  reverbSend: number;
  /** Delay send level: 0 (dry) to 1 (full send) */
  delaySend: number;
  /** Filter send level: 0 (dry) to 1 (full send) */
  filterSend: number;
  /** Insert effect chain (up to 8 effects) */
  insertEffects: InsertEffect[];
  /** Per-send-channel send levels: { sendChannelId: 0–1 } */
  sends: Record<string, number>;
  /** ID of the mixer track this channel routes to (null = direct to master) */
  mixerTrackId: string | null;
}

/** Per-channel automation target format: `${channelType}:${channelId}:${param}` */
export type ChannelAutomationParam = 'volume' | 'pan' | 'reverbSend' | 'delaySend' | 'filterSend';

/** Automatable parameter targets */
export type AutomationTarget =
  | 'masterVolume'
  | 'masterFilterCutoff'
  | 'masterFilterResonance'
  | 'masterReverbDecay'
  | 'masterReverbDamping'
  | 'masterDelayFeedback'
  | 'masterDelayMix'
  | `drum:${InstrumentName}:${ChannelAutomationParam}`
  | `sample:${string}:${ChannelAutomationParam}`;

/** A single automation breakpoint */
export interface AutomationPoint {
  /** Measure index (0-based) */
  measure: number;
  /** Step within the measure (0-based, 0–15 for 16-step measures) */
  step: number;
  /** Normalized value 0–1 */
  value: number;
}

/** An automation lane controlling a single parameter */
export interface AutomationLane {
  id: string;
  /** Which parameter this lane automates */
  target: AutomationTarget;
  /** Display name */
  name: string;
  /** Breakpoints sorted by (measure, step) */
  points: AutomationPoint[];
  /** Whether this lane is actively applied during playback */
  enabled: boolean;
}

/** Saved project metadata + state (persisted to server) */
export interface ProjectData {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  bpm: number;
  masterVolume: number;
  masterReverb: ReverbSettings;
  masterDelay: DelaySettings;
  masterFilter: FilterSettings;
  patterns: Pattern[];
  activePatternId: string;
  arrangement: ArrangementTrack[];
  arrangementLength: number;
  automationLanes: AutomationLane[];
  loopStart: number | null;
  loopEnd: number | null;
  metronomeEnabled: boolean;
  /** Swing amount: 0 = straight, 0.5 = light shuffle, 1 = full triplet swing */
  swing: number;
  /** User-defined send/FX bus channels */
  sendChannels: SendChannel[];
  /** Mixer tracks for channel routing */
  mixerTracks: MixerTrack[];
  /** Master bus limiter settings */
  masterLimiter: MasterLimiterSettings;
}

export type PlaybackMode = 'pattern' | 'song';

/** Tabs available in the main view switcher */
export type ViewTab = 'channel-rack' | 'piano-roll' | 'mixer' | 'arrangement';

export interface SequencerState {
  /** Current project ID (null if unsaved) */
  projectId: string | null;
  /** Current project name */
  projectName: string;
  patterns: Pattern[];
  activePatternId: string;
  /** Loaded sample instruments available across all patterns */
  samples: SampleInstrument[];
  arrangement: ArrangementTrack[];
  arrangementLength: number;
  bpm: number;
  currentStep: number;
  isPlaying: boolean;
  totalSteps: number;
  playbackMode: PlaybackMode;
  /** Current measure index during song-mode playback */
  currentMeasure: number;
  /** Master channel volume (0–1) */
  masterVolume: number;
  /** Master reverb effect settings */
  masterReverb: ReverbSettings;
  /** Master delay effect settings */
  masterDelay: DelaySettings;
  /** Master filter effect settings */
  masterFilter: FilterSettings;
  /** Loop start measure (0-based, inclusive) — null means no loop */
  loopStart: number | null;
  /** Loop end measure (0-based, exclusive) — null means no loop */
  loopEnd: number | null;
  /** Automation lanes for parameter control over time */
  automationLanes: AutomationLane[];
  /** Whether the metronome click is enabled during playback */
  metronomeEnabled: boolean;
  /** Swing amount: 0 = straight, 0.5 = light shuffle, 1 = full triplet swing */
  swing: number;
  /** User-defined send/FX bus channels */
  sendChannels: SendChannel[];
  /** Mixer tracks for channel routing */
  mixerTracks: MixerTrack[];
  /** Master bus limiter settings */
  masterLimiter: MasterLimiterSettings;
}
