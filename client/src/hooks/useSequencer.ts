import { useState, useRef, useEffect, useCallback } from 'react';
import type {
  InstrumentName,
  Track,
  Pattern,
  ArrangementTrack,
  ArrangementBlock,
  PlaybackMode,
  SequencerState,
  PianoNote,
} from '../types';
import AudioEngine from '../audio/AudioEngine';

const DEFAULT_STEP_COUNT = 16;

const PATTERN_COLORS = [
  '#e94560',
  '#f5a623',
  '#4ecdc4',
  '#a855f7',
  '#3b82f6',
  '#22c55e',
  '#ec4899',
  '#f97316',
];

const DEFAULT_VELOCITY = 0.8;

function createDefaultTracks(stepCount: number = DEFAULT_STEP_COUNT): Track[] {
  return [
    { id: 'kick', name: 'Kick', steps: Array(stepCount).fill(0), volume: 0.8, muted: false, solo: false },
    { id: 'snare', name: 'Snare', steps: Array(stepCount).fill(0), volume: 0.8, muted: false, solo: false },
    { id: 'hihat', name: 'Hi-Hat', steps: Array(stepCount).fill(0), volume: 0.8, muted: false, solo: false },
    { id: 'clap', name: 'Clap', steps: Array(stepCount).fill(0), volume: 0.8, muted: false, solo: false },
    { id: 'openhat', name: 'Open Hat', steps: Array(stepCount).fill(0), volume: 0.8, muted: false, solo: false },
    { id: 'percussion', name: 'Percussion', steps: Array(stepCount).fill(0), volume: 0.8, muted: false, solo: false },
  ];
}

function createPattern(index: number): Pattern {
  return {
    id: `pattern-${Date.now()}-${index}`,
    name: `Pattern ${index + 1}`,
    color: PATTERN_COLORS[index % PATTERN_COLORS.length],
    stepCount: DEFAULT_STEP_COUNT,
    tracks: createDefaultTracks(),
    pianoRoll: { notes: [] },
  };
}

const DEFAULT_ARRANGEMENT_TRACKS: ArrangementTrack[] = Array.from(
  { length: 4 },
  (_, i) => ({
    id: `arr-track-${i}`,
    name: `Track ${i + 1}`,
    blocks: [],
    muted: false,
  }),
);

const firstPattern = createPattern(0);

const INITIAL_STATE: SequencerState = {
  patterns: [firstPattern],
  activePatternId: firstPattern.id,
  arrangement: DEFAULT_ARRANGEMENT_TRACKS,
  arrangementLength: 16,
  bpm: 120,
  currentStep: -1,
  isPlaying: false,
  totalSteps: DEFAULT_STEP_COUNT,
  playbackMode: 'pattern',
  currentMeasure: -1,
};

