// src/adapters/GroqAdapter.ts

import { AIAdapter, AIProvider, AIModels, AIModel } from './AIAdapter';
import { NeuroVoxSettings } from '../settings/Settings';
import { Notice, requestUrl } from 'obsidian';

export class GroqAdapter implements AIAdapter {
    public apiKey: string;
    public models = AIModels[AIProvider.Groq];
    public readonly API_BASE_URL = 'https://api.groq.com/openai/v1';

    constructor(public settings: NeuroVoxSettings) {
        this.apiKey = settings.groqApiKey;
    }

    setApiKey(apiKey: string): void {
        this.apiKey = apiKey;
        this.settings.groqApiKey = apiKey;
    }

    getApiKey(): string {
        return this.apiKey;
    }

    async validateApiKey(): Promise<boolean> {
        try {
            if (!this.apiKey) throw new Error('API key not set.');
            // Attempt a simple transcription request with a small audio blob
            const dummyBlob = new Blob([new Uint8Array([0])], { type: 'audio/wav' });
            await this.transcribeAudio(dummyBlob, this.models[0].id);
            return true;
        } catch (error) {
            console.error('Groq API Key Validation Error:', error);
            new Notice('Invalid Groq API Key.');
            return false;
        }
    }

    getAvailableModels(category: 'transcription' | 'language'): AIModel[] {
        return this.models.filter(model => model.category === category);
    }

    isReady(): boolean {
        return !!this.apiKey && this.getAvailableModels('transcription').length > 0;
    }

    async generateResponse(prompt: string, model: string, options?: { maxTokens?: number }): Promise<string> {
        // Assuming Groq does not support language models currently
        throw new Error('Groq does not support text generation.');
    }

    async transcribeAudio(audioBlob: Blob, model: string): Promise<string> {
        const endpoint = `${this.API_BASE_URL}/audio/transcriptions`;

        const formData = new FormData();
        formData.append('file', audioBlob, 'audio.wav');
        formData.append('model', model);
        // Optionally, append language or other parameters

        try {
            const response = await requestUrl({
                url: endpoint,
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                },
                body: formData as any // TypeScript fix: Cast to any to bypass type mismatch
            });

            if (response.status !== 200) {
                const errorMessage = response.json?.error?.message || 'Unknown error';
                throw new Error(`API request failed: ${errorMessage}`);
            }

            return response.json.text.trim();
        } catch (error) {
            console.error('Groq Transcribe Audio Error:', error);
            throw new Error(`Groq Transcription Failed: ${(error as Error).message}`);
        }
    }
}
