import { App, Modal, Notice, Platform } from 'obsidian';
import { AudioRecordingManager } from '../utils/RecordingManager';
import { RecordingUI, RecordingState } from '../ui/RecordingUI';
import NeuroVoxPlugin from '../main';
import { StreamingTranscriptionService } from '../utils/transcription/StreamingTranscriptionService';
import { DeviceDetection } from '../utils/DeviceDetection';
import { splitWavBlob } from '../utils/audio/WavSplitter';
import { VoiceActivityMonitor } from '../utils/audio/VoiceActivityMonitor';
import { ChunkMetadata } from '../types';

interface TimerConfig {
    maxDuration: number;
    warningThreshold: number;
    updateInterval: number;
    chunkDuration: number;  // Duration in ms for each recording chunk
}

/**
 * Modal for managing audio recording with timer and controls.
 * Handles recording state, UI updates, and proper cleanup on close.
 */
export class TimerModal extends Modal {
    private recordingManager: AudioRecordingManager;
    private ui: RecordingUI;
    private intervalId: number | null = null;
    private seconds: number = 0;
    private isClosing: boolean = false;
    private currentState: RecordingState = 'inactive';
    private streamingService: StreamingTranscriptionService | null = null;
    private deviceDetection: DeviceDetection;
    private chunkIndex: number = 0;
    private recordingStartTime: number = 0;
    private segmentIntervalId: number | null = null;
    private segmentStartSeconds: number = 0;
    private isRotating: boolean = false;
    private voiceMonitor: VoiceActivityMonitor | null = null;

    // Rotate the recorder into bounded segments so no more than ~one segment of audio is held
    // in memory at a time. StereoAudioRecorder otherwise accumulates the entire recording in
    // RAM (a likely OOM on long mobile recordings) and yields it as one blob only at stop.
    //
    // Rotation prefers a natural pause: once a segment is at least MIN_SEGMENT_SECONDS long,
    // it rotates on the next stretch of silence (SILENCE_HOLD_MS) so the cut falls between
    // words. MAX_SEGMENT_SECONDS is a hard backstop for continuous speech (memory safety).
    private readonly MIN_SEGMENT_SECONDS = 15;
    private readonly MAX_SEGMENT_SECONDS = 90;
    private readonly SILENCE_HOLD_MS = 500;
    // Used only as the split size for the whole-blob fallback on very short recordings.
    private readonly SEGMENT_SECONDS = 60;

    private readonly CONFIG: TimerConfig;

    public onStop: (result: Blob | string) => void;

    constructor(private plugin: NeuroVoxPlugin) {
        super(plugin.app);
        this.recordingManager = new AudioRecordingManager(plugin);
        this.deviceDetection = DeviceDetection.getInstance();
        
        // Configure based on device type
        const streamingOptions = this.deviceDetection.getOptimalStreamingOptions();

        this.CONFIG = {
            maxDuration: 12 * 60,
            warningThreshold: 60,
            updateInterval: 1000,
            chunkDuration: streamingOptions.chunkDuration * 1000  // Convert to milliseconds
        };
        
        this.setupCloseHandlers();
    }

    /**
     * Sets up handlers for modal closing via escape key, clicks, and touch events
     * 📱 Enhanced with proper mobile touch handling
     */
    private setupCloseHandlers(): void {
        // Prevent touch events from bubbling on modal content
        this.contentEl.addEventListener('touchstart', (e) => {
            e.stopPropagation();
        }, { passive: true });

        // Handle clicks/touches outside modal
        const handleOutsideInteraction = (event: MouseEvent | TouchEvent) => {
            const target = event.target as HTMLElement;
            if (target === this.modalEl) {
                event.preventDefault();
                event.stopPropagation();
                void this.requestClose();
            }
        };

        // Desktop mouse events
        this.modalEl.addEventListener('click', handleOutsideInteraction);
        
        // Mobile touch events
        this.modalEl.addEventListener('touchstart', handleOutsideInteraction, { passive: false });
        this.modalEl.addEventListener('touchend', (e) => e.preventDefault(), { passive: false });

        // Handle escape key
        this.scope.register([], 'Escape', () => {
            void this.requestClose();
            return false;
        });

        // Handle mobile back button
        window.addEventListener('popstate', () => {
            void this.requestClose();
        });
    }

