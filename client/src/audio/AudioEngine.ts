import type { InstrumentName, ReverbSettings, DelaySettings, DelaySync, FilterSettings, SynthSettings, OscillatorType, SampleFormat } from '../types';

/** Accepted MIME types for sample loading */
const SAMPLE_MIME_TYPES: Record<SampleFormat, string> = {
  wav: 'audio/wav',
  mp3: 'audio/mpeg',
  ogg: 'audio/ogg',
};

export const ACCEPTED_SAMPLE_EXTENSIONS: SampleFormat[] = ['wav', 'mp3', 'ogg'];
export const ACCEPTED_SAMPLE_MIME_TYPES = Object.values(SAMPLE_MIME_TYPES).join(',');

class AudioEngine {
  private context: AudioContext;
  private masterGain: GainNode;
  private noiseBuffer: AudioBuffer;
  private channelGains: Map<InstrumentName, GainNode> = new Map();
  private panners: Map<InstrumentName, StereoPannerNode> = new Map();
  private channelAnalysers: Map<InstrumentName, AnalyserNode> = new Map();
  private masterAnalyser: AnalyserNode;

  // Reverb send/return bus
  private reverbSendGains: Map<InstrumentName, GainNode> = new Map();
  private reverbBus: GainNode;
  private reverbPreDelay: DelayNode;
  private reverbConvolver: ConvolverNode;
  private reverbDamping: BiquadFilterNode;
  private reverbReturnGain: GainNode;

  // Delay send/return bus
  private delaySendGains: Map<InstrumentName, GainNode> = new Map();
  private delayBus: GainNode;
  private delayNode: DelayNode;
  private delayFeedback: GainNode;
  private delayFilter: BiquadFilterNode;
  private delayReturnGain: GainNode;
  private delayBpm: number = 120;

  // Filter send/return bus
  private filterSendGains: Map<InstrumentName, GainNode> = new Map();
  private filterBus: GainNode;
  private filterNode: BiquadFilterNode;
  private filterReturnGain: GainNode;

  // Sample playback
  private sampleBuffers: Map<string, AudioBuffer> = new Map();
  private sampleChannelGains: Map<string, GainNode> = new Map();
  private samplePanners: Map<string, StereoPannerNode> = new Map();
  private sampleAnalysers: Map<string, AnalyserNode> = new Map();
  private sampleReverbSendGains: Map<string, GainNode> = new Map();
  private sampleDelaySendGains: Map<string, GainNode> = new Map();
  private sampleFilterSendGains: Map<string, GainNode> = new Map();
  /** Active looping sources per track, so they can be stopped */
  private activeSampleSources: Map<string, { source: AudioBufferSourceNode; gain: GainNode }> = new Map();
  /** Active preview source (for auditioning samples before loading) */
  private previewSource: { source: AudioBufferSourceNode; gain: GainNode } | null = null;

