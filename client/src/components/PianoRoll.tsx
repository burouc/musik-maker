import { memo, useCallback, useRef, useState, useEffect } from 'react';
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
/** Build array of MIDI note numbers from high to low for rendering top-to-bottom */
const KEY_RANGE: number[] = [];
for (let m = MIDI_HIGH; m >= MIDI_LOW; m--) {
  KEY_RANGE.push(m);
}

interface DragState {
  pitch: number;
  startStep: number;
  currentStep: number;
}

interface PianoRollProps {
  pianoRoll: PianoRollData;
  stepCount: number;
  currentStep: number;
  isPlaying: boolean;
  onAddNote: (pitch: number, step: number, duration: number) => void;
  onDeleteNote: (noteId: string) => void;
  onPreviewNote: (pitch: number) => void;
}

function PianoRoll({
  pianoRoll,
  stepCount,
  currentStep,
  isPlaying,
  onAddNote,
  onDeleteNote,
  onPreviewNote,
}: PianoRollProps) {
  const [drag, setDrag] = useState<DragState | null>(null);
  const dragRef = useRef<DragState | null>(null);

  // Build a lookup: for each pitch, a sorted list of notes
  const notesByPitch = useRef<Map<number, PianoNote[]>>(new Map());
  notesByPitch.current = new Map();
  for (const note of pianoRoll.notes) {
    const list = notesByPitch.current.get(note.pitch) ?? [];
    list.push(note);
    notesByPitch.current.set(note.pitch, list);
  }

  // Build a coverage map: "pitch-step" -> note (for cells covered by a note's duration)
  const cellCoverage = useRef<Map<string, PianoNote>>(new Map());
  cellCoverage.current = new Map();
  for (const note of pianoRoll.notes) {
    for (let s = note.step; s < note.step + note.duration && s < stepCount; s++) {
      cellCoverage.current.set(`${note.pitch}-${s}`, note);
    }
  }

  // Find note that starts at a specific pitch+step
  const findNoteStart = useCallback(
    (pitch: number, step: number): PianoNote | undefined => {
      return pianoRoll.notes.find((n) => n.pitch === pitch && n.step === step);
    },
    [pianoRoll.notes],
  );

  const handleKeyClick = useCallback(
    (midi: number) => {
      onPreviewNote(midi);
    },
    [onPreviewNote],
  );

  const handleCellMouseDown = useCallback(
    (pitch: number, step: number, e: React.MouseEvent) => {
      e.preventDefault();
      // Check if there's an existing note covering this cell
      const coveredNote = cellCoverage.current.get(`${pitch}-${step}`);
      if (coveredNote) {
        // Delete the note
        onDeleteNote(coveredNote.id);
        return;
      }
      // Start drawing a new note
      onPreviewNote(pitch);
      const newDrag: DragState = { pitch, startStep: step, currentStep: step };
      dragRef.current = newDrag;
      setDrag(newDrag);
    },
    [onDeleteNote, onPreviewNote],
  );

  const handleCellMouseEnter = useCallback(
    (pitch: number, step: number) => {
      if (!dragRef.current) return;
      // Only allow horizontal dragging on the same pitch
      if (pitch !== dragRef.current.pitch) return;
      const updated = { ...dragRef.current, currentStep: step };
      dragRef.current = updated;
      setDrag(updated);
    },
    [],
  );

  const handleMouseUp = useCallback(() => {
    const d = dragRef.current;
    if (!d) return;
    const minStep = Math.min(d.startStep, d.currentStep);
    const maxStep = Math.max(d.startStep, d.currentStep);
    const duration = maxStep - minStep + 1;
    onAddNote(d.pitch, minStep, duration);
    dragRef.current = null;
    setDrag(null);
  }, [onAddNote]);

  // Global mouseup listener to catch releases outside the grid
  useEffect(() => {
    const onUp = () => {
      if (dragRef.current) {
        handleMouseUp();
      }
    };
    window.addEventListener('mouseup', onUp);
    return () => window.removeEventListener('mouseup', onUp);
  }, [handleMouseUp]);

  // Compute drag preview range
  const dragMin = drag ? Math.min(drag.startStep, drag.currentStep) : -1;
  const dragMax = drag ? Math.max(drag.startStep, drag.currentStep) : -1;
  const dragPitch = drag?.pitch ?? -1;

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
            {Array.from({ length: stepCount }, (_, i) => (
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
                  {Array.from({ length: stepCount }, (_, step) => {
                    const noteStart = findNoteStart(midi, step);
                    const coveredNote = cellCoverage.current.get(`${midi}-${step}`);
                    const isNoteStart = !!noteStart;
                    const isCovered = !!coveredNote;
                    const isContinuation = isCovered && !isNoteStart;
                    const isCurrent = isPlaying && currentStep === step;
                    const isDragPreview =
                      drag && midi === dragPitch && step >= dragMin && step <= dragMax;
                    const isDragStart = isDragPreview && step === dragMin;

                    return (
                      <div
                        key={step}
                        className={
                          `piano-roll-cell` +
                          (isNoteStart ? ' active note-start' : '') +
                          (isContinuation ? ' active note-continuation' : '') +
                          (isCurrent ? ' current' : '') +
                          (step % 4 === 0 ? ' beat-start' : '') +
                          (isDragPreview && !isCovered ? ' drag-preview' : '') +
                          (isDragStart && !isCovered ? ' drag-start' : '')
                        }
                        onMouseDown={(e) => handleCellMouseDown(midi, step, e)}
                        onMouseEnter={() => handleCellMouseEnter(midi, step)}
                        onMouseUp={handleMouseUp}
                      >
                        {isNoteStart && noteStart!.duration > 1 && (
                          <div
                            className="piano-note-bar"
                            style={{ width: `calc(${noteStart!.duration * 100}% + ${(noteStart!.duration - 1) * 2}px)` }}
                          />
                        )}
                      </div>
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
