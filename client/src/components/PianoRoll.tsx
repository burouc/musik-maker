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

/** Pixel threshold from cell edge to trigger resize */
const RESIZE_EDGE_PX = 6;

interface DragState {
  pitch: number;
  startStep: number;
  currentStep: number;
}

interface ResizeState {
  noteId: string;
  pitch: number;
  /** 'left' = dragging left edge, 'right' = dragging right edge */
  edge: 'left' | 'right';
  /** Original note start step */
  origStep: number;
  /** Original note duration */
  origDuration: number;
  /** Current step the mouse is over */
  currentStep: number;
}

interface PianoRollProps {
  pianoRoll: PianoRollData;
  stepCount: number;
  currentStep: number;
  isPlaying: boolean;
  onAddNote: (pitch: number, step: number, duration: number) => void;
  onDeleteNote: (noteId: string) => void;
  onUpdateNote: (noteId: string, updates: { step?: number; duration?: number }) => void;
  onPreviewNote: (pitch: number) => void;
}

function PianoRoll({
  pianoRoll,
  stepCount,
  currentStep,
  isPlaying,
  onAddNote,
  onDeleteNote,
  onUpdateNote,
  onPreviewNote,
}: PianoRollProps) {
  const [drag, setDrag] = useState<DragState | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const [resize, setResize] = useState<ResizeState | null>(null);
  const resizeRef = useRef<ResizeState | null>(null);
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);

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

  /** Detect if mouse is near a note edge for resize */
  function detectEdge(e: React.MouseEvent, pitch: number, step: number): { note: PianoNote; edge: 'left' | 'right' } | null {
    const coveredNote = cellCoverage.current.get(`${pitch}-${step}`);
    if (!coveredNote || coveredNote.duration < 1) return null;

    const rect = (e.target as HTMLElement).getBoundingClientRect();
    const xInCell = e.clientX - rect.left;
    const cellWidth = rect.width;

    // Left edge: only on the first step of the note
    if (step === coveredNote.step && xInCell < RESIZE_EDGE_PX) {
      return { note: coveredNote, edge: 'left' };
    }
    // Right edge: only on the last step of the note
    const lastStep = coveredNote.step + coveredNote.duration - 1;
    if (step === lastStep && xInCell > cellWidth - RESIZE_EDGE_PX) {
      return { note: coveredNote, edge: 'right' };
    }

    return null;
  }

  const handleCellMouseDown = useCallback(
    (pitch: number, step: number, e: React.MouseEvent) => {
      e.preventDefault();

      // Check for resize edge first
      const edgeHit = detectEdge(e, pitch, step);
      if (edgeHit) {
        setSelectedNoteId(edgeHit.note.id);
        const newResize: ResizeState = {
          noteId: edgeHit.note.id,
          pitch: edgeHit.note.pitch,
          edge: edgeHit.edge,
          origStep: edgeHit.note.step,
          origDuration: edgeHit.note.duration,
          currentStep: step,
        };
        resizeRef.current = newResize;
        setResize(newResize);
        return;
      }

      // Check if there's an existing note covering this cell
      const coveredNote = cellCoverage.current.get(`${pitch}-${step}`);
      if (coveredNote) {
        // Select the note (right-click or Delete key to delete)
        setSelectedNoteId(coveredNote.id);
        return;
      }
      // Clicking empty space clears selection
      setSelectedNoteId(null);
      // Start drawing a new note
      onPreviewNote(pitch);
      const newDrag: DragState = { pitch, startStep: step, currentStep: step };
      dragRef.current = newDrag;
      setDrag(newDrag);
    },
    [onPreviewNote],
  );

  /** Right-click on a note to delete it */
  const handleCellContextMenu = useCallback(
    (pitch: number, step: number, e: React.MouseEvent) => {
      e.preventDefault();
      const coveredNote = cellCoverage.current.get(`${pitch}-${step}`);
      if (coveredNote) {
        if (selectedNoteId === coveredNote.id) {
          setSelectedNoteId(null);
        }
        onDeleteNote(coveredNote.id);
      }
    },
    [onDeleteNote, selectedNoteId],
  );

  const handleCellMouseEnter = useCallback(
    (pitch: number, step: number) => {
      // Handle resize drag
      if (resizeRef.current) {
        if (pitch !== resizeRef.current.pitch) return;
        const updated = { ...resizeRef.current, currentStep: step };
        resizeRef.current = updated;
        setResize(updated);
        return;
      }
      // Handle new-note drag
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
    // Handle resize completion
    const r = resizeRef.current;
    if (r) {
      let newStep = r.origStep;
      let newDuration = r.origDuration;
      if (r.edge === 'right') {
        // Right edge: new end = currentStep, keep start fixed
        const newEnd = Math.max(r.currentStep, r.origStep);
        newDuration = newEnd - r.origStep + 1;
      } else {
        // Left edge: new start = currentStep, keep end fixed
        const origEnd = r.origStep + r.origDuration - 1;
        newStep = Math.min(r.currentStep, origEnd);
        newDuration = origEnd - newStep + 1;
      }
      if (newStep !== r.origStep || newDuration !== r.origDuration) {
        onUpdateNote(r.noteId, { step: newStep, duration: newDuration });
      }
      resizeRef.current = null;
      setResize(null);
      return;
    }

    // Handle new-note drag completion
    const d = dragRef.current;
    if (!d) return;
    const minStep = Math.min(d.startStep, d.currentStep);
    const maxStep = Math.max(d.startStep, d.currentStep);
    const duration = maxStep - minStep + 1;
    onAddNote(d.pitch, minStep, duration);
    dragRef.current = null;
    setDrag(null);
  }, [onAddNote, onUpdateNote]);

  // Global mouseup listener to catch releases outside the grid
  useEffect(() => {
    const onUp = () => {
      if (dragRef.current || resizeRef.current) {
        handleMouseUp();
      }
    };
    window.addEventListener('mouseup', onUp);
    return () => window.removeEventListener('mouseup', onUp);
  }, [handleMouseUp]);

  // Delete/Backspace key handler for selected notes
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!selectedNoteId) return;
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        onDeleteNote(selectedNoteId);
        setSelectedNoteId(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectedNoteId, onDeleteNote]);

  // Clear selection if the selected note no longer exists
  useEffect(() => {
    if (selectedNoteId && !pianoRoll.notes.some((n) => n.id === selectedNoteId)) {
      setSelectedNoteId(null);
    }
  }, [pianoRoll.notes, selectedNoteId]);

  // Compute drag preview range
  const dragMin = drag ? Math.min(drag.startStep, drag.currentStep) : -1;
  const dragMax = drag ? Math.max(drag.startStep, drag.currentStep) : -1;
  const dragPitch = drag?.pitch ?? -1;

  // Compute resize preview range
  let resizePreviewStart = -1;
  let resizePreviewEnd = -1;
  const resizePitch = resize?.pitch ?? -1;
  if (resize) {
    if (resize.edge === 'right') {
      resizePreviewStart = resize.origStep;
      resizePreviewEnd = Math.max(resize.currentStep, resize.origStep);
    } else {
      const origEnd = resize.origStep + resize.origDuration - 1;
      resizePreviewStart = Math.min(resize.currentStep, origEnd);
      resizePreviewEnd = origEnd;
    }
  }

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

                    // Resize preview: show the note at its new size
                    const isResizing = resize && coveredNote && coveredNote.id === resize.noteId;
                    const isResizePreview =
                      resize && midi === resizePitch && step >= resizePreviewStart && step <= resizePreviewEnd;
                    const isResizeStart = isResizePreview && step === resizePreviewStart;

                    // During resize, hide the original note cells and show preview instead
                    const hideForResize = isResizing && !isResizePreview;
                    const showAsResizeActive = isResizePreview && !isResizing;

                    // Determine if this cell is a resize handle (left or right edge of a note)
                    const isLeftEdge = isNoteStart && isCovered;
                    const isRightEdge = isCovered && coveredNote && step === coveredNote.step + coveredNote.duration - 1;
                    const isSelected = isCovered && coveredNote && coveredNote.id === selectedNoteId;

                    return (
                      <div
                        key={step}
                        className={
                          `piano-roll-cell` +
                          (isNoteStart && !hideForResize ? ' active note-start' : '') +
                          (isContinuation && !hideForResize ? ' active note-continuation' : '') +
                          (isSelected && !hideForResize ? ' selected' : '') +
                          (isCurrent ? ' current' : '') +
                          (step % 4 === 0 ? ' beat-start' : '') +
                          (isDragPreview && !isCovered ? ' drag-preview' : '') +
                          (isDragStart && !isCovered ? ' drag-start' : '') +
                          (showAsResizeActive ? ' active resize-preview' : '') +
                          (isResizeStart && showAsResizeActive ? ' note-start' : '') +
                          (isResizePreview && isResizing ? ' resize-preview' : '') +
                          (isLeftEdge && !resize ? ' note-edge-left' : '') +
                          (isRightEdge && !resize ? ' note-edge-right' : '')
                        }
                        onMouseDown={(e) => handleCellMouseDown(midi, step, e)}
                        onMouseEnter={() => handleCellMouseEnter(midi, step)}
                        onMouseUp={handleMouseUp}
                        onContextMenu={(e) => handleCellContextMenu(midi, step, e)}
                      >
                        {isNoteStart && noteStart!.duration > 1 && !hideForResize && (
                          <div
                            className="piano-note-bar"
                            style={{ width: `calc(${noteStart!.duration * 100}% + ${(noteStart!.duration - 1) * 2}px)` }}
                          />
                        )}
                        {isResizeStart && resizePreviewEnd - resizePreviewStart >= 0 && (
                          <div
                            className="piano-note-bar resize-bar"
                            style={{ width: `calc(${(resizePreviewEnd - resizePreviewStart + 1) * 100}% + ${(resizePreviewEnd - resizePreviewStart) * 2}px)` }}
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
