import { useState, useRef, useEffect, useCallback } from 'react';
import type {
  InstrumentName,
  Track,
  SampleTrack,
  SampleInstrument,
  SamplePlaybackMode,
  Pattern,
  ArrangementTrack,
  ArrangementBlock,
  PlaybackMode,
  SequencerState,
  PianoNote,
  ReverbSettings,
  DelaySettings,
  FilterSettings,
  SynthSettings,
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

const DEFAULT_SYNTH_SETTINGS: SynthSettings = {
  oscType: 'sawtooth',
  oscOctave: 0,
  osc2Type: 'sawtooth',
  osc2Detune: 7,
  osc2Octave: 0,
  osc2Mix: 0.5,
  osc3Type: 'square',
  osc3Detune: 0,
  osc3Octave: -1,
  osc3Enabled: false,
  osc3Mix: 0.3,
  filterCutoff: 8000,
  filterResonance: 1,
  ampAttack: 0.005,
  ampDecay: 0.05,
  ampSustain: 0.7,
  ampRelease: 0.15,
  filterEnvAttack: 0.005,
  filterEnvDecay: 0.3,
  filterEnvSustain: 0,
  filterEnvRelease: 0.15,
  filterEnvAmount: 0,
};

function createDefaultTracks(stepCount: number = DEFAULT_STEP_COUNT): Track[] {
  return [
    { id: 'kick', name: 'Kick', steps: Array(stepCount).fill(0), pitches: Array(stepCount).fill(0), volume: 0.8, pan: 0, muted: false, solo: false, reverbSend: 0, delaySend: 0, filterSend: 0 },
    { id: 'snare', name: 'Snare', steps: Array(stepCount).fill(0), pitches: Array(stepCount).fill(0), volume: 0.8, pan: 0, muted: false, solo: false, reverbSend: 0, delaySend: 0, filterSend: 0 },
    { id: 'hihat', name: 'Hi-Hat', steps: Array(stepCount).fill(0), pitches: Array(stepCount).fill(0), volume: 0.8, pan: 0, muted: false, solo: false, reverbSend: 0, delaySend: 0, filterSend: 0 },
    { id: 'clap', name: 'Clap', steps: Array(stepCount).fill(0), pitches: Array(stepCount).fill(0), volume: 0.8, pan: 0, muted: false, solo: false, reverbSend: 0, delaySend: 0, filterSend: 0 },
    { id: 'openhat', name: 'Open Hat', steps: Array(stepCount).fill(0), pitches: Array(stepCount).fill(0), volume: 0.8, pan: 0, muted: false, solo: false, reverbSend: 0, delaySend: 0, filterSend: 0 },
    { id: 'percussion', name: 'Percussion', steps: Array(stepCount).fill(0), pitches: Array(stepCount).fill(0), volume: 0.8, pan: 0, muted: false, solo: false, reverbSend: 0, delaySend: 0, filterSend: 0 },
  ];
}

function createPattern(index: number): Pattern {
  return {
    id: `pattern-${Date.now()}-${index}`,
    name: `Pattern ${index + 1}`,
    color: PATTERN_COLORS[index % PATTERN_COLORS.length],
    stepCount: DEFAULT_STEP_COUNT,
    tracks: createDefaultTracks(),
    sampleTracks: [],
    pianoRoll: { notes: [] },
    synthSettings: { ...DEFAULT_SYNTH_SETTINGS },
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
  samples: [],
  arrangement: DEFAULT_ARRANGEMENT_TRACKS,
  arrangementLength: 16,
  bpm: 120,
  currentStep: -1,
  isPlaying: false,
  totalSteps: DEFAULT_STEP_COUNT,
  playbackMode: 'pattern',
  currentMeasure: -1,
  masterVolume: 0.8,
  masterReverb: { send: 0, decay: 2, preDelay: 0.01, damping: 0.3 },
  masterDelay: { send: 0, sync: '1/8' as const, feedback: 0.4, mix: 0.7 },
  masterFilter: { send: 0, type: 'lowpass' as const, cutoff: 2000, resonance: 1 },
  loopStart: null,
  loopEnd: null,
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
                const pitchOffset = track.pitches?.[nextStep] ?? 0;
                audioEngine.current.playSound(track.id, track.volume * stepVelocity, pitchOffset);
              }
            }

            // Play sample tracks at this step
            const anySampleSoloed = pattern.sampleTracks.some((t) => t.solo);
            for (const sTrack of pattern.sampleTracks) {
              const stepVelocity = sTrack.steps[nextStep];
              if (stepVelocity <= 0) continue;
              const effectivelyMuted =
                sTrack.muted || (anySampleSoloed && !sTrack.solo);
              if (!effectivelyMuted && sTrack.sampleId) {
                const sample = current.samples.find((s) => s.id === sTrack.sampleId);
                if (sample) {
                  const pitchOffset = sTrack.pitches?.[nextStep] ?? 0;
                  audioEngine.current.playSample(sample.url, sTrack.id, sTrack.volume * stepVelocity, pitchOffset, sTrack.playbackMode === 'loop');
                }
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
                  pattern.synthSettings,
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

              const hasLoop = prev.loopStart !== null && prev.loopEnd !== null;
              const loopEnd = hasLoop ? prev.loopEnd! : prev.arrangementLength;

              if (nextMeasure >= loopEnd) {
                if (hasLoop) {
                  // Loop back to loop start
                  nextMeasure = prev.loopStart!;
                } else {
                  // Song finished - stop playback
                  return {
                    ...prev,
                    isPlaying: false,
                    currentStep: -1,
                    currentMeasure: -1,
                  };
                }
              }
            }

            // Find all patterns playing at this measure
            for (const arrTrack of current.arrangement) {
              if (arrTrack.muted) continue;

              for (const block of arrTrack.blocks) {
                const blockEnd = block.startMeasure + (block.duration ?? 1);
                if (nextMeasure >= block.startMeasure && nextMeasure < blockEnd) {
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
                      const pitchOffset = track.pitches?.[nextStep] ?? 0;
                      audioEngine.current.playSound(track.id, track.volume * stepVelocity, pitchOffset);
                    }
                  }

                  // Play sample tracks in song mode
                  const anySampleSoloed2 = pattern.sampleTracks.some((t) => t.solo);
                  for (const sTrack of pattern.sampleTracks) {
                    const sVelocity = sTrack.steps[nextStep];
                    if (sVelocity <= 0) continue;
                    const sEffectivelyMuted =
                      sTrack.muted || (anySampleSoloed2 && !sTrack.solo);
                    if (!sEffectivelyMuted && sTrack.sampleId) {
                      const sample = current.samples.find((s) => s.id === sTrack.sampleId);
                      if (sample) {
                        const sPitchOffset = sTrack.pitches?.[nextStep] ?? 0;
                        audioEngine.current.playSample(sample.url, sTrack.id, sTrack.volume * sVelocity, sPitchOffset, sTrack.playbackMode === 'loop');
                      }
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
                        pattern.synthSettings,
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
        tracks: source.tracks.map((t) => ({ ...t, steps: [...t.steps], pitches: [...t.pitches] })),
        sampleTracks: source.sampleTracks.map((t) => ({ ...t, steps: [...t.steps], pitches: [...t.pitches] })),
        pianoRoll: { notes: source.pianoRoll.notes.map((n) => ({ ...n })) },
        synthSettings: { ...source.synthSettings },
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

  const setStepPitch = useCallback(
    (trackId: InstrumentName, stepIndex: number, pitch: number) => {
      const clamped = Math.round(Math.max(-12, Math.min(12, pitch)));
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
                        pitches: track.pitches.map((p, i) =>
                          i === stepIndex ? clamped : p,
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
      } else {
        // Stop all looping/active samples when playback stops
        audioEngine.current.stopAllSamples();
      }

      const songStart = prev.playbackMode === 'song'
        ? (prev.loopStart !== null ? prev.loopStart - 1 : -1)
        : prev.currentMeasure;

      return {
        ...prev,
        isPlaying: nextPlaying,
        currentStep: nextPlaying ? prev.currentStep : -1,
        currentMeasure: nextPlaying ? songStart : -1,
      };
    });
  }, []);

  const setBpm = useCallback((bpm: number) => {
    const clamped = Math.max(40, Math.min(300, bpm));
    setState((prev) => {
      audioEngine.current.setDelayBpm(clamped, prev.masterDelay.sync);
      return { ...prev, bpm: clamped };
    });
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

  const setTrackPan = useCallback(
    (trackId: InstrumentName, pan: number) => {
      const clamped = Math.max(-1, Math.min(1, pan));
      audioEngine.current.setChannelPan(trackId, clamped);
      setState((prev) => ({
        ...prev,
        patterns: prev.patterns.map((pattern) =>
          pattern.id === prev.activePatternId
            ? {
                ...pattern,
                tracks: pattern.tracks.map((track) =>
                  track.id === trackId
                    ? { ...track, pan: clamped }
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
                  ? { ...track, steps: Array(pattern.stepCount).fill(0), pitches: Array(pattern.stepCount).fill(0) }
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
                pitches: Array(pattern.stepCount).fill(0),
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
              return {
                ...track,
                steps: [...track.steps, ...Array(clamped - oldCount).fill(0)],
                pitches: [...track.pitches, ...Array(clamped - oldCount).fill(0)],
              };
            }
            return {
              ...track,
              steps: track.steps.slice(0, clamped),
              pitches: track.pitches.slice(0, clamped),
            };
          }),
          sampleTracks: pattern.sampleTracks.map((track) => {
            if (clamped > oldCount) {
              return {
                ...track,
                steps: [...track.steps, ...Array(clamped - oldCount).fill(0)],
                pitches: [...track.pitches, ...Array(clamped - oldCount).fill(0)],
              };
            }
            return {
              ...track,
              steps: track.steps.slice(0, clamped),
              pitches: track.pitches.slice(0, clamped),
            };
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

  const addPianoNote = useCallback((pitch: number, step: number, duration: number = 1) => {
    setState((prev) => ({
      ...prev,
      patterns: prev.patterns.map((pattern) => {
        if (pattern.id !== prev.activePatternId) return pattern;
        // Remove any existing notes that overlap with the new note's range
        const newEnd = step + duration;
        const filtered = pattern.pianoRoll.notes.filter(
          (n) => n.pitch !== pitch || n.step + n.duration <= step || n.step >= newEnd,
        );
        const newNote: PianoNote = {
          id: `note-${Date.now()}-${pitch}-${step}`,
          pitch,
          step,
          duration,
          velocity: 0.8,
        };
        return {
          ...pattern,
          pianoRoll: {
            notes: [...filtered, newNote],
          },
        };
      }),
    }));
  }, []);

  const deletePianoNote = useCallback((noteId: string) => {
    setState((prev) => ({
      ...prev,
      patterns: prev.patterns.map((pattern) => {
        if (pattern.id !== prev.activePatternId) return pattern;
        return {
          ...pattern,
          pianoRoll: {
            notes: pattern.pianoRoll.notes.filter((n) => n.id !== noteId),
          },
        };
      }),
    }));
  }, []);

  const previewPianoNote = useCallback((pitch: number) => {
    const pattern = stateRef.current.patterns.find(
      (p) => p.id === stateRef.current.activePatternId,
    );
    audioEngine.current.playPianoNote(pitch, 0.5, 0.3, pattern?.synthSettings);
  }, []);

  const updatePianoNote = useCallback((noteId: string, updates: { step?: number; duration?: number }) => {
    setState((prev) => ({
      ...prev,
      patterns: prev.patterns.map((pattern) => {
        if (pattern.id !== prev.activePatternId) return pattern;
        return {
          ...pattern,
          pianoRoll: {
            notes: pattern.pianoRoll.notes.map((n) =>
              n.id === noteId ? { ...n, ...updates } : n,
            ),
          },
        };
      }),
    }));
  }, []);

  const movePianoNotes = useCallback((noteIds: Set<string>, stepDelta: number, pitchDelta: number) => {
    setState((prev) => ({
      ...prev,
      patterns: prev.patterns.map((pattern) => {
        if (pattern.id !== prev.activePatternId) return pattern;
        return {
          ...pattern,
          pianoRoll: {
            notes: pattern.pianoRoll.notes.map((n) => {
              if (!noteIds.has(n.id)) return n;
              const newStep = n.step + stepDelta;
              const newPitch = n.pitch + pitchDelta;
              // Clamp: don't move out of bounds
              if (newStep < 0 || newStep + n.duration > pattern.stepCount) return n;
              if (newPitch < 36 || newPitch > 83) return n;
              return { ...n, step: newStep, pitch: newPitch };
            }),
          },
        };
      }),
    }));
  }, []);

  const pastePianoNotes = useCallback((notes: Omit<PianoNote, 'id'>[]) => {
    setState((prev) => ({
      ...prev,
      patterns: prev.patterns.map((pattern) => {
        if (pattern.id !== prev.activePatternId) return pattern;
        // Filter out notes that fall outside bounds
        const valid = notes.filter(
          (n) => n.step >= 0 && n.step + n.duration <= pattern.stepCount && n.pitch >= 36 && n.pitch <= 83,
        );
        if (valid.length === 0) return pattern;
        const newNotes = valid.map((n, i) => ({
          ...n,
          id: `note-${Date.now()}-${i}-${n.pitch}-${n.step}`,
        }));
        return {
          ...pattern,
          pianoRoll: {
            notes: [...pattern.pianoRoll.notes, ...newNotes],
          },
        };
      }),
    }));
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
          const newBlock: ArrangementBlock = { patternId, startMeasure: measure, duration: 1 };
          return {
            ...arrTrack,
            blocks: [...arrTrack.blocks, newBlock],
          };
        }),
      }));
    },
    [],
  );

  const placeArrangementBlock = useCallback(
    (arrTrackId: string, measure: number, patternId: string) => {
      setState((prev) => ({
        ...prev,
        arrangement: prev.arrangement.map((arrTrack) => {
          if (arrTrack.id !== arrTrackId) return arrTrack;

          const existingIndex = arrTrack.blocks.findIndex(
            (b) => b.startMeasure === measure,
          );

          if (existingIndex !== -1) {
            // Replace existing block
            return {
              ...arrTrack,
              blocks: arrTrack.blocks.map((b, i) =>
                i === existingIndex ? { ...b, patternId } : b,
              ),
            };
          }

          // Add new block
          const newBlock: ArrangementBlock = { patternId, startMeasure: measure, duration: 1 };
          return {
            ...arrTrack,
            blocks: [...arrTrack.blocks, newBlock],
          };
        }),
      }));
    },
    [],
  );

  const resizeArrangementBlock = useCallback(
    (arrTrackId: string, startMeasure: number, newDuration: number) => {
      setState((prev) => ({
        ...prev,
        arrangement: prev.arrangement.map((arrTrack) => {
          if (arrTrack.id !== arrTrackId) return arrTrack;
          return {
            ...arrTrack,
            blocks: arrTrack.blocks.map((b) =>
              b.startMeasure === startMeasure
                ? { ...b, duration: Math.max(1, newDuration) }
                : b,
            ),
          };
        }),
      }));
    },
    [],
  );

  const moveArrangementBlock = useCallback(
    (
      fromTrackId: string,
      fromStartMeasure: number,
      toTrackId: string,
      toStartMeasure: number,
    ) => {
      if (fromTrackId === toTrackId && fromStartMeasure === toStartMeasure) return;
      setState((prev) => {
        // Find the source block
        const srcTrack = prev.arrangement.find((t) => t.id === fromTrackId);
        const block = srcTrack?.blocks.find((b) => b.startMeasure === fromStartMeasure);
        if (!block) return prev;

        const movedBlock: ArrangementBlock = {
          ...block,
          startMeasure: toStartMeasure,
        };

        return {
          ...prev,
          arrangement: prev.arrangement.map((arrTrack) => {
            if (arrTrack.id === fromTrackId && arrTrack.id === toTrackId) {
              // Same track: remove old, add new
              return {
                ...arrTrack,
                blocks: [
                  ...arrTrack.blocks.filter((b) => b.startMeasure !== fromStartMeasure),
                  movedBlock,
                ],
              };
            }
            if (arrTrack.id === fromTrackId) {
              // Remove from source track
              return {
                ...arrTrack,
                blocks: arrTrack.blocks.filter((b) => b.startMeasure !== fromStartMeasure),
              };
            }
            if (arrTrack.id === toTrackId) {
              // Add to destination track
              return {
                ...arrTrack,
                blocks: [...arrTrack.blocks, movedBlock],
              };
            }
            return arrTrack;
          }),
        };
      });
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

  const setLoopStart = useCallback((measure: number | null) => {
    setState((prev) => ({
      ...prev,
      loopStart: measure,
      // Clear loop end if start is cleared or end is before/equal to start
      loopEnd: measure === null ? null
        : (prev.loopEnd !== null && prev.loopEnd > measure ? prev.loopEnd : null),
    }));
  }, []);

  const setLoopEnd = useCallback((measure: number | null) => {
    setState((prev) => ({
      ...prev,
      loopEnd: measure,
      // Clear loop start if end is cleared or start is after/equal to end
      loopStart: measure === null ? null
        : (prev.loopStart !== null && prev.loopStart < measure ? prev.loopStart : null),
    }));
  }, []);

  const setLoopMarkers = useCallback((start: number | null, end: number | null) => {
    setState((prev) => ({
      ...prev,
      loopStart: start,
      loopEnd: end !== null && start !== null && end > start ? end : null,
    }));
  }, []);

  const clearLoopMarkers = useCallback(() => {
    setState((prev) => ({
      ...prev,
      loopStart: null,
      loopEnd: null,
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

  const setMasterVolume = useCallback((volume: number) => {
    const clamped = Math.max(0, Math.min(1, volume));
    audioEngine.current.setMasterVolume(clamped);
    setState((prev) => ({ ...prev, masterVolume: clamped }));
  }, []);

  const setTrackReverbSend = useCallback(
    (trackId: InstrumentName, send: number) => {
      const clamped = Math.max(0, Math.min(1, send));
      audioEngine.current.setChannelReverbSend(trackId, clamped);
      setState((prev) => ({
        ...prev,
        patterns: prev.patterns.map((pattern) =>
          pattern.id === prev.activePatternId
            ? {
                ...pattern,
                tracks: pattern.tracks.map((track) =>
                  track.id === trackId
                    ? { ...track, reverbSend: clamped }
                    : track,
                ),
              }
            : pattern,
        ),
      }));
    },
    [],
  );

  const setMasterReverb = useCallback((params: Partial<ReverbSettings>) => {
    audioEngine.current.setReverbParams(params);
    setState((prev) => ({
      ...prev,
      masterReverb: { ...prev.masterReverb, ...params },
    }));
  }, []);

  const setTrackDelaySend = useCallback(
    (trackId: InstrumentName, send: number) => {
      const clamped = Math.max(0, Math.min(1, send));
      audioEngine.current.setChannelDelaySend(trackId, clamped);
      setState((prev) => ({
        ...prev,
        patterns: prev.patterns.map((pattern) =>
          pattern.id === prev.activePatternId
            ? {
                ...pattern,
                tracks: pattern.tracks.map((track) =>
                  track.id === trackId
                    ? { ...track, delaySend: clamped }
                    : track,
                ),
              }
            : pattern,
        ),
      }));
    },
    [],
  );

  const setMasterDelay = useCallback((params: Partial<DelaySettings>) => {
    audioEngine.current.setDelayParams(params);
    setState((prev) => ({
      ...prev,
      masterDelay: { ...prev.masterDelay, ...params },
    }));
  }, []);

  const setTrackFilterSend = useCallback(
    (trackId: InstrumentName, send: number) => {
      const clamped = Math.max(0, Math.min(1, send));
      audioEngine.current.setChannelFilterSend(trackId, clamped);
      setState((prev) => ({
        ...prev,
        patterns: prev.patterns.map((pattern) =>
          pattern.id === prev.activePatternId
            ? {
                ...pattern,
                tracks: pattern.tracks.map((track) =>
                  track.id === trackId
                    ? { ...track, filterSend: clamped }
                    : track,
                ),
              }
            : pattern,
        ),
      }));
    },
    [],
  );

  const setMasterFilter = useCallback((params: Partial<FilterSettings>) => {
    audioEngine.current.setFilterParams(params);
    setState((prev) => ({
      ...prev,
      masterFilter: { ...prev.masterFilter, ...params },
    }));
  }, []);

  // -----------------------------------------------------------------------
  // Sample management
  // -----------------------------------------------------------------------

  const loadSample = useCallback(async (file: File): Promise<SampleInstrument | null> => {
    const url = URL.createObjectURL(file);
    try {
      await audioEngine.current.loadSample(url);
    } catch {
      URL.revokeObjectURL(url);
      return null;
    }
    const sample: SampleInstrument = {
      id: `sample-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name: file.name.replace(/\.[^.]+$/, ''),
      url,
      fileName: file.name,
    };
    setState((prev) => ({
      ...prev,
      samples: [...prev.samples, sample],
    }));
    return sample;
  }, []);

  const previewSample = useCallback(async (file: File): Promise<void> => {
    await audioEngine.current.previewSample(file);
  }, []);

  const stopPreview = useCallback((): void => {
    audioEngine.current.stopPreview();
  }, []);

  const removeSampleInstrument = useCallback((sampleId: string) => {
    setState((prev) => {
      const sample = prev.samples.find((s) => s.id === sampleId);
      if (sample) {
        audioEngine.current.removeSample(sample.url);
        URL.revokeObjectURL(sample.url);
      }
      return {
        ...prev,
        samples: prev.samples.filter((s) => s.id !== sampleId),
        // Clear any sample track references to this sample
        patterns: prev.patterns.map((pattern) => ({
          ...pattern,
          sampleTracks: pattern.sampleTracks.map((t) =>
            t.sampleId === sampleId ? { ...t, sampleId: null } : t,
          ),
        })),
      };
    });
  }, []);

  const addSampleTrack = useCallback(() => {
    setState((prev) => {
      const pattern = prev.patterns.find((p) => p.id === prev.activePatternId);
      if (!pattern) return prev;
      const trackId = `strack-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      audioEngine.current.ensureSampleChannel(trackId);
      const newTrack: SampleTrack = {
        id: trackId,
        name: `Sample ${pattern.sampleTracks.length + 1}`,
        sampleId: null,
        playbackMode: 'oneshot',
        steps: Array(pattern.stepCount).fill(0),
        pitches: Array(pattern.stepCount).fill(0),
        volume: 0.8,
        pan: 0,
        muted: false,
        solo: false,
        reverbSend: 0,
        delaySend: 0,
        filterSend: 0,
      };
      return {
        ...prev,
        patterns: prev.patterns.map((p) =>
          p.id === prev.activePatternId
            ? { ...p, sampleTracks: [...p.sampleTracks, newTrack] }
            : p,
        ),
      };
    });
  }, []);

  const removeSampleTrack = useCallback((trackId: string) => {
    audioEngine.current.removeSampleChannel(trackId);
    setState((prev) => ({
      ...prev,
      patterns: prev.patterns.map((pattern) =>
        pattern.id === prev.activePatternId
          ? { ...pattern, sampleTracks: pattern.sampleTracks.filter((t) => t.id !== trackId) }
          : pattern,
      ),
    }));
  }, []);

  const setSampleTrackSample = useCallback((trackId: string, sampleId: string | null) => {
    setState((prev) => ({
      ...prev,
      patterns: prev.patterns.map((pattern) =>
        pattern.id === prev.activePatternId
          ? {
              ...pattern,
              sampleTracks: pattern.sampleTracks.map((t) =>
                t.id === trackId ? { ...t, sampleId } : t,
              ),
            }
          : pattern,
      ),
    }));
  }, []);

  const toggleSampleStep = useCallback((trackId: string, stepIndex: number) => {
    setState((prev) => ({
      ...prev,
      patterns: prev.patterns.map((pattern) =>
        pattern.id === prev.activePatternId
          ? {
              ...pattern,
              sampleTracks: pattern.sampleTracks.map((track) =>
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
  }, []);

  const setSampleStepVelocity = useCallback(
    (trackId: string, stepIndex: number, velocity: number) => {
      const clamped = Math.max(0, Math.min(1, velocity));
      setState((prev) => ({
        ...prev,
        patterns: prev.patterns.map((pattern) =>
          pattern.id === prev.activePatternId
            ? {
                ...pattern,
                sampleTracks: pattern.sampleTracks.map((track) =>
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

  const setSampleStepPitch = useCallback(
    (trackId: string, stepIndex: number, pitch: number) => {
      const clamped = Math.round(Math.max(-12, Math.min(12, pitch)));
      setState((prev) => ({
        ...prev,
        patterns: prev.patterns.map((pattern) =>
          pattern.id === prev.activePatternId
            ? {
                ...pattern,
                sampleTracks: pattern.sampleTracks.map((track) =>
                  track.id === trackId
                    ? {
                        ...track,
                        pitches: track.pitches.map((p, i) =>
                          i === stepIndex ? clamped : p,
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

  const setSampleTrackPlaybackMode = useCallback((trackId: string, mode: SamplePlaybackMode) => {
    // If switching away from loop, stop any active looping source
    if (mode === 'oneshot') {
      audioEngine.current.stopSample(trackId);
    }
    setState((prev) => ({
      ...prev,
      patterns: prev.patterns.map((pattern) =>
        pattern.id === prev.activePatternId
          ? {
              ...pattern,
              sampleTracks: pattern.sampleTracks.map((track) =>
                track.id === trackId ? { ...track, playbackMode: mode } : track,
              ),
            }
          : pattern,
      ),
    }));
  }, []);

  const setSampleTrackVolume = useCallback((trackId: string, volume: number) => {
    setState((prev) => ({
      ...prev,
      patterns: prev.patterns.map((pattern) =>
        pattern.id === prev.activePatternId
          ? {
              ...pattern,
              sampleTracks: pattern.sampleTracks.map((track) =>
                track.id === trackId
                  ? { ...track, volume: Math.max(0, Math.min(1, volume)) }
                  : track,
              ),
            }
          : pattern,
      ),
    }));
  }, []);

  const setSampleTrackPan = useCallback((trackId: string, pan: number) => {
    const clamped = Math.max(-1, Math.min(1, pan));
    audioEngine.current.setSampleChannelPan(trackId, clamped);
    setState((prev) => ({
      ...prev,
      patterns: prev.patterns.map((pattern) =>
        pattern.id === prev.activePatternId
          ? {
              ...pattern,
              sampleTracks: pattern.sampleTracks.map((track) =>
                track.id === trackId ? { ...track, pan: clamped } : track,
              ),
            }
          : pattern,
      ),
    }));
  }, []);

  const toggleSampleMute = useCallback((trackId: string) => {
    setState((prev) => ({
      ...prev,
      patterns: prev.patterns.map((pattern) =>
        pattern.id === prev.activePatternId
          ? {
              ...pattern,
              sampleTracks: pattern.sampleTracks.map((track) =>
                track.id === trackId ? { ...track, muted: !track.muted } : track,
              ),
            }
          : pattern,
      ),
    }));
  }, []);

  const toggleSampleSolo = useCallback((trackId: string) => {
    setState((prev) => ({
      ...prev,
      patterns: prev.patterns.map((pattern) =>
        pattern.id === prev.activePatternId
          ? {
              ...pattern,
              sampleTracks: pattern.sampleTracks.map((track) =>
                track.id === trackId ? { ...track, solo: !track.solo } : track,
              ),
            }
          : pattern,
      ),
    }));
  }, []);

  const clearSampleTrack = useCallback((trackId: string) => {
    setState((prev) => ({
      ...prev,
      patterns: prev.patterns.map((pattern) =>
        pattern.id === prev.activePatternId
          ? {
              ...pattern,
              sampleTracks: pattern.sampleTracks.map((track) =>
                track.id === trackId
                  ? { ...track, steps: Array(pattern.stepCount).fill(0), pitches: Array(pattern.stepCount).fill(0) }
                  : track,
              ),
            }
          : pattern,
      ),
    }));
  }, []);

  const setSampleTrackReverbSend = useCallback((trackId: string, send: number) => {
    const clamped = Math.max(0, Math.min(1, send));
    audioEngine.current.setSampleChannelReverbSend(trackId, clamped);
    setState((prev) => ({
      ...prev,
      patterns: prev.patterns.map((pattern) =>
        pattern.id === prev.activePatternId
          ? {
              ...pattern,
              sampleTracks: pattern.sampleTracks.map((track) =>
                track.id === trackId ? { ...track, reverbSend: clamped } : track,
              ),
            }
          : pattern,
      ),
    }));
  }, []);

  const setSampleTrackDelaySend = useCallback((trackId: string, send: number) => {
    const clamped = Math.max(0, Math.min(1, send));
    audioEngine.current.setSampleChannelDelaySend(trackId, clamped);
    setState((prev) => ({
      ...prev,
      patterns: prev.patterns.map((pattern) =>
        pattern.id === prev.activePatternId
          ? {
              ...pattern,
              sampleTracks: pattern.sampleTracks.map((track) =>
                track.id === trackId ? { ...track, delaySend: clamped } : track,
              ),
            }
          : pattern,
      ),
    }));
  }, []);

  const setSampleTrackFilterSend = useCallback((trackId: string, send: number) => {
    const clamped = Math.max(0, Math.min(1, send));
    audioEngine.current.setSampleChannelFilterSend(trackId, clamped);
    setState((prev) => ({
      ...prev,
      patterns: prev.patterns.map((pattern) =>
        pattern.id === prev.activePatternId
          ? {
              ...pattern,
              sampleTracks: pattern.sampleTracks.map((track) =>
                track.id === trackId ? { ...track, filterSend: clamped } : track,
              ),
            }
          : pattern,
      ),
    }));
  }, []);

  const setSynthSettings = useCallback((params: Partial<SynthSettings>) => {
    setState((prev) => ({
      ...prev,
      patterns: prev.patterns.map((pattern) =>
        pattern.id === prev.activePatternId
          ? { ...pattern, synthSettings: { ...pattern.synthSettings, ...params } }
          : pattern,
      ),
    }));
  }, []);

  // Derive active pattern tracks for component consumption
  const activePattern = getActivePattern(state);
  const tracks = activePattern?.tracks ?? [];
  const sampleTracks = activePattern?.sampleTracks ?? [];

  return {
    state,
    tracks,
    sampleTracks,
    activePattern,
    audioEngine: audioEngine.current,
    toggleStep,
    setStepVelocity,
    setStepPitch,
    togglePlay,
    setBpm,
    setTrackVolume,
    setTrackPan,
    toggleMute,
    toggleSolo,
    clearTrack,
    clearAll,
    addPattern,
    selectPattern,
    deletePattern,
    renamePattern,
    duplicatePattern,
    addPianoNote,
    deletePianoNote,
    updatePianoNote,
    previewPianoNote,
    movePianoNotes,
    pastePianoNotes,
    clearPianoRoll,
    toggleArrangementBlock,
    placeArrangementBlock,
    resizeArrangementBlock,
    moveArrangementBlock,
    toggleArrangementTrackMute,
    addArrangementTrack,
    removeArrangementTrack,
    setArrangementLength,
    setPlaybackMode,
    setLoopStart,
    setLoopEnd,
    setLoopMarkers,
    clearLoopMarkers,
    setPatternStepCount,
    setMasterVolume,
    setTrackReverbSend,
    setMasterReverb,
    setTrackDelaySend,
    setMasterDelay,
    setTrackFilterSend,
    setMasterFilter,
    setSynthSettings,
    // Sample management
    loadSample,
    previewSample,
    stopPreview,
    removeSampleInstrument,
    addSampleTrack,
    removeSampleTrack,
    setSampleTrackSample,
    setSampleTrackPlaybackMode,
    toggleSampleStep,
    setSampleStepVelocity,
    setSampleStepPitch,
    setSampleTrackVolume,
    setSampleTrackPan,
    toggleSampleMute,
    toggleSampleSolo,
    clearSampleTrack,
    setSampleTrackReverbSend,
    setSampleTrackDelaySend,
    setSampleTrackFilterSend,
  };
}

export default useSequencer;
