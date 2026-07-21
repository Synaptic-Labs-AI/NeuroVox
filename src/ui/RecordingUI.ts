import { setIcon } from 'obsidian';
import { TouchableButton } from './TouchableButton';

export type RecordingState = 'recording' | 'paused' | 'stopped' | 'inactive';
export type ProcessingStage = 'transcribing' | 'processing';

export interface RecordingUIHandlers {
    onPause: () => void;
    onStop: () => void;
}

/**
 * UI component for managing recording controls with mobile-optimized interactions
 * 📱 Enhanced with debouncing and state management for better mobile stability
 */
export class RecordingUI {
    private recordingView: HTMLElement;
    private processingView: HTMLElement;
    private timerText: HTMLElement;
    private pauseButton: TouchableButton;
    private stopButton: TouchableButton;
    private waveContainer: HTMLElement;
    private processingTitle: HTMLElement;
    private processingDescription: HTMLElement;
    private transcribingStep: HTMLElement;
    private processingStep: HTMLElement;
    private transcribingDot: HTMLElement;
    private processingIcon: HTMLElement;
    private completeIcon: HTMLElement;
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
        
        this.createRecordingView();
        this.createProcessingView();
        this.showRecording();
    }

    private createRecordingView(): void {
        this.recordingView = this.container.createDiv({
            cls: 'neurovox-recording-view'
        });

        this.recordingView.createDiv({
            cls: 'neurovox-recording-label',
            text: 'Recording'
        });

        this.createTimerDisplay();
        this.createWaveform();
        this.createControls();
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
        this.timerText = this.recordingView.createDiv({
            cls: 'neurovox-timer-display',
            text: '00:00'
        });
    }

    private createControls(): void {
        const controls = this.recordingView.createDiv({
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
        this.waveContainer = this.recordingView.createDiv({
            cls: 'neurovox-audio-wave'
        });
        
        for (let i = 0; i < 5; i++) {
            this.waveContainer.createDiv({
                cls: 'neurovox-wave-bar'
            });
        }
    }

    private createProcessingView(): void {
        this.processingView = this.container.createDiv({
            cls: 'neurovox-processing-view'
        });
        this.processingView.setAttribute('aria-live', 'polite');
        this.processingView.setAttribute('aria-atomic', 'true');

        const spinnerWrap = this.processingView.createDiv({
            cls: 'neurovox-processing-spinner-wrap'
        });
        spinnerWrap.setAttribute('aria-hidden', 'true');
        spinnerWrap.createDiv({ cls: 'neurovox-processing-spinner-glow' });
        spinnerWrap.createDiv({ cls: 'neurovox-processing-spinner' });
        spinnerWrap.createDiv({ cls: 'neurovox-processing-spinner-inner' });

        const aperture = spinnerWrap.createDiv({
            cls: 'neurovox-processing-aperture'
        });
        const miniWave = aperture.createDiv({
            cls: 'neurovox-processing-mini-wave'
        });
        for (let i = 0; i < 3; i++) {
            miniWave.createSpan();
        }

        this.processingIcon = aperture.createDiv({
            cls: 'neurovox-processing-stage-icon'
        });
        setIcon(this.processingIcon, 'sparkles');

        this.completeIcon = aperture.createDiv({
            cls: 'neurovox-processing-complete-icon'
        });
        setIcon(this.completeIcon, 'check');

        this.processingTitle = this.processingView.createEl('h2', {
            cls: 'neurovox-processing-title',
            text: 'Transcribing'
        });
        this.processingDescription = this.processingView.createEl('p', {
            cls: 'neurovox-processing-description',
            text: 'Turning your recording into text.'
        });

        const stages = this.processingView.createDiv({
            cls: 'neurovox-processing-stages'
        });
        stages.setAttribute('aria-label', 'Processing progress');

        this.transcribingStep = stages.createDiv({
            cls: 'neurovox-processing-step is-transcribing'
        });
        this.transcribingDot = this.transcribingStep.createSpan({
            cls: 'neurovox-processing-step-dot',
            text: '1'
        });
        this.transcribingStep.createSpan({ text: 'Transcribing' });

        stages.createDiv({ cls: 'neurovox-processing-step-line' });

        this.processingStep = stages.createDiv({
            cls: 'neurovox-processing-step is-processing'
        });
        this.processingStep.createSpan({
            cls: 'neurovox-processing-step-dot',
            text: '2'
        });
        this.processingStep.createSpan({ text: 'Processing' });
    }

    public showRecording(): void {
        this.container.removeClass('is-processing-view', 'is-complete-view');
        this.container.addClass('is-recording-view');
        this.container.removeAttribute('data-processing-stage');
        this.pauseButton.buttonEl.disabled = false;
        this.stopButton.buttonEl.disabled = false;
    }

    public showProcessing(stage: ProcessingStage): void {
        this.container.removeClass('is-recording-view', 'is-complete-view');
        this.container.addClass('is-processing-view');
        this.container.setAttribute('data-processing-stage', stage);
        this.pauseButton.buttonEl.disabled = true;
        this.stopButton.buttonEl.disabled = true;

        if (stage === 'transcribing') {
            this.processingTitle.setText('Transcribing');
            this.processingDescription.setText('Turning your recording into text.');
            this.transcribingDot.setText('1');
            this.transcribingStep.removeClass('is-complete');
            this.transcribingStep.addClass('is-active');
            this.processingStep.removeClass('is-active');
        } else {
            this.processingTitle.setText('Processing your note');
            this.processingDescription.setText(
                'Applying your preferences and adding the result to your note.'
            );
            this.transcribingDot.setText('✓');
            this.transcribingStep.removeClass('is-active');
            this.transcribingStep.addClass('is-complete');
            this.processingStep.addClass('is-active');
        }
    }

    public showComplete(): void {
        this.container.removeClass('is-recording-view', 'is-processing-view');
        this.container.addClass('is-complete-view');
        this.container.setAttribute('data-processing-stage', 'complete');
        this.processingTitle.setText('Added to your note');
        this.processingDescription.setText('Your recording is ready.');
        this.transcribingDot.setText('✓');
        this.transcribingStep.removeClass('is-active');
        this.transcribingStep.addClass('is-complete');
        this.processingStep.removeClass('is-active');
        this.processingStep.addClass('is-complete');
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

        if (state === 'recording' || state === 'paused') {
            this.showRecording();
        }
        
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
