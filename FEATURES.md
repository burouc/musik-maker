# Musik Maker — FL Studio Clone Feature List

## Current State

The app currently has:
- 16-step drum sequencer with 6 synthesized instruments (kick, snare, hi-hat, clap, open hat, percussion)
- Basic piano roll (C2–B5, click-to-place notes)
- Multi-pattern system with pattern CRUD (create, rename, duplicate, delete)
- Arrangement timeline (place patterns on a measure grid)
- Mixer with per-track volume, mute, and solo
- Transport controls (play/stop, BPM slider 40–300)
- Pattern and Song playback modes
- Web Audio API synthesis (no samples)
- Dark-themed UI
- Express backend (health check only, no persistence)

---

## Features To Add

Features are grouped by category. Each item is marked with a priority:
- **[P0]** — Core (must-have for a basic FL Studio clone)
- **[P1]** — Important (expected by users familiar with FL Studio)
- **[P2]** — Nice-to-have (polish and power-user features)

---

### 1. Channel Rack / Step Sequencer Improvements

- [ ] **[P0]** Variable step count per pattern (1–64 steps, not locked to 16)
- [ ] **[P0]** Per-step velocity editing (click-drag to set hit strength)
- [x] **[P0]** Per-step pitch shifting for drum instruments
- [ ] **[P1]** Swing/shuffle control (adjustable percentage)
- [ ] **[P1]** Ghost notes (reduced velocity visual distinction)
- [ ] **[P1]** Step sequencer zoom (fit more/fewer steps on screen)
- [ ] **[P2]** Graph editor for per-step volume/pan/pitch curves
- [ ] **[P2]** Instrument re-ordering via drag-and-drop

### 2. Piano Roll Enhancements

- [x] **[P0]** Click-and-drag to create notes with variable duration
- [x] **[P0]** Note resize by dragging note edges
- [ ] **[P0]** Note deletion (right-click or delete key)
- [ ] **[P0]** Note selection (click, shift-click, box select)
- [ ] **[P0]** Move selected notes (drag, arrow keys)
- [x] **[P0]** Copy/paste/duplicate notes
- [ ] **[P1]** Velocity lane below the piano roll grid
- [ ] **[P1]** Snap-to-grid with configurable grid resolution (1/4, 1/8, 1/16, 1/32, triplets)
- [ ] **[P1]** Zoom in/out (horizontal and vertical)
- [ ] **[P1]** Scroll/pan with middle-click or scroll wheel
- [ ] **[P1]** Piano roll tools: draw, select, slice, paint, erase
- [ ] **[P2]** Note color coding by velocity or channel
- [ ] **[P2]** Chord stamp tool (major, minor, 7th, etc.)
- [ ] **[P2]** Scale highlighting (show in-scale notes)
- [ ] **[P2]** Portamento/slide notes

### 3. Mixer / Audio Routing

- [x] **[P0]** Master channel with master volume
- [x] **[P0]** Per-channel pan control
- [ ] **[P0]** Visual VU meters (peak level display)
- [ ] **[P1]** Insert effect slots per mixer track (chain up to 8 effects)
- [ ] **[P1]** Send channels (route audio to FX buses)
- [ ] **[P1]** Mixer track routing (any channel to any mixer track)
- [ ] **[P1]** EQ per mixer track (at minimum a 3-band parametric EQ)
- [ ] **[P2]** Mixer track grouping / sub-mixes
- [ ] **[P2]** Sidechain routing visualization
- [ ] **[P2]** Mixer track renaming and color coding

### 4. Built-in Effects (Plugins)

- [ ] **[P0]** Reverb (convolution or algorithmic)
- [ ] **[P0]** Delay (tempo-synced, with feedback and mix controls)
- [ ] **[P0]** Filter (low-pass, high-pass, band-pass with resonance)
- [ ] **[P1]** Compressor (threshold, ratio, attack, release, gain)
- [ ] **[P1]** Distortion / overdrive / saturation
- [ ] **[P1]** Chorus / flanger / phaser
- [ ] **[P1]** Limiter on master bus
- [ ] **[P2]** Bitcrusher
- [ ] **[P2]** Stereo widener / imager
- [ ] **[P2]** Graphic EQ (31-band)

### 5. Synthesizer / Instrument Engine

- [ ] **[P0]** Polyphonic subtractive synth with oscillator selection (sine, saw, square, triangle)
- [ ] **[P0]** ADSR envelope for amplitude (attack, decay, sustain, release)
- [x] **[P0]** ADSR envelope for filter cutoff
- [x] **[P0]** Multiple oscillators with detune and mix
- [ ] **[P1]** LFO modulation (route to pitch, filter, volume, pan)
- [ ] **[P1]** Noise oscillator (white, pink)
- [ ] **[P1]** Unison / voice stacking with spread
- [ ] **[P1]** Preset system (save/load synth patches)
- [ ] **[P2]** FM synthesis mode
- [ ] **[P2]** Wavetable oscillator
- [ ] **[P2]** Arpeggiator

### 6. Sample Playback

