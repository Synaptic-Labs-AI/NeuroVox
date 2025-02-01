import { setIcon } from 'obsidian';
import { TouchableButton } from './TouchableButton';

export type RecordingState = 'recording' | 'paused' | 'stopped' | 'inactive';

export interface RecordingUIHandlers {
    onPause: () => void;
    onStop: () => void;
}

/**
 * UI component for managing recording controls with mobile-optimized interactions
 * 📱 Enhanced with debouncing and state management for better mobile stability
 */
export class RecordingUI {
    private timerText: HTMLElement;
    private pauseButton: TouchableButton;
    private stopButton: TouchableButton;
    private waveContainer: HTMLElement;
    private currentState: RecordingState = 'inactive';

    constructor(
        private container: HTMLElement,
        private handlers: RecordingUIHandlers
    ) {
        this.initializeComponents();
        
        // Cleanup on page unload to prevent memory leaks
        window.addEventListener('unload', () => this.cleanup());
    }

    private initializeComponents(): void {
        // Add touch event handlers to container
        this.setupTouchHandlers();
        
        this.createTimerDisplay();
        this.createControls();
        this.createWaveform();
    }

    /**
     * Sets up touch event handlers for mobile interactions
     * 📱 Prevents unwanted gestures and ensures smooth interaction
     */
    private setupTouchHandlers(): void {
        // Prevent pinch zoom
        this.container.addEventListener('gesturestart', (e) => {
            e.preventDefault();
        }, { passive: false });

        // Prevent scrolling while interacting with controls
        this.container.addEventListener('touchmove', (e) => {
            e.preventDefault();
        }, { passive: false });

        // Prevent double-tap zoom
        let lastTap = 0;
        this.container.addEventListener('touchend', (e) => {
            const currentTime = new Date().getTime();
            const tapLength = currentTime - lastTap;
            if (tapLength < 300 && tapLength > 0) {
                e.preventDefault();
            }
            lastTap = currentTime;
        }, { passive: false });
    }

    private createTimerDisplay(): void {
        this.timerText = this.container.createDiv({
            cls: 'neurovox-timer-display',
            text: '00:00'
        });
    }

    private createControls(): void {
        const controls = this.container.createDiv({
            cls: 'neurovox-timer-controls'
        });

        // Create pause button
        this.pauseButton = new TouchableButton({
            container: controls,
            text: '',
            icon: 'pause',
            classes: ['neurovox-timer-button', 'neurovox-pause-button'],
            ariaLabel: 'Pause recording',
            onClick: () => this.handlers.onPause()
        });

        // Create stop button
        this.stopButton = new TouchableButton({
            container: controls,
            text: '',
            icon: 'square',
            classes: ['neurovox-timer-button', 'neurovox-stop-button'],
            ariaLabel: 'Stop Recording',
            onClick: () => this.handlers.onStop()
        });
    }

    private createWaveform(): void {
        this.waveContainer = this.container.createDiv({
            cls: 'neurovox-audio-wave'
        });
        
        for (let i = 0; i < 5; i++) {
            this.waveContainer.createDiv({
                cls: 'neurovox-wave-bar'
            });
        }
    }

    public updateTimer(seconds: number, maxDuration: number, warningThreshold: number): void {
        const minutes = Math.floor(seconds / 60).toString().padStart(2, '0');
        const remainingSeconds = (seconds % 60).toString().padStart(2, '0');
        
        this.timerText.setText(`${minutes}:${remainingSeconds}`);

        const timeLeft = maxDuration - seconds;
        this.timerText.toggleClass('is-warning', timeLeft <= warningThreshold);
    }

    public updateState(state: RecordingState): void {
        this.currentState = state;
        
        const states = ['is-recording', 'is-paused', 'is-stopped', 'is-inactive'];
        states.forEach(cls => this.waveContainer.removeClass(cls));
        this.waveContainer.addClass(`is-${state}`);

        const isPaused = state === 'paused';
        const iconName = isPaused ? 'play' : 'pause';
        const label = isPaused ? 'Resume recording' : 'Pause Recording';
        
        // Update pause button
        this.pauseButton.buttonEl.empty();
        setIcon(this.pauseButton.buttonEl, iconName);
        this.pauseButton.buttonEl.setAttribute('aria-label', label);
        this.pauseButton.buttonEl.toggleClass('is-paused', isPaused);
    }

    /**
     * Enhanced cleanup with proper resource management
     * 🧹 Ensures all resources are properly released
     */
    public cleanup(): void {
        // Clean up buttons
        this.pauseButton?.cleanup();
        this.stopButton?.cleanup();

        // Clear container
        this.container.empty();
    }
}