function useSequencer() {
  const [state, setState] = useState<SequencerState>(INITIAL_STATE);

  const audioEngine = useRef<AudioEngine>(new AudioEngine());
  const timerRef = useRef<number | null>(null);
  const stateRef = useRef<SequencerState>(state);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  // Helper: get the currently active pattern from state
  const getActivePattern = useCallback(
    (s: SequencerState): Pattern | undefined =>
      s.patterns.find((p) => p.id === s.activePatternId),
    [],
  );

  // -----------------------------------------------------------------------
  // Playback loop
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (state.isPlaying) {
      const intervalMs = (60 / state.bpm / 4) * 1000;

      timerRef.current = window.setInterval(() => {
        setState((prev) => {
          const current = stateRef.current;

          if (current.playbackMode === 'pattern') {
            // --- Pattern mode: loop through current pattern ---
            const pattern = current.patterns.find(
              (p) => p.id === current.activePatternId,
            );
            if (!pattern) return prev;

            const nextStep = (prev.currentStep + 1) % pattern.stepCount;
            const anySoloed = pattern.tracks.some((t) => t.solo);

            for (const track of pattern.tracks) {
              const stepVelocity = track.steps[nextStep];
              if (stepVelocity <= 0) continue;
              const effectivelyMuted =
                track.muted || (anySoloed && !track.solo);
              if (!effectivelyMuted) {
                audioEngine.current.playSound(track.id, track.volume * stepVelocity);
              }
            }

            // Play piano roll notes at this step
            for (const note of pattern.pianoRoll.notes) {
              if (note.step === nextStep) {
                const durationSec =
                  (note.duration * (60 / current.bpm)) / 4;
                audioEngine.current.playPianoNote(
                  note.pitch,
                  note.velocity,
                  durationSec,
                );
              }
            }

            return { ...prev, currentStep: nextStep };
          } else {
            // --- Song mode: play through the arrangement ---
            // Use the active pattern's step count for the measure loop
            const activePattern = current.patterns.find(
              (p) => p.id === current.activePatternId,
            );
            const measureSteps = activePattern?.stepCount ?? DEFAULT_STEP_COUNT;
            const nextStep = (prev.currentStep + 1) % measureSteps;
            let nextMeasure = prev.currentMeasure;

            // Advance to next measure when we wrap around to step 0
            if (nextStep === 0) {
              nextMeasure = prev.currentMeasure + 1;
              if (nextMeasure >= prev.arrangementLength) {
                // Song finished - stop playback
                return {
                  ...prev,
                  isPlaying: false,
                  currentStep: -1,
                  currentMeasure: -1,
                };
              }
            }

            // Find all patterns playing at this measure
            for (const arrTrack of current.arrangement) {
              if (arrTrack.muted) continue;

              for (const block of arrTrack.blocks) {
                if (block.startMeasure === nextMeasure) {
                  const pattern = current.patterns.find(
                    (p) => p.id === block.patternId,
                  );
                  if (!pattern) continue;

                  // Only play steps within this pattern's step count
                  if (nextStep >= pattern.stepCount) continue;

                  const anySoloed = pattern.tracks.some((t) => t.solo);

                  for (const track of pattern.tracks) {
                    const stepVelocity = track.steps[nextStep];
                    if (stepVelocity <= 0) continue;
                    const effectivelyMuted =
                      track.muted || (anySoloed && !track.solo);
                    if (!effectivelyMuted) {
                      audioEngine.current.playSound(track.id, track.volume * stepVelocity);
                    }
                  }

                  // Play piano roll notes in song mode
                  for (const note of pattern.pianoRoll.notes) {
                    if (note.step === nextStep) {
                      const durationSec =
                        (note.duration * (60 / current.bpm)) / 4;
                      audioEngine.current.playPianoNote(
                        note.pitch,
                        note.velocity,
                        durationSec,
                      );
                    }
                  }
                }
              }
            }

            return {
              ...prev,
              currentStep: nextStep,
              currentMeasure: nextMeasure,
            };
          }
        });
      }, intervalMs);
    } else {
      if (timerRef.current !== null) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }

    return () => {
      if (timerRef.current !== null) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [state.isPlaying, state.bpm]);

  // -----------------------------------------------------------------------
  // Pattern actions
  // -----------------------------------------------------------------------

  const addPattern = useCallback(() => {
    setState((prev) => {
      const newPattern = createPattern(prev.patterns.length);
      return {
        ...prev,
        patterns: [...prev.patterns, newPattern],
        activePatternId: newPattern.id,
      };
    });
  }, []);

  const selectPattern = useCallback((patternId: string) => {
    setState((prev) => ({ ...prev, activePatternId: patternId }));
  }, []);

  const deletePattern = useCallback((patternId: string) => {
    setState((prev) => {
      if (prev.patterns.length <= 1) return prev;
      const filtered = prev.patterns.filter((p) => p.id !== patternId);
      const newActiveId =
        prev.activePatternId === patternId
          ? filtered[0].id
          : prev.activePatternId;
      // Also remove from arrangement
      const updatedArrangement = prev.arrangement.map((arrTrack) => ({
        ...arrTrack,
        blocks: arrTrack.blocks.filter((b) => b.patternId !== patternId),
      }));
      return {
        ...prev,
        patterns: filtered,
        activePatternId: newActiveId,
        arrangement: updatedArrangement,
      };
    });
  }, []);

  const renamePattern = useCallback((patternId: string, name: string) => {
    setState((prev) => ({
      ...prev,
      patterns: prev.patterns.map((p) =>
        p.id === patternId ? { ...p, name } : p,
      ),
    }));
  }, []);

  const duplicatePattern = useCallback((patternId: string) => {
    setState((prev) => {
      const source = prev.patterns.find((p) => p.id === patternId);
      if (!source) return prev;
      const newPattern: Pattern = {
        ...source,
        id: `pattern-${Date.now()}-dup`,
        name: `${source.name} (copy)`,
        color: PATTERN_COLORS[prev.patterns.length % PATTERN_COLORS.length],
        stepCount: source.stepCount,
        tracks: source.tracks.map((t) => ({ ...t, steps: [...t.steps] })),
        pianoRoll: { notes: source.pianoRoll.notes.map((n) => ({ ...n })) },
      };
      return {
        ...prev,
        patterns: [...prev.patterns, newPattern],
        activePatternId: newPattern.id,
      };
    });
  }, []);

  // -----------------------------------------------------------------------
  // Track step actions (operate on active pattern)
  // -----------------------------------------------------------------------

  const toggleStep = useCallback(
    (trackId: InstrumentName, stepIndex: number) => {
      setState((prev) => ({
        ...prev,
        patterns: prev.patterns.map((pattern) =>
          pattern.id === prev.activePatternId
            ? {
                ...pattern,
                tracks: pattern.tracks.map((track) =>
                  track.id === trackId
                    ? {
                        ...track,
                        steps: track.steps.map((v, i) =>
                          i === stepIndex ? (v > 0 ? 0 : DEFAULT_VELOCITY) : v,
                        ),
                      }
                    : track,
                ),
              }
            : pattern,
        ),
      }));
    },
    [],
  );

  const setStepVelocity = useCallback(
    (trackId: InstrumentName, stepIndex: number, velocity: number) => {
      const clamped = Math.max(0, Math.min(1, velocity));
      setState((prev) => ({
        ...prev,
        patterns: prev.patterns.map((pattern) =>
          pattern.id === prev.activePatternId
            ? {
                ...pattern,
                tracks: pattern.tracks.map((track) =>
                  track.id === trackId
                    ? {
                        ...track,
                        steps: track.steps.map((v, i) =>
                          i === stepIndex ? clamped : v,
                        ),
                      }
                    : track,
                ),
              }
            : pattern,
        ),
      }));
    },
    [],
  );

  const togglePlay = useCallback(() => {
    setState((prev) => {
      const nextPlaying = !prev.isPlaying;

      if (nextPlaying) {
        audioEngine.current.resume();
      }

      return {
        ...prev,
        isPlaying: nextPlaying,
        currentStep: nextPlaying ? prev.currentStep : -1,
        currentMeasure: nextPlaying
          ? prev.playbackMode === 'song'
            ? -1
            : prev.currentMeasure
          : -1,
      };
    });
  }, []);

  const setBpm = useCallback((bpm: number) => {
    setState((prev) => ({
      ...prev,
      bpm: Math.max(40, Math.min(300, bpm)),
    }));
  }, []);

  const setTrackVolume = useCallback(
    (trackId: InstrumentName, volume: number) => {
      setState((prev) => ({
        ...prev,
        patterns: prev.patterns.map((pattern) =>
          pattern.id === prev.activePatternId
            ? {
                ...pattern,
                tracks: pattern.tracks.map((track) =>
                  track.id === trackId
                    ? { ...track, volume: Math.max(0, Math.min(1, volume)) }
                    : track,
                ),
              }
            : pattern,
        ),
      }));
    },
    [],
  );

  const toggleMute = useCallback((trackId: InstrumentName) => {
    setState((prev) => ({
      ...prev,
      patterns: prev.patterns.map((pattern) =>
        pattern.id === prev.activePatternId
          ? {
              ...pattern,
              tracks: pattern.tracks.map((track) =>
                track.id === trackId
                  ? { ...track, muted: !track.muted }
                  : track,
              ),
            }
          : pattern,
      ),
    }));
  }, []);

  const toggleSolo = useCallback((trackId: InstrumentName) => {
    setState((prev) => ({
      ...prev,
      patterns: prev.patterns.map((pattern) =>
        pattern.id === prev.activePatternId
          ? {
              ...pattern,
              tracks: pattern.tracks.map((track) =>
                track.id === trackId
                  ? { ...track, solo: !track.solo }
                  : track,
              ),
            }
          : pattern,
      ),
    }));
  }, []);

  const clearTrack = useCallback((trackId: InstrumentName) => {
    setState((prev) => ({
      ...prev,
      patterns: prev.patterns.map((pattern) =>
        pattern.id === prev.activePatternId
          ? {
              ...pattern,
              tracks: pattern.tracks.map((track) =>
                track.id === trackId
                  ? { ...track, steps: Array(pattern.stepCount).fill(0) }
                  : track,
              ),
            }
          : pattern,
      ),
    }));
  }, []);

  const clearAll = useCallback(() => {
    setState((prev) => ({
      ...prev,
      isPlaying: false,
      currentStep: -1,
      currentMeasure: -1,
      patterns: prev.patterns.map((pattern) =>
        pattern.id === prev.activePatternId
          ? {
              ...pattern,
              tracks: pattern.tracks.map((track) => ({
                ...track,
                steps: Array(pattern.stepCount).fill(0),
              })),
            }
          : pattern,
      ),
    }));
  }, []);

  const setPatternStepCount = useCallback((stepCount: number) => {
    const clamped = Math.max(1, Math.min(64, stepCount));
    setState((prev) => ({
      ...prev,
      patterns: prev.patterns.map((pattern) => {
        if (pattern.id !== prev.activePatternId) return pattern;
        const oldCount = pattern.stepCount;
        if (clamped === oldCount) return pattern;
        return {
          ...pattern,
          stepCount: clamped,
          tracks: pattern.tracks.map((track) => {
            if (clamped > oldCount) {
              // Extend: pad with 0 (off)
              return {
                ...track,
                steps: [...track.steps, ...Array(clamped - oldCount).fill(0)],
              };
            }
            // Shrink: truncate
            return { ...track, steps: track.steps.slice(0, clamped) };
          }),
          pianoRoll: {
            // Remove notes beyond the new step count
            notes: pattern.pianoRoll.notes.filter((n) => n.step < clamped),
          },
        };
      }),
    }));
  }, []);

  // -----------------------------------------------------------------------
  // Piano roll actions
  // -----------------------------------------------------------------------

  const togglePianoNote = useCallback((pitch: number, step: number) => {
    setState((prev) => ({
      ...prev,
      patterns: prev.patterns.map((pattern) => {
        if (pattern.id !== prev.activePatternId) return pattern;
        const existing = pattern.pianoRoll.notes.find(
          (n) => n.pitch === pitch && n.step === step,
        );
        if (existing) {
          return {
            ...pattern,
            pianoRoll: {
              notes: pattern.pianoRoll.notes.filter((n) => n.id !== existing.id),
            },
          };
        }
        const newNote: PianoNote = {
          id: `note-${Date.now()}-${pitch}-${step}`,
          pitch,
          step,
          duration: 1,
          velocity: 0.8,
        };
        return {
          ...pattern,
          pianoRoll: {
            notes: [...pattern.pianoRoll.notes, newNote],
          },
        };
      }),
    }));
  }, []);

  const previewPianoNote = useCallback((pitch: number) => {
    audioEngine.current.playPianoNote(pitch, 0.5, 0.3);
  }, []);

  const clearPianoRoll = useCallback(() => {
    setState((prev) => ({
      ...prev,
      patterns: prev.patterns.map((pattern) =>
        pattern.id === prev.activePatternId
          ? { ...pattern, pianoRoll: { notes: [] } }
          : pattern,
      ),
    }));
  }, []);

  // -----------------------------------------------------------------------
  // Arrangement actions
  // -----------------------------------------------------------------------

  const toggleArrangementBlock = useCallback(
    (arrTrackId: string, measure: number, patternId: string) => {
      setState((prev) => ({
        ...prev,
        arrangement: prev.arrangement.map((arrTrack) => {
          if (arrTrack.id !== arrTrackId) return arrTrack;

          const existingIndex = arrTrack.blocks.findIndex(
            (b) => b.startMeasure === measure,
          );

          if (existingIndex !== -1) {
            // If it's the same pattern, remove the block
            if (arrTrack.blocks[existingIndex].patternId === patternId) {
              return {
                ...arrTrack,
                blocks: arrTrack.blocks.filter((_, i) => i !== existingIndex),
              };
            }
            // Different pattern - replace
            return {
              ...arrTrack,
              blocks: arrTrack.blocks.map((b, i) =>
                i === existingIndex ? { ...b, patternId } : b,
              ),
            };
          }

          // Add new block
          const newBlock: ArrangementBlock = { patternId, startMeasure: measure };
          return {
            ...arrTrack,
            blocks: [...arrTrack.blocks, newBlock],
          };
        }),
      }));
    },
    [],
  );

  const toggleArrangementTrackMute = useCallback((arrTrackId: string) => {
    setState((prev) => ({
      ...prev,
      arrangement: prev.arrangement.map((arrTrack) =>
        arrTrack.id === arrTrackId
          ? { ...arrTrack, muted: !arrTrack.muted }
          : arrTrack,
      ),
    }));
  }, []);

  const addArrangementTrack = useCallback(() => {
    setState((prev) => {
      const newTrack: ArrangementTrack = {
        id: `arr-track-${Date.now()}`,
        name: `Track ${prev.arrangement.length + 1}`,
        blocks: [],
        muted: false,
      };
      return {
        ...prev,
        arrangement: [...prev.arrangement, newTrack],
      };
    });
  }, []);

  const removeArrangementTrack = useCallback((arrTrackId: string) => {
    setState((prev) => {
      if (prev.arrangement.length <= 1) return prev;
      return {
        ...prev,
        arrangement: prev.arrangement.filter((t) => t.id !== arrTrackId),
      };
    });
  }, []);

  const setArrangementLength = useCallback((length: number) => {
    setState((prev) => ({
      ...prev,
      arrangementLength: Math.max(4, Math.min(64, length)),
    }));
  }, []);

  const setPlaybackMode = useCallback((mode: PlaybackMode) => {
    setState((prev) => ({
      ...prev,
      playbackMode: mode,
      isPlaying: false,
      currentStep: -1,
      currentMeasure: -1,
    }));
  }, []);

  // Derive active pattern tracks for component consumption
  const activePattern = getActivePattern(state);
  const tracks = activePattern?.tracks ?? [];

  return {
    state,
    tracks,
    activePattern,
    toggleStep,
    setStepVelocity,
    togglePlay,
    setBpm,
    setTrackVolume,
    toggleMute,
    toggleSolo,
    clearTrack,
    clearAll,
    addPattern,
    selectPattern,
    deletePattern,
    renamePattern,
    duplicatePattern,
    togglePianoNote,
    previewPianoNote,
    clearPianoRoll,
    toggleArrangementBlock,
    toggleArrangementTrackMute,
    addArrangementTrack,
    removeArrangementTrack,
    setArrangementLength,
    setPlaybackMode,
    setPatternStepCount,
  };
}

export default useSequencer;
