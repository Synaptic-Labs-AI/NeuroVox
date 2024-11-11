import { setIcon } from 'obsidian';

export type RecordingState = 'recording' | 'paused' | 'stopped' | 'inactive';

export interface RecordingUIHandlers {
    onPause: () => void;
    onStop: () => void;
}

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

    private initializeComponents(): void {
        this.createTimerDisplay();
        this.createControls();
        this.createWaveform();
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

    private createButton(
        container: HTMLElement,
        classNames: string[],
        iconName: string,
        ariaLabel: string,
        onClick: () => void
    ): HTMLButtonElement {
        const button = container.createEl('button', {
            cls: classNames,
            attr: { 'aria-label': ariaLabel }
        });

        setIcon(button, iconName);
        button.addEventListener('click', onClick);
        return button;
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

    public cleanup(): void {
        this.container.empty();
    }
}