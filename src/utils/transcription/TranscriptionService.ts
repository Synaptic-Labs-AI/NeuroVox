import { AIAdapter, AIProvider } from '../../adapters/AIAdapter';
import NeuroVoxPlugin from '../../main';

/**
 * Result of a transcription operation
 */
export interface TranscriptionResult {
    transcription: string;
    postProcessing?: string;
}

/**
 * Handles transcription and post-processing of audio content
 * Uses configured AI adapters to process the content
 */
export class TranscriptionService {
    constructor(private plugin: NeuroVoxPlugin) {}

    /**
     * Transcribes audio content and optionally generates post-processing
     * @param audioBuffer The audio data to transcribe
     * @returns The transcription result
     */
    public async transcribeContent(audioBuffer: ArrayBuffer): Promise<TranscriptionResult> {
        try {
            // Get transcription
            const transcription = await this.transcribeAudio(audioBuffer);

            // Generate post-processing if enabled
            const postProcessing = this.plugin.settings.generatePostProcessing
                ? await this.generatePostProcessing(transcription)
                : undefined;

            return {
                transcription,
                postProcessing
            };
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            throw new Error(`Transcription failed: ${message}`);
        }
    }

    /**
     * Transcribes audio using the configured AI adapter
     */
    private async transcribeAudio(audioBuffer: ArrayBuffer): Promise<string> {
        const adapter = this.getAdapter(
            this.plugin.settings.transcriptionProvider,
            'transcription'
        );
        
        return adapter.transcribeAudio(
            audioBuffer,
            this.plugin.settings.transcriptionModel
        );
    }

    /**
     * Generates post-processing content using the configured AI adapter
     */
    private async generatePostProcessing(transcription: string): Promise<string> {
        const adapter = this.getAdapter(
            this.plugin.settings.postProcessingProvider,
            'language'
        );

        const prompt = `${this.plugin.settings.postProcessingPrompt}\n\n${transcription}`;
        
        return adapter.generateResponse(
            prompt,
            this.plugin.settings.postProcessingModel,
            {
                maxTokens: this.plugin.settings.postProcessingMaxTokens,
                temperature: this.plugin.settings.postProcessingTemperature
            }
        );
    }

    /**
     * Gets and validates the appropriate AI adapter
     */
    private getAdapter(provider: AIProvider, category: 'transcription' | 'language'): AIAdapter {
        const adapter = this.plugin.aiAdapters.get(provider);
        if (!adapter) {
            throw new Error(`${provider} adapter not found`);
        }

        if (!adapter.isReady(category)) {
            const apiKey = adapter.getApiKey();
            if (!apiKey) {
                throw new Error(`${provider} API key is not configured`);
            }
            throw new Error(
                `${provider} adapter is not ready for ${category}. Please check your settings and model availability.`
            );
        }

        return adapter;
    }
}
