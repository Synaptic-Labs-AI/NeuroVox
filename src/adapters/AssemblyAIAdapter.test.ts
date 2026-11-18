// A stale model default or wrong request parameter must fail before it reaches the API.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { AssemblyAIAdapter } from './AssemblyAIAdapter';
import { AIModels, AIProvider } from './AIAdapter';
import { DEFAULT_SETTINGS } from '../settings/Settings';

class CapturingAssemblyAIAdapter extends AssemblyAIAdapter {
    readonly requests: Array<{ url: string; method: string; body: unknown }> = [];

    protected async makeAPIRequest<T = unknown>(
        url: string, method: string, _headers: Record<string, string>, body: unknown
    ): Promise<T> {
        this.requests.push({ url, method, body });
        const result = url.endsWith('/v2/upload')
            ? { upload_url: 'https://example.com/audio.wav' }
            : method === 'POST'
                ? { id: 'transcript-id' }
                : { status: 'completed', text: 'Hello NeuroVox.' };
        return result as T;
    }
}

describe('AssemblyAI STT 3.7', () => {
    it('offers the recorded model first and keeps streaming models out of the chunk API', () => {
        const models = AIModels[AIProvider.AssemblyAI];
        assert.equal(models[0].id, 'assemblyai-stt-3-7');
        assert.ok(models.some(model => model.id === 'universal-3-pro'));
        assert.ok(models.some(model => model.id === 'universal-3-5-pro'));
        assert.ok(models.every(model => model.category === 'transcription' && !model.id.includes('realtime')));
    });

    for (const model of ['', 'assemblyai-stt-3-7', 'universal-3-pro', 'universal-2']) {
        it(`submits ${model || 'the fallback'} through upload, create and poll`, async () => {
            const adapter = new CapturingAssemblyAIAdapter(DEFAULT_SETTINGS);
            const result = await adapter.transcribeAudio(new ArrayBuffer(32), model);
            assert.equal(result, 'Hello NeuroVox.');
            const payload = JSON.parse(adapter.requests[1].body as string);
            assert.deepEqual(payload.speech_models, [model || 'assemblyai-stt-3-7']);
            assert.equal('speech_model' in payload, false);
            assert.equal(payload.disfluencies, !model || model === 'assemblyai-stt-3-7' ? false : undefined);
            assert.ok(adapter.requests[2].url.endsWith('/v2/transcript/transcript-id'));
        });
    }
});
