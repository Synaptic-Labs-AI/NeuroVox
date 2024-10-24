import { App, Modal, Notice } from 'obsidian';
import { icons } from '../assets/icons';
import RecordRTC from 'recordrtc';

export class TimerModal extends Modal {
    public timerEl: HTMLElement;
    public pauseButton: HTMLButtonElement;
    public stopButton: HTMLButtonElement;
    public intervalId: number | null = null;
    public seconds: number = 0;
    public recorder: RecordRTC | null = null;
    public stream: MediaStream | null = null;
    public isRecording: boolean = false;
    public isPaused: boolean = false;

    public onStop: (audioBlob: Blob) => void;

    // Maximum recording duration in seconds (e.g., 12 minutes)
    public readonly MAX_RECORDING_DURATION = 12 * 60; // 720 seconds

    constructor(app: App) {
        super(app);
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass('neurovox-modal');

        const modalContent = contentEl.createDiv({ cls: 'neurovox-modal-content' });
        const timerGroup = modalContent.createDiv({ cls: 'neurovox-timer-group' });
        this.timerEl = timerGroup.createDiv({ cls: 'neurovox-timer', text: '00:00' });

        this.pauseButton = this.createIconButton(icons.pause, 'neurovox-pause-button');
        this.stopButton = this.createIconButton(icons.stop, 'neurovox-stop-button');

        const buttonGroup = modalContent.createDiv({ cls: 'neurovox-button-group' });
        buttonGroup.appendChild(this.pauseButton);
        buttonGroup.appendChild(this.stopButton);

        this.pauseButton.addEventListener('click', () => this.togglePause());
        this.stopButton.addEventListener('click', () => this.stopRecording());

        this.startRecording();
    }

    onClose() {
        if (this.isRecording) {
            this.stopRecording();
        }
    }

    public togglePause() {
        this.isPaused ? this.resumeRecording() : this.pauseRecording();
    }

    public async startRecording() {
        this.isRecording = true;
        this.isPaused = false;
        this.updateButtonState();

        if (!this.recorder) {
            try {
                this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                this.recorder = new RecordRTC(this.stream, {
                    type: 'audio',
                    mimeType: 'audio/wav',
                    recorderType: RecordRTC.StereoAudioRecorder,
                    numberOfAudioChannels: 1,
                    desiredSampRate: 16000,
                });
                this.recorder.startRecording();

                // Start the timer
                this.intervalId = window.setInterval(() => {
                    this.seconds++;
                    this.updateTimerDisplay();

                    // Enforce maximum duration
                    if (this.seconds >= this.MAX_RECORDING_DURATION) {
                        this.stopRecording();
                        new Notice('Maximum recording duration reached. Stopping recording.');
                    }
                }, 1000);
            } catch (error) {
                console.error('Error starting RecordRTC:', error);
                new Notice('Failed to start recording. Please check microphone permissions.');
                this.close();
            }
        } else {
            this.recorder.resumeRecording();
        }
    }

    public pauseRecording() {
        if (this.recorder) {
            this.recorder.pauseRecording();
            this.clearInterval();
            this.isRecording = false;
            this.isPaused = true;
            this.updateButtonIcon(this.pauseButton, icons.play);
            new Notice('Recording paused.');
        }
    }

    public resumeRecording() {
        this.startRecording();
        this.updateButtonIcon(this.pauseButton, icons.pause);
        new Notice('Recording resumed.');
    }

    public async stopRecording() {
        if (!this.isRecording && !this.isPaused) return;

        this.isRecording = false;
        this.isPaused = false;

        if (this.recorder) {
            this.recorder.stopRecording(() => {
                const blob = this.recorder?.getBlob();
                if (blob && this.onStop) {
                    this.onStop(blob);
                }
                this.cleanupRecording();
                this.close();
            });
        }

        this.clearInterval();
        this.seconds = 0;
        this.updateTimerDisplay();
        this.updateButtonState();
    }

    public updateTimerDisplay() {
        const minutes = Math.floor(this.seconds / 60).toString().padStart(2, '0');
        const seconds = (this.seconds % 60).toString().padStart(2, '0');
        this.timerEl.textContent = `${minutes}:${seconds}`;

        // Change color when approaching max duration (e.g., last minute)
        if (this.seconds >= this.MAX_RECORDING_DURATION - 60) {
            this.timerEl.style.color = 'orange';
        } else {
            this.timerEl.style.color = 'var(--text-normal)';
        }
    }

    public createIconButton(svgIcon: string, className: string): HTMLButtonElement {
        const button = document.createElement('button');
        button.addClass('neurovox-button', className);
        const svgElement = this.createSvgElement(svgIcon);
        if (svgElement) {
            button.appendChild(svgElement);
        }
        return button;
    }

    public updateButtonIcon(button: HTMLButtonElement, svgIcon: string) {
        button.empty();
        const svgElement = this.createSvgElement(svgIcon);
        if (svgElement) {
            button.appendChild(svgElement);
        }
    }

    public createSvgElement(svgIcon: string): SVGElement | null {
        const parser = new DOMParser();
        const svgDoc = parser.parseFromString(svgIcon, 'image/svg+xml');
        return svgDoc.documentElement instanceof SVGElement ? svgDoc.documentElement : null;
    }

    public updateButtonState() {
        if (this.isRecording) {
            this.pauseButton.removeClass('hidden');
            this.stopButton.removeClass('hidden');
        } else {
            this.pauseButton.addClass('hidden');
            this.stopButton.addClass('hidden');
        }
    }

    public clearInterval() {
        if (this.intervalId) {
            window.clearInterval(this.intervalId);
            this.intervalId = null;
        }
    }

    public cleanupRecording() {
        if (this.recorder) {
            this.recorder.destroy();
            this.recorder = null;
        }
        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
            this.stream = null;
        }
    }
}