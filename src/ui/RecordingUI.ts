import { setIcon } from 'obsidian';

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
    private pauseButton: HTMLButtonElement;
    private stopButton: HTMLButtonElement;
    private waveContainer: HTMLElement;
    private currentState: RecordingState = 'inactive';
    private isProcessingAction = false;
    private readonly DEBOUNCE_TIME = 1000; // 1 second debounce
    private actionTimeout: NodeJS.Timeout | null = null;

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

        this.pauseButton = this.createButton(
            controls,
            ['neurovox-timer-button', 'neurovox-pause-button'],
            'pause',
            'Pause recording',
            () => this.handlers.onPause()
        );

        this.stopButton = this.createButton(
            controls,
            ['neurovox-timer-button', 'neurovox-stop-button'],
            'square',
            'Stop Recording',
            () => this.handlers.onStop()
        );
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

    /**
     * Creates a button with debouncing and error handling
     * 🛡️ Mobile-optimized with protection against rapid clicks
     */
    /**
     * Creates a button with enhanced mobile interaction handling
     * 📱 Optimized touch events and feedback for mobile devices
     */
    private createButton(
        container: HTMLElement,
        classNames: string[],
        iconName: string,
        ariaLabel: string,
        onClick: () => void
    ): HTMLButtonElement {
        const button = container.createEl('button', {
            cls: [...classNames, 'touch-button'],
            attr: { 
                'aria-label': ariaLabel,
                'data-state': 'ready',
                'role': 'button',
                'tabindex': '0'
            }
        });

        setIcon(button, iconName);
        
        // Track touch interactions
        let touchStartTime = 0;
        let isLongPress = false;
        
        // Handle touch start
        const handleTouchStart = (e: TouchEvent) => {
            e.preventDefault();
            e.stopPropagation();
            
            if (this.isProcessingAction) return;
            
            touchStartTime = Date.now();
            isLongPress = false;
            
            button.addClass('is-touching');
            
            // Detect long press
            setTimeout(() => {
                if (button.matches(':active')) {
                    isLongPress = true;
                    button.addClass('is-long-press');
                }
            }, 500);
        };
        
        // Handle touch end
        const handleTouchEnd = async (e: TouchEvent) => {
            e.preventDefault();
            e.stopPropagation();
            
            button.removeClass('is-touching');
            button.removeClass('is-long-press');
            
            if (this.isProcessingAction || isLongPress) return;
            
            const touchDuration = Date.now() - touchStartTime;
            if (touchDuration > 1000) return; // Ignore long touches
            
            // Process the action
            await this.processButtonAction(button, onClick);
        };
        
        // Add touch event listeners
        button.addEventListener('touchstart', handleTouchStart, { passive: false });
        button.addEventListener('touchend', handleTouchEnd, { passive: false });
        button.addEventListener('touchcancel', () => {
            button.removeClass('is-touching');
            button.removeClass('is-long-press');
        });
        
        // Add click handler for non-touch devices
        button.addEventListener('click', async (e) => {
            e.preventDefault();
            if (!this.isProcessingAction) {
                await this.processButtonAction(button, onClick);
            }
        });

        return button;
    }

    /**
     * Processes button actions with proper state management and feedback
     * 🎯 Handles action processing with proper cleanup
     */
    private async processButtonAction(
        button: HTMLButtonElement,
        onClick: () => void
    ): Promise<void> {
        if (this.isProcessingAction) return;

        // Visual feedback
        button.setAttribute('data-state', 'processing');
        button.addClass('is-processing');
        this.isProcessingAction = true;

        try {
            // Clear any existing timeout
            if (this.actionTimeout) {
                clearTimeout(this.actionTimeout);
            }

            // Execute the action
            await onClick();

            // Set debounce timeout
            this.actionTimeout = setTimeout(() => {
                this.isProcessingAction = false;
                button.setAttribute('data-state', 'ready');
                button.removeClass('is-processing');
            }, this.DEBOUNCE_TIME);

        } catch (error) {
            // Reset state on error
            this.isProcessingAction = false;
            button.setAttribute('data-state', 'error');
            button.addClass('has-error');
            
            // Clear error state after delay
            setTimeout(() => {
                button.setAttribute('data-state', 'ready');
                button.removeClass('has-error');
            }, 2000);
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
        
        this.pauseButton.empty();
        setIcon(this.pauseButton, iconName);
        this.pauseButton.setAttribute('aria-label', label);
        this.pauseButton.toggleClass('is-paused', isPaused);
    }

    /**
     * Enhanced cleanup with proper resource management
     * 🧹 Ensures all resources are properly released
     */
    public cleanup(): void {
        // Clear any pending timeouts
        if (this.actionTimeout) {
            clearTimeout(this.actionTimeout);
            this.actionTimeout = null;
        }

        // Reset state
        this.isProcessingAction = false;
        
        // Remove event listeners
        if (this.pauseButton) {
            this.pauseButton.remove();
        }
        if (this.stopButton) {
            this.stopButton.remove();
        }

        // Clear container
        this.container.empty();
    }
}
