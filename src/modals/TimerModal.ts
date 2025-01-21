import { App, Modal, Notice } from 'obsidian';
import { AudioRecordingManager } from '../utils/RecordingManager';
import { RecordingUI, RecordingState } from '../ui/RecordingUI';
import { ConfirmationModal } from './ConfirmationModal';

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
    private currentState: RecordingState = 'inactive';

    private readonly CONFIG: TimerConfig = {
        maxDuration: 12 * 60,
        warningThreshold: 60,
        updateInterval: 1000
    };

    public onStop: (audioBlob: Blob) => void;

    constructor(app: App) {
        super(app);
        this.recordingManager = new AudioRecordingManager();
        this.setupCloseHandlers();
    }

    /**
     * Sets up handlers for modal closing via escape key and clicking outside
     */
    private setupCloseHandlers(): void {
        // Handle clicking outside the modal
        this.modalEl.addEventListener('click', (event: MouseEvent) => {
            if (event.target === this.modalEl) {
                event.preventDefault();
                event.stopPropagation();
                this.requestClose();
            }
        });

        // Handle escape key
        this.scope.register([], 'Escape', () => {
            this.requestClose();
            return false;
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
            await this.stopRecording();
        }
        
        await this.finalizeClose();
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
     * Initializes the modal and starts recording
     */
    async onOpen(): Promise<void> {
        try {
            const { contentEl } = this;
            contentEl.empty();
            contentEl.addClass('neurovox-timer-modal');

            const container = contentEl.createDiv({ 
                cls: 'neurovox-timer-content' 
            });

            this.ui = new RecordingUI(container, {
                onPause: () => this.handlePauseToggle(),
                onStop: () => this.handleStop()
            });

            await this.recordingManager.initialize();
            await this.startRecording();
        } catch (error) {
            this.handleError('Failed to initialize recording', error);
        }
    }

    /**
     * Starts or resumes recording
     */
    private async startRecording(): Promise<void> {
        try {
            if (this.currentState === 'paused') {
                this.recordingManager.resume();
                this.resumeTimer();
            } else {
                this.recordingManager.start();
                this.startTimer();
            }
            
            this.currentState = 'recording';
            this.ui.updateState(this.currentState);
            new Notice('Recording started');
        } catch (error) {
            this.handleError('Failed to start recording', error);
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
        await this.stopRecording();
        await this.requestClose();
    }

    /**
     * Stops recording and processes the result
     */
    private async stopRecording(): Promise<void> {
        try {
            const blob = await this.recordingManager.stop();
            
            if (!blob) {
                throw new Error('No audio data received from recorder');
            }
            
            this.currentState = 'stopped';
            this.ui.updateState(this.currentState);

            if (this.onStop) {
                try {
                    await this.onStop(blob);
                } catch (error) {
                    throw error;
                }
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            error('❌ Failed to stop recording:', {
                error,
                message: errorMessage,
                stack: error instanceof Error ? error.stack : undefined
            });
            this.handleError('Failed to stop recording', error);
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
        this.pauseTimer();
        this.recordingManager.cleanup();
        this.ui?.cleanup();
    }

    /**
     * Handles errors with user feedback
     */
    private handleError(message: string, error: unknown): void {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error('❌ Error:', {
            context: message,
            error,
            message: errorMessage,
            stack: error instanceof Error ? error.stack : undefined
        });
        new Notice(`${message}: ${errorMessage}`);
        this.cleanup();
        void this.requestClose();
    }
}
