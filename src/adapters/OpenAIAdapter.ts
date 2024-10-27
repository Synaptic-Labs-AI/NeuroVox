// src/adapters/OpenAIAdapter.ts

import { AIAdapter, AIProvider, AIModels, AIModel } from './AIAdapter';
import { NeuroVoxSettings } from '../settings/Settings';
import { Notice, requestUrl } from 'obsidian';

export class OpenAIAdapter implements AIAdapter {
    public apiKey: string;
    public models = AIModels[AIProvider.OpenAI];

    constructor(public settings: NeuroVoxSettings) {
        this.apiKey = settings.openaiApiKey;
    }

    setApiKey(apiKey: string): void {
        this.apiKey = apiKey;
        this.settings.openaiApiKey = apiKey;
    }

    getApiKey(): string {
        return this.apiKey;
    }

    async validateApiKey(): Promise<boolean> {
        try {
            if (!this.apiKey) throw new Error('API key not set.');
            // Simple request to validate the key by fetching models
            const response = await requestUrl({
                url: 'https://api.openai.com/v1/models',
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                },
            });

            if (response.status !== 200) {
                throw new Error(`Status ${response.status}`);
            }

            return true;
        } catch (error) {
            console.error('OpenAI API Key Validation Error:', error);
            new Notice('Invalid OpenAI API Key.');
            return false;
        }
    }

    getAvailableModels(category: 'transcription' | 'language'): AIModel[] {
        return this.models.filter(model => model.category === category);
    }

    isReady(): boolean {
        return !!this.apiKey && this.getAvailableModels('transcription').length > 0 && this.getAvailableModels('language').length > 0;
    }

    async generateResponse(prompt: string, model: string, options?: { maxTokens?: number }): Promise<string> {
        const endpoint = 'https://api.openai.com/v1/chat/completions';
        const maxTokens = options?.maxTokens || 1000;

        const requestBody = {
            model: model,
            messages: [
                { role: 'system', content: this.settings.summaryPrompt },
                { role: 'user', content: prompt }
            ],
            max_tokens: maxTokens
        };

        try {
            const response = await requestUrl({
                url: endpoint,
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(requestBody)
            });

            if (response.status !== 200) {
                const errorMessage = response.json?.error?.message || 'Unknown error';
                throw new Error(`API request failed: ${errorMessage}`);
            }

            return response.json.choices[0].message.content.trim();
        } catch (error) {
            console.error('OpenAI Generate Response Error:', error);
            throw new Error(`OpenAI Generate Response Failed: ${(error as Error).message}`);
        }
    }

    async transcribeAudio(audioBlob: Blob, model: string): Promise<string> {
        const endpoint = 'https://api.openai.com/v1/audio/transcriptions';

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
            console.error('OpenAI Transcribe Audio Error:', error);
            throw new Error(`OpenAI Transcription Failed: ${(error as Error).message}`);
        }
    }
}
