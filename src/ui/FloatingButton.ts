// src/ui/FloatingButton.ts
import { Plugin, WorkspaceLeaf, Notice } from 'obsidian';
import { TimerModal } from '../modals/TimerModal';
import { createButtonWithSvgIcon } from '../utils/SvgUtils';
import { saveAudioFile } from '../utils/FileUtils'; // Make sure to import your file-saving utility
import { icons } from 'src/assets/icons';
import { NeuroVoxSettings } from '../settings/Settings'; // Import the settings type

export class FloatingButton {
    private plugin: Plugin;
    private settings: NeuroVoxSettings; // Add a field to hold the settings
    public buttonEl: HTMLButtonElement;

/**
 * Constructs a new instance of the class, initializing with the provided plugin and settings.
 * It also creates a button and registers events.
 * 
 * @param {Plugin} plugin - The plugin instance to be used.
 * @param {NeuroVoxSettings} settings - Configuration settings for the NeuroVox plugin.
 */
constructor(plugin: Plugin, settings: NeuroVoxSettings) {
    this.plugin = plugin;
    this.settings = settings;
    this.createButton();
    this.registerEvents();
}

/**
 * Creates a button with an SVG microphone icon and attaches event listeners to it.
 * The button is initially hidden and added to the document body. When clicked, it opens a modal
 * for recording audio. Once the recording stops, the audio is saved as an MP3 file and a notice
 * is displayed to the user indicating the location of the saved file.
 */
private createButton() {
    // Create a button element with a microphone icon
    this.buttonEl = createButtonWithSvgIcon(icons.microphone);
    // Add CSS classes for styling
    this.buttonEl.classList.add('neurovox-button', 'floating');
    // Set the button to be hidden initially
    this.buttonEl.style.display = 'none';

    // Add a click event listener to the button
    this.buttonEl.addEventListener('click', () => {
        // Create and open a new timer modal for recording
        const modal = new TimerModal(this.plugin.app);
        modal.open();
        // Define the onStop event handler for the modal
        modal.onStop = async (audioBlob: Blob) => {
            // Generate a file name based on the current timestamp
            const fileName = `recording-${Date.now()}.mp3`;
            // Save the audio file and retrieve the file details
            const file = await saveAudioFile(this.plugin.app, audioBlob, fileName, this.settings);
            // Display a notice to the user with the file path
            new Notice(`Saved recording as ${file.path}`);
        };
    });

    // Append the button to the document body
    document.body.appendChild(this.buttonEl);
}

/**
 * Registers the necessary events for the plugin.
 * Specifically, it listens for changes in the active leaf in the workspace
 * and toggles the visibility of a button based on the current state.
 */
private registerEvents() {
    this.plugin.registerEvent(this.plugin.app.workspace.on('active-leaf-change', this.toggleButtonVisibility.bind(this)));
}

/**
 * Toggles the visibility and placement of a button based on the provided leaf's view type.
 * 
 * This method first removes the button from its current parent element if it exists.
 * If the provided leaf is valid and its view type is 'markdown', the button is appended
 * to the view's content container and displayed. If these conditions are not met,
 * the button is hidden.
 * 
 * @param {WorkspaceLeaf | null} leaf - The workspace leaf that may contain a view where the button should be displayed.
 */
private toggleButtonVisibility(leaf: WorkspaceLeaf | null) {
    const currentButtonParent = this.buttonEl.parentElement;
    if (currentButtonParent) {
        currentButtonParent.removeChild(this.buttonEl);
    }

    if (leaf && leaf.view && leaf.view.getViewType() === 'markdown') {
        const viewContent = leaf.view.containerEl.querySelector('.view-content');
        if (viewContent) {
            viewContent.appendChild(this.buttonEl);
            this.buttonEl.style.display = 'flex';
        }
    } else {
        this.buttonEl.style.display = 'none';
    }
}
}