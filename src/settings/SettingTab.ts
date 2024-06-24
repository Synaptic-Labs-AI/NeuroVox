import { App, PluginSettingTab, Setting } from 'obsidian';
import { NeuroVoxSettings, DEFAULT_SETTINGS } from '../settings/Settings';

export class NeuroVoxSettingTab extends PluginSettingTab {
    plugin: any;

    constructor(app: App, plugin: any) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;

        containerEl.empty();

        containerEl.createEl('h2', { text: 'NeuroVox Settings' });

        new Setting(containerEl)
            .setName('OpenAI API Key')
            .setDesc('Enter your OpenAI API key')
            .addText(text => text
                .setPlaceholder('API Key')
                .setValue(this.plugin.settings.openaiApiKey)
                .onChange(async (value) => {
                    this.plugin.settings.openaiApiKey = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('OpenAI Model')
            .setDesc('Enter the OpenAI model to use for content generation. See the available models here: https://platform.openai.com/docs/models')
            .addText(text => text
                .setPlaceholder('Model Name')
                .setValue(this.plugin.settings.openaiModel)
                .onChange(async (value) => {
                    this.plugin.settings.openaiModel = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Max Tokens')
            .setDesc('Set the maximum number of tokens for chat completions')
            .addText(text => text
                .setPlaceholder('Max Tokens')
                .setValue(this.plugin.settings.maxTokens.toString())
                .onChange(async (value) => {
                    this.plugin.settings.maxTokens = parseInt(value);
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Prompt')
            .setDesc('Enter the prompt to use for content generation')
            .addTextArea(text => text
                .setPlaceholder('Prompt')
                .setValue(this.plugin.settings.prompt)
                .onChange(async (value) => {
                    this.plugin.settings.prompt = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Voice Speed')
            .setDesc('Set the speed of the generated speech (0.25 to 4.0)')
            .addText(text => text
                .setPlaceholder('Voice Speed')
                .setValue(this.plugin.settings.voiceSpeed.toString())
                .onChange(async (value) => {
                    this.plugin.settings.voiceSpeed = parseFloat(value);
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Enable AI Voice Generation of Summaries')
            .setDesc('Whether to enable AI voice generation from transcription summaries')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.enableVoiceGeneration)
                .onChange(async (value) => {
                    this.plugin.settings.enableVoiceGeneration = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Enable HD Voice')
            .setDesc('When enabled, use HD voice for audio summaries')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.voiceMode === 'hd')
                .onChange(async (value) => {
                    this.plugin.settings.voiceMode = value ? 'hd' : 'standard';
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Save Recording')
            .setDesc('Enable or disable saving recordings')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.saveRecording)
                .onChange(async (value) => {
                    this.plugin.settings.saveRecording = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Recording Folder Path')
            .setDesc('Specify the folder path to save recordings relative to the vault root. For a folder in the root directory, enter its name (e.g., "Recordings"). For a nested folder, use forward slashes to indicate the path (e.g., "Audio/Recordings").')
            .addText(text => text
                .setPlaceholder('Enter folder path')
                .setValue(this.plugin.settings.recordingFolderPath)
                .onChange(async (value) => {
                    this.plugin.settings.recordingFolderPath = value;
                    await this.plugin.saveSettings();
                }));

        // Add color picker for microphone button
        new Setting(containerEl)
            .setName('Microphone Button Color')
            .setDesc('Choose a color for the microphone button')
            .addColorPicker(colorPicker => colorPicker
                .setValue(this.plugin.settings.micButtonColor)
                .onChange(async (value) => {
                    this.plugin.settings.micButtonColor = value;
                    await this.plugin.saveSettings();
                    this.updateMicButtonColor(value); // Update color immediately
                }));
    }

    updateMicButtonColor(color: string): void {
        document.documentElement.style.setProperty('--mic-button-color', color);
    }
}
