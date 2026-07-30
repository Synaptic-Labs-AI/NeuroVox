// src/utils/transcription/StreamingTranscriptionService.test.ts
//
// Tests for the streaming transcription pipeline with the disk-spill queue:
//  - stop-time drain: every queued segment is transcribed, none dropped (the
//    1.1.4 truncation regression);
//  - spill lifecycle: queued audio lives on disk, not in memory, and every
//    temp file is deleted once handled;
//  - per-segment timeout: one hung provider request cannot stall the drain or
//    silently discard the segments behind it;
//  - honest partial results: failed/dropped segments are called out in the
//    transcript instead of being silently omitted.
//
// The service's import chain reaches the 'obsidian' package, which ships type
// declarations only (no runtime JS); test/obsidian-stub-loader.mjs (registered
// in the npm test script) redirects it to a runtime stub. Run with: npm test

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { ChunkMetadata } from '../../types';
import { SegmentStore } from '../audio/SegmentStore';
import { MemoryAdapter } from '../../../test/memory-adapter';

// Browser-ish globals the import chain touches (sleep(), timers).
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

interface Harness {
    service: InstanceType<ServiceModule['StreamingTranscriptionService']>;
    adapter: MemoryAdapter;
}

/**
 * Builds a service wired to an in-memory disk adapter and a stubbed
 * transcription backend with the given behavior and per-segment timeout.
 * The stub receives the call index (order segments reach the backend) and the
 * audio buffer — key text off the buffer when earlier segments may never
 * reach the backend at all.
 */
async function makeService(
    transcribe: (callIndex: number, buffer: ArrayBuffer) => Promise<string>,
    segmentTimeoutMs = 5_000
): Promise<Harness> {
    const { StreamingTranscriptionService } = (await import(
        './StreamingTranscriptionService'
    )) as ServiceModule;

    const adapter = new MemoryAdapter();
    const store = new SegmentStore(adapter, 'plugins/neurovox/segments-tmp');
    const service = new StreamingTranscriptionService(
        fakePlugin as never,
        undefined,
        store
    );

    let calls = 0;
    (service as unknown as {
        transcriptionService: {
            transcribeAudioOnly(buf: ArrayBuffer, signal?: AbortSignal): Promise<string>;
            getTranscriptionTimeoutMs(): number;
        };
    }).transcriptionService = {
        transcribeAudioOnly: (buf: ArrayBuffer) => transcribe(calls++, buf),
        getTranscriptionTimeoutMs: () => segmentTimeoutMs
    };

    return { service, adapter };
}

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

