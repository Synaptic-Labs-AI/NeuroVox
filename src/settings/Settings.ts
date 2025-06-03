// src/settings/Settings.ts

import { AIProvider } from '../adapters/AIAdapter';

export enum AudioQuality {
    Low = 'low',
    Medium = 'medium',
    High = 'high'
}

export type NeuroVoxSettings = {
    // AI Providers
    openaiApiKey: string;
    groqApiKey: string;
    deepgramApiKey: string;

    // Recording
    audioQuality: AudioQuality;
    recordingFolderPath: string;
    transcriptFolderPath: string;
    showFloatingButton: boolean;
    useRecordingModal: boolean;
    showToolbarButton: boolean;
    micButtonColor: string;
    transcriptionModel: string;
    transcriptionProvider: AIProvider;
    transcriptionCalloutFormat: string;
    showTimer: boolean;
    autoStopEnabled: boolean;
    autoStopDuration: number;

    // Post-Processing
    generatePostProcessing: boolean;
    postProcessingPrompt: string;
    postProcessingMaxTokens: number;
    postProcessingModel: string;
    postProcessingProvider: AIProvider;
    postProcessingTemperature: number;
    postProcessingCalloutFormat: string;

    // Current Provider
    currentProvider: AIProvider;
};

export const DEFAULT_SETTINGS: NeuroVoxSettings = {
    // AI Providers
    openaiApiKey: '',
    groqApiKey: '',
    deepgramApiKey: '',

    // Recording
    audioQuality: AudioQuality.Medium,
    recordingFolderPath: 'Recordings',
    transcriptFolderPath: 'Transcripts',
    showFloatingButton: true,
    useRecordingModal: true,
    showToolbarButton: true,
    micButtonColor: '#4B4B4B',
    transcriptionModel: 'whisper-1',
    transcriptionProvider: AIProvider.OpenAI,
    transcriptionCalloutFormat: '>[!info]- Transcription\n>![[{audioPath}]]\n>{transcription}',
    showTimer: true,
    autoStopEnabled: false,
    autoStopDuration: 5,

    // Post-Processing
    generatePostProcessing: true,
    postProcessingPrompt: 'Process the following transcript to extract key insights and information.',
    postProcessingMaxTokens: 500,
    postProcessingModel: 'gpt-4o-mini',
    postProcessingProvider: AIProvider.OpenAI,
    postProcessingTemperature: 0.7,
    postProcessingCalloutFormat: '>[!note]- Post-Processing\n>{postProcessing}',

    // Current Provider
    currentProvider: AIProvider.OpenAI,
};
