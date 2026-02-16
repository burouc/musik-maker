import useSequencer from './hooks/useSequencer';
import StepSequencer from './components/StepSequencer';
import TransportControls from './components/TransportControls';
import Mixer from './components/Mixer';
import PatternSelector from './components/PatternSelector';
import PianoRoll from './components/PianoRoll';
import Arrangement from './components/Arrangement';
import './App.css';

function App() {
  const {
    state,
    tracks,
    sampleTracks,
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
    toggleArrangementBlock,
    toggleArrangementTrackMute,
    addArrangementTrack,
    removeArrangementTrack,
    setArrangementLength,
    setPlaybackMode,
    setPatternStepCount,
    setMasterVolume,
    setTrackReverbSend,
    setMasterReverb,
    setTrackDelaySend,
    setMasterDelay,
    setTrackFilterSend,
    setMasterFilter,
    setSynthSettings,
    activePattern,
    audioEngine,
    // Sample management
    loadSample,
    previewSample,
    stopPreview,
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
  } = useSequencer();

  return (
    <div className="app">
      <header className="app-header">
        <h1>Musik Maker</h1>
        <span className="app-subtitle">Step Sequencer, Piano Roll &amp; Arrangement</span>
      </header>

      <TransportControls
        isPlaying={state.isPlaying}
        bpm={state.bpm}
        playbackMode={state.playbackMode}
        onTogglePlay={togglePlay}
        onBpmChange={setBpm}
        onClearAll={clearAll}
      />

      <PatternSelector
        patterns={state.patterns}
        activePatternId={state.activePatternId}
        onSelectPattern={selectPattern}
        onAddPattern={addPattern}
        onDeletePattern={deletePattern}
        onDuplicatePattern={duplicatePattern}
        onRenamePattern={renamePattern}
      />

      <StepSequencer
        tracks={tracks}
        sampleTracks={sampleTracks}
        samples={state.samples}
        stepCount={activePattern?.stepCount ?? 16}
        currentStep={state.currentStep}
        isPlaying={state.isPlaying && state.playbackMode === 'pattern'}
        onToggleStep={toggleStep}
        onSetStepVelocity={setStepVelocity}
        onSetStepPitch={setStepPitch}
        onStepCountChange={setPatternStepCount}
        onToggleSampleStep={toggleSampleStep}
        onSetSampleStepVelocity={setSampleStepVelocity}
        onSetSampleStepPitch={setSampleStepPitch}
        onSetSampleTrackSample={setSampleTrackSample}
        onSetSampleTrackPlaybackMode={setSampleTrackPlaybackMode}
        onLoadSample={loadSample}
        onPreviewSample={previewSample}
        onStopPreview={stopPreview}
        onAddSampleTrack={addSampleTrack}
        onRemoveSampleTrack={removeSampleTrack}
      />

      <Mixer
        tracks={tracks}
        sampleTracks={sampleTracks}
        masterVolume={state.masterVolume}
        masterReverb={state.masterReverb}
        masterDelay={state.masterDelay}
        masterFilter={state.masterFilter}
        audioEngine={audioEngine}
        onSetVolume={setTrackVolume}
        onSetPan={setTrackPan}
        onToggleMute={toggleMute}
        onToggleSolo={toggleSolo}
        onClearTrack={clearTrack}
        onSetMasterVolume={setMasterVolume}
        onSetReverbSend={setTrackReverbSend}
        onSetMasterReverb={setMasterReverb}
        onSetDelaySend={setTrackDelaySend}
        onSetMasterDelay={setMasterDelay}
        onSetFilterSend={setTrackFilterSend}
        onSetMasterFilter={setMasterFilter}
        onSetSampleVolume={setSampleTrackVolume}
        onSetSamplePan={setSampleTrackPan}
        onToggleSampleMute={toggleSampleMute}
        onToggleSampleSolo={toggleSampleSolo}
        onClearSampleTrack={clearSampleTrack}
        onSetSampleReverbSend={setSampleTrackReverbSend}
        onSetSampleDelaySend={setSampleTrackDelaySend}
        onSetSampleFilterSend={setSampleTrackFilterSend}
      />

      {activePattern && (
        <PianoRoll
          pianoRoll={activePattern.pianoRoll}
          stepCount={activePattern.stepCount}
          currentStep={state.currentStep}
          isPlaying={state.isPlaying && state.playbackMode === 'pattern'}
          synthSettings={activePattern.synthSettings}
          onAddNote={addPianoNote}
          onDeleteNote={deletePianoNote}
          onUpdateNote={updatePianoNote}
          onPreviewNote={previewPianoNote}
          onMoveNotes={movePianoNotes}
          onPasteNotes={pastePianoNotes}
          onSynthSettingsChange={setSynthSettings}
        />
      )}

      <Arrangement
        patterns={state.patterns}
        activePatternId={state.activePatternId}
        arrangement={state.arrangement}
        arrangementLength={state.arrangementLength}
        playbackMode={state.playbackMode}
        currentMeasure={state.currentMeasure}
        isPlaying={state.isPlaying}
        onToggleBlock={toggleArrangementBlock}
        onToggleTrackMute={toggleArrangementTrackMute}
        onAddTrack={addArrangementTrack}
        onRemoveTrack={removeArrangementTrack}
        onSetLength={setArrangementLength}
        onSetPlaybackMode={setPlaybackMode}
      />
    </div>
  );
}

export default App;
