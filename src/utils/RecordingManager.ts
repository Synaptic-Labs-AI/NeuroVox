import RecordRTC from 'recordrtc';
import { Platform } from 'obsidian';

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
type BufferSize = 256 | 512 | 1024 | 2048 | 4096 | 8192 | 16384;

interface AudioRecorderOptions {
    type: 'audio';
    mimeType: AudioMimeType;
    recorderType: typeof RecordRTC.StereoAudioRecorder;
    numberOfAudioChannels: AudioChannels;
    desiredSampRate: number;
    timeSlice?: number;
    bufferSize?: BufferSize;
}

/**
 * Manages audio recording functionality using RecordRTC.
 * This class specifically handles audio-only recording for voice notes.
 */
export class AudioRecordingManager {
    private recorder: RecordRTC | null = null;
    private stream: MediaStream | null = null;
    private audioContext: AudioContext | null = null;
    private recordingState: 'inactive' | 'recording' | 'paused' = 'inactive';

    // Backup storage
    private recordingBackup: Blob | null = null;
    private backupInterval: number | null = null;
    private lastBackupTime: number = 0;
    private readonly BACKUP_INTERVAL = 1000; // 1 second

    private readonly AUDIO_CONFIG: AudioRecorderOptions = {
        type: 'audio',
        mimeType: "audio/webm;codecs=pcm",  // Use PCM encoding for better compatibility
        recorderType: RecordRTC.StereoAudioRecorder,
        numberOfAudioChannels: 1 as AudioChannels,
        desiredSampRate: 44100,  // CD quality audio for better fidelity
        bufferSize: 16384 as BufferSize  // Larger buffer for better stability
    };

    /**
     * Initializes the recording manager with device-specific settings
     * 📱 Added mobile-specific audio configurations
     */
    async initialize(options: { customSampleRate?: number } = {}): Promise<void> {
        try {
            // Check if browser supports getUserMedia
            if (!navigator.mediaDevices?.getUserMedia) {
                throw new Error('Browser does not support audio recording');
            }

            // Configure audio constraints based on device type
            const audioConstraints: MediaTrackConstraints = {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true,
                channelCount: 1,
                sampleRate: Platform.isIosApp ? 44100 : 48000,
                // iOS-specific optimizations
                ...(Platform.isIosApp && {
                    sampleSize: 16,
                    googEchoCancellation: true,
                    googAutoGainControl: true,
                    googNoiseSuppression: true,
                    googHighpassFilter: true
                })
            };

            // Request microphone access with device-specific constraints
            this.stream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints });

            // Verify we got an audio track
            const audioTracks = this.stream.getAudioTracks();
            if (audioTracks.length === 0) {
                throw new Error('No audio track available');
            }

            // Set up audio context first (especially important for iOS)
            if (Platform.isIosApp) {
                try {
                    console.debug('Initializing iOS audio context...');
                    // Need to create context before initializing recorder
                    this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({
                        // iOS specific options
                        sampleRate: 44100,
                        latencyHint: 'interactive'
                    });

                    // Resume context (required for iOS)
                    await this.audioContext.resume();

                    // Create and connect audio nodes for recording only (no speaker output)
                    const source = this.audioContext.createMediaStreamSource(this.stream);
                    const destination = this.audioContext.createMediaStreamDestination();
                    source.connect(destination); // Only connect to destination for recording

                    console.debug('iOS audio context initialized successfully');
                } catch (error) {
                    console.error('Error initializing iOS audio context:', error);
                    throw new Error('Failed to initialize iOS audio system');
                }
            }

            // Log audio context state
            console.debug('🔊 Audio context state:', {
                state: this.audioContext?.state,
                sampleRate: this.audioContext?.sampleRate,
                baseLatency: this.audioContext?.baseLatency
            });

            // Log media stream info
            console.debug('📡 Media stream tracks:', this.stream?.getTracks().map(t => ({
                kind: t.kind,
                label: t.label,
                enabled: t.enabled,
                muted: t.muted,
                constraints: t.getConstraints()
            })));

            // Initialize recorder with optimized settings
            const recorderConfig: AudioRecorderOptions & {
                disableLogs: boolean;
                onStateChanged: (state: string) => void;
            } = {
                type: 'audio',
                mimeType: "audio/webm;codecs=pcm",
                recorderType: RecordRTC.StereoAudioRecorder,
                numberOfAudioChannels: 1,
                desiredSampRate: 44100,
                bufferSize: 16384 as BufferSize,
                disableLogs: false,
                onStateChanged: (state: string) => {
                    console.debug('🎙️ Recorder state changed:', {
                        newState: state,
                        previousState: this.recordingState,
                        audioContextState: this.audioContext?.state
                    });
                    this.recordingState = state as 'recording' | 'paused' | 'inactive';
                }
            };