- [ ] **[P0]** Load audio files (WAV, MP3, OGG) as instruments
- [x] **[P0]** One-shot and looping sample playback modes
- [x] **[P0]** Sample preview before loading
- [ ] **[P1]** Basic sample editing (trim start/end, gain)
- [ ] **[P1]** Pitch-shift samples to match note
- [ ] **[P1]** Sample browser panel with folder navigation
- [ ] **[P2]** Time-stretch samples to match BPM
- [ ] **[P2]** Sliced breakbeat mode (chop a loop into steps)
- [ ] **[P2]** Drag-and-drop audio files from desktop

### 7. Arrangement / Playlist

- [x] **[P0]** Drag patterns onto the arrangement timeline
- [x] **[P0]** Resize pattern clips on the timeline
- [x] **[P0]** Move clips freely across tracks and time positions
- [ ] **[P0]** Loop markers (set start/end loop points)
- [ ] **[P1]** Audio clips directly on the arrangement timeline
- [ ] **[P1]** Automation clips on the arrangement timeline
- [ ] **[P1]** Track height resize
- [ ] **[P1]** Time signature support (3/4, 6/8, etc.)
- [ ] **[P1]** Markers / cue points for song sections (intro, verse, chorus)
- [ ] **[P2]** Clip fade-in / fade-out
- [ ] **[P2]** Time selection tool for rendering sections
- [ ] **[P2]** Arrangement track freezing (bounce to audio)

### 8. Automation

- [x] **[P0]** Automation lanes for any knob/parameter
- [ ] **[P0]** Draw automation curves (point-and-click or freehand)
- [x] **[P0]** Link automation to mixer volume, pan, effect params
- [ ] **[P1]** Automation curve types (linear, smooth, stepped)
- [ ] **[P1]** Copy/paste automation clips
- [ ] **[P2]** LFO-based automation generator
- [ ] **[P2]** Automation recording (move a knob while playing, record the motion)

### 9. Transport / Playback

- [ ] **[P0]** Time position display (bars:beats:ticks and mm:ss)
- [x] **[P0]** Click/metronome toggle
- [ ] **[P1]** Tap tempo
- [ ] **[P1]** Count-in before recording
- [ ] **[P1]** Song position scrubbing (click on timeline to jump)
- [ ] **[P2]** Time signature changes mid-song
- [ ] **[P2]** Tempo automation (BPM changes over time)

### 10. Recording

- [ ] **[P1]** MIDI input recording from connected MIDI controllers
- [ ] **[P1]** Audio input recording (microphone / line-in via Web Audio)
- [ ] **[P1]** Quantize recorded MIDI notes (snap to grid after recording)
- [ ] **[P2]** Overdub recording mode
- [ ] **[P2]** Punch-in / punch-out recording

### 11. File / Project Management

- [ ] **[P0]** Save project to server (persist all patterns, arrangement, mixer state)
- [x] **[P0]** Load saved projects
- [x] **[P0]** New project / reset all
- [ ] **[P1]** Export to WAV (offline render via OfflineAudioContext)
- [ ] **[P1]** Export to MP3
- [ ] **[P1]** Undo / redo (full action history)
- [ ] **[P1]** Autosave with recovery
- [ ] **[P2]** Export MIDI file
- [ ] **[P2]** Import MIDI file
- [ ] **[P2]** Project templates (starter genres: trap, house, lo-fi, etc.)

### 12. UI / UX

- [ ] **[P0]** Resizable panels (drag dividers between sequencer, piano roll, mixer, arrangement)
- [ ] **[P0]** Tabbed view switching (Channel Rack, Piano Roll, Mixer, Arrangement)
- [ ] **[P0]** Keyboard shortcuts (space=play/stop, ctrl+z=undo, ctrl+s=save, etc.)
- [ ] **[P1]** Detachable / floating windows for piano roll and mixer
- [ ] **[P1]** Right-click context menus
- [ ] **[P1]** Tooltips on all controls
- [ ] **[P1]** Waveform visualization on audio clips
- [ ] **[P1]** Responsive layout for different screen sizes
- [ ] **[P2]** Theme customization (colors, dark/light modes)
- [ ] **[P2]** Full-screen mode
- [ ] **[P2]** Touch-friendly controls for tablet use

### 13. Browser / Content Panel

- [ ] **[P1]** Left-side browser panel (like FL Studio's sidebar)
- [ ] **[P1]** Browse instruments, effects, samples, presets
- [ ] **[P1]** Search / filter content
- [ ] **[P1]** Favorites / bookmarks
- [ ] **[P2]** Plugin scanner for Web Audio plugins

### 14. Collaboration & Sharing

- [ ] **[P2]** Share project via URL
- [ ] **[P2]** Real-time collaboration (multiple users editing same project)
- [ ] **[P2]** Export and share rendered audio
- [ ] **[P2]** Community preset/sample sharing

---

## Summary Counts

| Priority | Count |
|----------|-------|
| P0 (Core) | 30 |
| P1 (Important) | 42 |
| P2 (Nice-to-have) | 30 |
| **Total** | **102** |