    /**
     * Override the built-in close method to use our custom close handler
     */
    close(): void {
        if (!this.isClosing) {
            void this.requestClose();
        }
    }

    /**
     * Handles all close attempts, ensuring proper cleanup and save prompts
     */
    private async requestClose(): Promise<void> {
        if (this.isClosing) return;
        this.isClosing = true;

        if (this.currentState === 'recording' || this.currentState === 'paused') {
            await this.handleStop();
        } else {
            await this.finalizeClose();
        }
    }

    /**
     * Performs final cleanup and closes the modal
     */
    private async finalizeClose(): Promise<void> {
        this.cleanup();
        this.isClosing = false;
        super.close();
    }

    /**
     * Initializes the modal with enhanced mobile support
     * 📱 Added mobile-specific meta tags and initialization
     */
    async onOpen(): Promise<void> {
        try {
            // Set viewport meta for mobile
            const viewport = document.querySelector('meta[name="viewport"]');
            if (!viewport) {
                const meta = document.createElement('meta');
                meta.name = 'viewport';
                meta.content = 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no';
                document.head.appendChild(meta);
            }

            const { contentEl } = this;
            contentEl.empty();
            contentEl.addClass('neurovox-timer-modal');

            // Add mobile-specific class
            if (this.isMobileDevice()) {
                contentEl.addClass('is-mobile');
            }

            const container = contentEl.createDiv({ 
                cls: 'neurovox-timer-content' 
            });

            this.ui = new RecordingUI(container, {
                onPause: () => this.handlePauseToggle(),
                onStop: () => this.handleStop()
            });

            // Initialize recording with mobile-specific settings
            await this.initializeRecording();
        } catch (error) {
            this.handleError('Failed to initialize recording', error);
        }
    }

    /**
     * Initializes recording with mobile-specific handling
     * 📱 Added device-specific audio configuration
     */
    private async initializeRecording(): Promise<void> {
        try {
            await this.recordingManager.initialize();
            await this.startRecording();
        } catch (error) {
            if (this.isIOSDevice() && error instanceof Error && error.name === 'NotAllowedError') {
                this.handleError('iOS requires microphone permission. Please enable it in Settings.', error);
            } else {
                this.handleError('Failed to initialize recording', error);
            }
        }
    }

    /**
     * Detects if current device is mobile using Obsidian's Platform API
     */
    private isMobileDevice(): boolean {
        return Platform.isMobile;
    }

    /**
     * Detects if current device is iOS using Obsidian's Platform API
     */
    private isIOSDevice(): boolean {
        return Platform.isIosApp || (Platform.isMobile && /iPhone|iPad|iPod/i.test(navigator.userAgent));
    }

    /**
     * Starts or resumes recording with progressive chunk processing
     */
    private async startRecording(): Promise<void> {
        try {
            if (this.currentState === 'paused') {
                this.recordingManager.resume();
                this.resumeTimer();
            } else {
                // Initialize streaming service
                if (!this.streamingService) {
                    this.streamingService = new StreamingTranscriptionService(
                        this.plugin,
                        {
                            onMemoryWarning: (usage) => {
                                new Notice(`Memory usage high: ${Math.round(usage)}%`);
                            }
                        }
                    );
                }

                this.recordingStartTime = Date.now();
                this.chunkIndex = 0;
                this.segmentStartSeconds = 0;

                // StereoAudioRecorder does not emit timeSlice chunks, so instead of relying on
                // onDataAvailable we rotate the recorder ourselves (see maybeRotate/rotateSegment).
                this.recordingManager.start();
                this.startTimer();
                this.startRotationMonitor();
            }

            this.currentState = 'recording';
            this.ui.updateState(this.currentState);
            new Notice('Recording started');
        } catch (error) {
            this.handleError('Failed to start recording', error);
        }
    }

