// src/adapters/AIAdapter.test.ts
//
// Covers the adapter behaviour that the "expired key" and "post-processing failed"
// incidents depend on: telling a rejected key apart from an unreachable provider, and
// recovering from a provider rejecting request parameters.
//
// Run with: npm test

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
    AIAdapter,
    AIProvider,
    adjustChatBodyForParameterError,
    classifyModelId,
    mergeModelCatalogs,
    AIModel
} from './AIAdapter';
import { ApiRequestError } from './ApiError';
import { ChatCompletionResponse, TranscriptionResponse } from '../types';
import type { NeuroVoxSettings } from '../settings/Settings';

type RequestHandler = (body: Record<string, unknown>) => unknown;

/** Minimal concrete adapter whose HTTP layer is replaced by a scripted handler. */
class TestAdapter extends AIAdapter {
    public apiKey = 'test-key';
    public probeError: unknown = null;
    public probeCalls = 0;
    public sentBodies: Record<string, unknown>[] = [];
    private handlers: RequestHandler[] = [];

    constructor() {
        super({} as NeuroVoxSettings, AIProvider.OpenAI);
    }

    /** Queues one response (or thrown error) per successive request. */
    scriptResponses(...handlers: RequestHandler[]): void {
        this.handlers = handlers;
    }

    getApiKey(): string { return this.apiKey; }
    protected setApiKeyInternal(key: string): void { this.apiKey = key; }
    protected getApiBaseUrl(): string { return 'https://example.test'; }
    protected getTextGenerationEndpoint(): string { return '/chat/completions'; }
    protected getTranscriptionEndpoint(): string { return '/audio/transcriptions'; }

    protected async probeApiKey(): Promise<void> {
        this.probeCalls++;
        if (this.probeError) throw this.probeError;
    }

    protected parseTextGenerationResponse(response: ChatCompletionResponse): string {
        const content = response?.choices?.[0]?.message?.content;
        if (content) return content;
        throw new Error('Invalid response format');
    }

    protected parseTranscriptionResponse(response: TranscriptionResponse): string {
        return response.text;
    }

    protected async makeAPIRequest<T>(
        _endpoint: string,
        _method: string,
        _headers: Record<string, string>,
        body: string | ArrayBuffer | null
    ): Promise<T> {
        const parsed = typeof body === 'string'
            ? JSON.parse(body) as Record<string, unknown>
            : {};
        this.sentBodies.push(parsed);
        const handler = this.handlers.shift();
        if (!handler) throw new Error('no scripted response left');
        const result = handler(parsed);
        if (result instanceof Error) throw result;
        return result as T;
    }
}

const completion = (content: string, finishReason = 'stop'): ChatCompletionResponse => ({
    id: 'x', object: 'chat.completion', created: 0, model: 'test',
    choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: finishReason }]
});

describe('verifyApiKey', () => {
    it('reports a missing key without calling the provider', async () => {
        const adapter = new TestAdapter();
        adapter.apiKey = '';

        assert.deepEqual(await adapter.verifyApiKey(), { status: 'missing' });
        assert.equal(adapter.probeCalls, 0);
    });

    it('reports a 401 as rejected so recording can be blocked', async () => {
        const adapter = new TestAdapter();
        adapter.probeError = new ApiRequestError('HTTP 401: Invalid API Key', { status: 401 });

        const check = await adapter.verifyApiKey();
        assert.equal(check.status, 'rejected');
        assert.match(check.message ?? '', /401/);
    });

    it('reports a network failure as unreachable, not as a bad key', async () => {
        const adapter = new TestAdapter();
        // No status: the request never got a response. This must not be reported as an
        // invalid key, or a flaky connection would block a recording that could have run.
        adapter.probeError = new Error('net::ERR_NAME_NOT_RESOLVED');

        assert.equal((await adapter.verifyApiKey()).status, 'unreachable');
    });

    it('treats a 500 as unreachable rather than a bad key', async () => {
        const adapter = new TestAdapter();
        adapter.probeError = new ApiRequestError('HTTP 503: upstream down', { status: 503 });

        assert.equal((await adapter.verifyApiKey()).status, 'unreachable');
    });

    it('caches a success but re-checks after a failure', async () => {
        const adapter = new TestAdapter();

        assert.equal((await adapter.verifyApiKey()).status, 'valid');
        assert.equal((await adapter.verifyApiKey()).status, 'valid');
        assert.equal(adapter.probeCalls, 1, 'a valid key is checked once per session');

        adapter.probeError = new ApiRequestError('HTTP 401: expired', { status: 401 });
        adapter.setApiKey('rotated-key');
        assert.equal((await adapter.verifyApiKey()).status, 'rejected');
        assert.equal((await adapter.verifyApiKey()).status, 'rejected');
        assert.equal(adapter.probeCalls, 3, 'a failure is never cached, so fixes take effect');
    });
});

