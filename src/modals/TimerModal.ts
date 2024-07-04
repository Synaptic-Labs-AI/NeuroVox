import { App, Modal } from 'obsidian';
import { icons } from '../assets/icons';
import RecordRTC from 'recordrtc';

export class TimerModal extends Modal {
    private timerEl: HTMLElement;
    private pulsingButton: HTMLButtonElement;
    private pauseButton: HTMLButtonElement;
    private stopButton: HTMLButtonElement;
    private intervalId: number | null = null;
    private seconds: number = 0;
    private recorder: RecordRTC | null = null;
    private stream: MediaStream | null = null;
    private isRecording: boolean = false;
    private isPaused: boolean = false;

    public onStop: (audioBlob: Blob) => void;

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

        this.pulsingButton = document.createElement('button');
        this.pulsingButton.addClass('neurovox-button', 'pulsing');
        timerGroup.appendChild(this.pulsingButton);

        const buttonGroup = modalContent.createDiv({ cls: 'neurovox-button-group' });
        this.pauseButton = this.createIconButton(icons.pause, 'neurovox-pause-button');
        this.stopButton = this.createIconButton(icons.stop, 'neurovox-stop-button');

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

    private togglePause() {
        this.isPaused ? this.resumeRecording() : this.pauseRecording();
    }

    private async startRecording() {
        this.isRecording = true;
        this.isPaused = false;
        this.updateButtonVisibility(true);

        if (!this.intervalId) {
            this.intervalId = window.setInterval(() => {
                this.seconds++;
                this.updateTimerDisplay();
            }, 1000);
        }

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
            } catch (error) {
                console.error('Error starting RecordRTC:', error);
            }
        } else {
            this.recorder.resumeRecording();
        }
    }

    private pauseRecording() {
        if (this.recorder) {
            this.recorder.pauseRecording();
            this.clearInterval();
            this.isRecording = false;
            this.isPaused = true;
            this.updateButtonIcon(this.pauseButton, icons.play);
        }
    }

    private resumeRecording() {
        this.startRecording();
        this.updateButtonIcon(this.pauseButton, icons.pause);
    }

    private stopRecording() {
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
        this.updateButtonVisibility(false);
    }

    private updateTimerDisplay() {
        const minutes = Math.floor(this.seconds / 60).toString().padStart(2, '0');
        const seconds = (this.seconds % 60).toString().padStart(2, '0');
        this.timerEl.textContent = `${minutes}:${seconds}`;
    }

    private createIconButton(svgIcon: string, className: string): HTMLButtonElement {
        const button = document.createElement('button');
        button.addClass('neurovox-button', className);
        const svgElement = this.createSvgElement(svgIcon);
        if (svgElement) {
            button.appendChild(svgElement);
        }
        return button;
    }

    private updateButtonIcon(button: HTMLButtonElement, svgIcon: string) {
        button.empty();
        const svgElement = this.createSvgElement(svgIcon);
        if (svgElement) {
            button.appendChild(svgElement);
        }
    }

    private createSvgElement(svgIcon: string): SVGElement | null {
        const parser = new DOMParser();
        const svgDoc = parser.parseFromString(svgIcon, 'image/svg+xml');
        return svgDoc.documentElement instanceof SVGElement ? svgDoc.documentElement : null;
    }

    private updateButtonVisibility(isVisible: boolean) {
        this.pulsingButton.toggleClass('hidden', !isVisible);
        this.pulsingButton.toggleClass('showing', isVisible);
        this.pauseButton.toggleClass('hidden', !isVisible);
        this.pauseButton.toggleClass('showing', isVisible);
    }

    private clearInterval() {
        if (this.intervalId) {
            window.clearInterval(this.intervalId);
            this.intervalId = null;
        }
    }

    private cleanupRecording() {
        if (this.recorder) {
            this.recorder.destroy();
            this.recorder = null;
        }
        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
            this.stream = null;
        }
    }
<<<<<<< HEAD
}
=======
}
<<<<<<< HEAD
>>>>>>> 5d40b8d (replaced mediarecorder with recordrtc so it would work for apple. works but only records in wav, so cant replay on apple.)
=======
>>>>>>> 6563c723182882a1287d3136f87cbb6676153b21
>>>>>>> 821ce7d (cleaning up debugs)
