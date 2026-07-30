import { requestUrl } from 'obsidian';
import { NeuroVoxSettings } from '../settings/Settings';
import {
    ChatCompletionResponse,
    TranscriptionResponse,
    DeepgramTranscriptionResponse,
    MoonshineTranscriptionResponse,
    AssemblyAITranscriptionResponse,
    ModelListResponse
} from '../types';

export enum AIProvider {
    OpenAI = 'openai',
    Groq = 'groq',
    Deepgram = 'deepgram',
    Moonshine = 'moonshine',
    OpenRouter = 'openrouter',
    AssemblyAI = 'assemblyai',
}

export interface AIModel {
    id: string;
    name: string;
    category: 'transcription' | 'language';
    maxTokens?: number;
}

export const AIModels: Record<AIProvider, AIModel[]> = {
    [AIProvider.OpenAI]: [
        { id: 'whisper-1', name: 'Whisper', category: 'transcription' },
        { id: 'gpt-4o-mini-transcribe', name: 'GPT-4o Mini Transcribe', category: 'transcription' },
        { id: 'gpt-4o-transcribe', name: 'GPT-4o Transcribe', category: 'transcription' },
        { id: 'gpt-4o', name: 'GPT 4o', category: 'language', maxTokens: 16000 },
        { id: 'gpt-4o-mini', name: 'GPT 4o Mini', category: 'language', maxTokens: 16000 },
        { id: 'gpt-5', name: 'GPT 5', category: 'language', maxTokens: 400000 },
        { id: 'gpt-5-mini', name: 'GPT 5 Mini', category: 'language', maxTokens: 400000 },
        { id: 'gpt-5-nano', name: 'GPT 5 Nano', category: 'language', maxTokens: 400000 },
    ],
    [AIProvider.Groq]: [
        { id: 'whisper-large-v3-turbo', name: 'Whisper Large v3 Turbo', category: 'transcription' },
        { id: 'whisper-large-v3', name: 'Whisper Large v3', category: 'transcription' },
        { id: 'llama-3.3-70b-versatile', name: 'Llama 3.3 70B Versatile', category: 'language', maxTokens: 32768 },
        { id: 'llama-3.1-8b-instant', name: 'Llama 3.1 8B Instant', category: 'language', maxTokens: 131072 },
        { id: 'meta-llama/llama-4-scout-17b-16e-instruct', name: 'Llama 4 Scout 17B', category: 'language', maxTokens: 8192 },
        { id: 'meta-llama/llama-4-maverick-17b-128e-instruct', name: 'Llama 4 Maverick 17B', category: 'language', maxTokens: 8192 },
        { id: 'qwen/qwen3-32b', name: 'Qwen 3 32B', category: 'language', maxTokens: 40960 },
        { id: 'moonshotai/kimi-k2-instruct-0905', name: 'Kimi K2', category: 'language', maxTokens: 16384 },
        { id: 'openai/gpt-oss-20b', name: 'OpenAI GPT-OSS 20B', category: 'language', maxTokens: 32768 },
        { id: 'openai/gpt-oss-120b', name: 'OpenAI GPT-OSS 120B', category: 'language', maxTokens: 32768 },
    ],
    [AIProvider.Deepgram]: [
        { id: 'nova-3', name: 'Nova-3', category: 'transcription' },
        { id: 'nova-3-medical', name: 'Nova-3 Medical', category: 'transcription' },
        { id: 'nova-2', name: 'Nova-2', category: 'transcription' },
    ],
    [AIProvider.Moonshine]: [
        { id: 'moonshine-tiny', name: 'Moonshine Tiny (27M, ~50MB)', category: 'transcription' },
        { id: 'moonshine-base', name: 'Moonshine Base (62M, ~400MB)', category: 'transcription' },
    ],
    [AIProvider.OpenRouter]: [
        // Fallback list only — replaced at runtime by fetchLanguageModels() (the live /models catalog).
        { id: 'anthropic/claude-sonnet-4.5', name: 'Claude Sonnet 4.5', category: 'language', maxTokens: 200000 },
        { id: 'openai/gpt-5-mini', name: 'GPT-5 Mini', category: 'language', maxTokens: 400000 },
        { id: 'google/gemini-2.5-flash', name: 'Gemini 2.5 Flash', category: 'language', maxTokens: 1000000 },
    ],
    [AIProvider.AssemblyAI]: [
        { id: 'universal-3-pro', name: 'Universal-3 Pro (best accuracy)', category: 'transcription' },
        { id: 'universal-2', name: 'Universal-2', category: 'transcription' },
    ],
};

