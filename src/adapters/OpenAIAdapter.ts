import { AIAdapter, AIProvider } from './AIAdapter';
import { NeuroVoxSettings } from '../settings/Settings';
import { ChatCompletionResponse, TranscriptionResponse } from '../types';

export class OpenAIAdapter extends AIAdapter {
    private apiKey: string = '';

    constructor(settings: NeuroVoxSettings) {
        super(settings, AIProvider.OpenAI);
    }

    getApiKey(): string {
        return this.apiKey;
    }

    protected setApiKeyInternal(key: string): void {
        this.apiKey = key;
    }

    protected getApiBaseUrl(): string {
        return 'https://api.openai.com/v1';
    }

    protected getTextGenerationEndpoint(): string {
        return '/chat/completions';
    }

    protected getTranscriptionEndpoint(): string {
        return '/audio/transcriptions';
    }

    /**
     * OpenAI publishes its whole catalog at GET /v1/models, so model lists come from the API
     * rather than from a table in this repo that goes stale with every release.
     */
    protected getModelListEndpoint(): string | null {
        return '/models';
    }

    /**
     * Probes with GET /models rather than a token-spending completion. It also avoids
     * pinning validation to one hardcoded model id: when that model is eventually retired,
     * a completion probe starts failing for everyone holding a perfectly good key.
     */
    protected async probeApiKey(): Promise<void> {
        await this.makeAPIRequest(`${this.getApiBaseUrl()}/models`, 'GET', {}, null);
    }

    protected parseTextGenerationResponse(response: ChatCompletionResponse): string {
        if (response?.choices?.[0]?.message?.content) {
            return response.choices[0].message.content;
        }
        throw new Error('Invalid response format from OpenAI');
    }

    protected parseTranscriptionResponse(response: TranscriptionResponse): string {
        if (response?.text) {
            return response.text;
        }
        throw new Error('Invalid transcription response format from OpenAI');
    }
}
