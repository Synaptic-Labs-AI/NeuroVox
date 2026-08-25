// src/utils/ProviderReadiness.test.ts
//
// The guard that must stop a recording before the microphone opens when the configured
// transcription key cannot work. Run with: npm test

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { checkTranscriptionReadiness, checkPostProcessingReadiness } from './ProviderReadiness';
import { AIProvider, ApiKeyCheck } from '../adapters/AIAdapter';
import type NeuroVoxPlugin from '../main';

/** Stands in for an AIAdapter with a scripted key-check outcome. */
function fakeAdapter(check: ApiKeyCheck, requiresApiKey = true) {
    return {
        requiresApiKey: () => requiresApiKey,
        verifyApiKey: async (): Promise<ApiKeyCheck> => check
    };
}

function fakePlugin(options: {
    transcription?: ApiKeyCheck;
    postProcessing?: ApiKeyCheck;
    transcriptionModel?: string;
    generatePostProcessing?: boolean;
    localTranscription?: boolean;
}) {
    const adapters = new Map<AIProvider, unknown>([
        [AIProvider.Groq, fakeAdapter(options.transcription ?? { status: 'valid' }, !options.localTranscription)],
        [AIProvider.OpenRouter, fakeAdapter(options.postProcessing ?? { status: 'valid' })]
    ]);

    return {
        aiAdapters: adapters,
        settings: {
            transcriptionProvider: AIProvider.Groq,
            transcriptionModel: options.transcriptionModel ?? 'whisper-large-v3-turbo',
            postProcessingProvider: AIProvider.OpenRouter,
            generatePostProcessing: options.generatePostProcessing ?? true
        }
    } as unknown as NeuroVoxPlugin;
}

describe('checkTranscriptionReadiness', () => {
    it('blocks recording when the key is expired — the incident this exists to prevent', async () => {
        const result = await checkTranscriptionReadiness(fakePlugin({
            transcription: { status: 'rejected', message: 'HTTP 401: Invalid API Key' }
        }));

        assert.equal(result.ok, false);
        assert.match(result.reason ?? '', /Groq rejected your API key/);
    });

    it('blocks recording when no key is configured', async () => {
        const result = await checkTranscriptionReadiness(fakePlugin({
            transcription: { status: 'missing' }
        }));

        assert.equal(result.ok, false);
        assert.match(result.reason ?? '', /No Groq API key is set/);
    });

    it('blocks recording when no transcription model is selected', async () => {
        const result = await checkTranscriptionReadiness(fakePlugin({ transcriptionModel: '' }));

        assert.equal(result.ok, false);
        assert.match(result.reason ?? '', /No transcription model is selected/);
    });

    it('allows recording when the provider is merely unreachable', async () => {
        // Refusing to record because the network hiccuped would destroy audio the user
        // could have captured — and says nothing about whether the key is good.
        const result = await checkTranscriptionReadiness(fakePlugin({
            transcription: { status: 'unreachable', message: 'net::ERR_INTERNET_DISCONNECTED' }
        }));

        assert.equal(result.ok, true);
        assert.match(result.warning ?? '', /Could not reach Groq/);
    });

    it('allows a local provider that has no key at all', async () => {
        const result = await checkTranscriptionReadiness(fakePlugin({
            localTranscription: true,
            transcription: { status: 'missing' }
        }));

        assert.equal(result.ok, true);
    });

    it('passes a working setup through without warnings', async () => {
        const result = await checkTranscriptionReadiness(fakePlugin({}));

        assert.equal(result.ok, true);
        assert.equal(result.warning, undefined);
    });
});

describe('checkPostProcessingReadiness', () => {
    it('warns but never blocks on a bad post-processing key', async () => {
        // The transcript survives a failed summary now, so a bad summarizer key is not a
        // reason to refuse to record.
        const result = await checkPostProcessingReadiness(fakePlugin({
            postProcessing: { status: 'rejected', message: 'HTTP 401' }
        }));

        assert.equal(result.ok, true);
        assert.match(result.warning ?? '', /transcription will still be saved/);
    });

    it('says nothing when post-processing is turned off', async () => {
        const result = await checkPostProcessingReadiness(fakePlugin({
            generatePostProcessing: false,
            postProcessing: { status: 'rejected' }
        }));

        assert.equal(result.ok, true);
        assert.equal(result.warning, undefined);
    });
});
