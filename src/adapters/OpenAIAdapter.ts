import { AIAdapter, AIProvider, AIModels, getModelInfo } from './AIAdapter';
import { NeuroVoxSettings } from '../settings/Settings';

export class OpenAIAdapter extends AIAdapter {
    constructor(settings: NeuroVoxSettings) {
        super(settings, AIProvider.OpenAI);
    }

    public getApiKey(): string {
        return this.settings.openaiApiKey;
    }

    public setApiKey(apiKey: string): void {
        this.settings.openaiApiKey = apiKey;
    }

    protected getApiBaseUrl(): string {
        return 'https://api.openai.com/v1';
    }

    protected getTranscriptionEndpoint(): string {
        return '/audio/transcriptions';
    }

    protected getTextGenerationEndpoint(): string {
        return '/chat/completions';
    }

    protected parseTextGenerationResponse(response: any): string {
        if (!response?.choices?.[0]?.message?.content) {
            throw new Error('Invalid response format from OpenAI API');
        }
        return response.choices[0].message.content.trim();
    }

    protected parseTranscriptionResponse(response: any): string {
        if (!response?.text) {
            throw new Error('Invalid transcription response format from OpenAI API');
        }
        return response.text.trim();
    }

    public async generateResponse(prompt: string, model: string, options?: { maxTokens?: number, temperature?: number }): Promise<string> {
        try {
            const endpoint = `${this.getApiBaseUrl()}${this.getTextGenerationEndpoint()}`;
            const modelInfo = getModelInfo(model);
            
            const body = {
                model: model,
                messages: [{ role: "user", content: prompt }],
                max_tokens: options?.maxTokens || modelInfo?.maxTokens || 1000,
                temperature: options?.temperature ?? 0.7,
            };

            const response = await this.makeAPIRequest(
                endpoint,
                'POST',
                {
                    'Content-Type': 'application/json',
                },
                JSON.stringify(body)
            );

            return this.parseTextGenerationResponse(response);
        } catch (error) {
            const errorMessage = this.getErrorMessage(error);
            console.error('OpenAI API Error:', error);
            throw new Error(`OpenAI API request failed: ${errorMessage}`);
        }
    }

    public async transcribeAudio(audioArrayBuffer: ArrayBuffer, model: string): Promise<string> {
        try {
            const { headers, body } = await this.prepareTranscriptionRequest(audioArrayBuffer, model);
            const endpoint = `${this.getApiBaseUrl()}${this.getTranscriptionEndpoint()}`;
            
            const response = await this.makeAPIRequest(
                endpoint,
                'POST',
                headers,
                body
            );

            return this.parseTranscriptionResponse(response);
        } catch (error) {
            const errorMessage = this.getErrorMessage(error);
            console.error('OpenAI Transcription Error:', error);
            throw new Error(`OpenAI transcription failed: ${errorMessage}`);
        }
    }

    protected async validateApiKeyImpl(): Promise<boolean> {
        try {
            const response = await this.makeAPIRequest(
                `${this.getApiBaseUrl()}/models`,
                'GET',
                {
                    'Content-Type': 'application/json',
                },
                null
            );
            return Array.isArray(response.data);
        } catch (error) {
            console.error('OpenAI API Key Validation Error:', error);
            return false;
        }
    }

    protected async makeAPIRequest(
        endpoint: string,
        method: string,
        headers: Record<string, string>,
        body: string | ArrayBuffer | null
    ): Promise<any> {
        try {
            const response = await super.makeAPIRequest(endpoint, method, headers, body);
            
            if (response.error) {
                throw new Error(response.error.message || 'Unknown OpenAI API error');
            }
            
            return response;
        } catch (error) {
            const status = (error as any).status;
            switch (status) {
                case 401:
                    throw new Error('Invalid OpenAI API key. Please check your credentials.');
                case 429:
                    throw new Error('OpenAI API rate limit exceeded. Please try again later.');
                case 500:
                    throw new Error('OpenAI API server error. Please try again later.');
                case 503:
                    throw new Error('OpenAI API service is temporarily unavailable. Please try again later.');
                default:
                    if (error instanceof Error) {
                        throw error;
                    }
                    throw new Error('Unknown error occurred');
            }
        }
    }

    protected getErrorMessage(error: unknown): string {
        if (error instanceof Error) return error.message;
        if (typeof error === 'string') return error;
        return 'Unknown error occurred';
    }
}