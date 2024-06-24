import { App, PluginSettingTab, Setting } from 'obsidian';

/**
 * Interface representing the settings for the NeuroVox plugin.
 */
export type NeuroVoxSettings = {
    openaiApiKey: string;
    openaiModel: string;
    maxTokens: number;
    generateAudioSummary: boolean;
    voiceChoice: string;
    prompt: string;
    voiceSpeed: number;
    saveRecording: boolean;
    enableVoiceGeneration: boolean;
    recordingFolderPath: string;
    voiceMode: 'standard' | 'hd';
    micButtonColor: string;
}

/**
 * Default settings for the NeuroVox plugin.
 * These values are used when the plugin is first installed or reset.
 */
export const DEFAULT_SETTINGS: NeuroVoxSettings = {
    openaiApiKey: '',
    openaiModel: 'gpt-4o',
    maxTokens: 500,
    generateAudioSummary: false,
    voiceChoice: 'onyx',
    prompt: 'Summarize the following transcript concisely, capturing the main points and key details.',
    voiceSpeed: 1,
    saveRecording: true,
    enableVoiceGeneration: false,
    recordingFolderPath: 'Recordings',
    voiceMode: 'standard',
    micButtonColor: '#4B4B4B'
};

/**
 * Validates the NeuroVox settings.
 * This function checks if the provided settings object has all required fields
 * and that their values are of the correct type.
 * 
 * @param settings - The settings object to validate
 * @returns True if the settings are valid, false otherwise
 */
function validateSettings(settings: any): settings is NeuroVoxSettings {
    return (
        typeof settings.openaiApiKey === 'string' &&
        typeof settings.openaiModel === 'string' &&
        typeof settings.maxTokens === 'number' &&
        typeof settings.generateAudioSummary === 'boolean' &&
        typeof settings.voiceChoice === 'string' &&
        typeof settings.prompt === 'string' &&
        typeof settings.voiceSpeed === 'number' &&
        typeof settings.saveRecording === 'boolean' &&
        typeof settings.enableVoiceGeneration === 'boolean' &&
        typeof settings.recordingFolderPath === 'string' &&
        (settings.voiceMode === 'standard' || settings.voiceMode === 'hd')
    );
}

/**
 * Sanitizes the NeuroVox settings by ensuring all fields have valid values.
 * If a field is missing or has an invalid value, it's replaced with the default value.
 * 
 * @param settings - The settings object to sanitize
 * @returns A sanitized version of the settings
 */
function sanitizeSettings(settings: Partial<NeuroVoxSettings>): NeuroVoxSettings {
    return {
        openaiApiKey: settings.openaiApiKey || DEFAULT_SETTINGS.openaiApiKey,
        openaiModel: settings.openaiModel || DEFAULT_SETTINGS.openaiModel,
        maxTokens: typeof settings.maxTokens === 'number' ? settings.maxTokens : DEFAULT_SETTINGS.maxTokens,
        generateAudioSummary: typeof settings.generateAudioSummary === 'boolean' ? settings.generateAudioSummary : DEFAULT_SETTINGS.generateAudioSummary,
        voiceChoice: settings.voiceChoice || DEFAULT_SETTINGS.voiceChoice,
        prompt: settings.prompt || DEFAULT_SETTINGS.prompt,
        voiceSpeed: typeof settings.voiceSpeed === 'number' ? settings.voiceSpeed : DEFAULT_SETTINGS.voiceSpeed,
        saveRecording: typeof settings.saveRecording === 'boolean' ? settings.saveRecording : DEFAULT_SETTINGS.saveRecording,
        enableVoiceGeneration: typeof settings.enableVoiceGeneration === 'boolean' ? settings.enableVoiceGeneration : DEFAULT_SETTINGS.enableVoiceGeneration,
        recordingFolderPath: settings.recordingFolderPath || DEFAULT_SETTINGS.recordingFolderPath,
        voiceMode: settings.voiceMode || DEFAULT_SETTINGS.voiceMode,
        micButtonColor: settings.micButtonColor || DEFAULT_SETTINGS.micButtonColor,
    };
}

/**
 * Class representing the settings tab for the NeuroVox plugin.
 * This class is responsible for rendering the settings UI and handling user input.
 */
class SettingTab extends PluginSettingTab {
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
    }
}


