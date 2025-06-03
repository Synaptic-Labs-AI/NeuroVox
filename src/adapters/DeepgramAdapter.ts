import { requestUrl } from 'obsidian';
import { AIAdapter, AIProvider } from './AIAdapter';
import { NeuroVoxSettings } from '../settings/Settings';

export class DeepgramAdapter extends AIAdapter {
    private apiKey: string = '';

    constructor(settings: NeuroVoxSettings) {
        super(settings, AIProvider.Deepgram);
    }    getApiKey(): string {
        return this.apiKey;
    }

    protected setApiKeyInternal(key: string): void {
        this.apiKey = key;
    }

    protected getApiBaseUrl(): string {
        return 'https://api.deepgram.com';
    }

    protected getTextGenerationEndpoint(): string {
        // Deepgram doesn't have text generation, but we need to implement this abstract method
        // This will not be used for Deepgram since it only has transcription models
        return '';
    }

    protected getTranscriptionEndpoint(): string {
        return '/v1/listen';
    }

    protected async validateApiKeyImpl(): Promise<boolean> {
        if (!this.apiKey) {
            return false;
        }

        try {
            // Use Deepgram's projects endpoint to validate the API key
            const response = await this.makeAPIRequest(
                `${this.getApiBaseUrl()}/v1/projects`,
                'GET',
                {},
                null
            );
            return response && Array.isArray(response.projects);
        } catch (error) {
            return false;
        }
    }

    protected parseTextGenerationResponse(response: any): string {
        // Deepgram doesn't support text generation
        throw new Error('Text generation not supported by Deepgram');
    }

    protected parseTranscriptionResponse(response: any): string {
        if (response?.results?.channels?.[0]?.alternatives?.[0]?.transcript) {
            return response.results.channels[0].alternatives[0].transcript;
        }
        throw new Error('Invalid transcription response format from Deepgram');
    }

    // Override the transcribeAudio method since Deepgram has a different API structure
    public async transcribeAudio(audioArrayBuffer: ArrayBuffer, model: string): Promise<string> {
        try {
            // Deepgram API expects the audio file directly in the body, not as form data
            const endpoint = `${this.getApiBaseUrl()}${this.getTranscriptionEndpoint()}?model=${model}`;
            
            const response = await this.makeAPIRequest(
                endpoint,
                'POST',
                {
                    'Content-Type': 'audio/wav'
                },
                audioArrayBuffer
            );
            
            return this.parseTranscriptionResponse(response);
        } catch (error) {
            const message = this.getErrorMessage(error);
            throw new Error(`Failed to transcribe audio with Deepgram: ${message}`);
        }
    }

    // Override the makeAPIRequest method to handle Deepgram's authorization header format
    protected async makeAPIRequest(
        endpoint: string, 
        method: string, 
        headers: Record<string, string>,
        body: string | ArrayBuffer | null
    ): Promise<any> {
        try {
            const requestHeaders: Record<string, string> = {
                'Authorization': `Token ${this.getApiKey()}`, // Deepgram uses "Token" instead of "Bearer"
                ...headers
            };

            const response = await requestUrl({
                url: endpoint,
                method,
                headers: requestHeaders,
                body: body || undefined,
                throw: true
            });

            if (!response.json) {
                throw new Error('Invalid response format');
            }

            return response.json;
        } catch (error: any) {
            throw error;
        }
    }
}
