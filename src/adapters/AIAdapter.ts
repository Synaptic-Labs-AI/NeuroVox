import { requestUrl } from 'obsidian';
import { NeuroVoxSettings } from '../settings/Settings';
import { ApiRequestError, getStatus, isAuthError } from './ApiError';
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

/**
 * Outcome of checking a provider credential.
 *
 * `rejected` and `unreachable` are deliberately distinct: only the first says anything about
 * the key itself. Collapsing them (as a bare boolean does) means a dropped Wi-Fi connection
 * gets reported as an invalid key and blocks a recording the user could have made.
 */
export type ApiKeyStatus = 'valid' | 'missing' | 'rejected' | 'unreachable';

export interface ApiKeyCheck {
    status: ApiKeyStatus;
    /** Provider's own explanation, when there was one. */
    message?: string;
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
        { id: 'gpt-5.6-sol', name: 'GPT-5.6 Sol', category: 'language', maxTokens: 400000 },
        { id: 'gpt-5.6-terra', name: 'GPT-5.6 Terra', category: 'language', maxTokens: 400000 },
        { id: 'gpt-5.6-luna', name: 'GPT-5.6 Luna', category: 'language', maxTokens: 400000 },
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

/**
 * Model ids that are neither chat nor speech-to-text. A provider's /models endpoint lists its
 * whole product line — embeddings, image, TTS, moderation — and none of that belongs in a
 * transcription or post-processing picker.
 */
const NON_TEXT_MODEL_PATTERN = /(embedding|moderation|dall-e|sora|tts|image|realtime|audio-preview|search-preview|computer-use|guard|rerank)/i;

/** Ids that identify a speech-to-text model across OpenAI-compatible providers. */
const TRANSCRIPTION_MODEL_PATTERN = /(whisper|transcribe|speech-to-text)/i;

/**
 * Classifies a model id from a live catalog, or returns null for models this plugin has no
 * use for. Matching on the id rather than on a list of known model families is what keeps the
 * picker working for models released after this code was written.
 */
export function classifyModelId(id: string): 'language' | 'transcription' | null {
    if (TRANSCRIPTION_MODEL_PATTERN.test(id)) return 'transcription';
    if (NON_TEXT_MODEL_PATTERN.test(id)) return null;
    return 'language';
}

/**
 * Merges a live catalog over the static one. Live entries win on id (their metadata is
 * current); static entries the endpoint didn't list are kept, so a provider that only
 * publishes part of its line-up never removes a model the user already relies on.
 */
export function mergeModelCatalogs(live: AIModel[], fallback: AIModel[]): AIModel[] {
    const byId = new Map<string, AIModel>();
    for (const model of fallback) byId.set(model.id, model);
    for (const model of live) {
        const existing = byId.get(model.id);
        byId.set(model.id, { ...model, maxTokens: model.maxTokens ?? existing?.maxTokens });
    }
    return Array.from(byId.values()).sort((a, b) => a.name.localeCompare(b.name));
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
    /**
     * Performs one cheap authenticated call against the provider. Must THROW on failure
     * rather than return a boolean, so verifyApiKey() can read the HTTP status off the
     * error and tell a refused key apart from an unreachable provider.
     */
    protected abstract probeApiKey(): Promise<void>;
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
     * Fetches the provider's live model catalog and caches it for the session.
     *
     * The hardcoded AIModels table goes stale the moment a provider ships something new, so
     * it is only a fallback: whenever the provider exposes a catalog endpoint, that endpoint
     * is the source of truth. Any failure (no endpoint, no key, network, unexpected shape)
     * falls back to the static list rather than leaving the user with an empty picker.
     */
    public async fetchModels(): Promise<AIModel[]> {
        // Serve the session cache once populated to avoid refetching on every settings render.
        const cached = dynamicModels[this.provider];
        if (cached) {
            return cached;
        }

        const endpoint = this.getModelListEndpoint();
        if (!endpoint || (this.requiresApiKey() && !this.getApiKey())) {
            return this.models;
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
                const merged = mergeModelCatalogs(parsed, this.models);
                dynamicModels[this.provider] = merged;
                return merged;
            }
        } catch {
            // Fall through to static list on network / parse errors.
        }
        return this.models;
    }

    /** Live language/chat models, or the static ones when the catalog is unavailable. */
    public async fetchLanguageModels(): Promise<AIModel[]> {
        return (await this.fetchModels()).filter(m => m.category === 'language');
    }

    /** Live transcription models, or the static ones when the catalog is unavailable. */
    public async fetchTranscriptionModels(): Promise<AIModel[]> {
        return (await this.fetchModels()).filter(m => m.category === 'transcription');
    }

