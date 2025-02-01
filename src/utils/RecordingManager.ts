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

    private readonly AUDIO_CONFIG: AudioRecorderOptions = {
        type: 'audio',
        mimeType: "audio/webm;codecs=pcm",  // Use PCM encoding for better quality
        recorderType: RecordRTC.StereoAudioRecorder,
        numberOfAudioChannels: 1 as AudioChannels,
        desiredSampRate: 44100,  // CD quality audio
        timeSlice: 1000  // Update each second
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
            this.recorder = new RecordRTC(this.stream, this.AUDIO_CONFIG);
        } catch (error) {
            console.error('Failed to initialize audio recorder:', error);
            throw new Error('Failed to access microphone');
        }
    }

    start(): void {
        if (!this.recorder) {
            throw new Error('Audio recorder not initialized');
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
                console.warn('Error destroying audio recorder:', error);
            }
            this.recorder = null;
        }

        if (this.stream) {
            try {
                this.stream.getTracks().forEach(track => track.stop());
            } catch (error) {
                console.warn('Error stopping audio tracks:', error);
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
