import RecordRTC from 'recordrtc';

/**
 * Audio-specific MIME types supported by RecordRTC
 */
type AudioMimeType = 
    | "audio/wav"
    | "audio/webm"
    | "audio/webm;codecs=pcm"
    | "audio/ogg";

/**
 * Valid number of audio channels for RecordRTC
 */
type AudioChannels = 1 | 2;

/**
 * Configuration options for audio recording that match RecordRTC requirements
 */
interface AudioRecorderOptions {
    type: 'audio';
    mimeType: AudioMimeType;
    recorderType: typeof RecordRTC.StereoAudioRecorder;
    numberOfAudioChannels: AudioChannels;
    desiredSampRate: number;
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

    private readonly AUDIO_CONFIG: AudioRecorderOptions = {
        type: 'audio',
        mimeType: "audio/webm",  // Remove PCM codec for better compression
        recorderType: RecordRTC.StereoAudioRecorder,
        numberOfAudioChannels: 1 as AudioChannels,
        desiredSampRate: 22050,  // Reduced from CD quality for better efficiency
    };

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
            ...this.AUDIO_CONFIG,
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