  constructor() {
    this.context = new AudioContext();
    this.masterGain = this.context.createGain();

    // Master analyser sits between master gain and destination
    this.masterAnalyser = this.context.createAnalyser();
    this.masterAnalyser.fftSize = 256;
    this.masterAnalyser.smoothingTimeConstant = 0.3;
    this.masterGain.connect(this.masterAnalyser);
    this.masterAnalyser.connect(this.context.destination);
    this.masterGain.gain.value = 0.8;

    // Reverb send/return bus
    // Signal flow: channel send gains → reverbBus → preDelay → convolver → damping → returnGain → masterGain
    this.reverbBus = this.context.createGain();
    this.reverbPreDelay = this.context.createDelay(0.1);
    this.reverbPreDelay.delayTime.value = 0.01;
    this.reverbConvolver = this.context.createConvolver();
    this.reverbDamping = this.context.createBiquadFilter();
    this.reverbDamping.type = 'lowpass';
    this.reverbDamping.frequency.value = 8000;
    this.reverbDamping.Q.value = 0.7;
    this.reverbReturnGain = this.context.createGain();
    this.reverbReturnGain.gain.value = 1;

    this.reverbBus.connect(this.reverbPreDelay);
    this.reverbPreDelay.connect(this.reverbConvolver);
    this.reverbConvolver.connect(this.reverbDamping);
    this.reverbDamping.connect(this.reverbReturnGain);
    this.reverbReturnGain.connect(this.masterGain);

    // Generate initial impulse response
    this.reverbConvolver.buffer = this.generateImpulseResponse(2, 4000);

    // Delay send/return bus
    // Signal flow: channel send gains → delayBus → delayNode → filter → returnGain → masterGain
    //                                                  ↑            ↓
    //                                                  └── feedback ←┘
    this.delayBus = this.context.createGain();
    this.delayNode = this.context.createDelay(2); // max 2 seconds
    this.delayNode.delayTime.value = 0.5; // default 1/4 at 120bpm
    this.delayFeedback = this.context.createGain();
    this.delayFeedback.gain.value = 0.4;
    this.delayFilter = this.context.createBiquadFilter();
    this.delayFilter.type = 'lowpass';
    this.delayFilter.frequency.value = 6000;
    this.delayFilter.Q.value = 0.7;
    this.delayReturnGain = this.context.createGain();
    this.delayReturnGain.gain.value = 0.7;

    this.delayBus.connect(this.delayNode);
    this.delayNode.connect(this.delayFilter);
    this.delayFilter.connect(this.delayReturnGain);
    this.delayFilter.connect(this.delayFeedback);
    this.delayFeedback.connect(this.delayNode);
    this.delayReturnGain.connect(this.masterGain);

    // Filter send/return bus
    // Signal flow: channel send gains → filterBus → filterNode → returnGain → masterGain
    this.filterBus = this.context.createGain();
    this.filterNode = this.context.createBiquadFilter();
    this.filterNode.type = 'lowpass';
    this.filterNode.frequency.value = 2000;
    this.filterNode.Q.value = 1;
    this.filterReturnGain = this.context.createGain();
    this.filterReturnGain.gain.value = 1;

    this.filterBus.connect(this.filterNode);
    this.filterNode.connect(this.filterReturnGain);
    this.filterReturnGain.connect(this.masterGain);

    // Create a gain + stereo panner + analyser per instrument channel
    const instruments: InstrumentName[] = ['kick', 'snare', 'hihat', 'clap', 'openhat', 'percussion'];
    for (const name of instruments) {
      const analyser = this.context.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.3;

      // Channel gain node for real-time volume automation
      const channelGain = this.context.createGain();
      channelGain.gain.value = 1; // unity by default; per-hit volume multiplied at trigger time

      const panner = this.context.createStereoPanner();
      channelGain.connect(panner);
      panner.connect(analyser);
      analyser.connect(this.masterGain);

      // Reverb send: taps from panner output into the reverb bus
      const sendGain = this.context.createGain();
      sendGain.gain.value = 0; // dry by default
      panner.connect(sendGain);
      sendGain.connect(this.reverbBus);

      // Delay send: taps from panner output into the delay bus
      const delaySendGain = this.context.createGain();
      delaySendGain.gain.value = 0; // dry by default
      panner.connect(delaySendGain);
      delaySendGain.connect(this.delayBus);

      // Filter send: taps from panner output into the filter bus
      const filterSendGain = this.context.createGain();
      filterSendGain.gain.value = 0; // dry by default
      panner.connect(filterSendGain);
      filterSendGain.connect(this.filterBus);

      this.channelGains.set(name, channelGain);
      this.panners.set(name, panner);
      this.channelAnalysers.set(name, analyser);
      this.reverbSendGains.set(name, sendGain);
      this.delaySendGains.set(name, delaySendGain);
      this.filterSendGains.set(name, filterSendGain);
    }

    // Pre-generate a reusable white noise buffer (2 seconds of noise)
    const sampleRate = this.context.sampleRate;
    const bufferLength = sampleRate * 2;
    this.noiseBuffer = this.context.createBuffer(1, bufferLength, sampleRate);
    const channelData = this.noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferLength; i++) {
      channelData[i] = Math.random() * 2 - 1;
    }
  }

  async resume(): Promise<void> {
    if (this.context.state === 'suspended') {
      await this.context.resume();
    }
  }

  /**
   * Play a pitched piano note using a polyphonic subtractive synth.
   * @param midiNote  MIDI note number (60 = C4)
   * @param volume    0–1
   * @param duration  Duration in seconds
   * @param settings  Optional synth voice settings (oscillator types, detune, filter)
   */
  async playPianoNote(
    midiNote: number,
    volume: number,
    duration: number = 0.2,
    settings?: SynthSettings,
  ): Promise<void> {
    await this.resume();
    const now = this.context.currentTime;
    const freq = 440 * Math.pow(2, (midiNote - 69) / 12);

    const osc1Type: OscillatorType = settings?.oscType ?? 'sawtooth';
    const osc1Octave = settings?.oscOctave ?? 0;
    const osc2Type: OscillatorType = settings?.osc2Type ?? 'sawtooth';
    const detuneCents = settings?.osc2Detune ?? 7;
    const osc2Octave = settings?.osc2Octave ?? 0;
    const osc2Mix = settings?.osc2Mix ?? 0.5;
    const osc3Enabled = settings?.osc3Enabled ?? false;
    const osc3Type: OscillatorType = settings?.osc3Type ?? 'square';
    const osc3Detune = settings?.osc3Detune ?? 0;
    const osc3Octave = settings?.osc3Octave ?? 0;
    const osc3Mix = settings?.osc3Mix ?? 0;
    const cutoff = settings?.filterCutoff ?? Math.min(freq * 4, 12000);
    const resonance = settings?.filterResonance ?? 1;

    // Oscillator 1 (with octave offset)
    const osc1 = this.context.createOscillator();
    osc1.type = osc1Type;
    osc1.frequency.setValueAtTime(freq * Math.pow(2, osc1Octave), now);

    // Oscillator 2 (detuned, with octave offset)
    const osc2 = this.context.createOscillator();
    osc2.type = osc2Type;
    osc2.frequency.setValueAtTime(freq * Math.pow(2, osc2Octave), now);
    osc2.detune.setValueAtTime(detuneCents, now);

    // Oscillator mix gains (distribute between osc1/osc2, with osc3 mixed in additively)
    const osc1Gain = this.context.createGain();
    osc1Gain.gain.value = 1 - osc2Mix;
    const osc2Gain = this.context.createGain();
    osc2Gain.gain.value = osc2Mix;

    // Oscillator 3 (optional, with its own detune and octave)
    let osc3: OscillatorNode | null = null;
    let osc3Gain: GainNode | null = null;
    if (osc3Enabled && osc3Mix > 0) {
      osc3 = this.context.createOscillator();
      osc3.type = osc3Type;
      osc3.frequency.setValueAtTime(freq * Math.pow(2, osc3Octave), now);
      osc3.detune.setValueAtTime(osc3Detune, now);

      osc3Gain = this.context.createGain();
      osc3Gain.gain.value = osc3Mix;
    }

    // Low-pass filter (subtractive)
    const filter = this.context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.Q.setValueAtTime(resonance, now);

    // Filter envelope
    const filterEnvAmount = settings?.filterEnvAmount ?? 0;
    if (filterEnvAmount > 0) {
      const fAttack = settings?.filterEnvAttack ?? 0.005;
      const fDecay = settings?.filterEnvDecay ?? 0.3;
      const fSustainLevel = settings?.filterEnvSustain ?? 0;
      const fRelease = settings?.filterEnvRelease ?? 0.15;

      // Envelope sweeps from cutoff up to cutoff + amount (in Hz, exponential)
      const peakCutoff = Math.min(cutoff * Math.pow(2, filterEnvAmount / 12), 20000);
      const sustainCutoff = cutoff + (peakCutoff - cutoff) * fSustainLevel;

      const fAttackEnd = now + fAttack;
      const fDecayEnd = fAttackEnd + fDecay;
      const fReleaseStart = now + duration;
      const fReleaseEnd = fReleaseStart + fRelease;

      filter.frequency.setValueAtTime(cutoff, now);
      filter.frequency.linearRampToValueAtTime(peakCutoff, fAttackEnd);
      filter.frequency.linearRampToValueAtTime(sustainCutoff, fDecayEnd);
      filter.frequency.setValueAtTime(sustainCutoff, fReleaseStart);
      filter.frequency.linearRampToValueAtTime(cutoff, fReleaseEnd);
    } else {
      filter.frequency.setValueAtTime(cutoff, now);
    }

    // ADSR envelope
    const gain = this.context.createGain();
    const attack = settings?.ampAttack ?? 0.005;
    const decay = settings?.ampDecay ?? 0.05;
    const sustainLevel = (settings?.ampSustain ?? 0.7) * volume;
    const release = settings?.ampRelease ?? 0.15;

    const attackEnd = now + attack;
    const decayEnd = attackEnd + decay;
    const releaseStart = now + duration;
    const releaseEnd = releaseStart + release;

    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(volume, attackEnd);
    gain.gain.linearRampToValueAtTime(sustainLevel, decayEnd);
    gain.gain.setValueAtTime(sustainLevel, releaseStart);
    gain.gain.exponentialRampToValueAtTime(0.001, releaseEnd);

    osc1.connect(osc1Gain);
    osc2.connect(osc2Gain);
    osc1Gain.connect(filter);
    osc2Gain.connect(filter);
    if (osc3 && osc3Gain) {
      osc3.connect(osc3Gain);
      osc3Gain.connect(filter);
    }
    filter.connect(gain);
    gain.connect(this.masterGain);

    osc1.start(now);
    osc2.start(now);
    osc1.stop(releaseEnd + 0.01);
    osc2.stop(releaseEnd + 0.01);
    if (osc3) {
      osc3.start(now);
      osc3.stop(releaseEnd + 0.01);
    }
  }

  async playSound(instrument: InstrumentName, volume: number, pitchOffset: number = 0): Promise<void> {
    await this.resume();
    const output = this.channelGains.get(instrument) ?? this.panners.get(instrument) ?? this.masterGain;

    switch (instrument) {
      case 'kick':
        this.playKick(volume, pitchOffset, output);
        break;
      case 'snare':
        this.playSnare(volume, pitchOffset, output);
        break;
      case 'hihat':
        this.playHihat(volume, pitchOffset, output);
        break;
      case 'clap':
        this.playClap(volume, pitchOffset, output);
        break;
      case 'openhat':
        this.playOpenHat(volume, pitchOffset, output);
        break;
      case 'percussion':
        this.playPercussion(volume, pitchOffset, output);
        break;
    }
  }

  setMasterVolume(value: number): void {
    this.masterGain.gain.value = Math.max(0, Math.min(1, value));
  }

  getMasterVolume(): number {
    return this.masterGain.gain.value;
  }

  /** Set the persistent channel volume (used by automation). */
  setChannelVolume(instrument: InstrumentName, value: number): void {
    const gain = this.channelGains.get(instrument);
    if (gain) {
      gain.gain.value = Math.max(0, Math.min(1, value));
    }
  }

  setChannelPan(instrument: InstrumentName, value: number): void {
    const panner = this.panners.get(instrument);
    if (panner) {
      panner.pan.value = Math.max(-1, Math.min(1, value));
    }
  }

  /** Read peak level (0–1) for a channel analyser. */
  getChannelLevel(instrument: InstrumentName): number {
    const analyser = this.channelAnalysers.get(instrument);
    if (!analyser) return 0;
    return this.readPeak(analyser);
  }

  /** Read peak level (0–1) for the master bus. */
  getMasterLevel(): number {
    return this.readPeak(this.masterAnalyser);
  }

  // ---------------------------------------------------------------------------
  // Reverb controls
  // ---------------------------------------------------------------------------

  /** Set the reverb send level for a channel (0–1). */
  setChannelReverbSend(instrument: InstrumentName, value: number): void {
    const sendGain = this.reverbSendGains.get(instrument);
    if (sendGain) {
      sendGain.gain.value = Math.max(0, Math.min(1, value));
    }
  }

  /** Update the master reverb parameters. Regenerates the impulse response if decay changes. */
  setReverbParams(params: Partial<ReverbSettings>): void {
    if (params.preDelay !== undefined) {
      this.reverbPreDelay.delayTime.value = Math.max(0, Math.min(0.1, params.preDelay));
    }
    if (params.damping !== undefined) {
      // Map damping 0–1 to frequency 12000–1000 Hz (0 = bright, 1 = dark)
      const freq = 12000 - params.damping * 11000;
      this.reverbDamping.frequency.value = Math.max(1000, Math.min(12000, freq));
    }
    if (params.decay !== undefined) {
      const decay = Math.max(0.1, Math.min(10, params.decay));
      const dampingFreq = this.reverbDamping.frequency.value;
      this.reverbConvolver.buffer = this.generateImpulseResponse(decay, dampingFreq);
    }
  }

  // ---------------------------------------------------------------------------
  // Delay controls
  // ---------------------------------------------------------------------------

  /** Set the delay send level for a channel (0–1). */
  setChannelDelaySend(instrument: InstrumentName, value: number): void {
    const sendGain = this.delaySendGains.get(instrument);
    if (sendGain) {
      sendGain.gain.value = Math.max(0, Math.min(1, value));
    }
  }

  /** Convert a sync division to delay time in seconds based on current BPM. */
  private syncToSeconds(sync: DelaySync, bpm: number): number {
    const beatSec = 60 / bpm; // quarter note duration
    switch (sync) {
      case '1/4':   return beatSec;
      case '1/8':   return beatSec / 2;
      case '1/16':  return beatSec / 4;
      case '3/16':  return (beatSec / 4) * 3; // dotted eighth
      case '1/4T':  return (beatSec * 2) / 3; // quarter triplet
      case '1/8T':  return beatSec / 3; // eighth triplet
    }
  }

  /** Update the delay BPM (recalculates tempo-synced delay time). */
  setDelayBpm(bpm: number, sync: DelaySync): void {
    this.delayBpm = bpm;
    this.delayNode.delayTime.value = this.syncToSeconds(sync, bpm);
  }

  /** Update the master delay parameters. */
  setDelayParams(params: Partial<DelaySettings>): void {
    if (params.sync !== undefined) {
      this.delayNode.delayTime.value = this.syncToSeconds(params.sync, this.delayBpm);
    }
    if (params.feedback !== undefined) {
      this.delayFeedback.gain.value = Math.max(0, Math.min(0.9, params.feedback));
    }
    if (params.mix !== undefined) {
      this.delayReturnGain.gain.value = Math.max(0, Math.min(1, params.mix));
    }
  }

  // ---------------------------------------------------------------------------
  // Filter controls
  // ---------------------------------------------------------------------------

  /** Set the filter send level for a channel (0–1). */
  setChannelFilterSend(instrument: InstrumentName, value: number): void {
    const sendGain = this.filterSendGains.get(instrument);
    if (sendGain) {
      sendGain.gain.value = Math.max(0, Math.min(1, value));
    }
  }

  /** Update the master filter parameters. */
  setFilterParams(params: Partial<FilterSettings>): void {
    if (params.type !== undefined) {
      this.filterNode.type = params.type as BiquadFilterType;
    }
    if (params.cutoff !== undefined) {
      this.filterNode.frequency.value = Math.max(20, Math.min(20000, params.cutoff));
    }
    if (params.resonance !== undefined) {
      this.filterNode.Q.value = Math.max(0.1, Math.min(25, params.resonance));
    }
  }

  // ---------------------------------------------------------------------------
  // Sample playback
  // ---------------------------------------------------------------------------

  /** Load an audio file into an AudioBuffer and cache it by URL. */
  async loadSample(url: string): Promise<AudioBuffer> {
    const cached = this.sampleBuffers.get(url);
    if (cached) return cached;

    await this.resume();
    const response = await fetch(url);
    const arrayBuffer = await response.arrayBuffer();
    const audioBuffer = await this.context.decodeAudioData(arrayBuffer);
    this.sampleBuffers.set(url, audioBuffer);
    return audioBuffer;
  }

  /** Remove a cached sample buffer. */
  removeSample(url: string): void {
    this.sampleBuffers.delete(url);
  }

  /** Check if a sample is loaded. */
  hasSample(url: string): boolean {
    return this.sampleBuffers.has(url);
  }

  /** Ensure a sample track channel exists (gain, panner, analyser, send gains). */
  ensureSampleChannel(trackId: string): void {
    if (this.samplePanners.has(trackId)) return;

    const analyser = this.context.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.3;

    // Channel gain node for real-time volume automation
    const channelGain = this.context.createGain();
    channelGain.gain.value = 1;

    const panner = this.context.createStereoPanner();
    channelGain.connect(panner);
    panner.connect(analyser);
    analyser.connect(this.masterGain);

    const reverbSend = this.context.createGain();
    reverbSend.gain.value = 0;
    panner.connect(reverbSend);
    reverbSend.connect(this.reverbBus);

    const delaySend = this.context.createGain();
    delaySend.gain.value = 0;
    panner.connect(delaySend);
    delaySend.connect(this.delayBus);

    const filterSend = this.context.createGain();
    filterSend.gain.value = 0;
    panner.connect(filterSend);
    filterSend.connect(this.filterBus);

    this.sampleChannelGains.set(trackId, channelGain);
    this.samplePanners.set(trackId, panner);
    this.sampleAnalysers.set(trackId, analyser);
    this.sampleReverbSendGains.set(trackId, reverbSend);
    this.sampleDelaySendGains.set(trackId, delaySend);
    this.sampleFilterSendGains.set(trackId, filterSend);
  }

  /** Remove a sample track channel. */
  removeSampleChannel(trackId: string): void {
    this.sampleChannelGains.get(trackId)?.disconnect();
    this.samplePanners.get(trackId)?.disconnect();
    this.sampleAnalysers.get(trackId)?.disconnect();
    this.sampleReverbSendGains.get(trackId)?.disconnect();
    this.sampleDelaySendGains.get(trackId)?.disconnect();
    this.sampleFilterSendGains.get(trackId)?.disconnect();
    this.sampleChannelGains.delete(trackId);
    this.samplePanners.delete(trackId);
    this.sampleAnalysers.delete(trackId);
    this.sampleReverbSendGains.delete(trackId);
    this.sampleDelaySendGains.delete(trackId);
    this.sampleFilterSendGains.delete(trackId);
  }

  /** Play a loaded sample on a sample track channel. */
  async playSample(sampleUrl: string, trackId: string, volume: number, pitchOffset: number = 0, loop: boolean = false): Promise<void> {
    await this.resume();
    const buffer = this.sampleBuffers.get(sampleUrl);
    if (!buffer) return;

    // Stop any currently playing source on this track (for both oneshot re-triggers and loop restarts)
    this.stopSample(trackId);

    this.ensureSampleChannel(trackId);
    const output = this.sampleChannelGains.get(trackId) ?? this.samplePanners.get(trackId) ?? this.masterGain;

    const source = this.context.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = this.pitchRatio(pitchOffset);
    source.loop = loop;

    const gain = this.context.createGain();
    gain.gain.value = volume;

    source.connect(gain);
    gain.connect(output);
    source.start();

    // Track active source so it can be stopped later
    this.activeSampleSources.set(trackId, { source, gain });
    source.onended = () => {
      // Only clean up if this is still the active source
      const active = this.activeSampleSources.get(trackId);
      if (active?.source === source) {
        this.activeSampleSources.delete(trackId);
      }
    };
  }

  /** Stop a currently playing sample on a track. */
  stopSample(trackId: string): void {
    const active = this.activeSampleSources.get(trackId);
    if (active) {
      try {
        active.source.stop();
      } catch {
        // Already stopped
      }
      active.source.disconnect();
      active.gain.disconnect();
      this.activeSampleSources.delete(trackId);
    }
  }

  /** Stop all active sample sources (e.g. when stopping playback). */
  stopAllSamples(): void {
    for (const [trackId] of this.activeSampleSources) {
      this.stopSample(trackId);
    }
  }

  /** Decode an audio file and play it as a preview through the master bus. */
  async previewSample(file: File): Promise<void> {
    await this.resume();
    this.stopPreview();

    const arrayBuffer = await file.arrayBuffer();
    const audioBuffer = await this.context.decodeAudioData(arrayBuffer);

    const source = this.context.createBufferSource();
    source.buffer = audioBuffer;

    const gain = this.context.createGain();
    gain.gain.value = 0.8;

    source.connect(gain);
    gain.connect(this.masterGain);
    source.start();

    this.previewSource = { source, gain };
    source.onended = () => {
      if (this.previewSource?.source === source) {
        this.previewSource = null;
      }
    };
  }

  /** Stop any currently playing preview. */
  stopPreview(): void {
    if (this.previewSource) {
      try {
        this.previewSource.source.stop();
      } catch {
        // Already stopped
      }
      this.previewSource.source.disconnect();
      this.previewSource.gain.disconnect();
      this.previewSource = null;
    }
  }

  /** Set the persistent channel volume for a sample track (used by automation). */
  setSampleChannelVolume(trackId: string, value: number): void {
    const gain = this.sampleChannelGains.get(trackId);
    if (gain) {
      gain.gain.value = Math.max(0, Math.min(1, value));
    }
  }

  /** Set pan for a sample track channel. */
  setSampleChannelPan(trackId: string, value: number): void {
    const panner = this.samplePanners.get(trackId);
    if (panner) {
      panner.pan.value = Math.max(-1, Math.min(1, value));
    }
  }

  /** Get peak level for a sample track channel. */
  getSampleChannelLevel(trackId: string): number {
    const analyser = this.sampleAnalysers.get(trackId);
    if (!analyser) return 0;
    return this.readPeak(analyser);
  }

  /** Set reverb send for a sample track channel. */
  setSampleChannelReverbSend(trackId: string, value: number): void {
    const sendGain = this.sampleReverbSendGains.get(trackId);
    if (sendGain) {
      sendGain.gain.value = Math.max(0, Math.min(1, value));
    }
  }

  /** Set delay send for a sample track channel. */
  setSampleChannelDelaySend(trackId: string, value: number): void {
    const sendGain = this.sampleDelaySendGains.get(trackId);
    if (sendGain) {
      sendGain.gain.value = Math.max(0, Math.min(1, value));
    }
  }

  /** Set filter send for a sample track channel. */
  setSampleChannelFilterSend(trackId: string, value: number): void {
    const sendGain = this.sampleFilterSendGains.get(trackId);
    if (sendGain) {
      sendGain.gain.value = Math.max(0, Math.min(1, value));
    }
  }

  // ---------------------------------------------------------------------------
  // Private synthesis methods
  // ---------------------------------------------------------------------------

  /** Convert a semitone offset to a playback rate multiplier. */
  private pitchRatio(semitones: number): number {
    return Math.pow(2, semitones / 12);
  }

  private playKick(volume: number, pitchOffset: number = 0, output: AudioNode = this.masterGain): void {
    const now = this.context.currentTime;
    const ratio = this.pitchRatio(pitchOffset);

    // Oscillator: sine wave with pitch sweep 150Hz -> 40Hz over 0.15s
    const osc = this.context.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(150 * ratio, now);
    osc.frequency.exponentialRampToValueAtTime(40 * ratio, now + 0.15);

    // Gain envelope: 0.7 -> 0 over 0.3s
    const gain = this.context.createGain();
    gain.gain.setValueAtTime(0.7 * volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);

    osc.connect(gain);
    gain.connect(output);

    osc.start(now);
    osc.stop(now + 0.3);
  }

  private playSnare(volume: number, pitchOffset: number = 0, output: AudioNode = this.masterGain): void {
    const now = this.context.currentTime;
    const ratio = this.pitchRatio(pitchOffset);

    // --- Tonal component: triangle wave at 200Hz with quick decay ---
    const osc = this.context.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(200 * ratio, now);

    const oscGain = this.context.createGain();
    oscGain.gain.setValueAtTime(0.5 * volume, now);
    oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

    osc.connect(oscGain);
    oscGain.connect(output);

    osc.start(now);
    osc.stop(now + 0.08);

    // --- Noise component: white noise bandpass filtered around 5000Hz ---
    const noise = this.createNoiseSource();

    const bandpass = this.context.createBiquadFilter();
    bandpass.type = 'bandpass';
    bandpass.frequency.setValueAtTime(5000 * ratio, now);
    bandpass.Q.setValueAtTime(1, now);

    const noiseGain = this.context.createGain();
    noiseGain.gain.setValueAtTime(0.6 * volume, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

    noise.connect(bandpass);
    bandpass.connect(noiseGain);
    noiseGain.connect(output);

    noise.start(now);
    noise.stop(now + 0.15);
  }

  private playHihat(volume: number, pitchOffset: number = 0, output: AudioNode = this.masterGain): void {
    const now = this.context.currentTime;
    const ratio = this.pitchRatio(pitchOffset);

    const noise = this.createNoiseSource();

    const highpass = this.context.createBiquadFilter();
    highpass.type = 'highpass';
    highpass.frequency.setValueAtTime(7000 * ratio, now);

    const gain = this.context.createGain();
    gain.gain.setValueAtTime(0.3 * volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);

    noise.connect(highpass);
    highpass.connect(gain);
    gain.connect(output);

    noise.start(now);
    noise.stop(now + 0.05);
  }

  private playClap(volume: number, pitchOffset: number = 0, output: AudioNode = this.masterGain): void {
    const now = this.context.currentTime;
    const ratio = this.pitchRatio(pitchOffset);

    const noise = this.createNoiseSource();

    const bandpass = this.context.createBiquadFilter();
    bandpass.type = 'bandpass';
    bandpass.frequency.setValueAtTime(1500 * ratio, now);
    bandpass.Q.setValueAtTime(0.8, now);

    const gain = this.context.createGain();

    // Three quick bursts then decay
    const burstDuration = 0.01;
    const burstGap = 0.015;
    gain.gain.setValueAtTime(0, now);

    for (let i = 0; i < 3; i++) {
      const burstStart = now + i * burstGap;
      gain.gain.setValueAtTime(0.6 * volume, burstStart);
      gain.gain.setValueAtTime(0.001, burstStart + burstDuration);
    }

    // Final sustain and decay after the bursts
    const decayStart = now + 3 * burstGap;
    gain.gain.setValueAtTime(0.6 * volume, decayStart);
    gain.gain.exponentialRampToValueAtTime(0.001, decayStart + 0.15);

    noise.connect(bandpass);
    bandpass.connect(gain);
    gain.connect(output);

    noise.start(now);
    noise.stop(decayStart + 0.15);
  }

  private playOpenHat(volume: number, pitchOffset: number = 0, output: AudioNode = this.masterGain): void {
    const now = this.context.currentTime;
    const ratio = this.pitchRatio(pitchOffset);

    const noise = this.createNoiseSource();

    const highpass = this.context.createBiquadFilter();
    highpass.type = 'highpass';
    highpass.frequency.setValueAtTime(6000 * ratio, now);

    const gain = this.context.createGain();
    gain.gain.setValueAtTime(0.25 * volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);

    noise.connect(highpass);
    highpass.connect(gain);
    gain.connect(output);

    noise.start(now);
    noise.stop(now + 0.3);
  }

  private playPercussion(volume: number, pitchOffset: number = 0, output: AudioNode = this.masterGain): void {
    const now = this.context.currentTime;
    const ratio = this.pitchRatio(pitchOffset);

    const osc = this.context.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(800 * ratio, now);
    osc.frequency.exponentialRampToValueAtTime(400 * ratio, now + 0.08);

    const gain = this.context.createGain();
    gain.gain.setValueAtTime(0.5 * volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

    osc.connect(gain);
    gain.connect(output);

    osc.start(now);
    osc.stop(now + 0.08);
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  /**
   * Generate a stereo impulse response buffer for convolution reverb.
   * Uses exponentially decaying noise with frequency-dependent decay.
   */
  private generateImpulseResponse(decay: number, dampingFreq: number): AudioBuffer {
    const sampleRate = this.context.sampleRate;
    const length = Math.floor(sampleRate * decay);
    const buffer = this.context.createBuffer(2, length, sampleRate);
    const left = buffer.getChannelData(0);
    const right = buffer.getChannelData(1);

    // Faster high-frequency decay for more natural sound
    const dampFactor = Math.max(0.2, dampingFreq / 12000);

    for (let i = 0; i < length; i++) {
      const t = i / sampleRate;
      // Exponential decay envelope
      const envelope = Math.exp(-3 * t / decay) * dampFactor +
                       Math.exp(-6 * t / decay) * (1 - dampFactor);
      // Stereo decorrelation with independent noise per channel
      left[i] = (Math.random() * 2 - 1) * envelope;
      right[i] = (Math.random() * 2 - 1) * envelope;
    }

    return buffer;
  }

  private createNoiseSource(): AudioBufferSourceNode {
    const source = this.context.createBufferSource();
    source.buffer = this.noiseBuffer;
    return source;
  }

  /** Read peak amplitude from an AnalyserNode using time-domain data. */
  private readPeak(analyser: AnalyserNode): number {
    const buf = new Uint8Array(analyser.fftSize);
    analyser.getByteTimeDomainData(buf);
    let peak = 0;
    for (let i = 0; i < buf.length; i++) {
      // Convert from 0-255 (128 = silence) to 0-1 amplitude
      const amplitude = Math.abs(buf[i] - 128) / 128;
      if (amplitude > peak) peak = amplitude;
    }
    return peak;
  }
}

export default AudioEngine;