    /**
     * Starts silence monitoring and the decision loop that rotates the recorder at natural
     * pauses (with a hard max-duration backstop).
     */
    private startRotationMonitor(): void {
        this.stopRotationMonitor();

        const stream = this.recordingManager.getStream();
        if (stream) {
            this.voiceMonitor = new VoiceActivityMonitor(stream);
            this.voiceMonitor.start();
        }

        // Check frequently; the actual rotation cadence is governed by maybeRotate().
        this.segmentIntervalId = window.setInterval(() => {
            this.maybeRotate();
        }, 250);
    }

    private stopRotationMonitor(): void {
        if (this.segmentIntervalId !== null) {
            window.clearInterval(this.segmentIntervalId);
            this.segmentIntervalId = null;
        }
        if (this.voiceMonitor) {
            this.voiceMonitor.stop();
            this.voiceMonitor = null;
        }
    }

    /**
     * Decides whether to rotate now: rotate at a silence break once the current segment is at
     * least MIN_SEGMENT_SECONDS, or unconditionally once it reaches MAX_SEGMENT_SECONDS. If
     * silence detection is unavailable, MAX_SEGMENT_SECONDS alone drives rotation.
     */
    private maybeRotate(): void {
        if (this.currentState !== 'recording' || this.isRotating) return;

        const elapsed = this.seconds - this.segmentStartSeconds;
        if (elapsed >= this.MAX_SEGMENT_SECONDS) {
            void this.rotateSegment();
            return;
        }

        const silentMs = this.voiceMonitor?.silentForMs() ?? 0;
        if (elapsed >= this.MIN_SEGMENT_SECONDS && silentMs >= this.SILENCE_HOLD_MS) {
            void this.rotateSegment();
        }
    }

    /**
     * Rotates the recorder, turning the elapsed audio into a segment that is transcribed and
     * freed. Skips while paused or if a rotation is already in flight.
     */
    private async rotateSegment(): Promise<void> {
        if (this.currentState !== 'recording' || this.isRotating || !this.streamingService) {
            return;
        }

        this.isRotating = true;
        try {
            const start = this.segmentStartSeconds;
            const end = this.seconds;
            const blob = await this.recordingManager.rotate();
            this.segmentStartSeconds = end;
            if (blob) {
                await this.feedSegment(blob, start, end);
            }
        } catch (error) {
            // Keep recording even if one rotation fails; the audio stays in the active recorder.
            console.error('[TimerModal] Segment rotation failed:', error);
        } finally {
            this.isRotating = false;
        }
    }

    /**
     * Feeds a recording segment into the streaming service for transcription. Uses the queue
     * (which serializes and frees blobs); on backpressure it transcribes directly to avoid
     * dropping audio.
     */
    private async feedSegment(blob: Blob, startSeconds: number, endSeconds: number): Promise<void> {
        if (!this.streamingService || !blob || blob.size === 0) return;

        const metadata: ChunkMetadata = {
            id: `segment_${this.chunkIndex}`,
            index: this.chunkIndex,
            duration: Math.max(0, endSeconds - startSeconds) * 1000,
            timestamp: this.recordingStartTime + startSeconds * 1000,
            size: blob.size
        };
        this.chunkIndex++;

        const added = await this.streamingService.addChunk(blob, metadata);
        if (!added) {
            await this.streamingService.transcribeFinalBlob(blob, metadata);
        }
    }

    /**
     * Handles pause/resume toggle
     */
    private handlePauseToggle(): void {
        if (this.currentState === 'paused') {
            void this.startRecording();
        } else {
            this.pauseRecording();
        }
    }

    /**
     * Pauses the current recording
     */
    private pauseRecording(): void {
        try {
            this.recordingManager.pause();
            this.pauseTimer();
            
            this.currentState = 'paused';
            this.ui.updateState(this.currentState);
            new Notice('Recording paused');
        } catch (error) {
            this.handleError('Failed to pause recording', error);
        }
    }

