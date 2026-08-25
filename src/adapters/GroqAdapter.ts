import { AIAdapter, AIProvider } from './AIAdapter';
import { NeuroVoxSettings } from '../settings/Settings';
import { ChatCompletionResponse, TranscriptionResponse } from '../types';

export class GroqAdapter extends AIAdapter {
    private apiKey: string = '';

    constructor(settings: NeuroVoxSettings) {
        super(settings, AIProvider.Groq);
    }

    getApiKey(): string {
        return this.apiKey;
    }

    protected setApiKeyInternal(key: string): void {
        this.apiKey = key;
    }

    protected getApiBaseUrl(): string {
        return 'https://api.groq.com/openai/v1';
    }

    protected getTextGenerationEndpoint(): string {
        return '/chat/completions';
    }

    protected getTranscriptionEndpoint(): string {
        return '/audio/transcriptions';
    }

    /** Groq is OpenAI-compatible and serves its live catalog at GET /openai/v1/models. */
    protected getModelListEndpoint(): string | null {
        return '/models';
    }

    /**
     * Probes with GET /models rather than a token-spending completion against a hardcoded
     * model id, which would start failing for valid keys once that model is retired.
     */
    protected async probeApiKey(): Promise<void> {
        await this.makeAPIRequest(`${this.getApiBaseUrl()}/models`, 'GET', {}, null);
    }

    protected parseTextGenerationResponse(response: ChatCompletionResponse): string {
        if (response?.choices?.[0]?.message?.content) {
            return response.choices[0].message.content;
        }
        throw new Error('Invalid response format from Groq');
    }

    protected parseTranscriptionResponse(response: TranscriptionResponse): string {
        if (response?.text) {
            return response.text;
        }
        throw new Error('Invalid transcription response format from Groq');
    }
}
