import { AIAdapter, AIProvider, AIModels, getModelInfo } from './AIAdapter';
import { NeuroVoxSettings } from '../settings/Settings';
import OpenAI from 'openai';

export class OpenAIAdapter extends AIAdapter {
    private client: OpenAI;

    constructor(settings: NeuroVoxSettings) {
        super(settings, AIProvider.OpenAI);
        this.client = new OpenAI({
            apiKey: this.getApiKey(),
            dangerouslyAllowBrowser: true // Required for client-side usage
        });
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
            // 🤖 Using OpenAI client to create chat completion
            const modelInfo = getModelInfo(model);
            const completion = await this.client.chat.completions.create({
                model: model,
                messages: [{ role: "user", content: prompt }],
                max_tokens: options?.maxTokens || modelInfo?.maxTokens || 1000,
                temperature: options?.temperature ?? 0.7,
            });

            // 🎯 Extract and validate response content
            if (!completion?.choices?.[0]?.message?.content) {
                throw new Error('Invalid response format from OpenAI API');
            }
            
            return completion.choices[0].message.content.trim();
        } catch (error) {
            console.error('🚨 OpenAI API Error:', error);
            throw new Error(`OpenAI response generation failed: ${this.getErrorMessage(error)}`);
        }
    }

    public async transcribeAudio(audioArrayBuffer: ArrayBuffer, model: string): Promise<string> {
        try {
            // 🎙️ Convert ArrayBuffer to Blob for OpenAI client
            const audioBlob = new Blob([audioArrayBuffer], { type: 'audio/wav' });
            const file = new File([audioBlob], 'recording.wav', { type: 'audio/wav' });

            // 🔊 Use OpenAI client to transcribe audio
            const transcription = await this.client.audio.transcriptions.create({
                file: file,
                model: model,
            });

            if (!transcription?.text) {
                throw new Error('Invalid transcription response format from OpenAI API');
            }

            return transcription.text.trim();
        } catch (error) {
            console.error('🎤 Transcription Error:', error);
            throw new Error(`OpenAI transcription failed: ${this.getErrorMessage(error)}`);
        }
    }

    protected async validateApiKeyImpl(): Promise<boolean> {
        try {
            // 🔑 Validate API key by listing models
            const models = await this.client.models.list();
            return Array.isArray(models.data);
        } catch (error) {
            console.error('🚫 API Key validation failed:', error);
            return false;
        }
    }

}
