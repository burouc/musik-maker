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
  steps: boolean[];
  volume: number;
  muted: boolean;
  solo: boolean;
}

export interface Pattern {
  id: string;
  name: string;
  color: string;
  tracks: Track[];
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
