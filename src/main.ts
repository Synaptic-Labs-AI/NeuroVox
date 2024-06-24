// src/main.ts

import { Plugin, WorkspaceLeaf, ItemView } from 'obsidian';
import { DEFAULT_SETTINGS, NeuroVoxSettings } from './settings/Settings';
import { NeuroVoxSettingTab } from './settings/SettingTab';
import { registerRecordBlockProcessor } from './processors/RecordBlockProcessor';
import { FloatingButton } from './ui/FloatingButton';

/**
 * NeuroVoxPlugin is the main class for the NeuroVox Obsidian plugin.
 * It handles plugin initialization, settings management, and core functionality.
 */
export default class NeuroVoxPlugin extends Plugin {
    /** Stores the plugin settings */
    settings: NeuroVoxSettings;

    /**
     * Runs when the plugin is loaded.
     * Initializes settings, UI components, and sets up event listeners.
     */
    async onload() {
        console.log('Loading NeuroVox plugin');

        // Load saved settings or use defaults
        await this.loadSettings();

        // Register the record block processor
        registerRecordBlockProcessor(this, this.settings);

        // Add the settings tab to the Obsidian settings panel
        this.addSettingTab(new NeuroVoxSettingTab(this.app, this));

        // Apply the saved microphone button color
        document.documentElement.style.setProperty('--mic-button-color', this.settings.micButtonColor);

        // Create the floating button
        new FloatingButton(this, this.settings);

        // Register a command to open our plugin's view
        this.addCommand({
            id: 'open-neurovox-view',
            name: 'Open NeuroVox View',
            callback: () => {
                this.activateView();
            }
        });
    }

    /**
     * Runs when the plugin is unloaded.
     * Performs cleanup tasks.
     */
    onunload() {
        console.log('Unloading NeuroVox plugin');
    }

    /**
     * Loads the plugin settings.
     * Merges saved settings with default settings.
     */
    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    /**
     * Saves the current plugin settings.
     */
    async saveSettings() {
        await this.saveData(this.settings);
    }

    /**
     * Activates the NeuroVox view.
     * Creates a new leaf for the view if it doesn't exist, or reveals an existing one.
     */
    async activateView() {
        const { workspace } = this.app;

        let leaf = workspace.getLeavesOfType('neurovox-view')[0];
        if (!leaf) {
            const newLeaf = workspace.getRightLeaf(false);
            if (newLeaf) {
                await newLeaf.setViewState({ type: 'neurovox-view', active: true });
                leaf = newLeaf;
            } else {
                console.error('Failed to create a new leaf for NeuroVox view');
                return;
            }
        }
        workspace.revealLeaf(leaf);
    }
}

/**
 * NeuroVoxView represents the custom view for the NeuroVox plugin.
 * It handles the rendering and functionality of the plugin's main interface.
 */
class NeuroVoxView extends ItemView {
    constructor(leaf: WorkspaceLeaf) {
        super(leaf);
    }

    /**
     * Returns the type identifier for this view.
     */
    getViewType(): string {
        return 'neurovox-view';
    }

    /**
     * Returns the display text for this view.
     */
    getDisplayText(): string {
        return 'NeuroVox';
    }

    /**
     * Renders the content of the NeuroVox view.
     */
    async onOpen() {
        const container = this.containerEl.children[1];
        container.empty();
        container.createEl('h4', { text: 'Welcome to NeuroVox' });
        // TODO: Add more UI elements and functionality here
    }

    /**
     * Performs any necessary cleanup when the view is closed.
     */
    async onClose() {
        // TODO: Add any necessary cleanup code here
    }
}