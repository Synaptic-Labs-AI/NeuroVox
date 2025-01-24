import { Notice, requestUrl } from 'obsidian';
import { NeuroVoxSettings } from '../settings/Settings';

export enum AIProvider {
    OpenAI = 'openai',
    Groq = 'groq',
}

export interface AIModel {
    id: string;
    name: string;
    category: 'transcription' | 'language';
    maxTokens?: number;
}

export const AIModels: Record<AIProvider, AIModel[]> = {
    [AIProvider.OpenAI]: [
        { id: 'whisper-1', name: 'OpenAI', category: 'transcription' },
        { id: 'gpt-4o', name: 'GPT 4o', category: 'language', maxTokens: 8192 },
        { id: 'gpt-4o-mini', name: 'GPT 4o Mini', category: 'language', maxTokens: 4096 },
        { id: 'o1-preview', name: 'o1 Preview', category: 'language', maxTokens: 2048 },
        { id: 'o1-mini', name: 'o1 Mini', category: 'language', maxTokens: 1024 },
    ],
    [AIProvider.Groq]: [
        { id: 'distil-whisper-large-v3-en', name: 'Groq', category: 'transcription' },
        { id: 'gemma2-9b-it', name: 'Gemma 2 9B IT', category: 'language', maxTokens: 4096 },
        { id: 'gemma-7b-it', name: 'Gemma 7B IT', category: 'language', maxTokens: 2048 },
        { id: 'llama3-groq-70b-8192-tool-use-preview', name: 'Llama 3 Groq 70B Versatile', category: 'language', maxTokens: 8192 },
        { id: 'llama3-groq-8b-8192-tool-use-preview', name: 'Llama 3 Groq 8B Instant', category: 'language', maxTokens: 4096 },
        { id: 'llama-3.1-70b-versatile', name: 'Llama 3.1 70b', category: 'language', maxTokens: 8192 },
        { id: 'llama-3.2-3b-preview', name: 'Llama 3.2 3b', category: 'language', maxTokens: 8192 },
        { id: 'llama-3.2-90b-vision-preview', name: 'Llama 3.2 90b', category: 'language', maxTokens: 8192 },
        { id: 'mixtral-8x7b-32768', name: 'Mixtral 8x7b', category: 'language', maxTokens: 32768 },
    ],
};

export function getModelInfo(modelId: string): AIModel | undefined {
    for (const models of Object.values(AIModels)) {
        const model = models.find(m => m.id === modelId);
        if (model) return model;
    }
    return undefined;
}

interface RequestOptions {
    maxTokens?: number;
    temperature?: number;
}

export abstract class AIAdapter {
    public models: AIModel[];

    protected constructor(
        protected settings: NeuroVoxSettings,
        protected provider: AIProvider
    ) {
        this.models = AIModels[provider];
    }

    // Abstract methods
    public abstract getApiKey(): string;
    public abstract setApiKey(apiKey: string): void;
    protected abstract getApiBaseUrl(): string;
    protected abstract getTextGenerationEndpoint(): string;
    protected abstract getTranscriptionEndpoint(): string;
    protected abstract validateApiKeyImpl(): Promise<boolean>;
    protected abstract parseTextGenerationResponse(response: any): string;
    protected abstract parseTranscriptionResponse(response: any): string;

    public async generateResponse(prompt: string, model: string, options?: { maxTokens?: number, temperature?: number }): Promise<string> {
        try {
            const endpoint = `${this.getApiBaseUrl()}${this.getTextGenerationEndpoint()}`;
            const body = {
                model,
                messages: [{ role: "user", content: prompt }],
                max_tokens: options?.maxTokens || 1000,
                temperature: options?.temperature || 0.7,
            };
            const response = await this.makeAPIRequest(
                endpoint,
                'POST',
                { 'Content-Type': 'application/json' },
                JSON.stringify(body)
            );
            return this.parseTextGenerationResponse(response);
        } catch (error) {
            const message = this.getErrorMessage(error);
            throw new Error(`Failed to generate response: ${message}`);
        }
    }

