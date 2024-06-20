// src/modals/TimerModal.ts
import { App, Modal } from 'obsidian';
import { createButtonWithSvgIcon } from '../utils/SvgUtils';
import { icons } from '../assets/icons';

export class TimerModal extends Modal {
    private timerEl: HTMLElement;
    private recordButton: HTMLButtonElement;
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

        // Create a timer element
        this.timerEl = modalContent.createEl('div', { cls: 'neurovox-timer', text: '00:00' });

        // Create a container for the control buttons
        const buttonGroup = modalContent.createEl('div', { cls: 'neurovox-button-group' });

        // Create control buttons using the createButtonWithSvgIcon function
        this.recordButton = createButtonWithSvgIcon(icons.microphone);
        this.pauseButton = createButtonWithSvgIcon(icons.pause);
        this.stopButton = createButtonWithSvgIcon(icons.stop);

        // Add classes for styling the buttons
        this.recordButton.addClass('neurovox-button', 'neurovox-record-button');
        this.pauseButton.addClass('neurovox-button', 'neurovox-pause-button');
        this.stopButton.addClass('neurovox-button', 'neurovox-stop-button');

        // Initially hide the pause button
        this.pauseButton.style.display = 'none';

        // Append buttons to the button group container
        buttonGroup.appendChild(this.recordButton);
        buttonGroup.appendChild(this.pauseButton);
        buttonGroup.appendChild(this.stopButton);

        // Attach event listeners to buttons for recording control
        this.recordButton.addEventListener('click', () => this.toggleRecording());
        this.pauseButton.addEventListener('click', () => this.togglePause());
        this.stopButton.addEventListener('click', () => this.stopRecording());

        // Start recording immediately upon modal open
        this.startRecording();
    }

    onClose() {
        if (!this.recordingStopped) {
            this.stopRecording();
        }
    }

    private async toggleRecording() {
        if (this.isRecording) {
            this.pauseRecording();
        } else {
            this.startRecording();
        }
    }

    private async startRecording() {
        this.isRecording = true;
        this.isPaused = false;
        this.recordButton.addClass('recording');
        this.pauseButton.style.display = 'flex';
        this.recordButton.innerHTML = icons.microphone; // Show solid microphone icon

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

    private togglePause() {
        if (this.isPaused) {
            this.resumeRecording();
        } else {
            this.pauseRecording();
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
        this.recordButton.removeClass('recording');
        this.pauseButton.innerHTML = icons.play; // Show play icon
    }

    private resumeRecording() {
        this.startRecording();
        this.pauseButton.innerHTML = icons.pause; // Show pause icon
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

        this.recordButton.removeClass('recording');
        this.pauseButton.style.display = 'none';
    }

    private updateTimerDisplay() {
        const minutes = Math.floor(this.seconds / 60).toString().padStart(2, '0');
        const seconds = (this.seconds % 60).toString().padStart(2, '0');
        this.timerEl.textContent = `${minutes}:${seconds}`;
    }
}