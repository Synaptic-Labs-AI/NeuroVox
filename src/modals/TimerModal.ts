import { App, Modal, Notice } from 'obsidian';
import { AudioRecordingManager } from '../utils/RecordingManager';  // Updated import
import { RecordingUI, RecordingState } from '../ui/RecordingUI';
import { ConfirmationModal } from './ConfirmationModal';

interface TimerConfig {
    maxDuration: number;
    warningThreshold: number;
    updateInterval: number;
}

/**
 * Modal for managing audio recording with timer and controls
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
            this.startRecording();
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
        this.close();
    }

    /**
     * Stops recording and processes the result
     */
    private async stopRecording(): Promise<void> {
        try {
            const blob = await this.recordingManager.stop();
            if (blob && this.onStop) {
                this.onStop(blob);
            }
            
            this.currentState = 'stopped';
            this.ui.updateState(this.currentState);
        } catch (error) {
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

    private updateTimerDisplay(): void {
        this.ui.updateTimer(
            this.seconds,
            this.CONFIG.maxDuration,
            this.CONFIG.warningThreshold
        );
    }

    private pauseTimer(): void {
        if (this.intervalId) {
            window.clearInterval(this.intervalId);
            this.intervalId = null;
        }
    }

    private resumeTimer(): void {
        if (!this.intervalId) {
            this.intervalId = window.setInterval(() => {
                this.seconds++;
                this.updateTimerDisplay();
            }, this.CONFIG.updateInterval);
        }
    }

    /**
     * Handles modal close with confirmation
     */
    async onClose(): Promise<void> {
        if (this.isClosing) return;
        
        if (this.currentState === 'recording' || this.currentState === 'paused') {
            this.isClosing = true;
            
            try {
                const confirmModal = new ConfirmationModal(this.app, {
                    title: 'Save Recording?',
                    message: 'Do you want to save the current recording?'
                });
                confirmModal.open();
                
                const shouldSave = await confirmModal.getResult();
                if (shouldSave) {
                    await this.stopRecording();
                }
            } catch (error) {
                this.handleError('Error handling close', error);
            } finally {
                this.cleanup();
                this.isClosing = false;
            }
        } else {
            this.cleanup();
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
        console.error(message, error);
        new Notice(`${message}. Please try again.`);
        this.cleanup();
        this.close();
    }
}