    /**
     * Handles stop button click
     */
    private async handleStop(): Promise<void> {
        try {
            this.stopRotationMonitor();

            // Let any in-flight rotation finish so it doesn't race the final stop().
            for (let waited = 0; this.isRotating && waited < 100; waited++) {
                await new Promise(resolve => setTimeout(resolve, 20));
            }

            const tailStart = this.segmentStartSeconds;
            const tailEnd = this.seconds;
            const finalBlob = await this.recordingManager.stop();

            if (!this.streamingService) {
                throw new Error('Streaming service not initialized');
            }

            new Notice('Finishing transcription...');

            if (finalBlob && finalBlob.size > 0) {
                if (this.streamingService.hasReceivedChunks()) {
                    // Tail audio recorded since the last rotation.
                    await this.feedSegment(finalBlob, tailStart, tailEnd);
                } else {
                    // Recording was shorter than one segment, so no rotation occurred:
                    // transcribe the whole blob (split as a safety net if it is unexpectedly long).
                    await this.transcribeFinalRecording(finalBlob);
                }
            }

            // Get transcription result from streaming service
            const result = await this.streamingService.finishProcessing();

            if (!result || result.trim().length === 0) {
                throw new Error('No transcription result received');
            }

            // Close recording modal first
            this.cleanup();
            super.close();

            // Always save the recording
            if (this.onStop) {
                await this.onStop(result);
            }
        } catch (error) {
            this.handleError('Failed to stop recording', error);
        }
    }

    /**
     * Transcribes the complete recording on stop. Long recordings are split into segments so
     * each is transcribed and freed in turn, bounding peak memory (important on mobile).
     * Non-WAV or short recordings fall back to a single whole-blob transcription.
     */
    private async transcribeFinalRecording(finalBlob: Blob): Promise<void> {
        if (!this.streamingService) return;

        const segments = await splitWavBlob(finalBlob, this.SEGMENT_SECONDS);

        if (!segments || segments.length <= 1) {
            const metadata: ChunkMetadata = {
                id: 'final-recording',
                index: 0,
                duration: this.seconds * 1000,
                timestamp: this.recordingStartTime,
                size: finalBlob.size
            };
            await this.streamingService.transcribeFinalBlob(finalBlob, metadata);
            return;
        }

        for (const segment of segments) {
            const metadata: ChunkMetadata = {
                id: `segment_${segment.index}`,
                index: segment.index,
                duration: segment.durationMs,
                timestamp: this.recordingStartTime + segment.offsetMs,
                size: segment.blob.size
            };
            await this.streamingService.transcribeFinalBlob(segment.blob, metadata);
        }
    }

    /**
     * Manages the recording timer
     */
    private startTimer(): void {
        this.seconds = 0;
        this.updateTimerDisplay();
        
        this.intervalId = window.setInterval(() => {
            this.seconds++;
            this.updateTimerDisplay();

            if (this.seconds >= this.CONFIG.maxDuration) {
                void this.handleStop();
                new Notice('Maximum recording duration reached');
            }
        }, this.CONFIG.updateInterval);
    }

    /**
     * Updates the timer display
     */
    private updateTimerDisplay(): void {
        this.ui.updateTimer(
            this.seconds,
            this.CONFIG.maxDuration,
            this.CONFIG.warningThreshold
        );
    }

    /**
     * Pauses the timer
     */
    private pauseTimer(): void {
        if (this.intervalId) {
            window.clearInterval(this.intervalId);
            this.intervalId = null;
        }
    }

    /**
     * Resumes the timer
     */
    private resumeTimer(): void {
        if (!this.intervalId) {
            this.intervalId = window.setInterval(() => {
                this.seconds++;
                this.updateTimerDisplay();
            }, this.CONFIG.updateInterval);
        }
    }

    /**
     * Cleans up all resources
     */
    private cleanup(): void {
        try {
            this.pauseTimer();
            this.stopRotationMonitor();
            this.recordingManager.cleanup();
            this.ui?.cleanup();
            
            // Clean up streaming service
            if (this.streamingService) {
                this.streamingService.abort();
                this.streamingService = null;
            }
        } catch (error) {
        } finally {
            // Reset states
            this.currentState = 'inactive';
            this.seconds = 0;
            this.isClosing = false;
            this.chunkIndex = 0;
            this.recordingStartTime = 0;
        }
    }

    /**
     * Handles errors with user feedback
     */
    private handleError(message: string, error: unknown): void {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        new Notice(`${message}: ${errorMessage}`);
        this.cleanup();
        void this.requestClose();
    }
}
