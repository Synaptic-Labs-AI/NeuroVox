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

    async onload() {
        console.log('NeuroVox Plugin Loaded');
        await this.loadSettings();

        registerSimpleCommand(this);
        registerRecordBlockProcessor(this);

        this.floatingButton = new FloatingButton(this, this.settings); // Pass settings here

        // This adds a settings tab so the user can configure various aspects of the plugin
        this.addSettingTab(new NeuroVoxSettingTab(this.app, this));
    }

    onunload() {
        console.log('NeuroVox Plugin Unloaded');
        // Ensure to remove the button when the plugin is unloaded
        if (this.floatingButton && this.floatingButton.buttonEl.parentElement) {
            this.floatingButton.buttonEl.parentElement.removeChild(this.floatingButton.buttonEl);
        }
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }
}
