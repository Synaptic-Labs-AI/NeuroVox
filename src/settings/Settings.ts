// src/settings/Settings.ts
export interface NeuroVoxSettings {
    openaiApiKey: string;
    openaiModel: string;
    maxTokens: number;
    generateAudioSummary: boolean;
    voiceChoice: string;
    prompt: string;
    voiceSpeed: number;
    saveRecording: boolean;
    voiceMode: string;
    enableVoiceGeneration: boolean;
    recordingFolderPath: string;  // Add this line
}

export const DEFAULT_SETTINGS: NeuroVoxSettings = {
    openaiApiKey: '',
    openaiModel: 'gpt-4',
    maxTokens: 500,
    generateAudioSummary: false,
    voiceChoice: 'alloy',
    prompt: 'Distill the essence. Capture every vital detail with utmost brevity, ensuring no meaning is lost. Crystallize the core message.',
    voiceSpeed: 1,
    saveRecording: true,
    voiceMode: 'standard',
    enableVoiceGeneration: false,
    recordingFolderPath: 'Recordings',  // Add this line
};
