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
  muted: boolean;
  solo: boolean;
}

export interface Pattern {
  id: string;
  name: string;
  color: string;
  /** Number of steps in this pattern (1–64, default 16) */
  stepCount: number;
  tracks: Track[];
  pianoRoll: PianoRollData;
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

export type PlaybackMode = 'pattern' | 'song';

export interface SequencerState {
  patterns: Pattern[];
  activePatternId: string;
  arrangement: ArrangementTrack[];
  arrangementLength: number;
  bpm: number;
  currentStep: number;
  isPlaying: boolean;
  totalSteps: number;
  playbackMode: PlaybackMode;
  /** Current measure index during song-mode playback */
  currentMeasure: number;
}