    public async transcribeAudio(audioArrayBuffer: ArrayBuffer, model: string): Promise<string> {
        try {
            const { headers, body } = await this.prepareTranscriptionRequest(audioArrayBuffer, model);
            const endpoint = `${this.getApiBaseUrl()}${this.getTranscriptionEndpoint()}`;
            
            try {
                const response = await this.makeAPIRequest(
                    endpoint,
                    'POST',
                    headers,
                    body
                );
                return this.parseTranscriptionResponse(response);
            } catch (error: any) {
                // Log detailed error information
                console.error('🎙️ Transcription Error:', {
                    endpoint,
                    model,
                    error: error?.message,
                    response: error?.response?.data,
                    status: error?.response?.status
                });
                
                // Provide more specific error messages based on status codes
                if (error?.response?.status === 400) {
                    throw new Error(`Invalid request format: ${error?.response?.data?.error?.message || 'Check audio format and model name'}`);
                } else if (error?.response?.status === 401) {
                    throw new Error('Invalid API key or unauthorized access');
                } else if (error?.response?.status === 413) {
                    throw new Error('Audio file too large. Maximum size is 25MB');
                }
                
                throw error;
            }
        } catch (error) {
            const message = this.getErrorMessage(error);
            throw new Error(`Failed to transcribe audio: ${message}`);
        }
    }

    public async validateApiKey(): Promise<boolean> {
        try {
            if (!this.getApiKey()) {
                return false;
            }

            const isValid = await this.validateApiKeyImpl();
            return isValid;
        } catch (error) {
            return false;
        }
    }

    public getAvailableModels(category: 'transcription' | 'language'): AIModel[] {
        return this.models.filter(model => model.category === category);
    }

    public isReady(category: 'transcription' | 'language' = 'transcription'): boolean {
        return Boolean(this.getApiKey());
    }

    protected async makeAPIRequest(
        endpoint: string, 
        method: string, 
        headers: Record<string, string>,
        body: string | ArrayBuffer | null
    ): Promise<any> {
        try {
            const requestHeaders: Record<string, string> = {
                'Authorization': `Bearer ${this.getApiKey()}`,
                ...headers
            };

            // Debug log the request (excluding sensitive data)
            console.log('🚀 Making API request:', {
                endpoint,
                method,
                headers: Object.keys(requestHeaders),
                bodyType: body instanceof ArrayBuffer ? 'ArrayBuffer' : typeof body,
                bodySize: body instanceof ArrayBuffer ? body.byteLength : 
                         typeof body === 'string' ? body.length : 0
            });

            const response = await requestUrl({
                url: endpoint,
                method,
                headers: requestHeaders,
                body: body || undefined,
                throw: true
            });

            if (!response.json) {
                console.error('❌ Invalid response format:', response);
                throw new Error('Invalid response format');
            }

            // Debug log the response (excluding sensitive data)
            console.log('✅ API response received:', {
                status: response.status,
                statusText: response.status.toString(),
                headers: response.headers
            });

            return response.json;
        } catch (error: any) {
            // Enhanced error logging
            console.error('❌ API request failed:', {
                endpoint,
                method,
                error: error?.message,
                status: error?.response?.status,
                response: error?.response?.data,
                headers: error?.response?.headers
            });
            throw error;
        }
    }

    protected async prepareTranscriptionRequest(audioArrayBuffer: ArrayBuffer, model: string): Promise<{
        headers: Record<string, string>;
        body: ArrayBuffer;
    }> {
        // Simple boundary without special characters
        const boundary = 'boundary';
        const encoder = new TextEncoder();
        
        // Debug log the request details
        console.log('🎙️ Preparing transcription request:', {
            model,
            audioSize: audioArrayBuffer.byteLength,
            boundary
        });
        
        const parts: Uint8Array[] = [];
        
        // File part (keep it simple, just file and filename)
        parts.push(encoder.encode(`--${boundary}\r\n`));
        parts.push(encoder.encode('Content-Disposition: form-data; name="file"; filename="audio.wav"\r\n\r\n'));
        parts.push(new Uint8Array(audioArrayBuffer));
        parts.push(encoder.encode('\r\n'));
        
        // Model part (just the model name)
        parts.push(encoder.encode(`--${boundary}\r\n`));
        parts.push(encoder.encode('Content-Disposition: form-data; name="model"\r\n\r\n'));
        parts.push(encoder.encode(model));
        parts.push(encoder.encode('\r\n'));
        
        // Final boundary
        parts.push(encoder.encode(`--${boundary}--\r\n`));
        
        // Combine all parts
        const totalLength = parts.reduce((acc, part) => acc + part.length, 0);
        const finalBuffer = new Uint8Array(totalLength);
        let offset = 0;
        
        for (const part of parts) {
            finalBuffer.set(part, offset);
            offset += part.length;
        }

        return {
            headers: {
                'Content-Type': `multipart/form-data; boundary=${boundary}`
            },
            body: finalBuffer.buffer
        };
    }

    protected getErrorMessage(error: unknown): string {
        if (error instanceof Error) return error.message;
        if (typeof error === 'string') return error;
        return 'Unknown error occurred';
    }
}
