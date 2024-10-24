import { App } from 'obsidian';

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
    showFloatingButton: boolean;
    showToolbarButton: boolean;
    buttonPosition?: { x: number, y: number };
};

/**
 * Default settings for the NeuroVox plugin.
 * These values are used when the plugin is first installed or reset.
 */
export const DEFAULT_SETTINGS: NeuroVoxSettings = {
    openaiApiKey: '',
    openaiModel: 'gpt-4',
    maxTokens: 500,
    generateAudioSummary: false,
    voiceChoice: 'onyx',
    prompt: 'Summarize the following transcript concisely, capturing the main points and key details.',
    voiceSpeed: 1,
    saveRecording: true,
    enableVoiceGeneration: false,
    recordingFolderPath: 'Recordings',
    voiceMode: 'standard',
    micButtonColor: '#4B4B4B',
    showFloatingButton: true,
    showToolbarButton: true
};

/**
 * Validates the NeuroVox settings.
 * This function checks if the provided settings object has all required fields
 * and that their values are of the correct type.
 * 
 * @param settings - The settings object to validate
 * @returns True if the settings are valid, false otherwise
 */
export function validateSettings(settings: any): settings is NeuroVoxSettings {
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
        (settings.voiceMode === 'standard' || settings.voiceMode === 'hd') &&
        typeof settings.micButtonColor === 'string' &&
        typeof settings.showFloatingButton === 'boolean' &&
        typeof settings.showToolbarButton === 'boolean'
    );
}

/**
 * Sanitizes the NeuroVox settings by ensuring all fields have valid values.
 * If a field is missing or has an invalid value, it's replaced with the default value.
 * 
 * @param settings - The settings object to sanitize
 * @returns A sanitized version of the settings
 */
export function sanitizeSettings(settings: Partial<NeuroVoxSettings>): NeuroVoxSettings {
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
        showFloatingButton: typeof settings.showFloatingButton === 'boolean' ? settings.showFloatingButton : DEFAULT_SETTINGS.showFloatingButton,
        showToolbarButton: typeof settings.showToolbarButton === 'boolean' ? settings.showToolbarButton : DEFAULT_SETTINGS.showToolbarButton
    };
}