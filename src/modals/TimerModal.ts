import { App, Modal, Notice } from 'obsidian';
import { icons } from '../assets/icons';
import RecordRTC from 'recordrtc';

/**
 * TimerModal provides a recording interface with integrated timer, controls, and audio visualization.
 * Uses CSS classes for styling and state management.
 */
export class TimerModal extends Modal {
    public recorder: RecordRTC | null = null;
    public stream: MediaStream | null = null;
    public intervalId: number | null = null;
    public seconds: number = 0;
    public isRecording: boolean = false;
    public isPaused: boolean = false;
    public timerText: HTMLElement;
    public pauseButton: HTMLButtonElement;
    public stopButton: HTMLButtonElement;
    public waveContainer: HTMLElement;
    
    public readonly MAX_RECORDING_DURATION = 12 * 60;
    public onStop: (audioBlob: Blob) => void;

    constructor(app: App) {
        super(app);
    }

    /**
     * Initializes the modal interface with timer, controls, and audio wave visualization
     */
    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass('neurovox-timer-modal');

        const container = contentEl.createDiv({
            cls: 'neurovox-timer-content'
        });

        this.createTimerDisplay(container);
        this.createControlButtons(container);
        this.createAudioWave(container);
        this.initializeRecording();
    }

    /**
     * Creates the timer display element
     */
    public createTimerDisplay(container: HTMLElement): void {
        this.timerText = container.createDiv({
            cls: 'neurovox-timer-display',
            text: '00:00'
        });
    }

    /**
     * Creates the control buttons container and buttons
     */
    public createControlButtons(container: HTMLElement): void {
        const controls = container.createDiv({
            cls: 'neurovox-timer-controls'
        });

        this.pauseButton = this.createButton(
            controls,
            ['neurovox-timer-button', 'neurovox-pause-button'],
            icons.pause,
            'Pause Recording',
            () => this.togglePause()
        );

        this.stopButton = this.createButton(
            controls,
            ['neurovox-timer-button', 'neurovox-stop-button'],
            icons.stop,
            'Stop Recording',
            () => this.stopRecording()
        );
    }

    /**
     * Creates the audio wave visualization container and bars
     */
    public createAudioWave(container: HTMLElement): void {
        this.waveContainer = container.createDiv({
            cls: 'neurovox-audio-wave'
        });
        
        for (let i = 0; i < 5; i++) {
            this.waveContainer.createDiv({
                cls: 'neurovox-wave-bar'
            });
        }
    }

    /**
     * Creates a button element with specified classes, icon, and handler
     */
    public createButton(
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
    public createSvgElement(svgIcon: string): SVGElement | null {
        const parser = new DOMParser();
        const svgDoc = parser.parseFromString(svgIcon, 'image/svg+xml');
        return svgDoc.documentElement instanceof SVGElement 
            ? svgDoc.documentElement 
            : null;
    }

    /**
     * Initializes the recording functionality
     */
    public async initializeRecording() {
        try {
            this.stream = await navigator.mediaDevices.getUserMedia({ 
                audio: true 
            });
            
            this.recorder = new RecordRTC(this.stream, {
                type: 'audio',
                mimeType: 'audio/wav',
                recorderType: RecordRTC.StereoAudioRecorder,
                numberOfAudioChannels: 1,
                desiredSampRate: 16000
            });

            this.startRecording();
        } catch (error) {
            console.error('Failed to initialize recording:', error);
            new Notice('Failed to start recording. Please check microphone permissions.');
            this.close();
        }
    }

    /**
     * Manages recording state and UI updates when starting/resuming recording
     */
    public startRecording() {
        if (!this.recorder) return;

        this.isRecording = true;
        this.isPaused = false;
        this.updateButtonState();
        this.updateRecordingState('recording');

        if (this.recorder.state === 'inactive') {
            this.recorder.startRecording();
            this.startTimer();
        } else {
            this.recorder.resumeRecording();
            this.resumeTimer();
        }

        new Notice('Recording started');
    }

    /**
     * Updates the visual state of the recording interface
     */
    public updateRecordingState(state: 'recording' | 'paused' | 'stopped') {
        const states = ['is-recording', 'is-paused', 'is-stopped'];
        states.forEach(cls => this.waveContainer.removeClass(cls));
        this.waveContainer.addClass(`is-${state}`);
    }

    /**
     * Toggles between pause and resume states
     */
    public togglePause() {
        if (this.isPaused) {
            this.resumeRecording();
        } else {
            this.pauseRecording();
        }
    }

    /**
     * Handles recording pause state and UI updates
     */
    public pauseRecording() {
        if (!this.recorder || !this.isRecording) return;

        this.recorder.pauseRecording();
        this.pauseTimer();
        
        this.isRecording = false;
        this.isPaused = true;
        this.updateButtonState();
        this.updateRecordingState('paused');
        
        new Notice('Recording paused');
    }

    /**
     * Resumes recording from paused state
     */
    public resumeRecording() {
        if (!this.recorder) return;
        this.startRecording();
        new Notice('Recording resumed');
    }

    /**
     * Handles the stop recording process and cleanup
     */
    public async stopRecording(): Promise<void> {
        if (!this.recorder) return;

        this.isRecording = false;
        this.isPaused = false;
        this.updateRecordingState('stopped');

        return new Promise<void>((resolve) => {
            if (!this.recorder) {
                resolve();
                return;
            }

            this.recorder.stopRecording(() => {
                const blob = this.recorder?.getBlob();
                if (blob && this.onStop) {
                    this.onStop(blob);
                }
                this.cleanupResources();
                this.close();
                resolve();
            });
        });
    }

    /**
     * Initializes and starts the timer
     */
    public startTimer() {
        this.seconds = 0;
        this.updateTimerDisplay();
        
        this.intervalId = window.setInterval(() => {
            this.seconds++;
            this.updateTimerDisplay();

            if (this.seconds >= this.MAX_RECORDING_DURATION) {
                this.stopRecording();
                new Notice('Maximum recording duration reached');
            }
        }, 1000);
    }

    /**
     * Updates the timer display and warning state
     */
    public updateTimerDisplay() {
        const minutes = Math.floor(this.seconds / 60).toString().padStart(2, '0');
        const seconds = (this.seconds % 60).toString().padStart(2, '0');
        this.timerText.setText(`${minutes}:${seconds}`);

        const timeLeft = this.MAX_RECORDING_DURATION - this.seconds;
        if (timeLeft <= 60) {
            this.timerText.addClass('is-warning');
        } else {
            this.timerText.removeClass('is-warning');
        }
    }

    /**
     * Updates pause/play button state and icon
     */
    public updateButtonState() {
        const pauseIcon = this.isPaused ? icons.play : icons.pause;
        const pauseLabel = this.isPaused ? 'Resume Recording' : 'Pause Recording';
        
        const svgElement = this.createSvgElement(pauseIcon);
        if (svgElement && this.pauseButton) {
            this.pauseButton.empty();
            this.pauseButton.appendChild(svgElement);
            this.pauseButton.setAttribute('aria-label', pauseLabel);
        }

        this.pauseButton.toggleClass('is-paused', this.isPaused);
    }

    /**
     * Pauses the timer
     */
    public pauseTimer() {
        if (this.intervalId) {
            window.clearInterval(this.intervalId);
            this.intervalId = null;
        }
    }

    /**
     * Resumes the timer
     */
    public resumeTimer() {
        if (!this.intervalId) {
            this.intervalId = window.setInterval(() => {
                this.seconds++;
                this.updateTimerDisplay();
            }, 1000);
        }
    }

    /**
     * Performs cleanup when modal is closed
     */
    onClose() {
        if (this.isRecording || this.isPaused) {
            this.stopRecording();
        }
        this.cleanupResources();
    }

    /**
     * Releases all resources used by the recorder
     */
    public cleanupResources() {
        this.pauseTimer();
        
        if (this.recorder) {
            this.recorder.destroy();
            this.recorder = null;
        }

        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
            this.stream = null;
        }

        this.seconds = 0;
        this.isRecording = false;
        this.isPaused = false;
    }
}