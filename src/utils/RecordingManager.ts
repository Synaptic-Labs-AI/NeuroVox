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
    private audioContext: AudioContext | null = null;
    private recordingState: 'inactive' | 'recording' | 'paused' = 'inactive';

    // Backup storage
    private recordingBackup: Blob | null = null;
    private backupInterval: number | null = null;
    private lastBackupTime: number = 0;
    private readonly BACKUP_INTERVAL = 1000; // 1 second

    private readonly AUDIO_CONFIG: AudioRecorderOptions = {
        type: 'audio',
        mimeType: "audio/wav",  // Reverted to WAV format
        recorderType: RecordRTC.StereoAudioRecorder,
        numberOfAudioChannels: 1 as AudioChannels, // Set to single audio channel
        desiredSampRate: 44100,   // Set sample rate to 44100 Hz
        // Note: RecordRTC does not provide a direct option for bits per sample.
        timeSlice: 1000           // ...existing code...
    };

    /**
     * Initializes the recording manager with microphone access
     */
    /**
     * Initializes the recording manager with device-specific settings
     * 📱 Added mobile-specific audio configurations
     */
    async initialize(options: { isMobile: boolean; isIOS: boolean } = { isMobile: false, isIOS: false }): Promise<void> {
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
                sampleRate: options.isIOS ? 44100 : 48000,
                // iOS-specific optimizations
                ...(options.isIOS && {
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
            if (options.isIOS) {
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

                    // Create and connect audio nodes
                    const source = this.audioContext.createMediaStreamSource(this.stream);
                    const destination = this.audioContext.createMediaStreamDestination();
                    source.connect(destination);
                    source.connect(this.audioContext.destination);

                    console.debug('iOS audio context initialized successfully');
                } catch (error) {
                    console.error('Error initializing iOS audio context:', error);
                    throw new Error('Failed to initialize iOS audio system');
                }
            }

            // Initialize recorder with device-specific settings
            const recorderConfig: AudioRecorderOptions = {
                ...this.AUDIO_CONFIG,
                desiredSampRate: options.isMobile ? 22050 : 44100,
                mimeType: options.isIOS ? "audio/webm" as AudioMimeType : "audio/wav" as AudioMimeType,
                timeSlice: options.isMobile ? 500 : 1000,
                type: 'audio',
                recorderType: RecordRTC.StereoAudioRecorder,
                numberOfAudioChannels: 1
            };

            // Create recorder instance with enhanced configuration
            this.recorder = new RecordRTC(this.stream, {
                ...recorderConfig,
                // Mobile optimizations
                ...(options.isMobile && {
                    bufferSize: 4096,
                    disableLogs: false // Enable logs for debugging
                }),
                // Backup handling
                ondataavailable: (blob: Blob) => {
                    console.debug('RecordRTC data available:', blob.size, 'bytes');
                    if (blob.size > 0) {
                        this.recordingBackup = blob;
                        this.lastBackupTime = Date.now();
                    }
                }
            });

            // Setup periodic backup
            this.backupInterval = window.setInterval(() => {
                if (this.recorder && this.recorder.state === 'recording') {
                    const currentTime = Date.now();
                    // If no backup received in twice the expected interval, log warning
                    if (currentTime - this.lastBackupTime > this.BACKUP_INTERVAL * 2) {
                        console.warn('No recent backup received from recorder');
                    }
                }
            }, this.BACKUP_INTERVAL);

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
     * Starts audio recording without enforcing a maximum duration
     */
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
            this.recorder.startRecording();
            this.recordingState = 'recording';
            this.lastBackupTime = Date.now();

            // Wait for first data to confirm recording started
            const startTimeout = setTimeout(() => {
                if (!this.recordingBackup) {
                    console.warn('No initial recording data received');
                }
            }, 1000);

            // Track recorder state
            const stateInterval = setInterval(() => {
                if (this.recorder) {
                    console.debug('Recorder state:', this.recorder.state);
                    if (this.recorder.state === 'inactive' && this.recordingState === 'recording') {
                        console.warn('Recorder unexpectedly stopped');
                        clearInterval(stateInterval);
                    }
                } else {
                    clearInterval(stateInterval);
                }
            }, 1000);

        } catch (error) {
            console.error('Error starting recording:', error);
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
     * Stops recording with enhanced error handling and resource cleanup
     * 🎯 Mobile-optimized with proper error handling and resource management
     */
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

        return new Promise<Blob | null>((resolve) => {
            console.debug('Initiating recording stop...');
            
            // Set a timeout to prevent hanging
            const timeoutId = setTimeout(async () => {
                console.warn('Recording stop timeout reached, using backup');
                await this.cleanup();
                resolve(this.recordingBackup);
            }, 5000);

            try {
                // Save reference to current backup before stopping
                const currentBackup = this.recordingBackup;

                this.recorder!.stopRecording(async () => {
                    try {
                        clearTimeout(timeoutId);
                        console.debug('Recording stopped, retrieving blob...');

                        let blob: Blob | null = null;
                        
                        try {
                            // Get the blob from recorder
                            blob = this.recorder?.getBlob() || null;
                            console.debug('Got blob:', blob?.size ?? 'null', 'bytes');

                            if (!blob || blob.size === 0) {
                                console.warn('Invalid blob, falling back to backup');
                                blob = currentBackup; // Use the backup we saved before stopping
                            } else {
                                // Set metadata for valid blob
                                Object.defineProperty(blob, 'name', {
                                    value: `recording-${new Date().getTime()}.wav`,
                                    writable: true
                                });
                            }
                        } catch (error) {
                            console.error('Error getting blob:', error);
                            blob = currentBackup;
                        }

                        // Always cleanup after getting the blob
                        await this.cleanup();
                        
                        if (!blob) {
                            console.warn('No valid recording data available');
                        }
                        resolve(blob);
                        
                    } catch (error) {
                        console.error('Error in stop callback:', error);
                        await this.cleanup();
                        resolve(currentBackup);
                    }
                });
            } catch (error) {
                console.error('Error stopping recording:', error);
                clearTimeout(timeoutId);
                this.cleanup();
                resolve(this.recordingBackup);
            }
        });
    }

    /**
     * Cleans up recording resources with enhanced error handling
     * 🧹 Aggressively cleans up resources to prevent memory leaks
     */
    /**
     * Cleans up recording resources with enhanced error handling
     * 🧹 Aggressively cleans up resources to prevent memory leaks
     */
    async cleanup(): Promise<void> {
        try {
            // Clean up recorder
            if (this.recorder) {
                console.debug('Cleaning up recorder in state:', this.recorder.state);
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
