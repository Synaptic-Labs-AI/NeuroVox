// src/settings/Settings.ts

import { AIProvider } from '../adapters/AIAdapter';

export type NeuroVoxSettings = {
    // AI Providers
    openaiApiKey: string;
    groqApiKey: string;

    // Recording Settings
    recordingFolderPath: string;
    saveRecording: boolean;
    showFloatingButton: boolean;
    showToolbarButton: boolean;
    micButtonColor: string;
    transcriptionModel: string;
    transcriptionProvider: AIProvider;  // Added

    // Summary Settings
    generateSummary: boolean;
    summaryPrompt: string;
    summaryMaxTokens: number;
    summaryModel: string;
    summaryProvider: AIProvider;  // Added
    summaryTemperature: number;   // Added

    // Current Provider
    currentProvider: AIProvider;
};

export const DEFAULT_SETTINGS: NeuroVoxSettings = {
    // AI Providers
    openaiApiKey: '',
    groqApiKey: '',

    // Recording Settings
    recordingFolderPath: 'Recordings',
    saveRecording: true,
    showFloatingButton: true,
    showToolbarButton: true,
    micButtonColor: '#4B4B4B',
    transcriptionModel: 'whisper-1',
    transcriptionProvider: AIProvider.OpenAI,

    // Summary Settings
    generateSummary: true,
    summaryPrompt: 'Summarize the following transcript concisely, capturing the main points and key details.',
    summaryMaxTokens: 500,
    summaryModel: 'gpt-4o-mini',
    summaryProvider: AIProvider.OpenAI,
    summaryTemperature: 0.7,

    // Current Provider
    currentProvider: AIProvider.OpenAI,
};