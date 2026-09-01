import { Modal, Notice, Platform } from 'obsidian';
import { Logger } from '../utils/Logger';
import { AudioRecordingManager } from '../utils/RecordingManager';
import { RecordingUI, RecordingState } from '../ui/RecordingUI';
import NeuroVoxPlugin from '../main';
import { StreamingTranscriptionService } from '../utils/transcription/StreamingTranscriptionService';
import { splitWavBlob } from '../utils/audio/WavSplitter';
import { VoiceActivityMonitor } from '../utils/audio/VoiceActivityMonitor';
import { SegmentStore } from '../utils/audio/SegmentStore';
import { RecordingArchive } from '../utils/audio/RecordingArchive';
import { AudioFileManager } from '../utils/audio/AudioFileManager';
import { ChunkMetadata } from '../types';

interface TimerConfig {
    maxDuration: number;
    warningThreshold: number;
    updateInterval: number;
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
    private isStopping: boolean = false;
    private currentState: RecordingState = 'inactive';
    private streamingService: StreamingTranscriptionService | null = null;
    private archive: RecordingArchive | null = null;
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
    // Tail segments smaller than this (~0.3s of 16 kHz mono WAV) carry no speech and are
    // rejected by transcription providers as too short.
    private readonly MIN_TAIL_BYTES = 10_000;

    private readonly CONFIG: TimerConfig;

    /**
     * Called with the finished transcript and the vault path of the saved recording (null
     * only if the audio could not be written to the vault).
     */
    public onStop: (result: string, audioFilePath: string | null) => void | Promise<void>;

    /**
     * Called when transcription failed but the recording itself was saved, so the caller
     * can leave a pointer to the audio where the transcript would have gone.
     */
    public onTranscriptionFailed?: (audioFilePath: string, error: Error) => void | Promise<void>;

