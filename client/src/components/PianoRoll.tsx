import { memo, useCallback, useMemo, useRef, useState, useEffect } from 'react';
import type { PianoRollData, PianoNote, SynthSettings, OscillatorType, SnapResolution } from '../types';

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

/** Horizontal zoom presets: label and corresponding min-width for cells (px) */
const H_ZOOM_LEVELS = [
  { label: 'XS', minWidth: 12 },
  { label: 'S', minWidth: 16 },
  { label: 'M', minWidth: 20 },
  { label: 'L', minWidth: 30 },
  { label: 'XL', minWidth: 44 },
] as const;
const DEFAULT_H_ZOOM = 2; // 'M' — matches existing 20px

/** Vertical zoom presets: label and corresponding row height (px) */
const V_ZOOM_LEVELS = [
  { label: 'XS', height: 12 },
  { label: 'S', height: 15 },
  { label: 'M', height: 18 },
  { label: 'L', height: 24 },
  { label: 'XL', height: 32 },
] as const;
const DEFAULT_V_ZOOM = 2; // 'M' — matches existing 18px

/** Available snap resolutions with display labels */
const SNAP_OPTIONS: { value: SnapResolution; label: string }[] = [
  { value: '1/4', label: '1/4' },
  { value: '1/8', label: '1/8' },
  { value: '1/16', label: '1/16' },
  { value: '1/32', label: '1/32' },
  { value: '1/4T', label: '1/4T' },
  { value: '1/8T', label: '1/8T' },
  { value: '1/16T', label: '1/16T' },
];

/**
 * Get the snap grid size in steps for a given resolution.
 * Steps are 1/16th notes (16 steps = 1 bar of 4/4).
 */
function snapStepSize(resolution: SnapResolution): number {
  switch (resolution) {
    case '1/4':  return 4;
    case '1/8':  return 2;
    case '1/16': return 1;
    case '1/32': return 0.5;
    case '1/4T': return 4 / 3;   // triplet quarter = 2.667 steps
    case '1/8T': return 2 / 3;   // triplet eighth = 1.333 steps
    case '1/16T': return 1 / 3;  // triplet sixteenth = 0.333 steps
  }
}

/** Snap a step value to the nearest grid position */
function snapToGrid(step: number, resolution: SnapResolution): number {
  const size = snapStepSize(resolution);
  return Math.round(step / size) * size;
}

/** Snap a step value down to the nearest grid position (floor) */
function snapFloor(step: number, resolution: SnapResolution): number {
  const size = snapStepSize(resolution);
  return Math.floor(step / size) * size;
}

/** Snap a step value up to the nearest grid position (ceil) */
function snapCeil(step: number, resolution: SnapResolution): number {
  const size = snapStepSize(resolution);
  return Math.ceil(step / size) * size;
}

/** Get the minimum duration for a given snap resolution (at least 1 grid unit) */
function snapMinDuration(resolution: SnapResolution): number {
  return Math.max(1, snapStepSize(resolution));
}

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

/** Box-select state: tracks a rectangular selection region on the grid */
interface BoxSelectState {
  startPitch: number;
  startStep: number;
  currentPitch: number;
  currentStep: number;
}

/** Move-drag state: tracks dragging selected notes to a new position */
interface MoveState {
  /** The pitch of the cell where the drag started */
  startPitch: number;
  /** The step of the cell where the drag started */
  startStep: number;
  /** Current pitch under the cursor */
  currentPitch: number;
  /** Current step under the cursor */
  currentStep: number;
}

/** Display labels for oscillator types */
const OSC_LABELS: Record<OscillatorType, string> = {
  sine: 'Sine',
  sawtooth: 'Saw',
  square: 'Square',
  triangle: 'Tri',
};

const OSC_TYPES: OscillatorType[] = ['sine', 'sawtooth', 'square', 'triangle'];

interface PianoRollProps {
  pianoRoll: PianoRollData;
  stepCount: number;
  currentStep: number;
  isPlaying: boolean;
  synthSettings: SynthSettings;
  onAddNote: (pitch: number, step: number, duration: number) => void;
  onDeleteNote: (noteId: string) => void;
  onUpdateNote: (noteId: string, updates: { step?: number; duration?: number }) => void;
  onPreviewNote: (pitch: number) => void;
  onMoveNotes: (noteIds: Set<string>, stepDelta: number, pitchDelta: number) => void;
  onPasteNotes: (notes: Omit<PianoNote, 'id'>[]) => void;
  onUpdateNoteVelocity: (noteId: string, velocity: number) => void;
  onSynthSettingsChange: (params: Partial<SynthSettings>) => void;
}