/**
 * Runtime cache of models fetched from provider /models endpoints, keyed by provider.
 * Populated by AIAdapter.fetchLanguageModels(); consulted by getModelInfo() so token
 * limits resolve for dynamically-discovered model ids too.
 */
const dynamicModels: Partial<Record<AIProvider, AIModel[]>> = {};

export function getDynamicModels(provider: AIProvider): AIModel[] | undefined {
    return dynamicModels[provider];
}

export function getModelInfo(modelId: string): AIModel | undefined {
    let dynamic: AIModel | undefined;
    for (const models of Object.values(dynamicModels)) {
        const found = models?.find(m => m.id === modelId);
        if (found) { dynamic = found; break; }
    }

    let staticModel: AIModel | undefined;
    for (const models of Object.values(AIModels)) {
        const found = models.find(m => m.id === modelId);
        if (found) { staticModel = found; break; }
    }

    // Prefer the dynamic entry but backfill maxTokens from the static catalog when the
    // /models endpoint didn't report a context length (e.g. OpenAI/Groq).
    if (dynamic) {
        return { ...dynamic, maxTokens: dynamic.maxTokens ?? staticModel?.maxTokens };
    }
    return staticModel;
}

export abstract class AIAdapter {
    public models: AIModel[];
    private keyValidated: boolean = false;
    private lastValidatedKey: string = '';

    protected constructor(
        protected settings: NeuroVoxSettings,
        protected provider: AIProvider
    ) {
        this.models = AIModels[provider];
    }

    // Abstract methods
    public abstract getApiKey(): string;
    protected abstract setApiKeyInternal(key: string): void;
    protected abstract getApiBaseUrl(): string;
    protected abstract getTextGenerationEndpoint(): string;
    protected abstract getTranscriptionEndpoint(): string;
    protected abstract validateApiKeyImpl(): Promise<boolean>;
    protected abstract parseTextGenerationResponse(response: ChatCompletionResponse): string;
    protected abstract parseTranscriptionResponse(
        response: TranscriptionResponse | DeepgramTranscriptionResponse | MoonshineTranscriptionResponse | AssemblyAITranscriptionResponse | string
    ): string;

    /**
     * Endpoint (relative to the API base URL) that returns the provider's model catalog in
     * the OpenAI-compatible `{ data: [...] }` shape. Return null for providers without one.
     */
    protected getModelListEndpoint(): string | null {
        return null;
    }

    /**
     * Fetches the provider's language/chat models from its /models endpoint and caches them
     * for the session. Falls back to the static AIModels language entries on any failure.
     * Providers without a model-list endpoint just return their static language models.
     */
    public async fetchLanguageModels(): Promise<AIModel[]> {
        const staticLanguage = this.models.filter(m => m.category === 'language');

        // Serve the session cache once populated to avoid refetching on every settings render.
        const cached = dynamicModels[this.provider];
        if (cached) {
            return cached;
        }

        const endpoint = this.getModelListEndpoint();
        if (!endpoint || !this.getApiKey()) {
            return staticLanguage;
        }

        try {
            const response = await this.makeAPIRequest<ModelListResponse>(
                `${this.getApiBaseUrl()}${endpoint}`,
                'GET',
                {},
                null
            );
            const parsed = this.parseModelList(response);
            if (parsed.length > 0) {
                dynamicModels[this.provider] = parsed;
                return parsed;
            }
        } catch {
            // Fall through to static list on network / parse errors.
        }
        return staticLanguage;
    }

    /**
     * Maps an OpenAI-compatible model list into language AIModels. Providers with richer
     * metadata (e.g. OpenRouter) may override this to filter by modality / context length.
     */
    protected parseModelList(response: ModelListResponse): AIModel[] {
        if (!response?.data) return [];
        return response.data
            .map(m => ({ id: m.id, name: m.id, category: 'language' as const }))
            .sort((a, b) => a.name.localeCompare(b.name));
    }

    public setApiKey(key: string): void {
        const currentKey = this.getApiKey();
        if (key !== currentKey) {
            this.keyValidated = false;
            this.lastValidatedKey = '';
        }
        this.setApiKeyInternal(key);
    }

