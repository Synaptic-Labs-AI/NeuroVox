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

/**
 * Callback function that is triggered when the audio recording stops.
 * @param audioBlob - The audio data captured as a Blob object.
 */
public onStop: (audioBlob: Blob) => void;

/**
 * Initializes a new instance of the class that extends another class, setting up the necessary properties from the App instance.
 * @param app - The App instance to be used in the constructor of the superclass.
 */
constructor(app: App) {
    super(app);
}

/**
 * Initializes and displays the modal interface for the recording feature.
 * This method sets up the modal's structure, including the timer display and control buttons.
 */
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

/**
 * Handles the closure of a session or component.
 * If recording is ongoing, it stops the recording before closing.
 */
onClose() {
    if (!this.recordingStopped) {
        this.stopRecording();
    }
}

/**
 * Toggles the recording state between pause and resume.
 * If the recording is currently paused, it will resume.
 * If the recording is currently active, it will pause.
 */
private togglePause() {
    if (this.isPaused) {
        this.resumeRecording();
    } else {
        this.pauseRecording();
    }
}

/**
 * Starts the recording process by setting up the UI and initializing media recording.
 * It handles both starting a new recording and resuming a paused recording.
 * 
 * The function first updates the UI to reflect the recording state by showing relevant buttons
 * and hiding others. It then checks if there's an existing interval to update the recording timer,
 * creating one if necessary. For the media recording, it checks if a `MediaRecorder` instance
 * already exists. If not, it requests user media, initializes a new `MediaRecorder`, and sets up
 * data handling for recorded chunks. If an instance exists, it simply resumes recording.
 */
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

/**
 * Pauses the recording process if it is currently active.
 * This method checks if the mediaRecorder is available and pauses it.
 * It also clears any set intervals associated with the recording process,
 * updates the recording state, and changes the button icon to indicate recording is paused.
 */
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

/**
 * Resumes the recording process by starting the recording and updating the button icon to pause.
 */
private resumeRecording() {
    this.startRecording();
    this.updateButtonIcon(this.pauseButton, icons.pause);
}

/**
 * Stops the recording process, handles the cleanup, and updates the UI.
 * This method checks if the recording has already been stopped to prevent redundant calls.
 * It finalizes the recording, creates an audio blob from the recorded chunks, and triggers any defined onStop event.
 * Additionally, it stops all associated media tracks, clears any set intervals, resets the timer, and updates the UI state.
 */
private stopRecording() {
    // Check if recording has already been stopped to prevent redundant stops
    if (this.recordingStopped) return;

    // Mark recording as stopped
    this.recordingStopped = true;

    // Handle media recorder if it exists
    if (this.mediaRecorder) {
        this.mediaRecorder.onstop = () => {
            // Create audio blob from chunks
            const audioBlob = new Blob(this.audioChunks, { type: 'audio/wav' });
            // Clear recorded chunks
            this.audioChunks = [];

            // Trigger onStop callback with the audio blob
            if (this.onStop) {
                this.onStop(audioBlob);
            }

            // Close additional resources if needed
            this.close();
        };
        // Stop the media recorder and all associated tracks
        this.mediaRecorder.stop();
        this.mediaRecorder.stream.getTracks().forEach(track => track.stop());
        // Clear media recorder reference
        this.mediaRecorder = null;
    }

    // Clear interval if set
    if (this.intervalId) {
        window.clearInterval(this.intervalId);
        this.intervalId = null;
    }

    // Reset seconds counter and update timer display
    this.seconds = 0;
    this.updateTimerDisplay();

    // Update UI elements to reflect the stopped state
    this.pulsingButton.classList.remove('showing');
    this.pulsingButton.classList.add('hidden');
    this.pauseButton.classList.remove('showing');
    this.pauseButton.classList.add('hidden');
}

/**
 * Updates the timer display element with the current time formatted as MM:SS.
 * Assumes `this.seconds` holds the total seconds count and `this.timerEl` is the DOM element where the time needs to be displayed.
 */
private updateTimerDisplay() {
    const minutes = Math.floor(this.seconds / 60).toString().padStart(2, '0');
    const seconds = (this.seconds % 60).toString().padStart(2, '0');
    this.timerEl.textContent = `${minutes}:${seconds}`;
}

/**
 * Creates an HTML button element containing an SVG icon.
 * 
 * @param svgIcon The SVG content as a string to be embedded within the button.
 * @returns An HTMLButtonElement with the SVG icon appended.
 */
private createIconButton(svgIcon: string): HTMLButtonElement {
    const button = document.createElement('button');
    const svgElement = this.createSvgElement(svgIcon);
    if (svgElement) {
        button.appendChild(svgElement);
    }
    return button;
}

/**
 * Updates the icon of a specified button element by replacing its contents with a new SVG element.
 * 
 * @param {HTMLButtonElement} button - The button element whose icon is to be updated.
 * @param {string} svgIcon - The SVG content as a string to be used as the new icon.
 */
private updateButtonIcon(button: HTMLButtonElement, svgIcon: string) {
    while (button.firstChild) {
        button.removeChild(button.firstChild);
    }
    const svgElement = this.createSvgElement(svgIcon);
    if (svgElement) {
        button.appendChild(svgElement);
    }
}

/**
 * Creates an SVG element from a string representation of an SVG.
 *
 * @param svgIcon The SVG content as a string.
 * @returns An SVGElement if the parsing is successful, otherwise null.
 */
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
