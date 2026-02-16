import type { InstrumentName } from '../types';

class AudioEngine {
  private context: AudioContext;
  private masterGain: GainNode;
  private noiseBuffer: AudioBuffer;

  constructor() {
    this.context = new AudioContext();
    this.masterGain = this.context.createGain();
    this.masterGain.connect(this.context.destination);
    this.masterGain.gain.value = 0.8;

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
   * Play a pitched piano note using a simple subtractive synth.
   * @param midiNote  MIDI note number (60 = C4)
   * @param volume    0–1
   * @param duration  Duration in seconds
   */
  async playPianoNote(
    midiNote: number,
    volume: number,
    duration: number = 0.2,
  ): Promise<void> {
    await this.resume();
    const now = this.context.currentTime;
    const freq = 440 * Math.pow(2, (midiNote - 69) / 12);

    // Two detuned saw oscillators for a richer tone
    const osc1 = this.context.createOscillator();
    osc1.type = 'sawtooth';
    osc1.frequency.setValueAtTime(freq, now);

    const osc2 = this.context.createOscillator();
    osc2.type = 'sawtooth';
    osc2.frequency.setValueAtTime(freq * 1.003, now); // slight detune

    // Low-pass filter for warmth
    const filter = this.context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(Math.min(freq * 4, 12000), now);
    filter.Q.setValueAtTime(1, now);

    // ADSR-ish envelope
    const gain = this.context.createGain();
    const attack = 0.005;
    const release = Math.min(0.15, duration * 0.3);
    const sustain = volume * 0.35;

    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(volume * 0.4, now + attack);
    gain.gain.linearRampToValueAtTime(sustain, now + attack + 0.05);
    gain.gain.setValueAtTime(sustain, now + duration - release);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    osc1.connect(filter);
    osc2.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);

    osc1.start(now);
    osc2.start(now);
    osc1.stop(now + duration + 0.01);
    osc2.stop(now + duration + 0.01);
  }

  async playSound(instrument: InstrumentName, volume: number): Promise<void> {
    await this.resume();

    switch (instrument) {
      case 'kick':
        this.playKick(volume);
        break;
      case 'snare':
        this.playSnare(volume);
        break;
      case 'hihat':
        this.playHihat(volume);
        break;
      case 'clap':
        this.playClap(volume);
        break;
      case 'openhat':
        this.playOpenHat(volume);
        break;
      case 'percussion':
        this.playPercussion(volume);
        break;
    }
  }

  setMasterVolume(value: number): void {
    this.masterGain.gain.value = Math.max(0, Math.min(1, value));
  }

  getMasterVolume(): number {
    return this.masterGain.gain.value;
  }

  // ---------------------------------------------------------------------------
  // Private synthesis methods
  // ---------------------------------------------------------------------------

  private playKick(volume: number): void {
    const now = this.context.currentTime;

    // Oscillator: sine wave with pitch sweep 150Hz -> 40Hz over 0.15s
    const osc = this.context.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(150, now);
    osc.frequency.exponentialRampToValueAtTime(40, now + 0.15);

    // Gain envelope: 0.7 -> 0 over 0.3s
    const gain = this.context.createGain();
    gain.gain.setValueAtTime(0.7 * volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(now);
    osc.stop(now + 0.3);
  }

  private playSnare(volume: number): void {
    const now = this.context.currentTime;

    // --- Tonal component: triangle wave at 200Hz with quick decay ---
    const osc = this.context.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(200, now);

    const oscGain = this.context.createGain();
    oscGain.gain.setValueAtTime(0.5 * volume, now);
    oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

    osc.connect(oscGain);
    oscGain.connect(this.masterGain);

    osc.start(now);
    osc.stop(now + 0.08);

    // --- Noise component: white noise bandpass filtered around 5000Hz ---
    const noise = this.createNoiseSource();

    const bandpass = this.context.createBiquadFilter();
    bandpass.type = 'bandpass';
    bandpass.frequency.setValueAtTime(5000, now);
    bandpass.Q.setValueAtTime(1, now);

    const noiseGain = this.context.createGain();
    noiseGain.gain.setValueAtTime(0.6 * volume, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

    noise.connect(bandpass);
    bandpass.connect(noiseGain);
    noiseGain.connect(this.masterGain);

    noise.start(now);
    noise.stop(now + 0.15);
  }

  private playHihat(volume: number): void {
    const now = this.context.currentTime;

    const noise = this.createNoiseSource();

    const highpass = this.context.createBiquadFilter();
    highpass.type = 'highpass';
    highpass.frequency.setValueAtTime(7000, now);

    const gain = this.context.createGain();
    gain.gain.setValueAtTime(0.3 * volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);

    noise.connect(highpass);
    highpass.connect(gain);
    gain.connect(this.masterGain);

    noise.start(now);
    noise.stop(now + 0.05);
  }

  private playClap(volume: number): void {
    const now = this.context.currentTime;

    const noise = this.createNoiseSource();

    const bandpass = this.context.createBiquadFilter();
    bandpass.type = 'bandpass';
    bandpass.frequency.setValueAtTime(1500, now);
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
    gain.connect(this.masterGain);

    noise.start(now);
    noise.stop(decayStart + 0.15);
  }

  private playOpenHat(volume: number): void {
    const now = this.context.currentTime;

    const noise = this.createNoiseSource();

    const highpass = this.context.createBiquadFilter();
    highpass.type = 'highpass';
    highpass.frequency.setValueAtTime(6000, now);

    const gain = this.context.createGain();
    gain.gain.setValueAtTime(0.25 * volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);

    noise.connect(highpass);
    highpass.connect(gain);
    gain.connect(this.masterGain);

    noise.start(now);
    noise.stop(now + 0.3);
  }

  private playPercussion(volume: number): void {
    const now = this.context.currentTime;

    const osc = this.context.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(800, now);
    osc.frequency.exponentialRampToValueAtTime(400, now + 0.08);

    const gain = this.context.createGain();
    gain.gain.setValueAtTime(0.5 * volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(now);
    osc.stop(now + 0.08);
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private createNoiseSource(): AudioBufferSourceNode {
    const source = this.context.createBufferSource();
    source.buffer = this.noiseBuffer;
    return source;
  }
}

export default AudioEngine;
