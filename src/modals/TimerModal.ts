import { App, Modal } from 'obsidian';
import { icons } from '../assets/icons';

export class TimerModal extends Modal {
    private timerEl: HTMLElement;
    private pulsingButton: HTMLButtonElement;
    private pauseButton: HTMLButtonElement;
    private stopButton: HTMLButtonElement;
    private intervalId: number | null = null;
    private seconds: number = 0;
    private mediaRecorder: MediaRecorder | null = null;
    private audioChunks: Blob[] = [];
    private recordingStopped: boolean = false;
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

        this.pauseButton = this.createIconButton(icons.pause);
        this.stopButton = this.createIconButton(icons.stop);

        this.pauseButton.addClass('neurovox-button', 'neurovox-pause-button');
        this.stopButton.addClass('neurovox-button', 'neurovox-stop-button');

        buttonGroup.appendChild(this.pauseButton);
        buttonGroup.appendChild(this.stopButton);

        this.pauseButton.addEventListener('click', () => this.togglePause());
        this.stopButton.addEventListener('click', () => this.stopRecording());

        this.startRecording();
    }

    onClose() {
        if (!this.recordingStopped) {
            this.stopRecording();
        }
    }

    private togglePause() {
        if (this.isPaused) {
            this.resumeRecording();
        } else {
            this.pauseRecording();
        }
    }

    private async startRecording() {
        this.isRecording = true;
        this.isPaused = false;
        this.pulsingButton.classList.remove('hidden');
        this.pulsingButton.classList.add('showing');
        this.pauseButton.classList.remove('hidden');
        this.pauseButton.classList.add('showing');

        if (!this.intervalId) {
            this.intervalId = window.setInterval(() => {
                this.seconds++;
                this.updateTimerDisplay();
            }, 1000);
        }

        if (!this.mediaRecorder) {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            this.mediaRecorder = new MediaRecorder(stream);
            this.mediaRecorder.ondataavailable = (event) => {
                this.audioChunks.push(event.data);
            };
            this.mediaRecorder.start();
        } else {
            this.mediaRecorder.resume();
        }
    }

    private pauseRecording() {
        if (this.mediaRecorder) {
            this.mediaRecorder.pause();
        }
        if (this.intervalId) {
            window.clearInterval(this.intervalId);
            this.intervalId = null;
        }
        this.isRecording = false;
        this.isPaused = true;
        this.updateButtonIcon(this.pauseButton, icons.play);
    }

    private resumeRecording() {
        this.startRecording();
        this.updateButtonIcon(this.pauseButton, icons.pause);
    }

    private stopRecording() {
        if (this.recordingStopped) return;

        this.recordingStopped = true;

        if (this.mediaRecorder) {
            this.mediaRecorder.onstop = () => {
                const audioBlob = new Blob(this.audioChunks, { type: 'audio/wav' });
                this.audioChunks = [];
    
                if (this.onStop) {
                    this.onStop(audioBlob);
                }
    
                this.close();
            };
            this.mediaRecorder.stop();
            this.mediaRecorder.stream.getTracks().forEach(track => track.stop());
            this.mediaRecorder = null;
        }

        if (this.intervalId) {
            window.clearInterval(this.intervalId);
            this.intervalId = null;
        }

        this.seconds = 0;
        this.updateTimerDisplay();

        this.pulsingButton.classList.remove('showing');
        this.pulsingButton.classList.add('hidden');
        this.pauseButton.classList.remove('showing');
        this.pauseButton.classList.add('hidden');
    }

    private updateTimerDisplay() {
        const minutes = Math.floor(this.seconds / 60).toString().padStart(2, '0');
        const seconds = (this.seconds % 60).toString().padStart(2, '0');
        this.timerEl.textContent = `${minutes}:${seconds}`;
    }

    private createIconButton(svgIcon: string): HTMLButtonElement {
        const button = document.createElement('button');
        const svgElement = this.createSvgElement(svgIcon);
        if (svgElement) {
            button.appendChild(svgElement);
        }
        return button;
    }

    private updateButtonIcon(button: HTMLButtonElement, svgIcon: string) {
        while (button.firstChild) {
            button.removeChild(button.firstChild);
        }
        const svgElement = this.createSvgElement(svgIcon);
        if (svgElement) {
            button.appendChild(svgElement);
        }
    }

    private createSvgElement(svgIcon: string): SVGElement | null {
        const parser = new DOMParser();
        const svgDoc = parser.parseFromString(svgIcon, 'image/svg+xml');
        const svgElement = svgDoc.documentElement;

        if (svgElement instanceof SVGElement) {
            return svgElement;
        } else {
            console.error('Failed to parse SVG string');
            return null;
        }
    }
}