describe('StreamingTranscriptionService drain-on-stop', () => {
    it('transcribes every queued segment when finishProcessing is called while segments are still pending', async () => {
        // Each transcription is slow relative to how fast segments arrive, so
        // most of them are still queued when finishProcessing() runs — the
        // exact shape of the original truncation bug.
        const { service } = await makeService(async i => {
            await delay(40);
            return `text-${i}`;
        });

        for (let i = 0; i < 4; i++) {
            const added = await service.addChunk(new Blob(['aaaa']), makeMetadata(i));
            assert.equal(added, true, `chunk ${i} should be accepted`);
        }

        const result = await service.finishProcessing();

        for (let i = 0; i < 4; i++) {
            assert.match(result, new RegExp(`text-${i}`), `segment ${i} must appear in the final transcript`);
        }
        assert.match(result, /Segments: 4/, 'all four segments must be counted in the result metadata');
        assert.doesNotMatch(result, /Incomplete transcript/, 'a fully-transcribed recording must not be flagged incomplete');
    });

    it('keeps later segments and flags the transcript when one mid-queue segment fails', async () => {
        const { service } = await makeService(async i => {
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
        assert.match(result, /Incomplete transcript/, 'a partial transcript must say so');
        assert.match(result, /1 segment could not be transcribed/);
        assert.match(result, /provider hiccup/, 'the marker should carry the underlying cause');
    });

    it('surfaces the underlying error when every segment fails', async () => {
        const { service } = await makeService(async () => {
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

describe('StreamingTranscriptionService disk spill', () => {
    it('spills queued segments to disk and deletes every file once drained', async () => {
        const { service, adapter } = await makeService(async i => {
            await delay(40);
            return `text-${i}`;
        });

        for (let i = 0; i < 4; i++) {
            await service.addChunk(new Blob(['aaaa']), makeMetadata(i));
        }

        // With transcription slow, the backlog must be sitting on disk right now.
        assert.ok(adapter.files.size >= 2, `expected a disk backlog, found ${adapter.files.size} file(s)`);

        await service.finishProcessing();

        assert.equal(adapter.files.size, 0, 'all segment temp files must be deleted after the drain');
    });

    it('deletes the temp file even when a segment fails to transcribe', async () => {
        const { service, adapter } = await makeService(async () => {
            await delay(10);
            throw new Error('boom');
        });

        await service.addChunk(new Blob(['aaaa']), makeMetadata(0));
        await service.finishProcessing().catch(() => { /* all-fail throws; files must still be cleaned */ });

        assert.equal(adapter.files.size, 0);
    });

    it('reports a rejected segment when the disk write fails, so the caller can transcribe it directly', async () => {
        const { service, adapter } = await makeService(async i => `direct-${i}`);
        adapter.failWrites = true;

        const added = await service.addChunk(new Blob(['aaaa']), makeMetadata(0));
        assert.equal(added, false, 'addChunk must not pretend a failed spill was queued');

        // The caller's fallback path: transcribe the blob directly.
        await service.transcribeFinalBlob(new Blob(['aaaa']), makeMetadata(0));
        const result = await service.finishProcessing();
        assert.match(result, /direct-0/);
    });

    it('abort removes queued segment files', async () => {
        const { service, adapter } = await makeService(async () => {
            await delay(5_000); // effectively never within this test
            return 'unreachable';
        }, 10_000);

        for (let i = 0; i < 3; i++) {
            await service.addChunk(new Blob(['aaaa']), makeMetadata(i));
        }
        assert.ok(adapter.files.size >= 2);

        service.abort();
        await delay(50);

        // The in-flight segment's file is released by the loop; the queued ones by abort().
        assert.ok(adapter.files.size <= 1, `expected queued files removed, found ${adapter.files.size}`);
    });
});

describe('StreamingTranscriptionService per-segment timeout', () => {
    it('times out a hung segment and still transcribes the segments behind it', async () => {
        // Segment 1 never resolves — the shape of a provider request that hangs
        // (requestUrl cannot be aborted). With a 200ms per-segment budget the
        // drain must move on and transcribe segments 0 and 2.
        const { service } = await makeService(i => {
            if (i === 1) return new Promise<string>(() => { /* hangs forever */ });
            return delay(20).then(() => `text-${i}`);
        }, 200);

        for (let i = 0; i < 3; i++) {
            await service.addChunk(new Blob(['aaaa']), makeMetadata(i));
        }

        const result = await service.finishProcessing();

        assert.match(result, /text-0/);
        assert.doesNotMatch(result, /text-1/);
        assert.match(result, /text-2/, 'segments after a hung one must still be transcribed');
        assert.match(result, /Incomplete transcript/);
        assert.match(result, /timed out/, 'the marker should say the segment timed out');
    });

    it('discards a timed-out segment result that resolves late, instead of double-counting it', async () => {
        // Segment 1 times out (200ms budget) but its abandoned request resolves at
        // ~400ms, while segments 2 and 3 (150ms each, within budget) keep the drain
        // alive past that point. The late result must NOT be added to the transcript:
        // without the per-call abort guard the final note would contain text-1 AND an
        // "Incomplete transcript" warning caused by that same segment.
        const { service } = await makeService(i => {
            if (i === 1) return delay(400).then(() => 'text-1');
            if (i >= 2) return delay(150).then(() => `text-${i}`);
            return delay(20).then(() => `text-${i}`);
        }, 200);

        for (let i = 0; i < 4; i++) {
            await service.addChunk(new Blob(['aaaa']), makeMetadata(i));
        }

        const result = await service.finishProcessing();

        assert.match(result, /text-0/);
        assert.doesNotMatch(result, /text-1/, 'a late result for a timed-out segment must be discarded');
        assert.match(result, /text-2/);
        assert.match(result, /text-3/);
        assert.match(result, /Segments: 3/, 'the timed-out segment must not be re-added by its late result');
        assert.match(result, /1 segment could not be transcribed/, 'the timed-out segment is failed exactly once');
    });

    it('fails a segment whose disk read hangs, rather than stalling the drain forever', async () => {
        // Key transcript text off the audio bytes, not call order: segment 0 never
        // reaches the backend, so call indices would misattribute its text.
        const { service, adapter } = await makeService(
            async (_i, buf) => `text-${new TextDecoder().decode(buf)}`,
            200
        );

        // First segment's file read never settles — the shape of a wedged
        // vault-adapter call, which abort() cannot interrupt.
        const realRead = adapter.readBinary.bind(adapter);
        let firstRead = true;
        adapter.readBinary = (path: string) => {
            if (firstRead) {
                firstRead = false;
                return new Promise<ArrayBuffer>(() => { /* hangs forever */ });
            }
            return realRead(path);
        };

        await service.addChunk(new Blob(['aaaa']), makeMetadata(0));
        await service.addChunk(new Blob(['bbbb']), makeMetadata(1));

        const result = await service.finishProcessing();

        assert.doesNotMatch(result, /text-aaaa/);
        assert.match(result, /text-bbbb/, 'segments after a hung disk read must still be transcribed');
        assert.match(result, /Incomplete transcript/);
    });

    it('waits out a segment that is slow but within its budget', async () => {
        const { service } = await makeService(async i => {
            await delay(i === 0 ? 300 : 20); // slow first segment, well under the 5s budget
            return `text-${i}`;
        });

        await service.addChunk(new Blob(['aaaa']), makeMetadata(0));
        await service.addChunk(new Blob(['aaaa']), makeMetadata(1));

        const result = await service.finishProcessing();
        assert.match(result, /text-0/);
        assert.match(result, /text-1/);
        assert.doesNotMatch(result, /Incomplete transcript/);
    });
});

describe('StreamingTranscriptionService reuse', () => {
    it('can run a second drain after finishProcessing (drain state is reset)', async () => {
        const { service, adapter } = await makeService(async i => {
            await delay(10);
            return `text-${i}`;
        });

        await service.addChunk(new Blob(['aaaa']), makeMetadata(0));
        await service.finishProcessing();

        // Second recording on the same instance: the consumer loop must start
        // and drain again rather than exiting immediately on the stale
        // drainRequested flag.
        await service.addChunk(new Blob(['bbbb']), makeMetadata(1));
        const result = await service.finishProcessing();

        assert.match(result, /text-1/, 'segments from the second run must be transcribed');
        assert.doesNotMatch(result, /text-0/, "the first recording's transcript must not leak into the second");
        assert.match(result, /Segments: 1/);
        assert.equal(adapter.files.size, 0);
    });

    it('does not carry failures or errors from one recording into the next', async () => {
        const { service } = await makeService(async i => {
            await delay(10);
            if (i === 0) throw new Error('run-1 failure');
            return `text-${i}`;
        });

        // Run 1: its only segment fails, so it throws.
        await service.addChunk(new Blob(['aaaa']), makeMetadata(0));
        await assert.rejects(() => service.finishProcessing(), /run-1 failure/);

        // Run 2: fully successful — it must be clean, not flagged incomplete by
        // run 1's failure, and not fed run 1's stale error.
        await service.addChunk(new Blob(['bbbb']), makeMetadata(1));
        const result = await service.finishProcessing();

        assert.match(result, /text-1/);
        assert.doesNotMatch(result, /Incomplete transcript/, "run 1's failure must not mark run 2 incomplete");
        assert.doesNotMatch(result, /run-1 failure/);
    });

    it('throws for a fully-failed second run instead of returning the first run’s text', async () => {
        const { service } = await makeService(async i => {
            await delay(10);
            if (i === 1) throw new Error('run-2 failure');
            return `text-${i}`;
        });

        await service.addChunk(new Blob(['aaaa']), makeMetadata(0));
        const first = await service.finishProcessing();
        assert.match(first, /text-0/);

        await service.addChunk(new Blob(['bbbb']), makeMetadata(1));
        await assert.rejects(
            () => service.finishProcessing(),
            /run-2 failure/,
            "an all-failed second run must throw, not silently return the first run's transcript"
        );
    });
});
