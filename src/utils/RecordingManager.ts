import RecordRTC from 'recordrtc';
import { AudioQuality } from '../settings/Settings';
import NeuroVoxPlugin from '../main';

import { Options } from 'recordrtc';

/**
 * Valid number of audio channels for RecordRTC
 */
type AudioChannels = 1 | 2;

/**
 * Configuration options for audio recording that extend RecordRTC Options
 */
interface AudioRecorderOptions extends Options {
    type: 'audio';
    recorderType: typeof RecordRTC.StereoAudioRecorder;
    numberOfAudioChannels: AudioChannels;
    desiredSampRate: number;
    bitsPerSecond: number;
    timeSlice?: number;
}

/**
 * Manages audio recording functionality using RecordRTC.
 * This class specifically handles audio-only recording for voice notes.
 */
export class AudioRecordingManager {
    private recorder: RecordRTC | null = null;
    private stream: MediaStream | null = null;

    private currentOptions?: {
        timeSlice?: number;
        onDataAvailable?: (blob: Blob) => Promise<void>;
    };

    // Audio quality settings (sample rates in Hz)
    private readonly SAMPLE_RATES = {
        [AudioQuality.Low]: 22050,    // Voice optimized
        [AudioQuality.Medium]: 32000,  // High quality voice
        [AudioQuality.High]: 44100     // CD quality
    };

    // Bitrate settings (bits per second)
    private readonly BIT_RATES = {
        [AudioQuality.Low]: 64000,     // Good for voice
        [AudioQuality.Medium]: 128000, // Excellent voice quality
        [AudioQuality.High]: 192000    // Studio quality
    };

    constructor(private plugin: NeuroVoxPlugin) {}

    /**
     * Gets audio configuration based on current quality settings
     */
    private getAudioConfig(): AudioRecorderOptions {
        const quality = this.plugin.settings.audioQuality;
        return {
            type: 'audio',
            mimeType: "audio/webm",  // Use WebM container for better compression
            recorderType: RecordRTC.StereoAudioRecorder,
            numberOfAudioChannels: 1 as AudioChannels,
            desiredSampRate: this.SAMPLE_RATES[quality] || this.SAMPLE_RATES[AudioQuality.Medium],
            // Add bitrate control for better compression
            bitsPerSecond: this.BIT_RATES[quality] || this.BIT_RATES[AudioQuality.Medium]
        };
    }

    /**
     * Initializes the recording manager with microphone access
     */
    async initialize(): Promise<void> {
        try {
            this.stream = await navigator.mediaDevices.getUserMedia({ 
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                }
            });
        } catch (error) {
            throw new Error('Failed to access microphone');
        }
    }

    start(options?: { timeSlice?: number; onDataAvailable?: (blob: Blob) => Promise<void> }): void {
        if (!this.stream) {
            throw new Error('Audio recorder not initialized');
        }

        // Store options for potential recorder recreation
        this.currentOptions = options;

        // Create recorder with current options
        const config = {
            ...this.getAudioConfig(),
            timeSlice: options?.timeSlice
        };

        this.recorder = new RecordRTC(this.stream, config);

        // Set up data available handler if provided
        if (options?.onDataAvailable) {
            (this.recorder as any).addEventListener('dataavailable', async (event: { data: Blob }) => {
                await options.onDataAvailable?.(event.data);
            });
        }

        this.recorder.startRecording();
    }

    pause(): void {
        if (!this.recorder) return;
        this.recorder.pauseRecording();
    }

    resume(): void {
        if (!this.recorder) return;
        this.recorder.resumeRecording();
    }

    async stop(): Promise<Blob | null> {
        if (!this.recorder) return null;

        return new Promise((resolve) => {
            if (!this.recorder) {
                resolve(null);
                return;
            }

            this.recorder.stopRecording(() => {
                const blob = this.recorder?.getBlob() || null;
                if (blob) {
                    // Set the appropriate filename and type
                    Object.defineProperty(blob, 'name', {
                        value: `recording-${new Date().getTime()}.wav`,
                        writable: true
                    });
                }
                resolve(blob);
            });
        });
    }

    cleanup(): void {
        if (this.recorder) {
            try {
                this.recorder.destroy();
            } catch (error) {
            }
            this.recorder = null;
        }

        if (this.stream) {
            try {
                this.stream.getTracks().forEach(track => track.stop());
            } catch (error) {
            }
            this.stream = null;
        }
    }

    getState(): string {
        return this.recorder ? this.recorder.state : 'inactive';
    }

    isRecording(): boolean {
        return this.getState() === 'recording';
    }

    isInitialized(): boolean {
        return this.recorder !== null;
    }

}
