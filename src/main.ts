// src/main.ts
import { Plugin } from 'obsidian';
import { DEFAULT_SETTINGS, NeuroVoxSettings } from './settings/Settings';
import { NeuroVoxSettingTab } from './settings/SettingTab';
import { registerSimpleCommand } from './commands/SimpleCommand';
import { registerRecordBlockProcessor } from './processors/RecordBlockProcessor';
import { FloatingButton } from './ui/FloatingButton';
import { saveAudioFile } from './utils/FileUtils'; // Import the function

export default class NeuroVoxPlugin extends Plugin {
    settings: NeuroVoxSettings;
    floatingButton: FloatingButton;

/**
 * Asynchronously loads the plugin and initializes its components.
 * This method is typically called when the plugin is loaded into the application.
 */
async onload() {
    // Log a message indicating that the plugin has been loaded
    console.log('NeuroVox Plugin Loaded');

    // Load settings from storage
    await this.loadSettings();

    // Register a simple command to the application
    registerSimpleCommand(this);

    // Register a block processor for handling specific types of content blocks
    registerRecordBlockProcessor(this);

    // Create a floating action button and associate it with the plugin settings
    this.floatingButton = new FloatingButton(this, this.settings);

    // Add a settings tab to the application, allowing users to configure the plugin
    this.addSettingTab(new NeuroVoxSettingTab(this.app, this));
}

/**
 * Handles the cleanup process when the plugin is unloaded.
 * Specifically, it removes the floating button from the DOM if it exists.
 */
onunload() {
    console.log('NeuroVox Plugin Unloaded');
    // Ensure to remove the button when the plugin is unloaded
    if (this.floatingButton && this.floatingButton.buttonEl.parentElement) {
        this.floatingButton.buttonEl.parentElement.removeChild(this.floatingButton.buttonEl);
    }
}

/**
 * Asynchronously loads settings by merging default settings with user-specific settings.
 * The method first takes a copy of the default settings and then overrides them with user settings fetched asynchronously.
 */
async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
}

/**
 * Asynchronously saves the current settings.
 * @returns {Promise<void>} A promise that resolves when the settings have been saved.
 */
async saveSettings() {
    await this.saveData(this.settings);
    }
}
