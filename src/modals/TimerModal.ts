import { App, Modal, Notice } from 'obsidian';
import { AudioRecordingManager } from '../utils/RecordingManager';
import { RecordingUI, RecordingState } from '../ui/RecordingUI';
import { ConfirmationModal, ConfirmationResult } from './ConfirmationModal';

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

    public onStop: (audioBlob: Blob, shouldSave: boolean) => void;

    constructor(app: App) {
        super(app);
        this.recordingManager = new AudioRecordingManager();
        this.setupCloseHandlers();
    }

    /**
     * Sets up handlers for modal closing via escape key and clicking outside
     */
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
     * Initializes the modal and starts recording
     */
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
            await this.recordingManager.initialize({
                isMobile: this.isMobileDevice(),
                isIOS: this.isIOSDevice()
            });
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
     * Detects if current device is mobile
     */
    private isMobileDevice(): boolean {
        return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    }

    /**
     * Detects if current device is iOS
     */
    private isIOSDevice(): boolean {
        return /iPhone|iPad|iPod/i.test(navigator.userAgent);
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
        try {
            const blob = await this.recordingManager.stop();
            if (!blob) {
                throw new Error('No audio data received from recorder');
            }

            // Close recording modal first
            this.cleanup();
            super.close();

            // Show confirmation modal
            const confirmModal = new ConfirmationModal(this.app, {
                title: 'Save Recording',
                message: 'Would you like to save the audio file?',
                confirmText: 'Save & Process',
                processOnlyText: 'Process Only',
                cancelText: 'Cancel'
            });

            confirmModal.open();
            const result = await confirmModal.getResult();

            switch (result) {
                case ConfirmationResult.SaveAndProcess:
                    if (this.onStop) {
                        await this.onStop(blob, true);
                    }
                    break;
                case ConfirmationResult.ProcessOnly:
                    if (this.onStop) {
                        await this.onStop(blob, false);
                    }
                    break;
                case ConfirmationResult.Cancel:
                    // Do nothing, just close
                    break;
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
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
        try {
            this.pauseTimer();
            this.recordingManager.cleanup();
            this.ui?.cleanup();
        } catch (error) {
        } finally {
            // Reset states
            this.currentState = 'inactive';
            this.seconds = 0;
            this.isClosing = false;
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