            // Log recorder configuration
            console.debug('🎙️ Initializing recorder with config:', {
                type: recorderConfig.type,
                mimeType: recorderConfig.mimeType,
                sampleRate: recorderConfig.desiredSampRate,
                bufferSize: recorderConfig.bufferSize,
                channels: recorderConfig.numberOfAudioChannels
            });

            // Create recorder instance
            this.recorder = new RecordRTC(this.stream, recorderConfig);
            console.debug('🎙️ Recorder instance created:', {
                version: RecordRTC.version,
                state: this.recorder.state
            });

            // Initialize audio context after recorder creation
            if (!this.audioContext) {
                this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({
                    sampleRate: 44100,
                    latencyHint: 'interactive'
                });
                await this.audioContext.resume();
            }

            // Verify the recorder was created successfully
            if (!this.recorder) {
                throw new Error('Failed to create recorder instance');
            }

            // Initialize recorder with detailed logging
            console.debug('🎙️ Starting recorder initialization...');
            await this.recorder.initRecorder();
            console.debug('🎙️ Recorder initialized successfully:', {
                state: this.recorder.state,
                audioContextState: this.audioContext?.state,
                streamActive: this.stream?.active
            });

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            // Provide more specific error messages
            if (error instanceof Error) {
                switch (error.name) {
                    case 'NotAllowedError':
                        throw new Error('Microphone access denied by user');
                    case 'NotFoundError':
                        throw new Error('No microphone found');
                    case 'NotReadableError':
                        throw new Error('Microphone is already in use');
                    default:
                        throw new Error(`Failed to access microphone: ${errorMessage}`);
                }
            }
            
