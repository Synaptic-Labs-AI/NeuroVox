import { AIAdapter, AIProvider } from './AIAdapter';
import { NeuroVoxSettings } from '../settings/Settings';

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

    protected async validateApiKeyImpl(): Promise<boolean> {
        if (!this.apiKey) {
            return false;
        }

        try {
            // Try a minimal completion request to validate the API key
            await this.makeAPIRequest(
                `${this.getApiBaseUrl()}/chat/completions`,
                'POST',
                {
                    'Content-Type': 'application/json'
                },
                JSON.stringify({
                    model: 'gpt-4o-mini',
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
        throw new Error('Invalid response format from OpenAI');
    }

    protected parseTranscriptionResponse(response: any): string {
        if (response?.text) {
            return response.text;
        }
        throw new Error('Invalid transcription response format from OpenAI');
    }
}
