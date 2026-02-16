import useSequencer from './hooks/useSequencer';
import StepSequencer from './components/StepSequencer';
import TransportControls from './components/TransportControls';
import Mixer from './components/Mixer';
import PatternSelector from './components/PatternSelector';
import PianoRoll from './components/PianoRoll';
import Arrangement from './components/Arrangement';
import AutomationLanes from './components/AutomationLanes';
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
    toggleMetronome,
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
    // Automation
    addAutomationLane,
    removeAutomationLane,
    toggleAutomationLane,
    setAutomationPoint,
    removeAutomationPoint,
    clearAutomationLane,
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
        currentStep={state.currentStep}
        currentMeasure={state.currentMeasure}
        stepCount={activePattern?.stepCount ?? 16}
        metronomeEnabled={state.metronomeEnabled}
        onTogglePlay={togglePlay}
        onBpmChange={setBpm}
        onToggleMetronome={toggleMetronome}
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
        loopStart={state.loopStart}
        loopEnd={state.loopEnd}
        onToggleBlock={toggleArrangementBlock}
        onPlaceBlock={placeArrangementBlock}
        onResizeBlock={resizeArrangementBlock}
        onMoveBlock={moveArrangementBlock}
        onToggleTrackMute={toggleArrangementTrackMute}
        onAddTrack={addArrangementTrack}
        onRemoveTrack={removeArrangementTrack}
        onSetLength={setArrangementLength}
        onSetPlaybackMode={setPlaybackMode}
        onSetLoopStart={setLoopStart}
        onSetLoopEnd={setLoopEnd}
        onClearLoop={clearLoopMarkers}
      />

      <AutomationLanes
        lanes={state.automationLanes}
        arrangementLength={state.arrangementLength}
        currentMeasure={state.currentMeasure}
        currentStep={state.currentStep}
        isPlaying={state.isPlaying}
        playbackMode={state.playbackMode}
        drumTracks={tracks}
        sampleTracks={sampleTracks}
        onAddLane={addAutomationLane}
        onRemoveLane={removeAutomationLane}
        onToggleLane={toggleAutomationLane}
        onSetPoint={setAutomationPoint}
        onRemovePoint={removeAutomationPoint}
        onClearLane={clearAutomationLane}
      />
    </div>
  );
}

export default App;
