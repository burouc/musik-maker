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
}

export interface ArrangementTrack {
  id: string;
  name: string;
  blocks: ArrangementBlock[];
  muted: boolean;
}

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
}

export type PlaybackMode = 'pattern' | 'song';

export interface SequencerState {
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
}
