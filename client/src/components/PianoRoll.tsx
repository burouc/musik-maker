import { memo, useCallback, useRef } from 'react';
import type { PianoRollData, PianoNote } from '../types';

/** Note names in chromatic order */
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;
const BLACK_KEYS = new Set([1, 3, 6, 8, 10]); // semitone offsets that are black keys

/** Convert MIDI note to display label e.g. "C4" */
function midiToLabel(midi: number): string {
  const octave = Math.floor(midi / 12) - 1;
  const note = NOTE_NAMES[midi % 12];
  return `${note}${octave}`;
}

function isBlackKey(midi: number): boolean {
  return BLACK_KEYS.has(midi % 12);
}

/** Range of notes to display (C2 = 36 to B5 = 83, 4 octaves) */
const MIDI_LOW = 36;
const MIDI_HIGH = 83;
const TOTAL_KEYS = MIDI_HIGH - MIDI_LOW + 1;
const TOTAL_STEPS = 16;

/** Build array of MIDI note numbers from high to low for rendering top-to-bottom */
const KEY_RANGE: number[] = [];
for (let m = MIDI_HIGH; m >= MIDI_LOW; m--) {
  KEY_RANGE.push(m);
}

interface PianoRollProps {
  pianoRoll: PianoRollData;
  currentStep: number;
  isPlaying: boolean;
  onToggleNote: (pitch: number, step: number) => void;
  onPreviewNote: (pitch: number) => void;
}

function PianoRoll({
  pianoRoll,
  currentStep,
  isPlaying,
  onToggleNote,
  onPreviewNote,
}: PianoRollProps) {
  // Build a lookup set for active notes: "pitch-step"
  const activeNotes = new Set(
    pianoRoll.notes.map((n) => `${n.pitch}-${n.step}`),
  );

  const handleKeyClick = useCallback(
    (midi: number) => {
      onPreviewNote(midi);
    },
    [onPreviewNote],
  );

  const handleCellClick = useCallback(
    (pitch: number, step: number) => {
      onToggleNote(pitch, step);
    },
    [onToggleNote],
  );

  return (
    <div className="piano-roll">
      <div className="piano-roll-header">
        <div className="piano-roll-title">Piano Roll</div>
      </div>

      <div className="piano-roll-body">
        {/* Step numbers header row */}
        <div className="piano-roll-step-header">
          <div className="piano-keyboard-spacer" />
          <div className="piano-roll-step-numbers">
            {Array.from({ length: TOTAL_STEPS }, (_, i) => (
              <div
                key={i}
                className={`piano-roll-step-num${i % 4 === 0 ? ' beat-start' : ''}${isPlaying && currentStep === i ? ' current' : ''}`}
              >
                {i + 1}
              </div>
            ))}
          </div>
        </div>

        <div className="piano-roll-scroll">
          {KEY_RANGE.map((midi) => {
            const black = isBlackKey(midi);
            const label = midiToLabel(midi);
            const isC = midi % 12 === 0;

            return (
              <div
                key={midi}
                className={`piano-roll-row${black ? ' black-key-row' : ' white-key-row'}${isC ? ' octave-boundary' : ''}`}
              >
                {/* Piano key on the left */}
                <button
                  className={`piano-key${black ? ' black' : ' white'}${isC ? ' c-note' : ''}`}
                  onClick={() => handleKeyClick(midi)}
                  title={label}
                >
                  <span className="piano-key-label">{label}</span>
                </button>

                {/* Step grid cells */}
                <div className="piano-roll-cells">
                  {Array.from({ length: TOTAL_STEPS }, (_, step) => {
                    const active = activeNotes.has(`${midi}-${step}`);
                    const isCurrent = isPlaying && currentStep === step;
                    return (
                      <button
                        key={step}
                        className={`piano-roll-cell${active ? ' active' : ''}${isCurrent ? ' current' : ''}${step % 4 === 0 ? ' beat-start' : ''}`}
                        onClick={() => handleCellClick(midi, step)}
                      />
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default memo(PianoRoll);
