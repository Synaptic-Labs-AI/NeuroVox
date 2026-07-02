import { requestUrl } from 'obsidian';
import { AIAdapter, AIProvider } from './AIAdapter';
import { NeuroVoxSettings } from '../settings/Settings';
import {
    ChatCompletionResponse,
    AssemblyAIUploadResponse,
    AssemblyAITranscriptionResponse
} from '../types';

/**
 * AssemblyAI transcription adapter.
 *
 * AssemblyAI uses an asynchronous flow rather than a single multipart request:
 *   1. Upload raw audio bytes            -> POST /v2/upload   -> { upload_url }
 *   2. Create a transcript job           -> POST /v2/transcript { audio_url, speech_model }
 *   3. Poll until the job completes      -> GET  /v2/transcript/{id}
 *
 * It also authenticates with a bare `Authorization: <key>` header (no `Bearer` prefix),
 * so both makeAPIRequest and transcribeAudio are overridden (mirrors DeepgramAdapter).
 */
export class AssemblyAIAdapter extends AIAdapter {
    private apiKey: string = '';

    // Poll at a steady interval, capped so a stuck job can't hang the pipeline forever.
    private readonly POLL_INTERVAL_MS = 2000;
    private readonly MAX_POLL_ATTEMPTS = 150; // ~5 minutes

    constructor(settings: NeuroVoxSettings) {
        super(settings, AIProvider.AssemblyAI);
    }

    getApiKey(): string {
        return this.apiKey;
    }

    protected setApiKeyInternal(key: string): void {
        this.apiKey = key;
    }

    protected getApiBaseUrl(): string {
        return 'https://api.assemblyai.com';
    }

    protected getTextGenerationEndpoint(): string {
        // AssemblyAI is transcription-only.
        return '';
    }

    protected getTranscriptionEndpoint(): string {
        return '/v2/transcript';
    }

    protected async validateApiKeyImpl(): Promise<boolean> {
        if (!this.apiKey) {
            return false;
        }

        try {
            await this.makeAPIRequest(
                `${this.getApiBaseUrl()}/v2/transcript?limit=1`,
                'GET',
                {},
                null
            );
            return true;
        } catch {
            return false;
        }
    }

    protected parseTextGenerationResponse(_response: ChatCompletionResponse): string {
        throw new Error('Text generation not supported by AssemblyAI');
    }

    protected parseTranscriptionResponse(response: AssemblyAITranscriptionResponse): string {
        if (typeof response?.text === 'string') {
            return response.text;
        }
        throw new Error('Invalid transcription response format from AssemblyAI');
    }

    public async transcribeAudio(audioArrayBuffer: ArrayBuffer, model: string): Promise<string> {
        try {
            // 1. Upload the raw audio bytes.
            const upload = await this.makeAPIRequest<AssemblyAIUploadResponse>(
                `${this.getApiBaseUrl()}/v2/upload`,
                'POST',
                { 'Content-Type': 'application/octet-stream' },
                audioArrayBuffer
            );

            if (!upload?.upload_url) {
                throw new Error('Upload failed: no upload_url returned');
            }

            // 2. Create the transcript job.
            const created = await this.makeAPIRequest<AssemblyAITranscriptionResponse>(
                `${this.getApiBaseUrl()}${this.getTranscriptionEndpoint()}`,
                'POST',
                { 'Content-Type': 'application/json' },
                JSON.stringify({
                    audio_url: upload.upload_url,
                    // `speech_model` (singular) is deprecated; AssemblyAI now takes a
                    // `speech_models` fallback array of universal-3-pro / universal-2.
                    speech_models: [model || 'universal-3-pro']
                })
            );

            if (!created?.id) {
                throw new Error('Failed to create transcript job');
            }

            // 3. Poll until completion.
            return await this.pollForResult(created.id);
        } catch (error) {
            const message = this.getErrorMessage(error);
            throw new Error(`Failed to transcribe audio with AssemblyAI: ${message}`);
        }
    }

    private async pollForResult(transcriptId: string): Promise<string> {
        const url = `${this.getApiBaseUrl()}/v2/transcript/${transcriptId}`;

        for (let attempt = 0; attempt < this.MAX_POLL_ATTEMPTS; attempt++) {
            const result = await this.makeAPIRequest<AssemblyAITranscriptionResponse>(
                url,
                'GET',
                {},
                null
            );

            if (result.status === 'completed') {
                return this.parseTranscriptionResponse(result);
            }

            if (result.status === 'error') {
                throw new Error(result.error || 'AssemblyAI transcription failed');
            }

            await this.sleep(this.POLL_INTERVAL_MS);
        }

        throw new Error('AssemblyAI transcription timed out');
    }

    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => window.setTimeout(resolve, ms));
    }

    // AssemblyAI uses a bare `Authorization: <key>` header (no `Bearer` prefix).
    protected async makeAPIRequest<T = unknown>(
        endpoint: string,
        method: string,
        headers: Record<string, string>,
        body: string | ArrayBuffer | null
    ): Promise<T> {
        const requestHeaders: Record<string, string> = {
            'Authorization': this.getApiKey(),
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

        return response.json as T;
    }
}
