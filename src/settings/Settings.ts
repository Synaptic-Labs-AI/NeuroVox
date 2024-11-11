// src/settings/Settings.ts

import { AIProvider } from '../adapters/AIAdapter';

export type NeuroVoxSettings = {
    // AI Providers
    openaiApiKey: string;
    groqApiKey: string;

    // Recording
    recordingFolderPath: string;
    saveRecording: boolean;
    showFloatingButton: boolean;
    useRecordingModal: boolean;
    showToolbarButton: boolean;
    micButtonColor: string;
    transcriptionModel: string;
    transcriptionProvider: AIProvider;

    // Summary
    generateSummary: boolean;
    summaryPrompt: string;
    summaryMaxTokens: number;
    summaryModel: string;
    summaryProvider: AIProvider;
    summaryTemperature: number;

    // Current Provider
    currentProvider: AIProvider;
};

export const DEFAULT_SETTINGS: NeuroVoxSettings = {
    // AI Providers
    openaiApiKey: '',
    groqApiKey: '',

    // Recording
    recordingFolderPath: 'Recordings',
    saveRecording: true,
    showFloatingButton: true,
    useRecordingModal: true,
    showToolbarButton: true,
    micButtonColor: '#4B4B4B',
    transcriptionModel: 'whisper-1',
    transcriptionProvider: AIProvider.OpenAI,

    // Summary
    generateSummary: true,
    summaryPrompt: 'Summarize the following transcript concisely, capturing the main points and key details.',
    summaryMaxTokens: 500,
    summaryModel: 'gpt-4o-mini',
    summaryProvider: AIProvider.OpenAI,
    summaryTemperature: 0.7,

    // Current Provider
    currentProvider: AIProvider.OpenAI,
};