describe('generateResponse parameter recovery', () => {
    it('retries with max_completion_tokens when the model rejects max_tokens', async () => {
        const adapter = new TestAdapter();
        adapter.scriptResponses(
            () => new ApiRequestError(
                "HTTP 400: Unsupported parameter: 'max_tokens' is not supported with this " +
                "model. Use 'max_completion_tokens' instead.",
                { status: 400 }
            ),
            () => completion('summary')
        );

        const result = await adapter.generateResponse('hi', 'gpt-5.6-luna', { maxTokens: 2000 });

        assert.equal(result, 'summary');
        assert.equal(adapter.sentBodies[0].max_tokens, 2000);
        assert.equal(adapter.sentBodies[1].max_tokens, undefined);
        assert.equal(adapter.sentBodies[1].max_completion_tokens, 2000);
    });

    it('drops temperature when the model only accepts its default', async () => {
        const adapter = new TestAdapter();
        adapter.scriptResponses(
            () => new ApiRequestError(
                "HTTP 400: Unsupported value: 'temperature' does not support 0.7 with this " +
                "model. Only the default (1) value is supported.",
                { status: 400 }
            ),
            () => completion('summary')
        );

        assert.equal(await adapter.generateResponse('hi', 'gpt-5.6-luna'), 'summary');
        assert.equal(adapter.sentBodies[0].temperature, 0.7);
        assert.equal('temperature' in adapter.sentBodies[1], false);
    });

    it('recovers when the model rejects both parameters in turn', async () => {
        const adapter = new TestAdapter();
        adapter.scriptResponses(
            () => new ApiRequestError("HTTP 400: Unsupported parameter: 'max_tokens'", { status: 400 }),
            () => new ApiRequestError("HTTP 400: Unsupported value: 'temperature'", { status: 400 }),
            () => completion('summary')
        );

        assert.equal(await adapter.generateResponse('hi', 'gpt-5.6-luna'), 'summary');
        assert.equal(adapter.sentBodies.length, 3);
    });

    it('does not retry a 401 — a rejected key fails identically every time', async () => {
        const adapter = new TestAdapter();
        adapter.scriptResponses(() => new ApiRequestError('HTTP 401: Invalid API Key', { status: 401 }));

        await assert.rejects(
            () => adapter.generateResponse('hi', 'gpt-5.6-luna'),
            /401/
        );
        assert.equal(adapter.sentBodies.length, 1);
    });

    it('preserves the status so callers can skip pointless retries', async () => {
        const adapter = new TestAdapter();
        adapter.scriptResponses(() => new ApiRequestError('HTTP 401: nope', { status: 401 }));

        const error = await adapter.generateResponse('hi', 'm').catch((e: unknown) => e);
        assert.ok(error instanceof ApiRequestError);
        assert.equal(error.status, 401);
    });

    it('explains an empty reasoning response instead of "invalid response format"', async () => {
        const adapter = new TestAdapter();
        adapter.scriptResponses(() => completion('', 'length'));

        await assert.rejects(
            () => adapter.generateResponse('hi', 'gpt-5.6-luna', { maxTokens: 100 }),
            /entire 100-token budget/
        );
    });

    it('keeps a deliberate temperature of 0', async () => {
        const adapter = new TestAdapter();
        adapter.scriptResponses(() => completion('ok'));

        await adapter.generateResponse('hi', 'm', { temperature: 0 });
        assert.equal(adapter.sentBodies[0].temperature, 0);
    });

    it('sends max_completion_tokens up front when the adapter opts in (OpenAI)', async () => {
        class NewParamAdapter extends TestAdapter {
            protected chatMaxTokensParam(): 'max_tokens' | 'max_completion_tokens' {
                return 'max_completion_tokens';
            }
        }
        const adapter = new NewParamAdapter();
        adapter.scriptResponses(() => completion('ok'));

        await adapter.generateResponse('hi', 'gpt-5.6-luna', { maxTokens: 2000 });
        assert.equal(adapter.sentBodies[0].max_completion_tokens, 2000);
        assert.equal('max_tokens' in adapter.sentBodies[0], false);
    });

    it('falls back to max_tokens when a provider rejects max_completion_tokens', async () => {
        class NewParamAdapter extends TestAdapter {
            protected chatMaxTokensParam(): 'max_tokens' | 'max_completion_tokens' {
                return 'max_completion_tokens';
            }
        }
        const adapter = new NewParamAdapter();
        adapter.scriptResponses(
            () => new ApiRequestError(
                "HTTP 400: Unknown parameter: 'max_completion_tokens'.",
                { status: 400 }
            ),
            () => completion('summary')
        );

        assert.equal(await adapter.generateResponse('hi', 'older-model', { maxTokens: 500 }), 'summary');
        assert.equal(adapter.sentBodies[1].max_tokens, 500);
        assert.equal('max_completion_tokens' in adapter.sentBodies[1], false);
    });
});

