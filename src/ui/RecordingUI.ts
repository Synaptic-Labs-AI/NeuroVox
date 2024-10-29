import { icons } from '../assets/icons';

export type RecordingState = 'recording' | 'paused' | 'stopped' | 'inactive';

export interface RecordingUIHandlers {
    onPause: () => void;
    onStop: () => void;
}

/**
 * Manages the visual components and state of the recording interface
 */
export class RecordingUI {
    private timerText: HTMLElement;
    private pauseButton: HTMLButtonElement;
    private stopButton: HTMLButtonElement;
    private waveContainer: HTMLElement;
    private currentState: RecordingState = 'inactive';

    constructor(
        private container: HTMLElement,
        private handlers: RecordingUIHandlers
    ) {
        this.initializeComponents();
    }

    /**
     * Creates all UI components
     */
    private initializeComponents(): void {
        this.createTimerDisplay();
        this.createControls();
        this.createWaveform();
    }

    /**
     * Creates the timer display component
     */
    private createTimerDisplay(): void {
        this.timerText = this.container.createDiv({
            cls: 'neurovox-timer-display',
            text: '00:00'
        });
    }

    /**
     * Creates the control buttons
     */
    private createControls(): void {
        const controls = this.container.createDiv({
            cls: 'neurovox-timer-controls'
        });

        this.pauseButton = this.createButton(
            controls,
            ['neurovox-timer-button', 'neurovox-pause-button'],
            icons.pause,
            'Pause Recording',
            () => this.handlers.onPause()
        );

        this.stopButton = this.createButton(
            controls,
            ['neurovox-timer-button', 'neurovox-stop-button'],
            icons.stop,
            'Stop Recording',
            () => this.handlers.onStop()
        );
    }

    /**
     * Creates the audio waveform visualization
     */
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
     * Creates a button with specified properties
     */
    private createButton(
        container: HTMLElement,
        classNames: string[],
        icon: string,
        ariaLabel: string,
        onClick: () => void
    ): HTMLButtonElement {
        const button = container.createEl('button', {
            cls: classNames,
            attr: { 'aria-label': ariaLabel }
        });

        const svgEl = this.createSvgElement(icon);
        if (svgEl) {
            button.appendChild(svgEl);
        }

        button.addEventListener('click', onClick);
        return button;
    }

    /**
     * Creates an SVG element from icon string
     */
    private createSvgElement(svgIcon: string): SVGElement | null {
        const parser = new DOMParser();
        const svgDoc = parser.parseFromString(svgIcon, 'image/svg+xml');
        return svgDoc.documentElement instanceof SVGElement 
            ? svgDoc.documentElement 
            : null;
    }

    /**
     * Updates the timer display
     */
    public updateTimer(seconds: number, maxDuration: number, warningThreshold: number): void {
        const minutes = Math.floor(seconds / 60).toString().padStart(2, '0');
        const remainingSeconds = (seconds % 60).toString().padStart(2, '0');
        
        this.timerText.setText(`${minutes}:${remainingSeconds}`);

        const timeLeft = maxDuration - seconds;
        this.timerText.toggleClass('is-warning', timeLeft <= warningThreshold);
    }

    /**
     * Updates the recording state and UI
     */
    public updateState(state: RecordingState): void {
        this.currentState = state;
        
        // Update wave animation state
        const states = ['is-recording', 'is-paused', 'is-stopped', 'is-inactive'];
        states.forEach(cls => this.waveContainer.removeClass(cls));
        this.waveContainer.addClass(`is-${state}`);

        // Update pause button state
        const isPaused = state === 'paused';
        const icon = isPaused ? icons.play : icons.pause;
        const label = isPaused ? 'Resume Recording' : 'Pause Recording';
        
        const svgElement = this.createSvgElement(icon);
        if (svgElement) {
            this.pauseButton.empty();
            this.pauseButton.appendChild(svgElement);
            this.pauseButton.setAttribute('aria-label', label);
        }

        this.pauseButton.toggleClass('is-paused', isPaused);
    }

    /**
     * Cleans up UI resources
     */
    public cleanup(): void {
        this.container.empty();
    }
}