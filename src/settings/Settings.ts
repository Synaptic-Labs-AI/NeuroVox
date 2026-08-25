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
    openrouterApiKey: string;
    assemblyaiApiKey: string;

    // Local Models (Moonshine)
    moonshineModel: string;
    moonshineAutoLoad: boolean;

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

    // Mobile Optimization
    enableMobileOptimization: boolean;
    streamingMode: boolean;
    adaptiveQuality: boolean;
    maxMemoryUsage: number; // MB
    includeTimestamps: boolean;
};

export const DEFAULT_SETTINGS: NeuroVoxSettings = {
    // AI Providers
    openaiApiKey: '',
    groqApiKey: '',
    deepgramApiKey: '',
    openrouterApiKey: '',
    assemblyaiApiKey: '',

    // Local Models (Moonshine)
    moonshineModel: 'moonshine-tiny',
    moonshineAutoLoad: false,

    // Recording
    audioQuality: AudioQuality.Medium,
    recordingFolderPath: 'Recordings',
    transcriptFolderPath: 'Transcripts',
    showFloatingButton: true,
    useRecordingModal: true,
    showToolbarButton: true,
    micButtonColor: '#4B4B4B',
    transcriptionModel: 'gpt-transcribe',
    transcriptionProvider: AIProvider.OpenAI,
    transcriptionCalloutFormat: '>[!info]- Transcription\n>![[{audioPath}]]\n>{transcription}',
    showTimer: true,
    autoStopEnabled: false,
    autoStopDuration: 5,

    // Post-Processing
    generatePostProcessing: true,
    postProcessingPrompt: 'Process the following transcript to extract key insights and information.',
    // Reasoning models spend part of this budget thinking before they emit any text, so a
    // few hundred tokens can produce an empty response. 2000 leaves room for both.
    postProcessingMaxTokens: 2000,
    postProcessingModel: 'gpt-5.6-luna',
    postProcessingProvider: AIProvider.OpenAI,
    postProcessingTemperature: 0.7,
    postProcessingCalloutFormat: '>[!note]- Post-Processing\n>{postProcessing}',

    // Current Provider
    currentProvider: AIProvider.OpenAI,

    // Mobile Optimization
    enableMobileOptimization: true,
    streamingMode: true, // Auto-detected based on device
    adaptiveQuality: true,
    maxMemoryUsage: 200, // MB
    includeTimestamps: false,
};
