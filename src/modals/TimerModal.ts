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

/**
 * Callback function that is triggered when the audio recording stops.
 * @param audioBlob - The audio data captured as a Blob object.
 */
public onStop: (audioBlob: Blob) => void;

/**
 * Initializes a new instance of the class that extends another class, passing the app instance to the superclass.
 * @param app - The application instance to be passed to the superclass.
 */
constructor(app: App) {
    super(app);
}

/**
 * Initializes and sets up the modal interface for recording.
 * This method is called when the modal is opened and is responsible for setting up the UI elements,
 * including buttons for controlling recording and a timer display.
 */
onOpen() {
    const { contentEl } = this;
    contentEl.addClass('neurovox-modal');

    // Create a timer element and add it to the content element
    this.timerEl = contentEl.createEl('div', { cls: 'timer', text: '00:00' });

    // Create a container for the control buttons
    const buttonGroup = contentEl.createEl('div', { cls: 'button-group' });

    // Create control buttons using a helper function that attaches SVG icons
    this.playButton = createButtonWithSvgIcon(icons.play);
    this.pauseButton = createButtonWithSvgIcon(icons.pause);
    this.stopButton = createButtonWithSvgIcon(icons.stop);

    // Add a specific class for styling the buttons
    this.playButton.addClass('neurovox-button');
    this.pauseButton.addClass('neurovox-button');
    this.stopButton.addClass('neurovox-button');

    // Initially hide the play button as recording starts immediately
    this.playButton.style.display = 'none';

    // Append buttons to the button group container
    buttonGroup.appendChild(this.playButton);
    buttonGroup.appendChild(this.pauseButton);
    buttonGroup.appendChild(this.stopButton);

    // Attach event listeners to buttons for recording control
    this.playButton.addEventListener('click', () => this.startRecording());
    this.pauseButton.addEventListener('click', () => this.pauseRecording());
    this.stopButton.addEventListener('click', () => this.stopRecording());

    // Start recording immediately upon modal open
    this.startRecording();
}

/**
 * Closes the current modal or component, clears its content, and stops recording if it's active.
 */
onClose() {
    const { contentEl } = this;
    contentEl.empty();
    if (!this.recordingStopped) {
        this.stopRecording();
    }
}

/**
 * Starts the recording process by hiding the play button, showing the pause button,
 * setting up a timer, and initializing or resuming the media recorder.
 */
private async startRecording() {
    // Hide the play button and show the pause button
    this.playButton.style.display = 'none';
    this.pauseButton.style.display = 'flex';

    // Set up a timer to update the recording duration every second
    if (!this.intervalId) {
        this.intervalId = window.setInterval(() => {
            this.seconds++;
            this.updateTimerDisplay();
        }, 1000);
    }

    // Initialize the media recorder if it's not already initialized
    if (!this.mediaRecorder) {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        this.mediaRecorder = new MediaRecorder(stream);
        this.mediaRecorder.ondataavailable = (event) => {
            this.audioChunks.push(event.data);
        };
        this.mediaRecorder.start();
    } else {
        // If the media recorder is already initialized, resume recording
        this.mediaRecorder.resume();
    }
}

/**
 * Pauses the recording process if it is currently active.
 * This method checks if the mediaRecorder is active and pauses it.
 * It also clears any active intervals and updates the UI to reflect
 * the paused state by hiding the pause button and showing the play button.
 */
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

/**
 * Stops the recording process, handles the cleanup, and updates the UI accordingly.
 * This method checks if the recording has already been stopped to prevent redundant execution.
 * It finalizes the recording by creating an audio blob from the accumulated audio chunks,
 * triggers the onStop callback with the audio blob, and resets the mediaRecorder and other related properties.
 * It also clears any ongoing intervals, resets the timer, and updates the button displays on the UI.
 */
private stopRecording() {
    // Early exit if recording has already been stopped
    if (this.recordingStopped) return;

    // Mark recording as stopped
    this.recordingStopped = true;

    // Handle mediaRecorder if it exists
    if (this.mediaRecorder) {
        this.mediaRecorder.onstop = () => {
            // Create audio blob from recorded chunks
            const audioBlob = new Blob(this.audioChunks, { type: 'audio/mp3' });
            // Reset audio chunks array
            this.audioChunks = [];

            // Trigger onStop callback if defined
            if (this.onStop) {
                this.onStop(audioBlob);
            }

            // Close mediaRecorder and cleanup
            this.close();
        };
        // Stop the media recorder and all associated tracks
        this.mediaRecorder.stop();
        this.mediaRecorder.stream.getTracks().forEach(track => track.stop());
        // Nullify the mediaRecorder to clean up references
        this.mediaRecorder = null;
    }

    // Clear any set interval for recording
    if (this.intervalId) {
        window.clearInterval(this.intervalId);
        this.intervalId = null;
    }

    // Reset seconds counter and update the timer display
    this.seconds = 0;
    this.updateTimerDisplay();

    // Update UI button visibility
    this.playButton.style.display = 'flex';
    this.pauseButton.style.display = 'none';
}

/**
 * Updates the timer display element with the current time formatted as MM:SS.
 * Assumes `this.seconds` holds the total seconds count and `this.timerEl` is the HTML element where the time is displayed.
 */
private updateTimerDisplay() {
    const minutes = Math.floor(this.seconds / 60).toString().padStart(2, '0');
    const seconds = (this.seconds % 60).toString().padStart(2, '0');
    this.timerEl.textContent = `${minutes}:${seconds}`;
    }
}

