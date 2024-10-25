import { App, Modal, Notice } from 'obsidian';
import { icons } from '../assets/icons';
import RecordRTC from 'recordrtc';

/**
 * TimerModal provides a recording interface with integrated timer, controls, and audio visualization.
 * Uses Obsidian's native modal structure and includes an animated audio wave visualization.
 */
export class TimerModal extends Modal {
    private recorder: RecordRTC | null = null;
    private stream: MediaStream | null = null;
    private intervalId: number | null = null;
    private seconds: number = 0;
    private isRecording: boolean = false;
    private isPaused: boolean = false;
    private timerText: HTMLElement;
    private pauseButton: HTMLButtonElement;
    private stopButton: HTMLButtonElement;
    private waveContainer: HTMLElement;
    
    // Maximum recording duration in seconds (12 minutes)
    private readonly MAX_RECORDING_DURATION = 12 * 60;

    // Callback for when recording is stopped
    public onStop: (audioBlob: Blob) => void;

    constructor(app: App) {
        super(app);
    }

    /**
     * Initializes the modal interface with timer, controls, and audio wave
     */
    onOpen() {
        const { contentEl } = this;
        contentEl.empty();

        // Container for all content
        const container = contentEl.createDiv('timer-content');

        // Create timer display
        this.timerText = container.createDiv('timer-text');
        this.timerText.setText('00:00');

        // Create controls container
        const controls = container.createDiv('timer-controls');
        this.createButtons(controls);

        // Create audio wave visualization
        this.waveContainer = container.createDiv('audio-wave');
        for (let i = 0; i < 5; i++) {
            this.waveContainer.createDiv('wave-bar');
        }

        // Start recording automatically
        this.initializeRecording();
    }

    /**
     * Creates control buttons with icons and event handlers
     */
    private createButtons(container: HTMLElement) {
        // Create pause button
        this.pauseButton = this.createButton(
            container,
            'timer-button pause-button',
            icons.pause,
            'Pause Recording',
            () => this.togglePause()
        );

        // Create stop button
        this.stopButton = this.createButton(
            container,
            'timer-button stop-button',
            icons.stop,
            'Stop Recording',
            () => this.stopRecording()
        );
    }

    /**
     * Creates a button with icon and event handler
     */
    private createButton(
        container: HTMLElement,
        className: string,
        icon: string,
        ariaLabel: string,
        onClick: () => void
    ): HTMLButtonElement {
        const button = container.createEl('button', {
            cls: className,
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
     * Creates an SVG element from SVG string
     */
    private createSvgElement(svgIcon: string): SVGElement | null {
        const parser = new DOMParser();
        const svgDoc = parser.parseFromString(svgIcon, 'image/svg+xml');
        return svgDoc.documentElement instanceof SVGElement 
            ? svgDoc.documentElement 
            : null;
    }

    /**
     * Initializes the recording session
     */
    private async initializeRecording() {
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
     * Starts or resumes recording with updated UI states
     */
    private startRecording() {
        if (!this.recorder) return;

        this.isRecording = true;
        this.isPaused = false;
        this.updateButtonState();
        this.updateWaveState();

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
     * Toggles between pause and resume states
     */
    private togglePause() {
        if (this.isPaused) {
            this.resumeRecording();
        } else {
            this.pauseRecording();
        }
    }

    /**
     * Pauses recording and updates UI states
     */
    private pauseRecording() {
        if (!this.recorder || !this.isRecording) return;

        this.recorder.pauseRecording();
        this.pauseTimer();
        
        this.isRecording = false;
        this.isPaused = true;
        this.updateButtonState();
        this.updateWaveState();
        
        new Notice('Recording paused');
    }

    /**
     * Resumes a paused recording
     */
    private resumeRecording() {
        if (!this.recorder) return;
        this.startRecording();
        new Notice('Recording resumed');
    }

    /**
     * Stops recording and processes the result
     */
    private async stopRecording(): Promise<void> {
        if (!this.recorder) return;

        this.isRecording = false;
        this.isPaused = false;
        this.updateWaveState();

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
     * Starts the recording timer
     */
    private startTimer() {
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
     * Updates the timer display with current time
     */
    private updateTimerDisplay() {
        const minutes = Math.floor(this.seconds / 60).toString().padStart(2, '0');
        const seconds = (this.seconds % 60).toString().padStart(2, '0');
        this.timerText.setText(`${minutes}:${seconds}`);

        if (this.seconds >= this.MAX_RECORDING_DURATION - 60) {
            this.timerText.addClass('warning');
        }
    }

    /**
     * Updates the audio wave animation state
     */
    private updateWaveState() {
        if (!this.waveContainer) return;

        this.waveContainer.removeClass('paused', 'stopped');

        if (this.isPaused) {
            this.waveContainer.addClass('paused');
        } else if (!this.isRecording) {
            this.waveContainer.addClass('stopped');
        }
    }

    /**
     * Pauses the timer
     */
    private pauseTimer() {
        if (this.intervalId) {
            window.clearInterval(this.intervalId);
            this.intervalId = null;
        }
    }

    /**
     * Resumes the timer
     */
    private resumeTimer() {
        if (!this.intervalId) {
            this.intervalId = window.setInterval(() => {
                this.seconds++;
                this.updateTimerDisplay();
            }, 1000);
        }
    }

    /**
     * Updates button states based on recording status
     */
    private updateButtonState() {
        const pauseIcon = this.isPaused ? icons.play : icons.pause;
        const pauseLabel = this.isPaused ? 'Resume Recording' : 'Pause Recording';
        
        const svgElement = this.createSvgElement(pauseIcon);
        if (svgElement && this.pauseButton) {
            this.pauseButton.empty();
            this.pauseButton.appendChild(svgElement);
            this.pauseButton.setAttribute('aria-label', pauseLabel);
        }
    }

    /**
     * Cleans up resources when modal is closed
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
    private cleanupResources() {
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