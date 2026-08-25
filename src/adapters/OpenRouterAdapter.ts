import { AIAdapter, AIModel, AIProvider } from './AIAdapter';
import { NeuroVoxSettings } from '../settings/Settings';
import { ChatCompletionResponse, ModelListResponse } from '../types';

/**
 * OpenRouter is an OpenAI-compatible aggregator used for post-processing (language) only.
 * It has no dedicated transcription endpoint, so transcription is unsupported.
 */
export class OpenRouterAdapter extends AIAdapter {
    private apiKey: string = '';

    constructor(settings: NeuroVoxSettings) {
        super(settings, AIProvider.OpenRouter);
    }

    getApiKey(): string {
        return this.apiKey;
    }

    protected setApiKeyInternal(key: string): void {
        this.apiKey = key;
    }

    protected getApiBaseUrl(): string {
        return 'https://openrouter.ai/api/v1';
    }

    protected getTextGenerationEndpoint(): string {
        return '/chat/completions';
    }

    protected getTranscriptionEndpoint(): string {
        // OpenRouter does not provide audio transcription.
        return '';
    }

    protected getModelListEndpoint(): string | null {
        return '/models';
    }

    protected async probeApiKey(): Promise<void> {
        // /models is authenticated and free (no token spend).
        const response = await this.makeAPIRequest<ModelListResponse>(
            `${this.getApiBaseUrl()}/models`,
            'GET',
            {},
            null
        );
        if (!Array.isArray(response?.data)) {
            throw new Error('Unexpected response from the OpenRouter model list');
        }
    }

    /**
     * OpenRouter reads these for app attribution on its rankings page and, for some routes,
     * to identify the calling app at all. They are cheap to send and removing the guesswork
     * about whether a route needs them is worth more than the two header bytes.
     */
    protected getExtraHeaders(): Record<string, string> {
        return {
            'HTTP-Referer': 'https://github.com/Synaptic-Labs-AI/NeuroVox',
            'X-Title': 'NeuroVox'
        };
    }

    protected parseTextGenerationResponse(response: ChatCompletionResponse): string {
        if (response?.choices?.[0]?.message?.content) {
            return response.choices[0].message.content;
        }
        throw new Error('Invalid response format from OpenRouter');
    }

    protected parseTranscriptionResponse(): string {
        throw new Error('Transcription not supported by OpenRouter');
    }

    /**
     * OpenRouter exposes rich metadata, so keep only text-output models and use the reported
     * display name and context length.
     */
    protected parseModelList(response: ModelListResponse): AIModel[] {
        if (!response?.data) return [];
        return response.data
            .filter(m => {
                const outputs = m.architecture?.output_modalities;
                // If modality info is missing, keep the model (most are text chat models).
                return !outputs || outputs.includes('text');
            })
            .map(m => ({
                id: m.id,
                name: m.name || m.id,
                category: 'language' as const,
                maxTokens: m.context_length
            }))
            .sort((a, b) => a.name.localeCompare(b.name));
    }
}