    public async generateResponse(prompt: string, model: string, options?: { maxTokens?: number, temperature?: number }): Promise<string> {
        try {
            const endpoint = `${this.getApiBaseUrl()}${this.getTextGenerationEndpoint()}`;
            const body = {
                model,
                messages: [{ role: "user", content: prompt }],
                max_tokens: options?.maxTokens || 1000,
                temperature: options?.temperature || 0.7,
            };
            const response = await this.makeAPIRequest<ChatCompletionResponse>(
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

    /**
     * Upper bound on how long one transcription call may legitimately take. The streaming
     * drain derives its stall timeout from this, so providers with long-running flows
     * (AssemblyAI's upload+poll) must override it — otherwise their segments get cut off
     * mid-flight and dropped.
     */
    public getTranscriptionTimeoutMs(): number {
        return 120_000;
    }

    public async transcribeAudio(audioArrayBuffer: ArrayBuffer, model: string, signal?: AbortSignal): Promise<string> {
        try {
            this.throwIfAborted(signal);
            const { headers, body } = await this.prepareTranscriptionRequest(audioArrayBuffer, model);
            const endpoint = `${this.getApiBaseUrl()}${this.getTranscriptionEndpoint()}`;

            const response = await this.makeAPIRequest<TranscriptionResponse>(
                endpoint,
                'POST',
                headers,
                body
            );
            return this.parseTranscriptionResponse(response);
        } catch (error) {
            const message = this.getErrorMessage(error);
            throw new Error(`Failed to transcribe audio: ${message}`);
        }
    }

    public async validateApiKey(): Promise<boolean> {
        try {
            const currentKey = this.getApiKey();
            
            if (!currentKey) {
                this.keyValidated = false;
                this.lastValidatedKey = '';
                return false;
            }

            // Return cached validation if key hasn't changed
            if (this.keyValidated && this.lastValidatedKey === currentKey) {
                return true;
            }

            // Otherwise validate the key
            const isValid = await this.validateApiKeyImpl();
            if (isValid) {
                this.keyValidated = true;
                this.lastValidatedKey = currentKey;
            } else {
                this.keyValidated = false;
                this.lastValidatedKey = '';
            }

            return isValid;
        } catch {
            this.keyValidated = false;
            this.lastValidatedKey = '';
            return false;
        }
    }

    public getAvailableModels(category: 'transcription' | 'language'): AIModel[] {
        return this.models.filter(model => model.category === category);
    }

    public isReady(category: 'transcription' | 'language' = 'transcription'): boolean {
        const currentKey = this.getApiKey();
        if (!currentKey) return false;
        return this.keyValidated && this.lastValidatedKey === currentKey;
    }

    /**
     * Auth headers for this provider. Most APIs take `Bearer <key>`; providers with a
     * different scheme (Deepgram's `Token <key>`, AssemblyAI's bare key) override this
     * instead of duplicating makeAPIRequest.
     */
    protected getAuthHeaders(): Record<string, string> {
        return { 'Authorization': `Bearer ${this.getApiKey()}` };
    }

    /** Throws an AbortError-shaped error if the signal has been aborted. */
    protected throwIfAborted(signal?: AbortSignal): void {
        if (signal?.aborted) {
            throw new Error('Transcription aborted');
        }
    }

    protected async makeAPIRequest<T = unknown>(
        endpoint: string,
        method: string,
        headers: Record<string, string>,
        body: string | ArrayBuffer | null
    ): Promise<T> {
        const requestHeaders: Record<string, string> = {
            ...this.getAuthHeaders(),
            ...headers
        };

        // throw:false so error responses can be read: with throw:true, requestUrl throws a
        // bare "status 4xx" error and the provider's body — which says exactly what was
        // wrong with the request — is discarded.
        const response = await requestUrl({
            url: endpoint,
            method,
            headers: requestHeaders,
            body: body || undefined,
            throw: false
        });

        if (response.status >= 400) {
            throw new Error(`HTTP ${response.status}: ${this.extractErrorDetail(response) || 'no error detail in response'}`);
        }

        if (!response.json) {
            throw new Error('Invalid response format');
        }

        return response.json as T;
    }

    /** Pulls a human-readable error message out of a provider error response body. */
    private extractErrorDetail(response: { json: unknown; text: string }): string {
        try {
            const json = response.json as { error?: { message?: string } | string; message?: string } | null;
            const detail =
                (typeof json?.error === 'object' ? json.error?.message : json?.error) ||
                json?.message ||
                response.text ||
                '';
            return String(detail).slice(0, 300);
        } catch {
            // response.json is a parsing getter and throws on non-JSON bodies.
            try {
                return (response.text || '').slice(0, 300);
            } catch {
                return '';
            }
        }
    }

    protected async prepareTranscriptionRequest(audioArrayBuffer: ArrayBuffer, model: string): Promise<{
        headers: Record<string, string>;
        body: ArrayBuffer;
    }> {
        // Simple boundary without special characters
        const boundary = 'boundary';
        const encoder = new TextEncoder();
        
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