describe('adjustChatBodyForParameterError', () => {
    const body = { model: 'm', max_tokens: 500, temperature: 0.7 };

    it('ignores errors that are not about parameters', () => {
        const error = new ApiRequestError('HTTP 400: model not found', { status: 400 });
        assert.equal(adjustChatBodyForParameterError(body, error), null);
    });

    it('ignores non-4xx failures', () => {
        const error = new ApiRequestError("HTTP 500: 'max_tokens' blew up", { status: 500 });
        assert.equal(adjustChatBodyForParameterError(body, error), null);
    });

    it('leaves the original body untouched', () => {
        const error = new ApiRequestError("HTTP 400: 'max_tokens' unsupported", { status: 400 });
        adjustChatBodyForParameterError(body, error);
        assert.equal(body.max_tokens, 500);
    });
});

describe('classifyModelId', () => {
    it('routes speech models to transcription', () => {
        assert.equal(classifyModelId('whisper-1'), 'transcription');
        assert.equal(classifyModelId('gpt-4o-transcribe'), 'transcription');
        assert.equal(classifyModelId('whisper-large-v3-turbo'), 'transcription');
    });

    it('routes chat models to language', () => {
        assert.equal(classifyModelId('gpt-5.6-luna'), 'language');
        assert.equal(classifyModelId('llama-3.3-70b-versatile'), 'language');
    });

    it('recognises current speech models, not just the Whisper generation', () => {
        assert.equal(classifyModelId('gpt-transcribe'), 'transcription');
    });

    it('drops models that belong in neither picker', () => {
        for (const id of ['text-embedding-3-large', 'dall-e-3', 'tts-1', 'omni-moderation-latest', 'llama-guard-4-12b']) {
            assert.equal(classifyModelId(id), null, id);
        }
    });

    it('drops Realtime speech models, which need a WebSocket session', () => {
        // These say "whisper"/"transcribe" but cannot be used through the multipart POST to
        // /v1/audio/transcriptions, so they must not reach the transcription picker.
        assert.equal(classifyModelId('gpt-realtime-whisper'), null);
        assert.equal(classifyModelId('gpt-realtime-translate'), null);
    });
});

describe('mergeModelCatalogs', () => {
    const live: AIModel[] = [{ id: 'gpt-5.6-luna', name: 'GPT-5.6 Luna', category: 'language' }];
    const fallback: AIModel[] = [
        { id: 'gpt-5.6-luna', name: 'stale name', category: 'language', maxTokens: 400000 },
        { id: 'gpt-4o', name: 'GPT 4o', category: 'language', maxTokens: 16000 }
    ];

    it('prefers live metadata but backfills a missing context length', () => {
        const merged = mergeModelCatalogs(live, fallback);
        const luna = merged.find(m => m.id === 'gpt-5.6-luna');
        assert.equal(luna?.name, 'GPT-5.6 Luna');
        assert.equal(luna?.maxTokens, 400000);
    });

    it('keeps static models the live catalog did not list', () => {
        assert.ok(mergeModelCatalogs(live, fallback).some(m => m.id === 'gpt-4o'));
    });
});
