import { useState, useRef, useEffect, useCallback } from 'react';
import type { InstrumentName, Track, SequencerState } from '../types';
import AudioEngine from '../audio/AudioEngine';

const TOTAL_STEPS = 16;

const DEFAULT_TRACKS: Track[] = [
  { id: 'kick', name: 'Kick', steps: Array(TOTAL_STEPS).fill(false), volume: 0.8, muted: false, solo: false },
  { id: 'snare', name: 'Snare', steps: Array(TOTAL_STEPS).fill(false), volume: 0.8, muted: false, solo: false },
  { id: 'hihat', name: 'Hi-Hat', steps: Array(TOTAL_STEPS).fill(false), volume: 0.8, muted: false, solo: false },
  { id: 'clap', name: 'Clap', steps: Array(TOTAL_STEPS).fill(false), volume: 0.8, muted: false, solo: false },
  { id: 'openhat', name: 'Open Hat', steps: Array(TOTAL_STEPS).fill(false), volume: 0.8, muted: false, solo: false },
  { id: 'percussion', name: 'Percussion', steps: Array(TOTAL_STEPS).fill(false), volume: 0.8, muted: false, solo: false },
];

const INITIAL_STATE: SequencerState = {
  tracks: DEFAULT_TRACKS,
  bpm: 120,
  currentStep: -1,
  isPlaying: false,
  totalSteps: TOTAL_STEPS,
};

function useSequencer() {
  const [state, setState] = useState<SequencerState>(INITIAL_STATE);

  const audioEngine = useRef<AudioEngine>(new AudioEngine());
  const timerRef = useRef<number | null>(null);
  const stateRef = useRef<SequencerState>(state);

  // Keep stateRef in sync with state so the interval callback always has fresh data.
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  // -----------------------------------------------------------------------
  // Playback loop
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (state.isPlaying) {
      const intervalMs = (60 / state.bpm / 4) * 1000;

      timerRef.current = window.setInterval(() => {
        setState((prev) => {
          const nextStep = (prev.currentStep + 1) % prev.totalSteps;

          // Determine which tracks should be audible on this step.
          const currentState = stateRef.current;
          const anySoloed = currentState.tracks.some((t) => t.solo);

          for (const track of currentState.tracks) {
            if (!track.steps[nextStep]) continue;

            const effectivelyMuted =
              track.muted || (anySoloed && !track.solo);

            if (!effectivelyMuted) {
              audioEngine.current.playSound(track.id, track.volume);
            }
          }

          return { ...prev, currentStep: nextStep };
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
  // Actions
  // -----------------------------------------------------------------------

  const toggleStep = useCallback(
    (trackId: InstrumentName, stepIndex: number) => {
      setState((prev) => ({
        ...prev,
        tracks: prev.tracks.map((track) =>
          track.id === trackId
            ? {
                ...track,
                steps: track.steps.map((v, i) =>
                  i === stepIndex ? !v : v,
                ),
              }
            : track,
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
        tracks: prev.tracks.map((track) =>
          track.id === trackId
            ? { ...track, volume: Math.max(0, Math.min(1, volume)) }
            : track,
        ),
      }));
    },
    [],
  );

  const toggleMute = useCallback((trackId: InstrumentName) => {
    setState((prev) => ({
      ...prev,
      tracks: prev.tracks.map((track) =>
        track.id === trackId ? { ...track, muted: !track.muted } : track,
      ),
    }));
  }, []);

  const toggleSolo = useCallback((trackId: InstrumentName) => {
    setState((prev) => ({
      ...prev,
      tracks: prev.tracks.map((track) =>
        track.id === trackId ? { ...track, solo: !track.solo } : track,
      ),
    }));
  }, []);

  const clearTrack = useCallback((trackId: InstrumentName) => {
    setState((prev) => ({
      ...prev,
      tracks: prev.tracks.map((track) =>
        track.id === trackId
          ? { ...track, steps: Array(prev.totalSteps).fill(false) }
          : track,
      ),
    }));
  }, []);

  const clearAll = useCallback(() => {
    setState((prev) => ({
      ...prev,
      isPlaying: false,
      currentStep: -1,
      tracks: prev.tracks.map((track) => ({
        ...track,
        steps: Array(prev.totalSteps).fill(false),
      })),
    }));
  }, []);

  return {
    state,
    toggleStep,
    togglePlay,
    setBpm,
    setTrackVolume,
    toggleMute,
    toggleSolo,
    clearTrack,
    clearAll,
  };
}

export default useSequencer;