function PianoRoll({
  pianoRoll,
  stepCount,
  currentStep,
  isPlaying,
  synthSettings,
  onAddNote,
  onDeleteNote,
  onUpdateNote,
  onPreviewNote,
  onMoveNotes,
  onPasteNotes,
  onUpdateNoteVelocity,
  onSynthSettingsChange,
}: PianoRollProps) {
  const [drag, setDrag] = useState<DragState | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const [resize, setResize] = useState<ResizeState | null>(null);
  const resizeRef = useRef<ResizeState | null>(null);
  const [selectedNoteIds, setSelectedNoteIds] = useState<Set<string>>(new Set());
  const [move, setMove] = useState<MoveState | null>(null);
  const moveRef = useRef<MoveState | null>(null);
  const [boxSelect, setBoxSelect] = useState<BoxSelectState | null>(null);
  const boxSelectRef = useRef<BoxSelectState | null>(null);
  /** Clipboard: stores copied notes with positions relative to the selection origin */
  const clipboardRef = useRef<Omit<PianoNote, 'id'>[]>([]);
  const velocityLaneRef = useRef<HTMLDivElement>(null);
  /** Snap-to-grid resolution */
  const [snapResolution, setSnapResolution] = useState<SnapResolution>('1/16');
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [hZoom, setHZoom] = useState(DEFAULT_H_ZOOM);
  const [vZoom, setVZoom] = useState(DEFAULT_V_ZOOM);

  const zoomStyle = useMemo(
    () =>
      ({
        '--pr-cell-min-width': `${H_ZOOM_LEVELS[hZoom].minWidth}px`,
        '--pr-row-height': `${V_ZOOM_LEVELS[vZoom].height}px`,
      }) as React.CSSProperties,
    [hZoom, vZoom],
  );

  // Build a lookup: for each pitch, a sorted list of notes
  const notesByPitch = useRef<Map<number, PianoNote[]>>(new Map());
  notesByPitch.current = new Map();
  for (const note of pianoRoll.notes) {
    const list = notesByPitch.current.get(note.pitch) ?? [];
    list.push(note);
    notesByPitch.current.set(note.pitch, list);
  }

  // Build a lookup: for each step, the notes that start there (for velocity lane)
  const notesByStep = useRef<Map<number, PianoNote[]>>(new Map());
  notesByStep.current = new Map();
  for (const note of pianoRoll.notes) {
    const list = notesByStep.current.get(note.step) ?? [];
    list.push(note);
    notesByStep.current.set(note.step, list);
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

  /** Find all notes that overlap with a rectangular region (step range x pitch range) */
  function getNotesInBox(box: BoxSelectState): Set<string> {
    const minStep = Math.min(box.startStep, box.currentStep);
    const maxStep = Math.max(box.startStep, box.currentStep);
    const minPitch = Math.min(box.startPitch, box.currentPitch);
    const maxPitch = Math.max(box.startPitch, box.currentPitch);

    const ids = new Set<string>();
    for (const note of pianoRoll.notes) {
      const noteEnd = note.step + note.duration - 1;
      // Note overlaps box if pitch is in range and step ranges overlap
      if (
        note.pitch >= minPitch &&
        note.pitch <= maxPitch &&
        noteEnd >= minStep &&
        note.step <= maxStep
      ) {
        ids.add(note.id);
      }
    }
    return ids;
  }

  const handleCellMouseDown = useCallback(
    (pitch: number, step: number, e: React.MouseEvent) => {
      e.preventDefault();

      // Check for resize edge first
      const edgeHit = detectEdge(e, pitch, step);
      if (edgeHit) {
        if (!e.shiftKey) {
          setSelectedNoteIds(new Set([edgeHit.note.id]));
        } else {
          setSelectedNoteIds((prev) => {
            const next = new Set(prev);
            next.add(edgeHit.note.id);
            return next;
          });
        }
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
        if (e.shiftKey) {
          // Shift-click: toggle note in/out of selection
          setSelectedNoteIds((prev) => {
            const next = new Set(prev);
            if (next.has(coveredNote.id)) {
              next.delete(coveredNote.id);
            } else {
              next.add(coveredNote.id);
            }
            return next;
          });
        } else if (selectedNoteIds.has(coveredNote.id)) {
          // Clicking an already-selected note: start move drag
          const newMove: MoveState = {
            startPitch: pitch,
            startStep: step,
            currentPitch: pitch,
            currentStep: step,
          };
          moveRef.current = newMove;
          setMove(newMove);
        } else {
          // Plain click on unselected note: select only this note, start move drag
          setSelectedNoteIds(new Set([coveredNote.id]));
          const newMove: MoveState = {
            startPitch: pitch,
            startStep: step,
            currentPitch: pitch,
            currentStep: step,
          };
          moveRef.current = newMove;
          setMove(newMove);
        }
        return;
      }

      // Empty space clicked
      if (e.ctrlKey || e.metaKey) {
        // Ctrl/Cmd + drag on empty space: start box select
        if (!e.shiftKey) {
          setSelectedNoteIds(new Set());
        }
        const newBox: BoxSelectState = {
          startPitch: pitch,
          startStep: step,
          currentPitch: pitch,
          currentStep: step,
        };
        boxSelectRef.current = newBox;
        setBoxSelect(newBox);
        return;
      }

      // Clicking empty space without modifier clears selection and starts note draw
      setSelectedNoteIds(new Set());
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
        // If the right-clicked note is selected, delete all selected notes
        if (selectedNoteIds.has(coveredNote.id)) {
          for (const id of selectedNoteIds) {
            onDeleteNote(id);
          }
          setSelectedNoteIds(new Set());
        } else {
          onDeleteNote(coveredNote.id);
        }
      }
    },
    [onDeleteNote, selectedNoteIds],
  );

  const handleCellMouseEnter = useCallback(
    (pitch: number, step: number) => {
      // Handle box select drag
      if (boxSelectRef.current) {
        const updated = { ...boxSelectRef.current, currentPitch: pitch, currentStep: step };
        boxSelectRef.current = updated;
        setBoxSelect(updated);
        return;
      }
      // Handle move drag
      if (moveRef.current) {
        const updated = { ...moveRef.current, currentPitch: pitch, currentStep: step };
        moveRef.current = updated;
        setMove(updated);
        return;
      }
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
    // Handle box select completion
    const b = boxSelectRef.current;
    if (b) {
      const ids = getNotesInBox(b);
      setSelectedNoteIds((prev) => {
        // If shift was held at start, merge with existing selection
        const next = new Set(prev);
        for (const id of ids) {
          next.add(id);
        }
        return next;
      });
      boxSelectRef.current = null;
      setBoxSelect(null);
      return;
    }

    // Handle move completion
    const m = moveRef.current;
    if (m) {
      let stepDelta = m.currentStep - m.startStep;
      const pitchDelta = m.currentPitch - m.startPitch;
      // Snap the step delta to the grid
      if (snapEnabled && stepDelta !== 0) {
        const size = snapStepSize(snapResolution);
        stepDelta = Math.round(stepDelta / size) * size;
      }
      if (stepDelta !== 0 || pitchDelta !== 0) {
        onMoveNotes(selectedNoteIds, stepDelta, pitchDelta);
      }
      moveRef.current = null;
      setMove(null);
      return;
    }

    // Handle resize completion
    const r = resizeRef.current;
    if (r) {
      let newStep = r.origStep;
      let newDuration = r.origDuration;
      if (r.edge === 'right') {
        // Right edge: new end = currentStep, keep start fixed
        let newEnd = Math.max(r.currentStep, r.origStep);
        if (snapEnabled) {
          // Snap the end position to grid (snap the cell after the end)
          newEnd = Math.max(r.origStep, Math.round(snapCeil(newEnd + 1, snapResolution)) - 1);
        }
        newDuration = newEnd - r.origStep + 1;
      } else {
        // Left edge: new start = currentStep, keep end fixed
        const origEnd = r.origStep + r.origDuration - 1;
        newStep = Math.min(r.currentStep, origEnd);
        if (snapEnabled) {
          newStep = Math.min(origEnd, Math.round(snapFloor(newStep, snapResolution)));
        }
        newDuration = origEnd - newStep + 1;
      }
      // Ensure minimum duration
      if (snapEnabled) {
        newDuration = Math.max(newDuration, Math.round(snapMinDuration(snapResolution)));
      }
      if (newDuration < 1) newDuration = 1;
      if (newStep !== r.origStep || newDuration !== r.origDuration) {
        onUpdateNote(r.noteId, { step: Math.round(newStep), duration: Math.round(newDuration) });
      }
      resizeRef.current = null;
      setResize(null);
      return;
    }

    // Handle new-note drag completion
    const d = dragRef.current;
    if (!d) return;
    let minStep = Math.min(d.startStep, d.currentStep);
    let maxStep = Math.max(d.startStep, d.currentStep);
    if (snapEnabled) {
      minStep = Math.round(snapFloor(minStep, snapResolution));
      maxStep = Math.round(snapCeil(maxStep + 1, snapResolution)) - 1;
      // Ensure at least one grid unit
      if (maxStep < minStep) maxStep = minStep + Math.round(snapMinDuration(snapResolution)) - 1;
    }
    const duration = maxStep - minStep + 1;
    onAddNote(d.pitch, Math.round(minStep), Math.round(duration));
    dragRef.current = null;
    setDrag(null);
  }, [onAddNote, onUpdateNote, onMoveNotes, selectedNoteIds, snapEnabled, snapResolution]);

  // Global mouseup listener to catch releases outside the grid
  useEffect(() => {
    const onUp = () => {
      if (dragRef.current || resizeRef.current || boxSelectRef.current || moveRef.current) {
        handleMouseUp();
      }
    };
    window.addEventListener('mouseup', onUp);
    return () => window.removeEventListener('mouseup', onUp);
  }, [handleMouseUp]);

  // Keyboard handler: Delete/Backspace, Escape, Ctrl+A
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // Ctrl+A / Cmd+A: select all notes
      if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
        e.preventDefault();
        setSelectedNoteIds(new Set(pianoRoll.notes.map((n) => n.id)));
        return;
      }

      // Ctrl+C / Cmd+C: copy selected notes
      if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
        if (selectedNoteIds.size === 0) return;
        e.preventDefault();
        const selected = pianoRoll.notes.filter((n) => selectedNoteIds.has(n.id));
        // Store relative to the top-left of the selection
        const minStep = Math.min(...selected.map((n) => n.step));
        const minPitch = Math.min(...selected.map((n) => n.pitch));
        clipboardRef.current = selected.map((n) => ({
          pitch: n.pitch - minPitch,
          step: n.step - minStep,
          duration: n.duration,
          velocity: n.velocity,
        }));
        return;
      }

      // Ctrl+V / Cmd+V: paste notes at the selection's original position
      if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
        if (clipboardRef.current.length === 0) return;
        e.preventDefault();
        // Paste at the earliest selected note position, or at step 0 / lowest pitch if nothing selected
        let baseStep = 0;
        let basePitch = 60; // middle C default
        if (selectedNoteIds.size > 0) {
          const selected = pianoRoll.notes.filter((n) => selectedNoteIds.has(n.id));
          baseStep = Math.min(...selected.map((n) => n.step));
          basePitch = Math.min(...selected.map((n) => n.pitch));
        }
        const pasted = clipboardRef.current.map((n) => ({
          pitch: n.pitch + basePitch,
          step: n.step + baseStep,
          duration: n.duration,
          velocity: n.velocity,
        }));
        onPasteNotes(pasted);
        // Select the newly pasted notes (they'll get new IDs from the hook)
        // We can't know the IDs yet, so just clear selection
        setSelectedNoteIds(new Set());
        return;
      }

      // Ctrl+D / Cmd+D: duplicate selected notes (paste 1 step after last selected note)
      if ((e.ctrlKey || e.metaKey) && e.key === 'd') {
        if (selectedNoteIds.size === 0) return;
        e.preventDefault();
        const selected = pianoRoll.notes.filter((n) => selectedNoteIds.has(n.id));
        const maxEnd = Math.max(...selected.map((n) => n.step + n.duration));
        const minStep = Math.min(...selected.map((n) => n.step));
        const stepOffset = maxEnd - minStep;
        const duplicated = selected.map((n) => ({
          pitch: n.pitch,
          step: n.step + stepOffset,
          duration: n.duration,
          velocity: n.velocity,
        }));
        onPasteNotes(duplicated);
        setSelectedNoteIds(new Set());
        return;
      }

      // Escape: clear selection
      if (e.key === 'Escape') {
        if (selectedNoteIds.size > 0) {
          e.preventDefault();
          setSelectedNoteIds(new Set());
        }
        return;
      }

      // All remaining shortcuts require a selection
      if (selectedNoteIds.size === 0) return;

      // Delete/Backspace: delete all selected notes
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        for (const id of selectedNoteIds) {
          onDeleteNote(id);
        }
        setSelectedNoteIds(new Set());
        return;
      }

      // Arrow keys: move selected notes
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault();
        const snapSize = snapEnabled ? Math.max(1, Math.round(snapStepSize(snapResolution))) : 1;
        const stepDelta = e.key === 'ArrowLeft' ? -snapSize : e.key === 'ArrowRight' ? snapSize : 0;
        const pitchDelta = e.key === 'ArrowUp' ? 1 : e.key === 'ArrowDown' ? -1 : 0;
        onMoveNotes(selectedNoteIds, stepDelta, pitchDelta);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectedNoteIds, onDeleteNote, onMoveNotes, onPasteNotes, pianoRoll.notes, snapEnabled, snapResolution]);

  // Clear selected notes that no longer exist
  useEffect(() => {
    if (selectedNoteIds.size === 0) return;
    const existingIds = new Set(pianoRoll.notes.map((n) => n.id));
    const filtered = new Set<string>();
    let changed = false;
    for (const id of selectedNoteIds) {
      if (existingIds.has(id)) {
        filtered.add(id);
      } else {
        changed = true;
      }
    }
    if (changed) {
      setSelectedNoteIds(filtered);
    }
  }, [pianoRoll.notes, selectedNoteIds]);

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

  // Compute move preview: build a coverage map of where selected notes would land
  const moveStepDelta = move ? move.currentStep - move.startStep : 0;
  const movePitchDelta = move ? move.currentPitch - move.startPitch : 0;
  const movePreviewCells = useRef<Map<string, PianoNote>>(new Map());
  movePreviewCells.current = new Map();
  if (move && (moveStepDelta !== 0 || movePitchDelta !== 0)) {
    for (const note of pianoRoll.notes) {
      if (!selectedNoteIds.has(note.id)) continue;
      const newStep = note.step + moveStepDelta;
      const newPitch = note.pitch + movePitchDelta;
      for (let s = newStep; s < newStep + note.duration && s < stepCount; s++) {
        if (s >= 0 && newPitch >= MIDI_LOW && newPitch <= MIDI_HIGH) {
          movePreviewCells.current.set(`${newPitch}-${s}`, { ...note, step: newStep, pitch: newPitch });
        }
      }
    }
  }

  // Compute box-select bounds
  const boxMinStep = boxSelect ? Math.min(boxSelect.startStep, boxSelect.currentStep) : -1;
  const boxMaxStep = boxSelect ? Math.max(boxSelect.startStep, boxSelect.currentStep) : -1;
  const boxMinPitch = boxSelect ? Math.min(boxSelect.startPitch, boxSelect.currentPitch) : -1;
  const boxMaxPitch = boxSelect ? Math.max(boxSelect.startPitch, boxSelect.currentPitch) : -1;

  // Pre-compute which note IDs are in the active box selection (for live preview)
  const boxPreviewIds = boxSelect ? getNotesInBox(boxSelect) : null;

  // Pre-compute snap grid line positions for visual feedback
  const snapSize = snapEnabled ? snapStepSize(snapResolution) : 1;
  const isSnapLine = useCallback((step: number): boolean => {
    if (!snapEnabled || snapSize <= 1) return false;
    // A step is on the snap grid if it's within rounding distance of a grid position
    const remainder = step % snapSize;
    return remainder < 0.001 || (snapSize - remainder) < 0.001;
  }, [snapEnabled, snapSize]);

  /** Velocity lane: compute velocity from mouse Y position relative to the bar container */
  const velocityFromMouseY = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - rect.top;
    // Top = velocity 1, bottom = velocity 0.05
    return Math.max(0.05, Math.min(1, 1 - y / rect.height));
  }, []);

  const velocityDragRef = useRef<boolean>(false);

  const handleVelocityMouseDown = useCallback(
    (step: number, e: React.MouseEvent<HTMLDivElement>) => {
      e.preventDefault();
      const velocity = velocityFromMouseY(e);
      const notes = notesByStep.current.get(step);
      if (!notes || notes.length === 0) return;
      velocityDragRef.current = true;
      for (const note of notes) {
        onUpdateNoteVelocity(note.id, velocity);
      }
    },
    [onUpdateNoteVelocity, velocityFromMouseY],
  );

  const handleVelocityMouseEnter = useCallback(
    (step: number, e: React.MouseEvent<HTMLDivElement>) => {
      if (!velocityDragRef.current) return;
      const velocity = velocityFromMouseY(e);
      const notes = notesByStep.current.get(step);
      if (!notes || notes.length === 0) return;
      for (const note of notes) {
        onUpdateNoteVelocity(note.id, velocity);
      }
    },
    [onUpdateNoteVelocity, velocityFromMouseY],
  );

  useEffect(() => {
    const onUp = () => { velocityDragRef.current = false; };
    window.addEventListener('mouseup', onUp);
    return () => window.removeEventListener('mouseup', onUp);
  }, []);

  return (
    <div className="piano-roll" style={zoomStyle}>
      <div className="piano-roll-header">
        <div className="piano-roll-title-row">
          <div className="piano-roll-title">Piano Roll</div>
          <div className="pr-zoom-control">
            <span className="pr-zoom-label">H:</span>
            <div className="pr-zoom-buttons">
              {H_ZOOM_LEVELS.map((level, i) => (
                <button
                  key={level.label}
                  className={`pr-zoom-btn${i === hZoom ? ' active' : ''}`}
                  onClick={() => setHZoom(i)}
                  title={`Horizontal zoom ${level.label}`}
                >
                  {level.label}
                </button>
              ))}
            </div>
            <span className="pr-zoom-label">V:</span>
            <div className="pr-zoom-buttons">
              {V_ZOOM_LEVELS.map((level, i) => (
                <button
                  key={level.label}
                  className={`pr-zoom-btn${i === vZoom ? ' active' : ''}`}
                  onClick={() => setVZoom(i)}
                  title={`Vertical zoom ${level.label}`}
                >
                  {level.label}
                </button>
              ))}
            </div>
          </div>
          <div className="snap-controls">
            <button
              className={`snap-toggle${snapEnabled ? ' active' : ''}`}
              onClick={() => setSnapEnabled((v) => !v)}
              title={snapEnabled ? 'Snap enabled (click to disable)' : 'Snap disabled (click to enable)'}
            >
              Snap
            </button>
            <select
              className="snap-select"
              value={snapResolution}
              onChange={(e) => setSnapResolution(e.target.value as SnapResolution)}
              disabled={!snapEnabled}
              title="Grid resolution"
            >
              {SNAP_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="synth-controls">
          <div className="synth-control-group">
            <label className="synth-label">OSC 1</label>
            <div className="synth-osc-buttons">
              {OSC_TYPES.map((t) => (
                <button
                  key={t}
                  className={`synth-osc-btn${synthSettings.oscType === t ? ' active' : ''}`}
                  onClick={() => onSynthSettingsChange({ oscType: t })}
                  title={OSC_LABELS[t]}
                >
                  {OSC_LABELS[t]}
                </button>
              ))}
            </div>
          </div>

          <div className="synth-control-group">
            <label className="synth-label">Oct 1</label>
            <input
              type="range"
              className="synth-slider"
              min={-2}
              max={2}
              step={1}
              value={synthSettings.oscOctave}
              onChange={(e) => onSynthSettingsChange({ oscOctave: Number(e.target.value) })}
              title={`Octave: ${synthSettings.oscOctave > 0 ? '+' : ''}${synthSettings.oscOctave}`}
            />
          </div>

          <div className="synth-control-group">
            <label className="synth-label">OSC 2</label>
            <div className="synth-osc-buttons">
              {OSC_TYPES.map((t) => (
                <button
                  key={t}
                  className={`synth-osc-btn${synthSettings.osc2Type === t ? ' active' : ''}`}
                  onClick={() => onSynthSettingsChange({ osc2Type: t })}
                  title={OSC_LABELS[t]}
                >
                  {OSC_LABELS[t]}
                </button>
              ))}
            </div>
          </div>

          <div className="synth-control-group">
            <label className="synth-label">Oct 2</label>
            <input
              type="range"
              className="synth-slider"
              min={-2}
              max={2}
              step={1}
              value={synthSettings.osc2Octave}
              onChange={(e) => onSynthSettingsChange({ osc2Octave: Number(e.target.value) })}
              title={`Octave: ${synthSettings.osc2Octave > 0 ? '+' : ''}${synthSettings.osc2Octave}`}
            />
          </div>

          <div className="synth-control-group">
            <label className="synth-label">Detune</label>
            <input
              type="range"
              className="synth-slider"
              min={0}
              max={100}
              value={synthSettings.osc2Detune}
              onChange={(e) => onSynthSettingsChange({ osc2Detune: Number(e.target.value) })}
              title={`${synthSettings.osc2Detune} cents`}
            />
          </div>

          <div className="synth-control-group">
            <label className="synth-label">Mix</label>
            <input
              type="range"
              className="synth-slider"
              min={0}
              max={100}
              value={Math.round(synthSettings.osc2Mix * 100)}
              onChange={(e) => onSynthSettingsChange({ osc2Mix: Number(e.target.value) / 100 })}
              title={`${Math.round(synthSettings.osc2Mix * 100)}%`}
            />
          </div>

          <div className="synth-control-divider" />

          <div className="synth-control-group">
            <label className="synth-label">
              <input
                type="checkbox"
                checked={synthSettings.osc3Enabled}
                onChange={(e) => onSynthSettingsChange({ osc3Enabled: e.target.checked })}
              />
              {' OSC 3'}
            </label>
            <div className="synth-osc-buttons">
              {OSC_TYPES.map((t) => (
                <button
                  key={t}
                  className={`synth-osc-btn${synthSettings.osc3Type === t ? ' active' : ''}${!synthSettings.osc3Enabled ? ' disabled' : ''}`}
                  onClick={() => synthSettings.osc3Enabled && onSynthSettingsChange({ osc3Type: t })}
                  title={OSC_LABELS[t]}
                  disabled={!synthSettings.osc3Enabled}
                >
                  {OSC_LABELS[t]}
                </button>
              ))}
            </div>
          </div>

          <div className="synth-control-group">
            <label className="synth-label">Oct 3</label>
            <input
              type="range"
              className="synth-slider"
              min={-2}
              max={2}
              step={1}
              value={synthSettings.osc3Octave}
              onChange={(e) => onSynthSettingsChange({ osc3Octave: Number(e.target.value) })}
              title={`Octave: ${synthSettings.osc3Octave > 0 ? '+' : ''}${synthSettings.osc3Octave}`}
              disabled={!synthSettings.osc3Enabled}
            />
          </div>

          <div className="synth-control-group">
            <label className="synth-label">Det 3</label>
            <input
              type="range"
              className="synth-slider"
              min={0}
              max={100}
              value={synthSettings.osc3Detune}
              onChange={(e) => onSynthSettingsChange({ osc3Detune: Number(e.target.value) })}
              title={`${synthSettings.osc3Detune} cents`}
              disabled={!synthSettings.osc3Enabled}
            />
          </div>

          <div className="synth-control-group">
            <label className="synth-label">Mix 3</label>
            <input
              type="range"
              className="synth-slider"
              min={0}
              max={100}
              value={Math.round(synthSettings.osc3Mix * 100)}
              onChange={(e) => onSynthSettingsChange({ osc3Mix: Number(e.target.value) / 100 })}
              title={`${Math.round(synthSettings.osc3Mix * 100)}%`}
              disabled={!synthSettings.osc3Enabled}
            />
          </div>

          <div className="synth-control-group">
            <label className="synth-label">Cutoff</label>
            <input
              type="range"
              className="synth-slider"
              min={0}
              max={100}
              value={Math.round(Math.log(synthSettings.filterCutoff / 20) / Math.log(20000 / 20) * 100)}
              onChange={(e) => {
                const normalized = Number(e.target.value) / 100;
                const freq = 20 * Math.pow(20000 / 20, normalized);
                onSynthSettingsChange({ filterCutoff: Math.round(freq) });
              }}
              title={`${synthSettings.filterCutoff} Hz`}
            />
          </div>

          <div className="synth-control-group">
            <label className="synth-label">Reso</label>
            <input
              type="range"
              className="synth-slider"
              min={1}
              max={250}
              value={Math.round(synthSettings.filterResonance * 10)}
              onChange={(e) => onSynthSettingsChange({ filterResonance: Number(e.target.value) / 10 })}
              title={`Q: ${synthSettings.filterResonance.toFixed(1)}`}
            />
          </div>

          <div className="synth-control-group">
            <label className="synth-label">FAtk</label>
            <input
              type="range"
              className="synth-slider"
              min={1}
              max={2000}
              value={Math.round(synthSettings.filterEnvAttack * 1000)}
              onChange={(e) => onSynthSettingsChange({ filterEnvAttack: Number(e.target.value) / 1000 })}
              title={`Filter Attack: ${synthSettings.filterEnvAttack >= 1 ? `${synthSettings.filterEnvAttack.toFixed(1)}s` : `${Math.round(synthSettings.filterEnvAttack * 1000)}ms`}`}
            />
          </div>

          <div className="synth-control-group">
            <label className="synth-label">FDec</label>
            <input
              type="range"
              className="synth-slider"
              min={1}
              max={2000}
              value={Math.round(synthSettings.filterEnvDecay * 1000)}
              onChange={(e) => onSynthSettingsChange({ filterEnvDecay: Number(e.target.value) / 1000 })}
              title={`Filter Decay: ${synthSettings.filterEnvDecay >= 1 ? `${synthSettings.filterEnvDecay.toFixed(1)}s` : `${Math.round(synthSettings.filterEnvDecay * 1000)}ms`}`}
            />
          </div>

          <div className="synth-control-group">
            <label className="synth-label">FSus</label>
            <input
              type="range"
              className="synth-slider"
              min={0}
              max={100}
              value={Math.round(synthSettings.filterEnvSustain * 100)}
              onChange={(e) => onSynthSettingsChange({ filterEnvSustain: Number(e.target.value) / 100 })}
              title={`Filter Sustain: ${Math.round(synthSettings.filterEnvSustain * 100)}%`}
            />
          </div>

          <div className="synth-control-group">
            <label className="synth-label">FRel</label>
            <input
              type="range"
              className="synth-slider"
              min={1}
              max={2000}
              value={Math.round(synthSettings.filterEnvRelease * 1000)}
              onChange={(e) => onSynthSettingsChange({ filterEnvRelease: Number(e.target.value) / 1000 })}
              title={`Filter Release: ${synthSettings.filterEnvRelease >= 1 ? `${synthSettings.filterEnvRelease.toFixed(1)}s` : `${Math.round(synthSettings.filterEnvRelease * 1000)}ms`}`}
            />
          </div>

          <div className="synth-control-group">
            <label className="synth-label">FAmt</label>
            <input
              type="range"
              className="synth-slider"
              min={0}
              max={100}
              value={Math.round(synthSettings.filterEnvAmount)}
              onChange={(e) => onSynthSettingsChange({ filterEnvAmount: Number(e.target.value) })}
              title={`Filter Env Amount: ${Math.round(synthSettings.filterEnvAmount)} semitones`}
            />
          </div>

          <div className="synth-control-divider" />

          <div className="synth-control-group">
            <label className="synth-label">Atk</label>
            <input
              type="range"
              className="synth-slider"
              min={1}
              max={2000}
              value={Math.round(synthSettings.ampAttack * 1000)}
              onChange={(e) => onSynthSettingsChange({ ampAttack: Number(e.target.value) / 1000 })}
              title={`Attack: ${synthSettings.ampAttack >= 1 ? `${synthSettings.ampAttack.toFixed(1)}s` : `${Math.round(synthSettings.ampAttack * 1000)}ms`}`}
            />
          </div>

          <div className="synth-control-group">
            <label className="synth-label">Dec</label>
            <input
              type="range"
              className="synth-slider"
              min={1}
              max={2000}
              value={Math.round(synthSettings.ampDecay * 1000)}
              onChange={(e) => onSynthSettingsChange({ ampDecay: Number(e.target.value) / 1000 })}
              title={`Decay: ${synthSettings.ampDecay >= 1 ? `${synthSettings.ampDecay.toFixed(1)}s` : `${Math.round(synthSettings.ampDecay * 1000)}ms`}`}
            />
          </div>

          <div className="synth-control-group">
            <label className="synth-label">Sus</label>
            <input
              type="range"
              className="synth-slider"
              min={0}
              max={100}
              value={Math.round(synthSettings.ampSustain * 100)}
              onChange={(e) => onSynthSettingsChange({ ampSustain: Number(e.target.value) / 100 })}
              title={`Sustain: ${Math.round(synthSettings.ampSustain * 100)}%`}
            />
          </div>

          <div className="synth-control-group">
            <label className="synth-label">Rel</label>
            <input
              type="range"
              className="synth-slider"
              min={1}
              max={2000}
              value={Math.round(synthSettings.ampRelease * 1000)}
              onChange={(e) => onSynthSettingsChange({ ampRelease: Number(e.target.value) / 1000 })}
              title={`Release: ${synthSettings.ampRelease >= 1 ? `${synthSettings.ampRelease.toFixed(1)}s` : `${Math.round(synthSettings.ampRelease * 1000)}ms`}`}
            />
          </div>
        </div>

        {selectedNoteIds.size > 0 && (
          <div className="piano-roll-selection-count">
            {selectedNoteIds.size} selected
          </div>
        )}
      </div>

      <div className="piano-roll-body">
        {/* Step numbers header row */}
        <div className="piano-roll-step-header">
          <div className="piano-keyboard-spacer" />
          <div className="piano-roll-step-numbers">
            {Array.from({ length: stepCount }, (_, i) => (
              <div
                key={i}
                className={`piano-roll-step-num${i % 4 === 0 ? ' beat-start' : ''}${isSnapLine(i) && i % 4 !== 0 ? ' snap-line' : ''}${isPlaying && currentStep === i ? ' current' : ''}`}
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

                    // Move preview: hide selected notes at original position, show at preview position
                    const isMoving = move && (moveStepDelta !== 0 || movePitchDelta !== 0);
                    const hideForMove = isMoving && isCovered && coveredNote && selectedNoteIds.has(coveredNote.id);
                    const movePreview = movePreviewCells.current.get(`${midi}-${step}`);
                    const isMovePreview = isMoving && !!movePreview;
                    const isMovePreviewStart = isMovePreview && movePreview && step === movePreview.step;

                    // Determine if this cell is a resize handle (left or right edge of a note)
                    const isLeftEdge = isNoteStart && isCovered;
                    const isRightEdge = isCovered && coveredNote && step === coveredNote.step + coveredNote.duration - 1;
                    const isSelected = isCovered && coveredNote && (
                      selectedNoteIds.has(coveredNote.id) ||
                      (boxPreviewIds !== null && boxPreviewIds.has(coveredNote.id))
                    );

                    // Box select overlay (highlight the rectangular region)
                    const isBoxSelectArea = boxSelect &&
                      midi >= boxMinPitch && midi <= boxMaxPitch &&
                      step >= boxMinStep && step <= boxMaxStep;

                    return (
                      <div
                        key={step}
                        className={
                          `piano-roll-cell` +
                          (isNoteStart && !hideForResize && !hideForMove ? ' active note-start' : '') +
                          (isContinuation && !hideForResize && !hideForMove ? ' active note-continuation' : '') +
                          (isSelected && !hideForResize && !hideForMove ? ' selected' : '') +
                          (isMovePreview ? ' active move-preview selected' : '') +
                          (isMovePreviewStart ? ' note-start' : '') +
                          (isCurrent ? ' current' : '') +
                          (step % 4 === 0 ? ' beat-start' : '') +
                          (isSnapLine(step) && step % 4 !== 0 ? ' snap-line' : '') +
                          (isDragPreview && !isCovered ? ' drag-preview' : '') +
                          (isDragStart && !isCovered ? ' drag-start' : '') +
                          (showAsResizeActive ? ' active resize-preview' : '') +
                          (isResizeStart && showAsResizeActive ? ' note-start' : '') +
                          (isResizePreview && isResizing ? ' resize-preview' : '') +
                          (isLeftEdge && !resize && !hideForMove ? ' note-edge-left' : '') +
                          (isRightEdge && !resize && !hideForMove ? ' note-edge-right' : '') +
                          (isBoxSelectArea && !isCovered ? ' box-select-area' : '')
                        }
                        onMouseDown={(e) => handleCellMouseDown(midi, step, e)}
                        onMouseEnter={() => handleCellMouseEnter(midi, step)}
                        onMouseUp={handleMouseUp}
                        onContextMenu={(e) => handleCellContextMenu(midi, step, e)}
                      >
                        {isNoteStart && noteStart!.duration > 1 && !hideForResize && !hideForMove && (
                          <div
                            className="piano-note-bar"
                            style={{ width: `calc(${noteStart!.duration * 100}% + ${(noteStart!.duration - 1) * 2}px)` }}
                          />
                        )}
                        {isMovePreviewStart && movePreview && movePreview.duration > 1 && (
                          <div
                            className="piano-note-bar"
                            style={{ width: `calc(${movePreview.duration * 100}% + ${(movePreview.duration - 1) * 2}px)` }}
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

        {/* Velocity lane */}
        <div className="velocity-lane">
          <div className="velocity-lane-label">VEL</div>
          <div className="velocity-lane-bars" ref={velocityLaneRef}>
            {Array.from({ length: stepCount }, (_, step) => {
              const notes = notesByStep.current.get(step);
              const hasNote = notes && notes.length > 0;
              // Use the highest velocity among notes at this step
              const velocity = hasNote
                ? Math.max(...notes.map((n) => n.velocity))
                : 0;
              const isCurrent = isPlaying && currentStep === step;

              return (
                <div
                  key={step}
                  className={
                    `velocity-lane-step` +
                    (step % 4 === 0 ? ' beat-start' : '') +
                    (isCurrent ? ' current' : '')
                  }
                  onMouseDown={(e) => handleVelocityMouseDown(step, e)}
                  onMouseEnter={(e) => handleVelocityMouseEnter(step, e)}
                >
                  {hasNote && (
                    <div
                      className="velocity-bar"
                      style={{ height: `${Math.round(velocity * 100)}%` }}
                      title={`Velocity: ${Math.round(velocity * 100)}%`}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

export default memo(PianoRoll);
