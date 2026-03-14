import { Notice } from 'obsidian';
import { AIAdapter, AIProvider } from './AIAdapter';
import { NeuroVoxSettings } from '../settings/Settings';
import {
    ChatCompletionResponse,
    MoonshineTranscriptionResponse,
    TransformersProgressData
} from '../types';
import { ASRPipeline, createASRPipeline, isTransformersLoaded } from '../utils/TransformersLoader';

/**
 * Model status for tracking download state
 */
export enum MoonshineModelStatus {
    NotDownloaded = 'not_downloaded',
    Downloading = 'downloading',
    Ready = 'ready',
    Error = 'error'
}

/**
 * Moonshine model configuration
 */
interface MoonshineModelConfig {
    id: string;
    name: string;
    path: string;
    size: string;
}

const MOONSHINE_MODELS: Record<string, MoonshineModelConfig> = {
    'moonshine-tiny': {
        id: 'moonshine-tiny',
        name: 'Moonshine Tiny',
        path: 'onnx-community/moonshine-tiny-ONNX',
        size: '~50MB'
    },
    'moonshine-base': {
        id: 'moonshine-base',
        name: 'Moonshine Base',
        path: 'onnx-community/moonshine-base-ONNX',
        size: '~400MB'
    }
};

/**
 * MoonshineAdapter - Local speech-to-text using Moonshine models
 *
 * This adapter runs entirely locally in the browser using WebGPU/WASM,
 * with no API calls or internet required after model download.
 */
export class MoonshineAdapter extends AIAdapter {
    private modelStatus: Map<string, MoonshineModelStatus> = new Map();
    private transcriber: ASRPipeline | null = null;
    private currentModel: string | null = null;
    private isInitializing: boolean = false;
    private downloadProgress: number = 0;

    constructor(settings: NeuroVoxSettings) {
        super(settings, AIProvider.Moonshine);

        // Initialize model status
        Object.keys(MOONSHINE_MODELS).forEach(modelId => {
            this.modelStatus.set(modelId, MoonshineModelStatus.NotDownloaded);
        });
    }

    // ========================================
    // Abstract method implementations
    // ========================================

    getApiKey(): string {
        // Moonshine doesn't use API keys - return empty string
        return '';
    }

    protected setApiKeyInternal(_key: string): void {
        // No-op for local models
    }

    protected getApiBaseUrl(): string {
        // Not used for local models
        return '';
    }

    protected getTextGenerationEndpoint(): string {
        // Moonshine doesn't support text generation
        return '';
    }

    protected getTranscriptionEndpoint(): string {
        // Not used for local models
        return '';
    }

    protected async validateApiKeyImpl(): Promise<boolean> {
        // For Moonshine, "validation" means checking if a model is ready
        // We consider it valid if any model is downloaded
        for (const status of this.modelStatus.values()) {
            if (status === MoonshineModelStatus.Ready) {
                return true;
            }
        }
        // Also return true if no model is downloaded yet - user can still select Moonshine
        // The actual check happens at transcription time
        return true;
    }

    protected parseTextGenerationResponse(_response: never): string {
        throw new Error('Text generation not supported by Moonshine');
    }

    protected parseTranscriptionResponse(response: MoonshineTranscriptionResponse | string): string {
        // The transcription response from Moonshine is already a string
        if (typeof response === 'string') {
            return response;
        }
        if (response?.text) {
            return response.text;
        }
        throw new Error('Invalid transcription response from Moonshine');
    }

    // ========================================
    // Override base class methods
    // ========================================

    /**
     * Check if the adapter is ready for transcription
     */
    public isReady(_category: 'transcription' | 'language' = 'transcription'): boolean {
        // Moonshine is "ready" if at least one model is downloaded
        // or if we can attempt to download on first use
        return true;
    }

    /**
     * Transcribe audio using local Moonshine model
     */
    public async transcribeAudio(audioArrayBuffer: ArrayBuffer, model: string): Promise<string> {
        console.log('[Moonshine] Starting transcription, audio size:', audioArrayBuffer.byteLength, 'model:', model);
        try {
            // Ensure the model is loaded
            await this.ensureModelLoaded(model);

            if (!this.transcriber) {
                throw new Error('Moonshine transcriber not initialized');
            }

            // Convert ArrayBuffer to the format Moonshine expects
            const audioBlob = new Blob([audioArrayBuffer], { type: 'audio/wav' });
            console.log('[Moonshine] Created audio blob, size:', audioBlob.size);

            // Use the transcriber to process the audio
            const result = await this.transcribeBlob(audioBlob);
            console.log('[Moonshine] Transcription result:', result);

            return this.parseTranscriptionResponse(result);
        } catch (error) {
            console.error('[Moonshine] Transcription error:', error);
            const message = this.getErrorMessage(error);
            throw new Error(`Failed to transcribe audio with Moonshine: ${message}`);
        }
    }

    // ========================================
    // Moonshine-specific methods
    // ========================================

    /**
     * Get the status of a specific model
     */
    public getModelStatus(modelId: string): MoonshineModelStatus {
        return this.modelStatus.get(modelId) || MoonshineModelStatus.NotDownloaded;
    }

    /**
     * Get download progress (0-100)
     */
    public getDownloadProgress(): number {
        return this.downloadProgress;
    }

    /**
     * Check if any model is currently downloading
     */
    public isDownloading(): boolean {
        for (const status of this.modelStatus.values()) {
            if (status === MoonshineModelStatus.Downloading) {
                return true;
            }
        }
        return false;
    }