    constructor(private plugin: NeuroVoxPlugin) {
        super(plugin.app);
        this.recordingManager = new AudioRecordingManager(plugin);

        this.CONFIG = {
            maxDuration: 12 * 60,
            warningThreshold: 60,
            updateInterval: 1000
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
        if (this.isClosing || this.isStopping) return;
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
                const meta = createEl('meta');
                meta.name = 'viewport';
                meta.content = 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no';
                document.head.appendChild(meta);
            }

            const { contentEl } = this;
            contentEl.empty();
            this.modalEl.addClass('neurovox-timer-modal-shell');
            contentEl.addClass('neurovox-timer-modal');

            // Add mobile-specific class to both the shell and the content so CSS can
            // center the card within the full-screen mobile sheet.
            if (this.isMobileDevice()) {
                this.modalEl.addClass('is-mobile');
                contentEl.addClass('is-mobile');
            }

            const container = contentEl.createDiv({ 
                cls: 'neurovox-timer-content' 
            });

            this.ui = new RecordingUI(container, {
                onPause: () => this.handlePauseToggle(),
                onStop: () => { void this.handleStop(); }
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
        return Platform.isIosApp;
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
                this.recordingStartTime = Date.now();
                this.chunkIndex = 0;
                this.segmentStartSeconds = 0;

                // Each recording gets its own segment directory. The segment files are the
                // recording's durable copy until the archive has joined them into one audio
                // file in the vault, and a per-recording directory is what lets a crashed
                // recording be recovered on the next load without colliding with the next one.
                if (!this.streamingService) {
                    const startedAt = new Date(this.recordingStartTime);
                    const store = new SegmentStore(
                        this.plugin.app.vault.adapter,
                        `${this.plugin.manifest.dir}/segments-tmp/rec-${startedAt.toISOString().replace(/[:.]/g, '-')}`
                    );
                    this.archive = new RecordingArchive(store, new AudioFileManager(this.plugin), startedAt);
                    // Segments are spilled to disk as they rotate, so no memory-pressure
                    // callback is needed; queued audio no longer lives in RAM.
                    this.streamingService = new StreamingTranscriptionService(this.plugin, undefined, store);
                }

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
            Logger.log('[TimerModal] Rotated segment', this.chunkIndex, `${start}s-${end}s`, 'blob bytes:', blob?.size ?? 0);
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
     * Archives a recording segment and feeds it to the streaming service for transcription.
     * The archive spills the blob to disk first (that file is the segment's durable copy,
     * and the queue reads from it); if the spill fails, the segment is kept in memory by the
     * archive and transcribed directly so no audio is dropped either way.
     */
    private async feedSegment(blob: Blob, startSeconds: number, endSeconds: number): Promise<void> {
        if (!this.streamingService || !this.archive || !blob || blob.size === 0) return;

        const metadata: ChunkMetadata = {
            id: `segment_${this.chunkIndex}`,
            index: this.chunkIndex,
            duration: Math.max(0, endSeconds - startSeconds) * 1000,
            timestamp: this.recordingStartTime + startSeconds * 1000,
            size: blob.size
        };
        this.chunkIndex++;

        const path = await this.archive.addSegment(blob);
        if (path) {
            this.streamingService.enqueue(path, metadata);
        } else {
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
        if (this.isStopping) return;

        this.isStopping = true;
        this.pauseTimer();
        this.currentState = 'stopped';
        this.ui.showProcessing('transcribing');

        let savedPath: string | null = null;
        // Set once the transcript reaches onStop: a failure after that point is a note
        // write problem (already rescued to the clipboard downstream), not a lost transcript.
        let transcriptHandedOff = false;

        try {
            this.stopRotationMonitor();

            // Let any in-flight rotation finish so it doesn't race the final stop().
            for (let waited = 0; this.isRotating && waited < 100; waited++) {
                await new Promise(resolve => window.setTimeout(resolve, 20));
            }
            if (this.isRotating) {
                // Proceeding anyway: the tail's start time may overlap the still-rotating
                // segment, and in the worst case that segment misses the drain entirely.
                console.warn('[TimerModal] Rotation still in flight after 2s stop wait; proceeding with stop');
            }

            const tailStart = this.segmentStartSeconds;
            const tailEnd = this.seconds;
            const finalBlob = await this.recordingManager.stop();

            if (!this.streamingService || !this.archive) {
                throw new Error('Streaming service not initialized');
            }

            if (finalBlob && finalBlob.size > 0) {
                // Branch on whether rotation produced segments (chunkIndex), not on whether
                // the queue accepted them: if every enqueue fell back to direct
                // transcription, the final blob is still only tail audio — splitting it as
                // if it were the whole recording would interleave mislabeled segments.
                if (this.chunkIndex > 0) {
                    // Tail audio recorded since the last rotation. Skip near-empty tails
                    // (stop pressed right after a rotation): providers reject sub-0.1s
                    // audio with HTTP 400, which would falsely flag the transcript as
                    // incomplete over a fraction of a second of silence. The tail is
                    // archived regardless so the saved file holds the whole recording.
                    if (finalBlob.size >= this.MIN_TAIL_BYTES) {
                        await this.feedSegment(finalBlob, tailStart, tailEnd);
                    } else {
                        await this.archive.addSegment(finalBlob);
                    }
                } else {
                    // Recording was shorter than one segment, so no rotation occurred:
                    // archive the whole blob, then transcribe it (split as a safety net if
                    // it is unexpectedly long).
                    await this.archive.addSegment(finalBlob);
                    await this.transcribeFinalRecording(finalBlob);
                }
            }

            // Write the recording to the vault BEFORE waiting on transcription. From here
            // on, nothing that goes wrong (provider errors, timeouts, a failed note write)
            // can lose the audio: it exists as a file the user can re-process.
            savedPath = await this.persistRecording();

            // Get transcription result from streaming service
            const result = await this.streamingService.finishProcessing();

            if (!result || result.trim().length === 0) {
                throw new Error('No transcription result received');
            }

            // Keep the modal visible while post-processing and note insertion complete.
            this.ui.showProcessing('processing');
            transcriptHandedOff = true;
            if (this.onStop) {
                await this.onStop(result, savedPath);
            }

            this.ui.showComplete();
            await new Promise(resolve => window.setTimeout(resolve, 450));

            this.cleanup();
            super.close();
        } catch (error) {
            // If the failure hit before the recording was written (e.g. the recorder's own
            // stop threw), make one more attempt now: the archived segments are still here.
            if (!savedPath && this.archive?.hasAudio()) {
                savedPath = await this.persistRecording();
            }
            if (savedPath && !transcriptHandedOff) {
                // Transcription failed, but the audio is safe. Say where it is and leave a
                // pointer in the note so the user can retry without hunting for the file.
                const err = error instanceof Error ? error : new Error(String(error));
                new Notice(`Recording saved to ${savedPath}. Open it and run "Transcribe audio file" to retry.`, 15000);
                try {
                    await this.onTranscriptionFailed?.(savedPath, err);
                } catch (insertError) {
                    console.error('[TimerModal] Could not add the saved-recording note:', insertError);
                }
            }
            this.handleError('Failed to finish recording', error);
        }
    }

    /**
     * Joins the archived segments into one audio file in the recordings folder. A failure
     * here is reported but does not abort the stop flow: transcription still runs, and the
     * segment files stay on disk so the recording is recovered on the next plugin load.
     */
    private async persistRecording(): Promise<string | null> {
        if (!this.archive) return null;
        try {
            const path = await this.archive.finalize();
            Logger.log('[TimerModal] Recording saved to', path);
            return path;
        } catch (error) {
            console.error('[TimerModal] Failed to save recording to the vault:', error);
            const message = error instanceof Error ? error.message : 'Unknown error';
            new Notice(`Could not save the recording audio (${message}). Its segments were kept and will be recovered the next time NeuroVox loads.`, 15000);
            return null;
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

            // Release the segment files only if the recording reached the vault; otherwise
            // they stay for load-time recovery.
            if (this.archive) {
                void this.archive.dispose();
                this.archive = null;
            }
        } catch {
            // Cleanup failures here are non-fatal; proceed to reset state below.
        } finally {
            // Reset states
            this.currentState = 'inactive';
            this.isStopping = false;
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
