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

export interface SequencerState {
  tracks: Track[];
  bpm: number;
  currentStep: number;
  isPlaying: boolean;
  totalSteps: number;
}