    /**
     * Ensure the specified model is loaded and ready
     */
    public async ensureModelLoaded(modelId: string): Promise<void> {
        // If already loaded with this model, return
        if (this.transcriber && this.currentModel === modelId) {
            return;
        }

        // If currently initializing, wait
        if (this.isInitializing) {
            await this.waitForInitialization();
            return;
        }

        const modelConfig = MOONSHINE_MODELS[modelId];
        if (!modelConfig) {
            throw new Error(`Unknown Moonshine model: ${modelId}`);
        }

        this.isInitializing = true;
        this.modelStatus.set(modelId, MoonshineModelStatus.Downloading);
        this.downloadProgress = 0;

        try {
            new Notice(`Loading Moonshine ${modelConfig.name} model (${modelConfig.size})... This may take a minute.`);

            // Use iframe-based loader to load transformers.js
            // The iframe creates a true browser sandbox that avoids Electron's
            // Node.js detection issues with onnxruntime-web
            this.transcriber = await createASRPipeline(
                modelConfig.path,
                {
                    progress_callback: (progress: TransformersProgressData) => {
                        if (progress.status === 'progress' && progress.progress) {
                            this.downloadProgress = Math.round(progress.progress);
                        }
                        // Log progress for debugging
                        if (progress.status === 'download') {
                            console.log(`Downloading: ${progress.file}`);
                        }
                    }
                }
            );

            this.currentModel = modelId;
            this.modelStatus.set(modelId, MoonshineModelStatus.Ready);
            this.downloadProgress = 100;

            new Notice(`Moonshine ${modelConfig.name} model loaded successfully!`);
        } catch (error) {
            this.modelStatus.set(modelId, MoonshineModelStatus.Error);
            this.transcriber = null;
            this.currentModel = null;
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            console.error('Failed to load Moonshine model:', error);
            new Notice(`Failed to load model: ${errorMessage}`);
            throw error;
        } finally {
            this.isInitializing = false;
        }
    }

    /**
     * Check if transformers.js library is loaded
     */
    public isLibraryLoaded(): boolean {
        return isTransformersLoaded();
    }

    /**
     * Transcribe a Blob using the loaded model
     */
    private async transcribeBlob(audioBlob: Blob): Promise<string> {
        if (!this.transcriber) {
            throw new Error('Transcriber not initialized');
        }

        // Convert Blob to ArrayBuffer then to Float32Array for audio processing
        console.log('[Moonshine] Decoding audio blob...');
        const arrayBuffer = await audioBlob.arrayBuffer();
        const audioData = await this.decodeAudioData(arrayBuffer);
        console.log('[Moonshine] Decoded audio, samples:', audioData.length, 'duration:', audioData.length / 16000, 'seconds');

        // Run transcription
        console.log('[Moonshine] Calling transcriber pipeline...');
        const result = await this.transcriber(audioData, {
            language: 'en',
            return_timestamps: false
        });
        console.log('[Moonshine] Pipeline returned:', result);

        return result.text || '';
    }

    /**
     * Decode audio data from ArrayBuffer to Float32Array
     */
    private async decodeAudioData(arrayBuffer: ArrayBuffer): Promise<Float32Array> {
        // Create an AudioContext for decoding
        // window.webkitAudioContext is typed in types.ts global declaration
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextClass) {
            throw new Error('AudioContext not supported in this browser');
        }
        const audioContext = new AudioContextClass({ sampleRate: 16000 });

        try {
            const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

            // Get the first channel (mono)
            const channelData = audioBuffer.getChannelData(0);

            // If sample rate doesn't match, resample
            if (audioBuffer.sampleRate !== 16000) {
                return this.resampleAudio(channelData, audioBuffer.sampleRate, 16000);
            }

            return channelData;
        } finally {
            await audioContext.close();
        }
    }

    /**
     * Resample audio to target sample rate
     */
    private resampleAudio(audioData: Float32Array, fromRate: number, toRate: number): Float32Array {
        const ratio = fromRate / toRate;
        const newLength = Math.round(audioData.length / ratio);
        const result = new Float32Array(newLength);

        for (let i = 0; i < newLength; i++) {
            const srcIndex = i * ratio;
            const srcIndexFloor = Math.floor(srcIndex);
            const srcIndexCeil = Math.min(srcIndexFloor + 1, audioData.length - 1);
            const t = srcIndex - srcIndexFloor;

            // Linear interpolation
            result[i] = audioData[srcIndexFloor] * (1 - t) + audioData[srcIndexCeil] * t;
        }

        return result;
    }

    /**
     * Wait for initialization to complete
     */
    private async waitForInitialization(): Promise<void> {
        const maxWaitTime = 120000; // 2 minutes max
        const checkInterval = 500;
        let waited = 0;

        while (this.isInitializing && waited < maxWaitTime) {
            await new Promise(resolve => setTimeout(resolve, checkInterval));
            waited += checkInterval;
        }

        if (this.isInitializing) {
            throw new Error('Model initialization timed out');
        }
    }

    /**
     * Unload the current model to free memory
     */
    public async unloadModel(): Promise<void> {
        if (this.transcriber) {
            // Transformers.js doesn't have explicit disposal, but we can null the reference
            this.transcriber = null;
            this.currentModel = null;
        }
    }

    /**
     * Get available model configurations
     */
    public static getAvailableModels(): MoonshineModelConfig[] {
        return Object.values(MOONSHINE_MODELS);
    }
}
