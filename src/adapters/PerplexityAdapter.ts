import { AIAdapter, AIProvider } from './AIAdapter';
import { NeuroVoxSettings } from '../settings/Settings';

export class PerplexityAdapter extends AIAdapter {
    private apiKey: string = '';

    constructor(settings: NeuroVoxSettings) {
        super(settings, AIProvider.Perplexity);
    }

    getApiKey(): string {
        return this.apiKey;
    }

    protected setApiKeyInternal(key: string): void {
        this.apiKey = key;
    }

    protected getApiBaseUrl(): string {
        return 'https://api.perplexity.ai';
    }

    protected getTextGenerationEndpoint(): string {
        return '/chat/completions';
    }

    protected getTranscriptionEndpoint(): string {
        throw new Error('Transcription not supported by Perplexity');
    }

    protected async validateApiKeyImpl(): Promise<boolean> {
        if (!this.apiKey) {
            return false;
        }

        try {
            await this.makeAPIRequest(
                `${this.getApiBaseUrl()}/chat/completions`,
                'POST',
                {
                    'Content-Type': 'application/json'
                },
                JSON.stringify({
                    model: 'sonar',
                    messages: [{ role: 'user', content: 'test' }],
                    max_tokens: 1
                })
            );
            return true;
        } catch (error) {
            return false;
        }
    }

    protected parseTextGenerationResponse(response: any): string {
        if (response?.choices?.[0]?.message?.content) {
            return response.choices[0].message.content;
        }
        throw new Error('Invalid response format from Perplexity');
    }

    protected parseTranscriptionResponse(response: any): string {
        throw new Error('Transcription not supported by Perplexity');
    }
}
