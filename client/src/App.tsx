import useSequencer from './hooks/useSequencer';
import StepSequencer from './components/StepSequencer';
import TransportControls from './components/TransportControls';
import Mixer from './components/Mixer';
import './App.css';

function App() {
  const {
    state,
    toggleStep,
    togglePlay,
    setBpm,
    setTrackVolume,
    toggleMute,
    toggleSolo,
    clearTrack,
    clearAll,
  } = useSequencer();

  return (
    <div className="app">
      <header className="app-header">
        <h1>Musik Maker</h1>
        <span className="app-subtitle">Step Sequencer</span>
      </header>

      <TransportControls
        isPlaying={state.isPlaying}
        bpm={state.bpm}
        onTogglePlay={togglePlay}
        onBpmChange={setBpm}
        onClearAll={clearAll}
      />

      <StepSequencer
        tracks={state.tracks}
        currentStep={state.currentStep}
        isPlaying={state.isPlaying}
        onToggleStep={toggleStep}
      />

      <Mixer
        tracks={state.tracks}
        onSetVolume={setTrackVolume}
        onToggleMute={toggleMute}
        onToggleSolo={toggleSolo}
        onClearTrack={clearTrack}
      />
    </div>
  );
}

export default App;