    /**
     * Maps an OpenAI-compatible model list into AIModels, classifying each id by name.
     * Providers with richer metadata (e.g. OpenRouter) override this.
     */
    protected parseModelList(response: ModelListResponse): AIModel[] {
        if (!response?.data) return [];
        const models: AIModel[] = [];
        for (const entry of response.data) {
            const category = classifyModelId(entry.id);
            if (!category) continue;
            models.push({
                id: entry.id,
                name: entry.name || entry.id,
                category,
                maxTokens: entry.context_length
            });
        }
        return models.sort((a, b) => a.name.localeCompare(b.name));
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
        const endpoint = `${this.getApiBaseUrl()}${this.getTextGenerationEndpoint()}`;
        const maxTokens = options?.maxTokens ?? 1000;
        // ?? not ||: a deliberate temperature of 0 must not be silently rewritten to 0.7.
        const temperature = options?.temperature ?? 0.7;

        let body: Record<string, unknown> = {
            model,
            messages: [{ role: "user", content: prompt }],
            max_tokens: maxTokens,
            temperature,
        };

        // Newer reasoning models reject `max_tokens` in favour of `max_completion_tokens`,
        // and reject any `temperature` other than their default. Which models those are
        // cannot be hardcoded here — the model catalog is fetched live from the provider and
        // new models ship constantly — so send the conventional body and let the provider's
        // own 400 say what to drop, then retry with a corrected one. Each adjustment removes
        // a parameter, so the loop always terminates.
        const maxAttempts = 3;
        for (let attempt = 1; ; attempt++) {
            try {
                const response = await this.makeAPIRequest<ChatCompletionResponse>(
                    endpoint,
                    'POST',
                    { 'Content-Type': 'application/json' },
                    JSON.stringify(body)
                );
                this.assertGeneratedText(response, model, maxTokens);
                return this.parseTextGenerationResponse(response);
            } catch (error) {
                const corrected = attempt < maxAttempts ? adjustChatBodyForParameterError(body, error) : null;
                if (corrected) {
                    body = corrected;
                    continue;
                }
                throw new ApiRequestError(
                    `Failed to generate response: ${this.getErrorMessage(error)}`,
                    { status: getStatus(error) }
                );
            }
        }
    }

    /**
     * Catches the reasoning-model failure that otherwise surfaces as an opaque "invalid
     * response format": the model spent the whole token budget thinking and returned an
     * empty message. The fix is a settings change, so the error has to say so.
     */
    private assertGeneratedText(response: ChatCompletionResponse, model: string, maxTokens: number): void {
        const choice = response?.choices?.[0];
        if (choice && !choice.message?.content?.trim() && choice.finish_reason === 'length') {
            throw new ApiRequestError(
                `${model} used its entire ${maxTokens}-token budget before producing any text. ` +
                `Raise "Maximum post-processing length" in settings, or pick a different model.`
            );
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
            // Rethrow as ApiRequestError so the status survives: it decides whether the
            // caller retries and whether a pre-flight check calls the key rejected.
            throw new ApiRequestError(
                `Failed to transcribe audio: ${this.getErrorMessage(error)}`,
                { status: getStatus(error) }
            );
        }
    }

    public async validateApiKey(): Promise<boolean> {
        return (await this.verifyApiKey()).status === 'valid';
    }

    /**
     * Checks the configured credential against the provider, distinguishing "refused" from
     * "couldn't ask". A successful check is cached for the session; a failed one is not, so
     * fixing a key in settings takes effect without reloading the plugin.
     */
    public async verifyApiKey(): Promise<ApiKeyCheck> {
        const currentKey = this.getApiKey();

        if (!currentKey && this.requiresApiKey()) {
            this.keyValidated = false;
            this.lastValidatedKey = '';
            return { status: 'missing' };
        }

        if (this.keyValidated && this.lastValidatedKey === currentKey) {
            return { status: 'valid' };
        }

        try {
            await this.probeApiKey();
            this.keyValidated = true;
            this.lastValidatedKey = currentKey;
            return { status: 'valid' };
        } catch (error) {
            this.keyValidated = false;
            this.lastValidatedKey = '';
            const message = this.getErrorMessage(error);
            // Only 401/403 condemns the key. Everything else — offline, provider outage, a
            // retired model behind the probe endpoint — says nothing about the credential,
            // and must not be reported to the user as an invalid key.
            return { status: isAuthError(error) ? 'rejected' : 'unreachable', message };
        }
    }

    /** False for local providers (Moonshine), which have nothing to authenticate. */
    public requiresApiKey(): boolean {
        return true;
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

    /**
     * Non-auth headers this provider expects on every request (e.g. OpenRouter's
     * app-attribution pair). Merged under the per-call headers, which win.
     */
    protected getExtraHeaders(): Record<string, string> {
        return {};
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
            ...this.getExtraHeaders(),
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
            const detail = this.extractErrorDetail(response);
            throw new ApiRequestError(
                `HTTP ${response.status}: ${detail || 'no error detail in response'}`,
                { status: response.status, detail }
            );
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

/**
 * Given a provider's rejection of a chat request, returns a corrected body when the
 * complaint was about a parameter we can adapt, or null when it was about anything else.
 *
 * Only 400/422 responses are considered: those are the provider saying the request itself
 * was malformed. The parameter names are matched against the provider's message rather than
 * against a list of model families, so models released after this code still work.
 */
export function adjustChatBodyForParameterError(
    body: Record<string, unknown>,
    error: unknown
): Record<string, unknown> | null {
    const status = getStatus(error);
    if (status !== 400 && status !== 422) return null;

    const message = (error instanceof Error ? error.message : String(error)).toLowerCase();
    const next = { ...body };
    let changed = false;

    // "Unsupported parameter: 'max_tokens' is not supported with this model.
    //  Use 'max_completion_tokens' instead."
    if ('max_tokens' in next && message.includes('max_tokens')) {
        next.max_completion_tokens = next.max_tokens;
        delete next.max_tokens;
        changed = true;
    }

    // "Unsupported value: 'temperature' does not support 0.7 with this model.
    //  Only the default (1) value is supported."
    if ('temperature' in next && message.includes('temperature')) {
        delete next.temperature;
        changed = true;
    }

    return changed ? next : null;
}
