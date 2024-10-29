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
        return 'https://api.groq.com/openai/v1';  // Updated base URL
    }

    protected getTranscriptionEndpoint(): string {
        return '/audio/transcriptions';
    }

    protected getTextGenerationEndpoint(): string {
        return '/chat/completions';  // Updated to correct endpoint
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
            
            // Updated request body format for Groq chat completions
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
            console.error('Groq API Error:', error);
            throw new Error(`Groq API request failed: ${(error as Error).message}`);
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
            return Array.isArray(response.data);
        } catch (error) {
            console.error('Groq API Key Validation Error:', error);
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
                throw new Error(response.error.message || 'Unknown Groq API error');
            }
            
            return response;
        } catch (error) {
            const status = (error as any).status;
            switch (status) {
                case 401:
                    throw new Error('Invalid Groq API key. Please check your credentials.');
                case 404:
                    throw new Error('Groq API endpoint not found. Please check your model selection.');
                case 429:
                    throw new Error('Groq API rate limit exceeded. Please try again later.');
                default:
                    if (error instanceof Error) {
                        throw error;
                    }
                    throw new Error('Unknown error occurred');
            }
        }
    }
}