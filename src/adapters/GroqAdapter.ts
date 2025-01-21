import { AIAdapter, AIProvider, AIModels, getModelInfo } from './AIAdapter';
import { NeuroVoxSettings } from '../settings/Settings';

export class GroqAdapter extends AIAdapter {
    constructor(settings: NeuroVoxSettings) {
        super(settings, AIProvider.Groq);
    }

    public getApiKey(): string {
        return this.settings.groqApiKey;
    }

    public setApiKey(apiKey: string): void {
        this.settings.groqApiKey = apiKey;
    }

    protected getApiBaseUrl(): string {
        return 'https://api.groq.com/openai/v1';
    }

    protected getTranscriptionEndpoint(): string {
        return '/audio/transcriptions';
    }

    protected getTextGenerationEndpoint(): string {
        return '/chat/completions';
    }

    protected parseTextGenerationResponse(response: any): string {
        if (!response?.choices?.[0]?.message?.content) {
            throw new Error('Invalid response format from Groq API');
        }
        return response.choices[0].message.content.trim();
    }

    protected parseTranscriptionResponse(response: any): string {
        if (!response?.text) {
            throw new Error('Invalid transcription response format from Groq API');
        }
        return response.text.trim();
    }

    public async generateResponse(prompt: string, model: string, options?: { maxTokens?: number, temperature?: number }): Promise<string> {
        try {
            const endpoint = `${this.getApiBaseUrl()}${this.getTextGenerationEndpoint()}`;
            const modelInfo = getModelInfo(model);
            
            const body = {
                model: model,
                messages: [
                    {
                        role: "user",
                        content: prompt
                    }
                ],
                max_tokens: options?.maxTokens || modelInfo?.maxTokens || 1000,
                temperature: options?.temperature ?? 0.7,
            };

            const response = await this.makeAPIRequest(
                endpoint,
                'POST',
                {
                    'Content-Type': 'application/json'
                },
                JSON.stringify(body)
            );

            return this.parseTextGenerationResponse(response);
        } catch (error) {
            throw new Error(`Groq response generation failed: ${this.getErrorMessage(error)}`);
        }
    }

    protected async validateApiKeyImpl(): Promise<boolean> {
        try {
            const response = await this.makeAPIRequest(
                `${this.getApiBaseUrl()}/models`,
                'GET',
                {
                    'Content-Type': 'application/json'
                },
                null
            );
            // Groq API returns { data: [...] } format
            return Boolean(response?.data);
        } catch (error) {
            console.error('Groq API validation error:', error);
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
                const errorMsg = response.error.message || 'Unknown Groq API error';
                console.error('Groq API error:', errorMsg);
                throw new Error(errorMsg);
            }
            
            return response;
        } catch (error) {
            const status = (error as any).status;
            const errorMsg = (error as any).message || 'Unknown error';
            
            console.error(`Groq API error (${status}):`, errorMsg);
            
            switch (status) {
                case 401:
                    throw new Error('Invalid Groq API key. Please check your settings.');
                case 404:
                    throw new Error('Groq API endpoint not found. Please check your model selection.');
                case 429:
                    throw new Error('Groq API rate limit exceeded. Please try again in a few minutes.');
                case 500:
                    throw new Error('Groq API server error. Please try again later.');
                case 503:
                    throw new Error('Groq API service is temporarily unavailable. Please try again later.');
                default:
                    if (error instanceof Error) {
                        throw error;
                    }
                    throw new Error(`Groq API error: ${errorMsg}`);
            }
        }
    }
}
