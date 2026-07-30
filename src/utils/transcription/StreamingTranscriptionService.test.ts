// src/utils/transcription/StreamingTranscriptionService.test.ts
//
// Regression tests for the stop-time drain behavior: finishProcessing() must
// transcribe every segment still waiting in the queue rather than killing the
// consumer loop immediately (which used to truncate long recordings to the
// first couple of segments).
//
// The service's import chain reaches the 'obsidian' package, which ships type
// declarations only (no runtime JS); test/obsidian-stub-loader.mjs (registered
// in the npm test script) redirects it to a runtime stub. Run with: npm test

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { ChunkMetadata } from '../../types';

// Browser-ish globals the import chain touches (DeviceDetection, sleep()).
(globalThis as unknown as { window: unknown }).window = globalThis;

type ServiceModule = typeof import('./StreamingTranscriptionService');

const fakePlugin = { settings: { includeTimestamps: false } };

function makeMetadata(index: number, durationMs = 30_000): ChunkMetadata {
    return {
        id: `segment_${index}`,
        index,
        duration: durationMs,
        timestamp: 1_000_000 + index * durationMs,
        size: 4
    };
}

/** Builds a service whose transcription backend is a stub with the given behavior. */
async function makeService(
    transcribe: (callIndex: number) => Promise<string>
): Promise<InstanceType<ServiceModule['StreamingTranscriptionService']>> {
    const { StreamingTranscriptionService } = (await import(
        './StreamingTranscriptionService'
    )) as ServiceModule;

    const service = new StreamingTranscriptionService(
        fakePlugin as never
    );

    let calls = 0;
    (service as unknown as {
        transcriptionService: { transcribeAudioOnly(buf: ArrayBuffer): Promise<string> };
    }).transcriptionService = {
        transcribeAudioOnly: () => transcribe(calls++)
    };

    return service;
}

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

describe('StreamingTranscriptionService drain-on-stop', () => {
    it('transcribes every queued segment when finishProcessing is called while segments are still pending', async () => {
        // Each transcription is slow relative to how fast segments arrive, so
        // most of them are still queued when finishProcessing() runs — the
        // exact shape of the original truncation bug.
        const service = await makeService(async i => {
            await delay(40);
            return `text-${i}`;
        });

        for (let i = 0; i < 4; i++) {
            const added = await service.addChunk(new Blob(['aaaa']), makeMetadata(i));
            assert.equal(added, true, `chunk ${i} should be accepted by the queue`);
        }

        const result = await service.finishProcessing();

        for (let i = 0; i < 4; i++) {
            assert.match(result, new RegExp(`text-${i}`), `segment ${i} must appear in the final transcript`);
        }
        assert.equal(service.getStats().processedChunks, 4);
    });

    it('keeps later segments when one mid-queue segment fails', async () => {
        const service = await makeService(async i => {
            await delay(20);
            if (i === 1) throw new Error('provider hiccup');
            return `text-${i}`;
        });

        for (let i = 0; i < 3; i++) {
            await service.addChunk(new Blob(['aaaa']), makeMetadata(i));
        }

        const result = await service.finishProcessing();

        assert.match(result, /text-0/);
        assert.doesNotMatch(result, /text-1/);
        assert.match(result, /text-2/, 'segments after a failed one must still be transcribed');
    });

    it('surfaces the underlying error when every segment fails', async () => {
        const service = await makeService(async () => {
            await delay(10);
            throw new Error('bad api key');
        });

        await service.addChunk(new Blob(['aaaa']), makeMetadata(0));

        await assert.rejects(
            () => service.finishProcessing(),
            /bad api key/
        );
    });
});