            throw new Error('Failed to initialize recording system');
        }
    }

    /**
     * Starts audio recording with enhanced state tracking
     * 🎯 Added better error handling and state management
     */
    async start(): Promise<void> {
        if (!this.recorder) {
            console.error('Recorder not initialized');
            throw new Error('Audio recorder not initialized');
        }

        if (this.recordingState !== 'inactive') {
            console.warn('Recording already in progress');
            return;
        }

        try {
            console.debug('Starting recording...');
            
            // Ensure audio context is active
            if (this.audioContext?.state === 'suspended') {
                await this.audioContext.resume();
            }
            
            // Start recording
            this.recorder.startRecording();
            this.recordingState = 'recording';
            
            // Wait for recorder to actually start
            await new Promise<void>((resolve, reject) => {
                const maxWait = setTimeout(() => {
                    reject(new Error('Recorder failed to start'));
                }, 3000);
                
                const checkState = setInterval(() => {
                    if (this.recorder?.state === 'recording') {
                        clearInterval(checkState);
                        clearTimeout(maxWait);
                        resolve();
                    }
                }, 100);
            });
            
            console.debug('Recording started successfully');

        } catch (error) {
            const errorContext = {
                error: error instanceof Error ? error.message : error,
                state: this.recordingState,
                recorderState: this.recorder?.state,
                audioContextState: this.audioContext?.state,
                streamActive: this.stream?.active,
                streamTracks: this.stream?.getTracks().map(t => ({
                    kind: t.kind,
                    enabled: t.enabled,
                    muted: t.muted,
                    readyState: t.readyState
                }))
            };
            console.error('🚨 Error starting recording:', errorContext);
            this.recordingState = 'inactive';
            await this.cleanup();
            throw error;
        }
    }

    /**
     * Pauses audio recording with state tracking
     * 🎯 Enhanced with state validation and error handling
     */
    pause(): void {
        if (!this.recorder || this.recordingState !== 'recording') {
            console.warn('Cannot pause: recorder not active');
            return;
        }
        try {
            console.debug('Pausing recording...');
            this.recorder.pauseRecording();
            this.recordingState = 'paused';
        } catch (error) {
            console.error('Error pausing recording:', error);
        }
    }

    /**
     * Resumes audio recording with state validation
     * 🎯 Enhanced with state validation and error handling
     */
    resume(): void {
        if (!this.recorder || this.recordingState !== 'paused') {
            console.warn('Cannot resume: recorder not paused');
            return;
        }
        try {
            console.debug('Resuming recording...');
            this.recorder.resumeRecording();
            this.recordingState = 'recording';
        } catch (error) {
            console.error('Error resuming recording:', error);
        }
    }

    /**
     * Stops recording and retrieves the audio blob
     * 🎯 Enhanced with better error handling and iOS compatibility
     */
    async stop(): Promise<Blob | null> {
        if (!this.recorder) {
            console.debug('No recorder available, returning backup');
            return this.recordingBackup;
        }

        if (this.recorder.state === 'inactive') {
            console.debug('Recorder already inactive, returning backup');
            return this.recordingBackup;
        }

        return new Promise<Blob | null>((resolve, reject) => {
            console.debug('🎙️ Initiating recording stop:', {
                currentState: this.recordingState,
                recorderState: this.recorder?.state,
                audioContextState: this.audioContext?.state,
                streamActive: this.stream?.active
            });
            
            // Set a timeout to prevent hanging
            const timeoutId = setTimeout(async () => {
                console.warn('⚠️ Recording stop timeout reached:', {
                    state: this.recordingState,
                    recorderState: this.recorder?.state,
                    audioContextState: this.audioContext?.state
                });
                reject(new Error('Recording stop timeout'));
            }, 5000);

            try {
                // Wait for recorder to finish any pending operations
                const waitForInactive = setInterval(() => {
                    console.debug('🔄 Waiting for recorder to become inactive:', {
                        state: this.recorder?.state,
                        recordingState: this.recordingState
                    });
                    if (this.recorder?.state === 'inactive') {
                        console.debug('✅ Recorder is now inactive');
                        clearInterval(waitForInactive);
                        clearTimeout(timeoutId);
                        this.getRecordingBlob().then(resolve).catch(reject);
                    }
                }, 100);

                // Stop the recording
                console.debug('🛑 Calling stopRecording...');
                this.recorder!.stopRecording(() => {
                    console.debug('🎙️ StopRecording callback triggered');
                    clearInterval(waitForInactive);
                    clearTimeout(timeoutId);
                    this.getRecordingBlob().then(resolve).catch(reject);
                });
            } catch (error) {
                clearTimeout(timeoutId);
                reject(error);
            }
        }).finally(async () => {
            // Always cleanup after getting the blob
            await this.cleanup();
        });
    }

    /**
     * Gets the recording blob with proper error handling
     */
    private async getRecordingBlob(): Promise<Blob> {
        console.debug('🎙️ Getting recording blob...');
        
        if (!this.recorder) {
            throw new Error('Recorder not available');
        }

        const blob = this.recorder.getBlob();
        if (!blob) {
            console.error('❌ No blob returned from recorder');
            throw new Error('No recording data available');
        }

        console.debug('🎙️ Raw blob details:', {
            size: blob.size,
            type: blob.type,
            state: this.recorder.state
        });

        if (blob.size === 0) {
            console.error('❌ Empty recording blob:', {
                recorderState: this.recorder.state,
                audioContextState: this.audioContext?.state
            });
            throw new Error('Empty recording data');
        }

        // Create a File object instead of setting blob metadata
        const file = new File([blob], `recording-${new Date().getTime()}.webm`, {
            type: blob.type
        });

        console.debug('✅ Got valid recording file:', {
            size: file.size,
            type: file.type,
            name: file.name
        });

        return file;
    }

    /**
     * Cleans up recording resources with enhanced error handling
     * 🧹 Aggressively cleans up resources to prevent memory leaks
     */
    async cleanup(): Promise<void> {
        try {
            // Clean up recorder
            if (this.recorder) {
            console.debug('🧹 Starting cleanup. Current state:', {
                recorderState: this.recorder?.state,
                recordingState: this.recordingState,
                audioContextState: this.audioContext?.state,
                streamActive: this.stream?.active
            });
                try {
                    if (this.recorder.state !== 'inactive') {
                        this.recorder.stopRecording();
                    }
                    this.recorder.destroy();
                } catch (error) {
                    console.error('Error destroying recorder:', error);
                } finally {
                    this.recorder = null;
                }
            }

            // Clean up audio context
            if (this.audioContext) {
                try {
                    await this.audioContext.close();
                } catch (error) {
                    console.error('Error closing audio context:', error);
                } finally {
                    this.audioContext = null;
                }
            }

            // Clean up media stream
            if (this.stream) {
                try {
                    const tracks = this.stream.getTracks();
                    tracks.forEach(track => {
                        try {
                            console.debug('Stopping track:', track.label);
                            track.stop();
                            this.stream?.removeTrack(track);
                        } catch (error) {
                            console.error('Error stopping track:', error);
                        }
                    });
                } catch (error) {
                    console.error('Error cleaning up media stream:', error);
                } finally {
                    this.stream = null;
                }
            }

            // Clear backup interval
            if (this.backupInterval) {
                clearInterval(this.backupInterval);
                this.backupInterval = null;
            }

            // Reset backup state
            this.recordingBackup = null;
            this.lastBackupTime = 0;
            this.recordingState = 'inactive';

        } catch (error) {
            console.error('Error during cleanup:', error);
            // Even if cleanup fails, make sure to null out resources
            this.recorder = null;
            this.audioContext = null;
            this.stream = null;
            this.backupInterval = null;
            this.recordingBackup = null;
            this.recordingState = 'inactive';
        }
    }

    /**
     * Gets the current state of the audio recorder
     */
    getState(): string {
        return this.recorder ? this.recorder.state : 'inactive';
    }

    /**
     * Checks if the recorder is currently recording
     */
    isRecording(): boolean {
        return this.getState() === 'recording';
    }

    /**
     * Checks if the recorder has been initialized
     */
    isInitialized(): boolean {
        return this.recorder !== null;
    }
}
