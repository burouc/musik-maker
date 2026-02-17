import { useState, useEffect, useCallback } from 'react';
import useSequencer from './hooks/useSequencer';
import StepSequencer from './components/StepSequencer';
import TransportControls from './components/TransportControls';
import Mixer from './components/Mixer';
import PatternSelector from './components/PatternSelector';
import PianoRoll from './components/PianoRoll';
import Arrangement from './components/Arrangement';
import AutomationLanes from './components/AutomationLanes';
import ResizablePanel from './components/ResizablePanel';
import type { ViewTab } from './types';
import './App.css';

const VIEW_TABS: { id: ViewTab; label: string; shortcut: string }[] = [
  { id: 'channel-rack', label: 'Channel Rack', shortcut: '1' },
  { id: 'piano-roll', label: 'Piano Roll', shortcut: '2' },
  { id: 'mixer', label: 'Mixer', shortcut: '3' },
  { id: 'arrangement', label: 'Arrangement', shortcut: '4' },
];

function App() {
  const {
    state,
    tracks,
    sampleTracks,
    undo,
    redo,
    toggleStep,
    setStepVelocity,
    setStepPitch,
    togglePlay,
    toggleMetronome,
    setSwing,
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
    slicePianoNote,
    previewPianoNote,
    movePianoNotes,
    pastePianoNotes,
    updatePianoNoteVelocity,
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
    setMasterLimiter,
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
    // Insert effects
    addInsertEffect,
    removeInsertEffect,
    toggleInsertEffect,
    updateInsertEffectParams,
    moveInsertEffect,
    // Send channels (FX buses)
    addSendChannel,
    removeSendChannel,
    renameSendChannel,
    setSendChannelVolume,
    setChannelSendLevel,
    addSendChannelInsertEffect,
    removeSendChannelInsertEffect,
    toggleSendChannelInsertEffect,
    updateSendChannelInsertEffectParams,
    moveSendChannelInsertEffect,
    // Mixer tracks
    addMixerTrack,
    removeMixerTrack,
    renameMixerTrack,
    setMixerTrackVolume,
    setMixerTrackPan,
    setMixerTrackEQBand,
    setMixerTrackEQEnabled,
    // Automation
    addAutomationLane,
    removeAutomationLane,
    toggleAutomationLane,
    setAutomationPoint,
    removeAutomationPoint,
    clearAutomationLane,
    // Project management
    newProject,
    saveProject,
    loadProject,
    listProjects,
    deleteProject: deleteServerProject,
    setProjectName,
  } = useSequencer();

  const [activeTab, setActiveTab] = useState<ViewTab>('channel-rack');
  const [saving, setSaving] = useState(false);
  const [showLoadDialog, setShowLoadDialog] = useState(false);
  const [savedProjects, setSavedProjects] = useState<{ id: string; name: string; updatedAt: string }[]>([]);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);

  const handleNew = useCallback(() => {
    if (!confirm('Create a new project? Any unsaved changes will be lost.')) return;
    newProject();
    setSaveStatus(null);
  }, [newProject]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setSaveStatus(null);
    try {
      await saveProject();
      setSaveStatus('Saved');
      setTimeout(() => setSaveStatus(null), 2000);
    } catch {
      setSaveStatus('Error saving');
    } finally {
      setSaving(false);
    }
  }, [saveProject]);

  const handleOpenLoad = useCallback(async () => {
    try {
      const projects = await listProjects();
      setSavedProjects(projects);
      setShowLoadDialog(true);
    } catch {
      setSaveStatus('Error loading project list');
    }
  }, [listProjects]);

  const handleLoad = useCallback(async (id: string) => {
    try {
      await loadProject(id);
      setShowLoadDialog(false);
      setSaveStatus('Loaded');
      setTimeout(() => setSaveStatus(null), 2000);
    } catch {
      setSaveStatus('Error loading project');
    }
  }, [loadProject]);

  const handleDeleteProject = useCallback(async (id: string) => {
    try {
      await deleteServerProject(id);
      setSavedProjects((prev) => prev.filter((p) => p.id !== id));
    } catch {
      setSaveStatus('Error deleting project');
    }
  }, [deleteServerProject]);

  // Global keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      const tag = (e.target as HTMLElement).tagName;
      const isTyping = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';

      // Ctrl+S — Save project
      if (mod && e.key === 's') {
        e.preventDefault();
        handleSave();
        return;
      }
      // Ctrl+N — New project
      if (mod && e.key === 'n') {
        e.preventDefault();
        handleNew();
        return;
      }
      // Ctrl+Z — Undo
      if (mod && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
        return;
      }
      // Ctrl+Shift+Z or Ctrl+Y — Redo
      if ((mod && e.key === 'z' && e.shiftKey) || (mod && e.key === 'y')) {
        e.preventDefault();
        redo();
        return;
      }

      // Shortcuts below only fire when not typing in an input
      if (isTyping) return;

      // Space — Play/Stop
      if (e.key === ' ') {
        e.preventDefault();
        togglePlay();
        return;
      }
      // M — Toggle metronome
      if (e.key === 'm' || e.key === 'M') {
        toggleMetronome();
        return;
      }
      // L — Toggle playback mode (pattern/song)
      if (e.key === 'l' || e.key === 'L') {
        setPlaybackMode(state.playbackMode === 'pattern' ? 'song' : 'pattern');
        return;
      }
      // Tab switching with number keys (1-4)
      if (!mod && !e.altKey) {
        const tab = VIEW_TABS.find((t) => t.shortcut === e.key);
        if (tab) setActiveTab(tab.id);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleSave, handleNew, undo, redo, togglePlay, toggleMetronome, setPlaybackMode, state.playbackMode]);

  return (
    <div className="app">
      <header className="app-header">
        <h1>Musik Maker</h1>
        <span className="app-subtitle">Step Sequencer, Piano Roll &amp; Arrangement</span>
        <div className="project-bar">
          <input
            className="project-name-input"
            type="text"
            value={state.projectName}
            onChange={(e) => setProjectName(e.target.value)}
            placeholder="Project name"
          />
          <button className="project-btn" onClick={handleNew}>
            New
          </button>
          <button className="project-btn project-save-btn" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : 'Save'}
          </button>
          <button className="project-btn" onClick={handleOpenLoad}>
            Load
          </button>
          {saveStatus && <span className="project-status">{saveStatus}</span>}
        </div>
      </header>

      {showLoadDialog && (
        <div className="load-dialog-overlay" onClick={() => setShowLoadDialog(false)}>
          <div className="load-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="load-dialog-header">
              <h2>Load Project</h2>
              <button className="load-dialog-close" onClick={() => setShowLoadDialog(false)}>
                X
              </button>
            </div>
            {savedProjects.length === 0 ? (
              <p className="load-dialog-empty">No saved projects</p>
            ) : (
              <ul className="load-dialog-list">
                {savedProjects.map((p) => (
                  <li key={p.id} className="load-dialog-item">
                    <button className="load-dialog-item-name" onClick={() => handleLoad(p.id)}>
                      {p.name}
                    </button>
                    <span className="load-dialog-item-date">
                      {new Date(p.updatedAt).toLocaleDateString()}
                    </span>
                    <button
                      className="load-dialog-item-delete"
                      onClick={() => handleDeleteProject(p.id)}
                      title="Delete project"
                    >
                      X
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      <TransportControls
        isPlaying={state.isPlaying}
        bpm={state.bpm}
        swing={state.swing}
        playbackMode={state.playbackMode}
        currentStep={state.currentStep}
        currentMeasure={state.currentMeasure}
        stepCount={activePattern?.stepCount ?? 16}
        metronomeEnabled={state.metronomeEnabled}
        onTogglePlay={togglePlay}
        onBpmChange={setBpm}
        onSwingChange={setSwing}
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

      <div className="view-tabs">
        {VIEW_TABS.map((tab) => (
          <button
            key={tab.id}
            className={`view-tab${activeTab === tab.id ? ' active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
            <span className="view-tab-shortcut">{tab.shortcut}</span>
          </button>
        ))}
      </div>

      {activeTab === 'channel-rack' && (
        <ResizablePanel defaultHeight={280} minHeight={100} maxHeight={800} className="panel-sequencer" showDivider={false}>
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
        </ResizablePanel>
      )}

      {activeTab === 'piano-roll' && (
        <ResizablePanel defaultHeight={380} minHeight={120} maxHeight={800} className="panel-piano-roll" showDivider={false}>
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
              onSliceNote={slicePianoNote}
              onPreviewNote={previewPianoNote}
              onMoveNotes={movePianoNotes}
              onPasteNotes={pastePianoNotes}
              onUpdateNoteVelocity={updatePianoNoteVelocity}
              onSynthSettingsChange={setSynthSettings}
            />
          )}
        </ResizablePanel>
      )}

      {activeTab === 'mixer' && (
        <ResizablePanel defaultHeight={340} minHeight={120} maxHeight={800} className="panel-mixer" showDivider={false}>
          <Mixer
            tracks={tracks}
            sampleTracks={sampleTracks}
            masterVolume={state.masterVolume}
            masterReverb={state.masterReverb}
            masterDelay={state.masterDelay}
            masterFilter={state.masterFilter}
            masterLimiter={state.masterLimiter}
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
            onAddInsertEffect={addInsertEffect}
            onRemoveInsertEffect={removeInsertEffect}
            onToggleInsertEffect={toggleInsertEffect}
            onUpdateInsertEffectParams={updateInsertEffectParams}
            onMoveInsertEffect={moveInsertEffect}
            sendChannels={state.sendChannels}
            onAddSendChannel={addSendChannel}
            onRemoveSendChannel={removeSendChannel}
            onRenameSendChannel={renameSendChannel}
            onSetSendChannelVolume={setSendChannelVolume}
            onSetChannelSendLevel={setChannelSendLevel}
            onAddSendChannelInsertEffect={addSendChannelInsertEffect}
            onRemoveSendChannelInsertEffect={removeSendChannelInsertEffect}
            onToggleSendChannelInsertEffect={toggleSendChannelInsertEffect}
            onUpdateSendChannelInsertEffectParams={updateSendChannelInsertEffectParams}
            onMoveSendChannelInsertEffect={moveSendChannelInsertEffect}
            mixerTracks={state.mixerTracks}
            onAddMixerTrack={addMixerTrack}
            onRemoveMixerTrack={removeMixerTrack}
            onRenameMixerTrack={renameMixerTrack}
            onSetMixerTrackVolume={setMixerTrackVolume}
            onSetMixerTrackPan={setMixerTrackPan}
            onSetMixerTrackEQBand={setMixerTrackEQBand}
            onSetMixerTrackEQEnabled={setMixerTrackEQEnabled}
          />
        </ResizablePanel>
      )}

      {activeTab === 'arrangement' && (
        <ResizablePanel defaultHeight={400} minHeight={120} maxHeight={1000} className="panel-arrangement" showDivider={false}>
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
        </ResizablePanel>
      )}
    </div>
  );
}

export default App;
