import RecordRTC from 'recordrtc';
import { AudioQuality } from '../settings/Settings';
import NeuroVoxPlugin from '../main';
import { DeviceDetection } from './DeviceDetection';

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
    private deviceDetection: DeviceDetection;

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

    // Mobile-optimized sample rates
    private readonly MOBILE_SAMPLE_RATES = {
        [AudioQuality.Low]: 16000,     // Mobile voice optimized
        [AudioQuality.Medium]: 22050,  // Mobile high quality voice
        [AudioQuality.High]: 32000     // Mobile max quality
    };

    // Bitrate settings (bits per second)
    private readonly BIT_RATES = {
        [AudioQuality.Low]: 64000,     // Good for voice
        [AudioQuality.Medium]: 128000, // Excellent voice quality
        [AudioQuality.High]: 192000    // Studio quality
    };

    // Mobile-optimized bitrates
    private readonly MOBILE_BIT_RATES = {
        [AudioQuality.Low]: 16000,     // Mobile voice optimized
        [AudioQuality.Medium]: 32000,  // Mobile good quality
        [AudioQuality.High]: 48000     // Mobile high quality
    };

    constructor(private plugin: NeuroVoxPlugin) {
        this.deviceDetection = DeviceDetection.getInstance();
    }

    /**
     * Gets audio configuration based on current quality settings
     */
    private getAudioConfig(): AudioRecorderOptions {
        const quality = this.plugin.settings.audioQuality;
        const isMobile = this.deviceDetection.isMobile();
        
        // Use mobile-optimized settings if on mobile device
        const sampleRates = isMobile ? this.MOBILE_SAMPLE_RATES : this.SAMPLE_RATES;
        const bitRates = isMobile ? this.MOBILE_BIT_RATES : this.BIT_RATES;
        
        return {
            type: 'audio',
            mimeType: "audio/webm",  // Use WebM container for better compression
            recorderType: RecordRTC.StereoAudioRecorder,
            numberOfAudioChannels: 1 as AudioChannels,
            desiredSampRate: sampleRates[quality] || sampleRates[AudioQuality.Medium],
            // Add bitrate control for better compression
            bitsPerSecond: bitRates[quality] || bitRates[AudioQuality.Medium]
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
        const config: any = {
            ...this.getAudioConfig(),
            timeSlice: options?.timeSlice,
            // RecordRTC uses ondataavailable callback for time-sliced recording
            ondataavailable: options?.onDataAvailable ? async (blob: Blob) => {
                await options.onDataAvailable!(blob);
            } : undefined
        };

        this.recorder = new RecordRTC(this.stream, config);
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
