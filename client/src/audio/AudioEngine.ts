import type { InstrumentName, ReverbSettings, DelaySettings, DelaySync, FilterSettings, SynthSettings, OscillatorType, SampleFormat, InsertEffect, InsertEffectType, InsertEffectParams, FilterEffectParams, ReverbEffectParams, DelayEffectParams, DistortionEffectParams, ChorusEffectParams, CompressorEffectParams, SendChannel, MixerTrack, EQBand } from '../types';

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

  // Insert effect chains per channel
  // Each channel stores an array of effect node groups + a dry bypass gain.
  // Signal flow: panner → [effect1 → effect2 → ...] → analyser
  private insertEffectChains: Map<string, {
    effects: { id: string; nodes: AudioNode[]; inputNode: AudioNode; outputNode: AudioNode; bypassGain: GainNode; wetGain: GainNode; enabled: boolean }[];
    panner: StereoPannerNode;
    analyser: AnalyserNode;
  }> = new Map();

  // User-defined send/FX bus channels
  // Each send channel has: inputBus → [insert FX chain] → outputGain → masterGain
  private sendChannelBuses: Map<string, { inputBus: GainNode; outputGain: GainNode; analyser: AnalyserNode }> = new Map();
  // Per-source-channel per-send-channel send gains: Map<`${sourceChannelId}:${sendChannelId}`, GainNode>
  private sendChannelSendGains: Map<string, GainNode> = new Map();

  // Mixer tracks: channels can route through these instead of directly to master
  // Each mixer track has: inputGain → [eq bands] → panner → analyser → masterGain
  private mixerTrackNodes: Map<string, { inputGain: GainNode; eqBands: BiquadFilterNode[]; eqEnabled: boolean; panner: StereoPannerNode; analyser: AnalyserNode }> = new Map();
  // Track which mixer track each channel is routed to (channelId → mixerTrackId)
  private channelMixerRouting: Map<string, string> = new Map();

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
  // Insert effect chains
  // ---------------------------------------------------------------------------

  /**
   * Rebuild the insert effect chain for a channel.
   * Disconnects old chain, creates new Web Audio nodes, and wires them in series.
   * @param channelId  Either an InstrumentName or a sample track ID
   * @param effects    Array of InsertEffect definitions
   */
  rebuildInsertEffects(channelId: string, effects: InsertEffect[]): void {
    // Determine the panner, analyser, and send gains for this channel
    const isInstrument = this.panners.has(channelId as InstrumentName);
    const panner = isInstrument
      ? this.panners.get(channelId as InstrumentName)!
      : this.samplePanners.get(channelId);
    const analyser = isInstrument
      ? this.channelAnalysers.get(channelId as InstrumentName)!
      : this.sampleAnalysers.get(channelId);

    if (!panner || !analyser) return;

    // Get send gains (reverb, delay, filter) for reconnection
    const reverbSend = isInstrument
      ? this.reverbSendGains.get(channelId as InstrumentName)
      : this.sampleReverbSendGains.get(channelId);
    const delaySend = isInstrument
      ? this.delaySendGains.get(channelId as InstrumentName)
      : this.sampleDelaySendGains.get(channelId);
    const filterSend = isInstrument
      ? this.filterSendGains.get(channelId as InstrumentName)
      : this.sampleFilterSendGains.get(channelId);

    // Disconnect old chain
    const existing = this.insertEffectChains.get(channelId);
    if (existing) {
      for (const fx of existing.effects) {
        for (const node of fx.nodes) {
          node.disconnect();
        }
        fx.bypassGain.disconnect();
        fx.wetGain.disconnect();
      }
    }

    // Disconnect panner from everything (will rewire below)
    panner.disconnect();

    if (effects.length === 0) {
      // No insert effects: direct panner → analyser + sends
      panner.connect(analyser);
      analyser.connect(this.getChannelOutputDestination(channelId));
      if (reverbSend) { panner.connect(reverbSend); }
      if (delaySend) { panner.connect(delaySend); }
      if (filterSend) { panner.connect(filterSend); }
      // Reconnect user-defined send channel gains
      for (const [key, sendGain] of this.sendChannelSendGains) {
        if (key.startsWith(`${channelId}:`)) {
          panner.connect(sendGain);
        }
      }
      this.insertEffectChains.delete(channelId);
      return;
    }

    // Build effect node groups
    const fxChain: typeof existing extends undefined ? never : NonNullable<typeof existing>['effects'] = [];

    for (const fx of effects) {
      const { nodes, inputNode, outputNode } = this.createEffectNodes(fx);
      const bypassGain = this.context.createGain();
      const wetGain = this.context.createGain();

      if (fx.enabled) {
        bypassGain.gain.value = 0;
        wetGain.gain.value = 1;
      } else {
        bypassGain.gain.value = 1;
        wetGain.gain.value = 0;
      }

      // Wire: input splits to both bypass and effect chain
      // Output merges bypass and wet
      outputNode.connect(wetGain);

      fxChain.push({ id: fx.id, nodes, inputNode, outputNode, bypassGain, wetGain, enabled: fx.enabled });
    }

    // Wire chain: panner → fx1 → fx2 → ... → analyser
    let prevOutput: AudioNode = panner;

    for (const fx of fxChain) {
      // prevOutput → inputNode (effect processing)
      prevOutput.connect(fx.inputNode);
      // prevOutput → bypassGain (dry bypass)
      prevOutput.connect(fx.bypassGain);
      // Create a merge node for this effect's output
      const merge = this.context.createGain();
      merge.gain.value = 1;
      fx.wetGain.connect(merge);
      fx.bypassGain.connect(merge);
      // Store merge as a node so we can disconnect later
      fx.nodes.push(merge);
      prevOutput = merge;
    }

    // Final output → analyser + sends
    prevOutput.connect(analyser);
    analyser.connect(this.getChannelOutputDestination(channelId));
    if (reverbSend) { prevOutput.connect(reverbSend); }
    if (delaySend) { prevOutput.connect(delaySend); }
    if (filterSend) { prevOutput.connect(filterSend); }

    // Reconnect user-defined send channel gains
    for (const [key, sendGain] of this.sendChannelSendGains) {
      if (key.startsWith(`${channelId}:`)) {
        prevOutput.connect(sendGain);
      }
    }

    this.insertEffectChains.set(channelId, { effects: fxChain, panner, analyser });
  }

  /** Toggle bypass for a single insert effect slot. */
  setInsertEffectEnabled(channelId: string, effectId: string, enabled: boolean): void {
    const chain = this.insertEffectChains.get(channelId);
    if (!chain) return;
    const fx = chain.effects.find((f) => f.id === effectId);
    if (!fx) return;
    fx.enabled = enabled;
    fx.bypassGain.gain.value = enabled ? 0 : 1;
    fx.wetGain.gain.value = enabled ? 1 : 0;
  }

  /** Create Web Audio nodes for a given insert effect. */
  private createEffectNodes(fx: InsertEffect): { nodes: AudioNode[]; inputNode: AudioNode; outputNode: AudioNode } {
    switch (fx.effectType) {
      case 'filter':
        return this.createFilterEffect(fx.params as FilterEffectParams);
      case 'reverb':
        return this.createReverbEffect(fx.params as ReverbEffectParams);
      case 'delay':
        return this.createDelayEffect(fx.params as DelayEffectParams);
      case 'distortion':
        return this.createDistortionEffect(fx.params as DistortionEffectParams);
      case 'chorus':
        return this.createChorusEffect(fx.params as ChorusEffectParams);
      case 'compressor':
        return this.createCompressorEffect(fx.params as CompressorEffectParams);
    }
  }

  private createFilterEffect(params: FilterEffectParams): { nodes: AudioNode[]; inputNode: AudioNode; outputNode: AudioNode } {
    const filter = this.context.createBiquadFilter();
    filter.type = params.type as BiquadFilterType;
    filter.frequency.value = Math.max(20, Math.min(20000, params.cutoff));
    filter.Q.value = Math.max(0.1, Math.min(25, params.resonance));
    return { nodes: [filter], inputNode: filter, outputNode: filter };
  }

  private createReverbEffect(params: ReverbEffectParams): { nodes: AudioNode[]; inputNode: AudioNode; outputNode: AudioNode } {
    const preDelay = this.context.createDelay(0.1);
    preDelay.delayTime.value = Math.max(0, Math.min(0.1, params.preDelay));

    const convolver = this.context.createConvolver();
    const dampFreq = 12000 - params.damping * 11000;
    convolver.buffer = this.generateImpulseResponse(params.decay, dampFreq);

    const wetGain = this.context.createGain();
    wetGain.gain.value = params.mix;

    const dryGain = this.context.createGain();
    dryGain.gain.value = 1 - params.mix;

    const inputSplitter = this.context.createGain();
    inputSplitter.gain.value = 1;

    const outputMerge = this.context.createGain();
    outputMerge.gain.value = 1;

    inputSplitter.connect(preDelay);
    preDelay.connect(convolver);
    convolver.connect(wetGain);
    wetGain.connect(outputMerge);
    inputSplitter.connect(dryGain);
    dryGain.connect(outputMerge);

    return { nodes: [inputSplitter, preDelay, convolver, wetGain, dryGain, outputMerge], inputNode: inputSplitter, outputNode: outputMerge };
  }

  private createDelayEffect(params: DelayEffectParams): { nodes: AudioNode[]; inputNode: AudioNode; outputNode: AudioNode } {
    const delay = this.context.createDelay(2);
    delay.delayTime.value = Math.max(0.01, Math.min(2, params.time));

    const feedback = this.context.createGain();
    feedback.gain.value = Math.max(0, Math.min(0.9, params.feedback));

    const wetGain = this.context.createGain();
    wetGain.gain.value = params.mix;

    const dryGain = this.context.createGain();
    dryGain.gain.value = 1 - params.mix;

    const inputSplitter = this.context.createGain();
    inputSplitter.gain.value = 1;

    const outputMerge = this.context.createGain();
    outputMerge.gain.value = 1;

    inputSplitter.connect(delay);
    delay.connect(feedback);
    feedback.connect(delay);
    delay.connect(wetGain);
    wetGain.connect(outputMerge);
    inputSplitter.connect(dryGain);
    dryGain.connect(outputMerge);

    return { nodes: [inputSplitter, delay, feedback, wetGain, dryGain, outputMerge], inputNode: inputSplitter, outputNode: outputMerge };
  }

  private createDistortionEffect(params: DistortionEffectParams): { nodes: AudioNode[]; inputNode: AudioNode; outputNode: AudioNode } {
    const inputSplitter = this.context.createGain();
    inputSplitter.gain.value = 1;

    const waveshaper = this.context.createWaveShaper();
    waveshaper.oversample = '4x';
    const drive = Math.max(1, Math.min(100, params.drive));
    const samples = 44100;
    const curve = new Float32Array(samples);
    const mode = params.mode || 'distortion';
    for (let i = 0; i < samples; i++) {
      const x = (i * 2) / samples - 1;
      switch (mode) {
        case 'overdrive': {
          // Soft-clip with asymmetric response for tube-like warmth
          const k = drive * 0.5;
          curve[i] = Math.tanh(k * x);
          break;
        }
        case 'saturation': {
          // Gentle tape-style saturation using soft sigmoid
          const amount = 1 + drive * 0.3;
          curve[i] = x / (1 + Math.abs(x) * amount) * (1 + amount * 0.2);
          break;
        }
        default: {
          // Hard distortion — original algorithm
          curve[i] = ((Math.PI + drive) * x) / (Math.PI + drive * Math.abs(x));
          break;
        }
      }
    }
    waveshaper.curve = curve;

    // Post-distortion tone filter (low-pass)
    const toneFilter = this.context.createBiquadFilter();
    toneFilter.type = 'lowpass';
    toneFilter.frequency.value = Math.max(200, Math.min(20000, params.tone ?? 8000));
    toneFilter.Q.value = 0.707;

    const wetGain = this.context.createGain();
    const mix = Math.max(0, Math.min(1, params.mix ?? 1));
    wetGain.gain.value = mix;

    const dryGain = this.context.createGain();
    dryGain.gain.value = 1 - mix;

    const outputGain = this.context.createGain();
    outputGain.gain.value = Math.max(0, Math.min(1, params.outputGain));

    const outputMerge = this.context.createGain();
    outputMerge.gain.value = 1;

    // Wet path: input → waveshaper → tone → wetGain → merge
    inputSplitter.connect(waveshaper);
    waveshaper.connect(toneFilter);
    toneFilter.connect(wetGain);
    wetGain.connect(outputMerge);

    // Dry path: input → dryGain → merge
    inputSplitter.connect(dryGain);
    dryGain.connect(outputMerge);

    // Final output gain
    outputMerge.connect(outputGain);

    return { nodes: [inputSplitter, waveshaper, toneFilter, wetGain, dryGain, outputMerge, outputGain], inputNode: inputSplitter, outputNode: outputGain };
  }

  private createChorusEffect(params: ChorusEffectParams): { nodes: AudioNode[]; inputNode: AudioNode; outputNode: AudioNode } {
    const inputSplitter = this.context.createGain();
    inputSplitter.gain.value = 1;

    const delay = this.context.createDelay(0.05);
    delay.delayTime.value = 0.025;

    const lfo = this.context.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = Math.max(0.1, Math.min(10, params.rate));

    const lfoGain = this.context.createGain();
    lfoGain.gain.value = Math.max(0, Math.min(1, params.depth)) * 0.01;

    lfo.connect(lfoGain);
    lfoGain.connect(delay.delayTime);
    lfo.start();

    const wetGain = this.context.createGain();
    wetGain.gain.value = params.mix;

    const dryGain = this.context.createGain();
    dryGain.gain.value = 1 - params.mix;

    const outputMerge = this.context.createGain();
    outputMerge.gain.value = 1;

    inputSplitter.connect(delay);
    delay.connect(wetGain);
    wetGain.connect(outputMerge);
    inputSplitter.connect(dryGain);
    dryGain.connect(outputMerge);

    return { nodes: [inputSplitter, delay, lfo, lfoGain, wetGain, dryGain, outputMerge], inputNode: inputSplitter, outputNode: outputMerge };
  }

  private createCompressorEffect(params: CompressorEffectParams): { nodes: AudioNode[]; inputNode: AudioNode; outputNode: AudioNode } {
    const compressor = this.context.createDynamicsCompressor();
    compressor.threshold.value = Math.max(-60, Math.min(0, params.threshold));
    compressor.ratio.value = Math.max(1, Math.min(20, params.ratio));
    compressor.attack.value = Math.max(0.001, Math.min(1, params.attack));
    compressor.release.value = Math.max(0.01, Math.min(1, params.release));
    // knee fixed at a moderate value for musical response
    compressor.knee.value = 6;

    const makeupGain = this.context.createGain();
    // Convert dB to linear gain
    makeupGain.gain.value = Math.pow(10, Math.max(0, Math.min(40, params.gain)) / 20);

    compressor.connect(makeupGain);

    return { nodes: [compressor, makeupGain], inputNode: compressor, outputNode: makeupGain };
  }

  // ---------------------------------------------------------------------------
  // Send channels (FX buses)
  // ---------------------------------------------------------------------------

  /** Create a send channel bus. Audio from source channels is summed here. */
  ensureSendChannel(sendChannelId: string, volume: number = 1): void {
    if (this.sendChannelBuses.has(sendChannelId)) return;

    const inputBus = this.context.createGain();
    inputBus.gain.value = 1;

    const analyser = this.context.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.3;

    const outputGain = this.context.createGain();
    outputGain.gain.value = Math.max(0, Math.min(1, volume));

    // Default routing: inputBus → analyser → outputGain → masterGain
    inputBus.connect(analyser);
    analyser.connect(outputGain);
    outputGain.connect(this.masterGain);

    this.sendChannelBuses.set(sendChannelId, { inputBus, outputGain, analyser });
  }

  /** Remove a send channel bus and all associated send gains. */
  removeSendChannel(sendChannelId: string): void {
    const bus = this.sendChannelBuses.get(sendChannelId);
    if (bus) {
      bus.inputBus.disconnect();
      bus.analyser.disconnect();
      bus.outputGain.disconnect();
      this.sendChannelBuses.delete(sendChannelId);
    }
    // Remove all send gains that route to this send channel
    for (const [key, gain] of this.sendChannelSendGains) {
      if (key.endsWith(`:${sendChannelId}`)) {
        gain.disconnect();
        this.sendChannelSendGains.delete(key);
      }
    }
    // Remove insert effect chain for the send channel
    this.insertEffectChains.delete(sendChannelId);
  }

  /** Set the output volume of a send channel bus. */
  setSendChannelVolume(sendChannelId: string, volume: number): void {
    const bus = this.sendChannelBuses.get(sendChannelId);
    if (bus) {
      bus.outputGain.gain.value = Math.max(0, Math.min(1, volume));
    }
  }

  /** Get peak level for a send channel. */
  getSendChannelLevel(sendChannelId: string): number {
    const bus = this.sendChannelBuses.get(sendChannelId);
    if (!bus) return 0;
    return this.readPeak(bus.analyser);
  }

  /**
   * Set the send level from a source channel to a send channel.
   * Creates/connects the send gain node if needed.
   */
  setChannelSendLevel(sourceChannelId: string, sendChannelId: string, level: number): void {
    const bus = this.sendChannelBuses.get(sendChannelId);
    if (!bus) return;

    const key = `${sourceChannelId}:${sendChannelId}`;
    let sendGain = this.sendChannelSendGains.get(key);

    if (!sendGain) {
      // Create new send gain and connect it
      sendGain = this.context.createGain();
      sendGain.gain.value = 0;
      this.sendChannelSendGains.set(key, sendGain);
      sendGain.connect(bus.inputBus);

      // Connect from the source channel's post-insert output
      // Find the final output node for this channel
      this.connectSendGainToSource(sourceChannelId, sendGain);
    }

    sendGain.gain.value = Math.max(0, Math.min(1, level));
  }

  /**
   * Rebuild the insert effect chain for a send channel.
   * Signal flow: inputBus → [fx chain] → analyser → outputGain → masterGain
   */
  rebuildSendChannelInsertEffects(sendChannelId: string, effects: InsertEffect[]): void {
    const bus = this.sendChannelBuses.get(sendChannelId);
    if (!bus) return;

    // Disconnect old chain
    const existing = this.insertEffectChains.get(sendChannelId);
    if (existing) {
      for (const fx of existing.effects) {
        for (const node of fx.nodes) {
          node.disconnect();
        }
        fx.bypassGain.disconnect();
        fx.wetGain.disconnect();
      }
    }

    // Disconnect inputBus from everything
    bus.inputBus.disconnect();

    if (effects.length === 0) {
      // No effects: inputBus → analyser → outputGain → masterGain
      bus.inputBus.connect(bus.analyser);
      bus.analyser.connect(bus.outputGain);
      bus.outputGain.connect(this.masterGain);
      this.insertEffectChains.delete(sendChannelId);
      return;
    }

    // Build effect chain (same logic as regular channels)
    const fxChain: { id: string; nodes: AudioNode[]; inputNode: AudioNode; outputNode: AudioNode; bypassGain: GainNode; wetGain: GainNode; enabled: boolean }[] = [];

    for (const fx of effects) {
      const { nodes, inputNode, outputNode } = this.createEffectNodes(fx);
      const bypassGain = this.context.createGain();
      const wetGain = this.context.createGain();

      if (fx.enabled) {
        bypassGain.gain.value = 0;
        wetGain.gain.value = 1;
      } else {
        bypassGain.gain.value = 1;
        wetGain.gain.value = 0;
      }

      outputNode.connect(wetGain);
      fxChain.push({ id: fx.id, nodes, inputNode, outputNode, bypassGain, wetGain, enabled: fx.enabled });
    }

    // Wire: inputBus → fx1 → fx2 → ... → analyser → outputGain → masterGain
    let prevOutput: AudioNode = bus.inputBus;

    for (const fx of fxChain) {
      prevOutput.connect(fx.inputNode);
      prevOutput.connect(fx.bypassGain);
      const merge = this.context.createGain();
      merge.gain.value = 1;
      fx.wetGain.connect(merge);
      fx.bypassGain.connect(merge);
      fx.nodes.push(merge);
      prevOutput = merge;
    }

    prevOutput.connect(bus.analyser);
    bus.analyser.connect(bus.outputGain);
    bus.outputGain.connect(this.masterGain);

    // Store using the same insertEffectChains map (reuse the bypass toggle logic)
    this.insertEffectChains.set(sendChannelId, {
      effects: fxChain,
      panner: bus.inputBus as unknown as StereoPannerNode, // placeholder, not used for sends
      analyser: bus.analyser,
    });
  }

  // ---------------------------------------------------------------------------
  // Mixer tracks (channel routing)
  // ---------------------------------------------------------------------------

  /** Create a mixer track with gain, EQ, panner, and analyser. */
  ensureMixerTrack(mixerTrackId: string, volume: number = 1, pan: number = 0, eqBands?: EQBand[], eqEnabled: boolean = true): void {
    if (this.mixerTrackNodes.has(mixerTrackId)) return;

    const inputGain = this.context.createGain();
    inputGain.gain.value = Math.max(0, Math.min(1, volume));

    // Create 3-band parametric EQ
    const eqNodes: BiquadFilterNode[] = [];
    const bandDefaults: EQBand[] = eqBands ?? [
      { enabled: true, frequency: 200, gain: 0, q: 1, type: 'lowshelf' },
      { enabled: true, frequency: 1000, gain: 0, q: 1, type: 'peaking' },
      { enabled: true, frequency: 5000, gain: 0, q: 1, type: 'highshelf' },
    ];
    for (const band of bandDefaults) {
      const filter = this.context.createBiquadFilter();
      filter.type = band.type as BiquadFilterType;
      filter.frequency.value = band.frequency;
      filter.gain.value = (band.enabled && eqEnabled) ? band.gain : 0;
      filter.Q.value = band.q;
      eqNodes.push(filter);
    }

    const panner = this.context.createStereoPanner();
    panner.pan.value = Math.max(-1, Math.min(1, pan));

    const analyser = this.context.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.3;

    // Signal chain: inputGain → eq1 → eq2 → eq3 → panner → analyser → masterGain
    let prevNode: AudioNode = inputGain;
    for (const eq of eqNodes) {
      prevNode.connect(eq);
      prevNode = eq;
    }
    prevNode.connect(panner);
    panner.connect(analyser);
    analyser.connect(this.masterGain);

    this.mixerTrackNodes.set(mixerTrackId, { inputGain, eqBands: eqNodes, eqEnabled, panner, analyser });
  }

  /** Remove a mixer track and re-route any channels using it back to master. */
  removeMixerTrack(mixerTrackId: string): void {
    const nodes = this.mixerTrackNodes.get(mixerTrackId);
    if (!nodes) return;

    // Re-route any channels assigned to this mixer track back to master
    for (const [channelId, routedTo] of this.channelMixerRouting) {
      if (routedTo === mixerTrackId) {
        this.channelMixerRouting.delete(channelId);
        this.rewireChannelOutput(channelId, null);
      }
    }

    nodes.inputGain.disconnect();
    for (const eq of nodes.eqBands) {
      eq.disconnect();
    }
    nodes.panner.disconnect();
    nodes.analyser.disconnect();
    this.mixerTrackNodes.delete(mixerTrackId);
  }

  /** Set the volume of a mixer track. */
  setMixerTrackVolume(mixerTrackId: string, volume: number): void {
    const nodes = this.mixerTrackNodes.get(mixerTrackId);
    if (nodes) {
      nodes.inputGain.gain.value = Math.max(0, Math.min(1, volume));
    }
  }

  /** Set the pan of a mixer track. */
  setMixerTrackPan(mixerTrackId: string, pan: number): void {
    const nodes = this.mixerTrackNodes.get(mixerTrackId);
    if (nodes) {
      nodes.panner.pan.value = Math.max(-1, Math.min(1, pan));
    }
  }

  /** Get peak level for a mixer track. */
  getMixerTrackLevel(mixerTrackId: string): number {
    const nodes = this.mixerTrackNodes.get(mixerTrackId);
    if (!nodes) return 0;
    return this.readPeak(nodes.analyser);
  }

  /** Update a single EQ band on a mixer track. */
  setMixerTrackEQBand(mixerTrackId: string, bandIndex: number, band: EQBand): void {
    const nodes = this.mixerTrackNodes.get(mixerTrackId);
    if (!nodes || bandIndex < 0 || bandIndex >= nodes.eqBands.length) return;
    const filter = nodes.eqBands[bandIndex];
    filter.type = band.type as BiquadFilterType;
    filter.frequency.value = Math.max(20, Math.min(20000, band.frequency));
    filter.Q.value = Math.max(0.1, Math.min(18, band.q));
    filter.gain.value = (band.enabled && nodes.eqEnabled) ? Math.max(-24, Math.min(24, band.gain)) : 0;
  }

  /** Toggle the entire EQ on/off for a mixer track. */
  setMixerTrackEQEnabled(mixerTrackId: string, enabled: boolean, bands: EQBand[]): void {
    const nodes = this.mixerTrackNodes.get(mixerTrackId);
    if (!nodes) return;
    nodes.eqEnabled = enabled;
    for (let i = 0; i < nodes.eqBands.length && i < bands.length; i++) {
      nodes.eqBands[i].gain.value = (enabled && bands[i].enabled) ? bands[i].gain : 0;
    }
  }

  /**
   * Route a channel to a mixer track (or back to master if mixerTrackId is null).
   * This changes where the channel's analyser output connects to.
   */
  setChannelMixerRouting(channelId: string, mixerTrackId: string | null): void {
    const prevRouting = this.channelMixerRouting.get(channelId) ?? null;
    if (prevRouting === mixerTrackId) return;

    if (mixerTrackId) {
      this.channelMixerRouting.set(channelId, mixerTrackId);
    } else {
      this.channelMixerRouting.delete(channelId);
    }

    this.rewireChannelOutput(channelId, mixerTrackId);
  }

  /** Get the output destination for a channel (mixer track input or master gain). */
  private getChannelOutputDestination(channelId: string): AudioNode {
    const mixerTrackId = this.channelMixerRouting.get(channelId);
    if (mixerTrackId) {
      const nodes = this.mixerTrackNodes.get(mixerTrackId);
      if (nodes) return nodes.inputGain;
    }
    return this.masterGain;
  }

  /**
   * Rewire a channel's analyser output to either a mixer track or master.
   * The channel's signal chain is: panner → [insert FX] → analyser → [destination]
   * We change only the analyser's output destination.
   */
  private rewireChannelOutput(channelId: string, mixerTrackId: string | null): void {
    const isInstrument = this.channelAnalysers.has(channelId as InstrumentName);
    const analyser = isInstrument
      ? this.channelAnalysers.get(channelId as InstrumentName)
      : this.sampleAnalysers.get(channelId);

    if (!analyser) return;

    // Disconnect analyser from its current output
    analyser.disconnect();

    // Reconnect to the new destination
    analyser.connect(this.getChannelOutputDestination(channelId));
  }

  /**
   * Connect a send gain node to the post-insert output of a source channel.
   * This taps from the same point as the reverb/delay/filter sends.
   */
  private connectSendGainToSource(sourceChannelId: string, sendGain: GainNode): void {
    // Check if there's an insert effect chain — if so, find the final merge node
    const chain = this.insertEffectChains.get(sourceChannelId);
    if (chain && chain.effects.length > 0) {
      // The last effect's last node is the merge node
      const lastFx = chain.effects[chain.effects.length - 1];
      const mergeNode = lastFx.nodes[lastFx.nodes.length - 1];
      mergeNode.connect(sendGain);
    } else {
      // No insert effects: connect from the panner
      const isInstrument = this.panners.has(sourceChannelId as InstrumentName);
      const panner = isInstrument
        ? this.panners.get(sourceChannelId as InstrumentName)
        : this.samplePanners.get(sourceChannelId);
      if (panner) {
        panner.connect(sendGain);
      }
    }
  }

  /**
   * Reconnect all send gains for a source channel (call after insert effects rebuild).
   */
  reconnectSendGains(sourceChannelId: string): void {
    for (const [key, sendGain] of this.sendChannelSendGains) {
      if (key.startsWith(`${sourceChannelId}:`)) {
        // Disconnect and reconnect
        // We can't selectively disconnect inputs, so we disconnect all and reconnect to bus
        const sendChannelId = key.split(':').slice(1).join(':');
        const bus = this.sendChannelBuses.get(sendChannelId);
        if (bus) {
          sendGain.disconnect();
          sendGain.connect(bus.inputBus);
          this.connectSendGainToSource(sourceChannelId, sendGain);
        }
      }
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
  // Metronome
  // ---------------------------------------------------------------------------

  /**
   * Play a metronome click sound.
   * @param accent  True for the downbeat (beat 1), which plays a higher pitch.
   * @param volume  0–1
   */
  async playMetronome(accent: boolean, volume: number = 0.5): Promise<void> {
    await this.resume();
    const now = this.context.currentTime;
    const freq = accent ? 1500 : 1000;
    const duration = 0.03;

    const osc = this.context.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, now);

    const gain = this.context.createGain();
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(now);
    osc.stop(now + duration);
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
