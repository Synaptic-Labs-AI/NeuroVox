// src/modals/TimerModal.ts
import { App, Modal } from 'obsidian';
import { createButtonWithSvgIcon } from '../utils/SvgUtils';
import { icons } from 'src/assets/icons';

export class TimerModal extends Modal {
    private timerEl: HTMLElement;
    private playButton: HTMLButtonElement;
    private pauseButton: HTMLButtonElement;
    private stopButton: HTMLButtonElement;
    private intervalId: number | null = null;
    private seconds: number = 0;
    private mediaRecorder: MediaRecorder | null = null;
    private audioChunks: Blob[] = [];
    private recordingStopped: boolean = false;

    public onStop: (audioBlob: Blob) => void;

    constructor(app: App) {
        super(app);
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.addClass('neurovox-modal');

        this.timerEl = contentEl.createEl('div', { cls: 'timer', text: '00:00' });

        const buttonGroup = contentEl.createEl('div', { cls: 'button-group' });

        this.playButton = createButtonWithSvgIcon(icons.play);
        this.pauseButton = createButtonWithSvgIcon(icons.pause);
        this.stopButton = createButtonWithSvgIcon(icons.stop);

        this.playButton.addClass('neurovox-button');
        this.pauseButton.addClass('neurovox-button');
        this.stopButton.addClass('neurovox-button');

        this.playButton.style.display = 'none'; // Initially hide play button

        buttonGroup.appendChild(this.playButton);
        buttonGroup.appendChild(this.pauseButton);
        buttonGroup.appendChild(this.stopButton);

        this.playButton.addEventListener('click', () => this.startRecording());
        this.pauseButton.addEventListener('click', () => this.pauseRecording());
        this.stopButton.addEventListener('click', () => this.stopRecording());

        // immediately start recording
        this.startRecording();
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
        if (!this.recordingStopped) {
            this.stopRecording();
        }
    }

    private async startRecording() {
        this.playButton.style.display = 'none';
        this.pauseButton.style.display = 'flex';

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
        this.playButton.style.display = 'flex';
        this.pauseButton.style.display = 'none';
    }

    private stopRecording() {
        if (this.recordingStopped) return;

        this.recordingStopped = true;

        if (this.mediaRecorder) {
            this.mediaRecorder.onstop = () => {
                const audioBlob = new Blob(this.audioChunks, { type: 'audio/mp3' });
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
        this.playButton.style.display = 'flex';
        this.pauseButton.style.display = 'none';
    }

    private updateTimerDisplay() {
        const minutes = Math.floor(this.seconds / 60).toString().padStart(2, '0');
        const seconds = (this.seconds % 60).toString().padStart(2, '0');
        this.timerEl.textContent = `${minutes}:${seconds}`;
    }
}
