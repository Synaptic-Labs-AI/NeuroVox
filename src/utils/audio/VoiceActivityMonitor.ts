// src/utils/audio/VoiceActivityMonitor.ts

export interface VoiceActivityOptions {
    /** RMS amplitude (0..1) below which a sample is considered silence. */
    silenceThreshold?: number;
    /** How often to sample the input level, in ms. */
    sampleIntervalMs?: number;
}

/**
 * Lightweight voice-activity / silence detector over a MediaStream.
 *
 * Taps the mic with a Web Audio AnalyserNode (separate from the recorder) and tracks how long
 * the input has been below a silence threshold. Used to rotate recording segments at natural
 * pauses instead of arbitrary time boundaries, so segment splits fall between words.
 */
export class VoiceActivityMonitor {
    private audioContext: AudioContext | null = null;
    private analyser: AnalyserNode | null = null;
    private source: MediaStreamAudioSourceNode | null = null;
    private intervalId: number | null = null;
    private buffer: Uint8Array = new Uint8Array(0);
    private lastVoiceTime: number = 0;

    private readonly threshold: number;
    private readonly sampleInterval: number;

    constructor(private stream: MediaStream, options: VoiceActivityOptions = {}) {
        this.threshold = options.silenceThreshold ?? 0.015;
        this.sampleInterval = options.sampleIntervalMs ?? 100;
    }

    start(): void {
        if (this.audioContext) return;

        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) return; // no Web Audio -> caller falls back to time-based rotation

        this.audioContext = new Ctx();
        this.source = this.audioContext.createMediaStreamSource(this.stream);
        this.analyser = this.audioContext.createAnalyser();
        this.analyser.fftSize = 2048;
        this.buffer = new Uint8Array(this.analyser.fftSize);
        // Intentionally not connected to destination — analysis only, no playback/echo.
        this.source.connect(this.analyser);

        this.lastVoiceTime = Date.now();
        this.intervalId = window.setInterval(() => this.sample(), this.sampleInterval);
    }

    private sample(): void {
        if (!this.analyser) return;

        this.analyser.getByteTimeDomainData(this.buffer);
        let sumSquares = 0;
        for (let i = 0; i < this.buffer.length; i++) {
            const centered = (this.buffer[i] - 128) / 128; // -1..1
            sumSquares += centered * centered;
        }
        const rms = Math.sqrt(sumSquares / this.buffer.length);

        if (rms >= this.threshold) {
            this.lastVoiceTime = Date.now();
        }
    }

    /** Milliseconds since voice was last detected (0 while currently voiced). */
    silentForMs(): number {
        if (!this.audioContext) return 0;
        return Date.now() - this.lastVoiceTime;
    }

    /** Whether monitoring is actually running (Web Audio available and started). */
    isActive(): boolean {
        return this.audioContext !== null;
    }

    stop(): void {
        if (this.intervalId !== null) {
            window.clearInterval(this.intervalId);
            this.intervalId = null;
        }
        try { this.source?.disconnect(); } catch { /* noop */ }
        try { this.analyser?.disconnect(); } catch { /* noop */ }
        try { void this.audioContext?.close(); } catch { /* noop */ }
        this.source = null;
        this.analyser = null;
        this.audioContext = null;
    }
}
