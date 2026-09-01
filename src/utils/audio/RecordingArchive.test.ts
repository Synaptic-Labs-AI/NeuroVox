// src/utils/audio/RecordingArchive.test.ts
//
// Tests for the recording archive: the guarantee that a recording is written to the vault
// before transcription can fail it, and that segments left behind by a crash are recovered
// on the next load. Uses the in-memory adapter and a fake vault sink. Run with: npm test

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { RecordingArchive, RecordingSink, recoverOrphanedRecordings } from './RecordingArchive';
import { SegmentStore } from './SegmentStore';
import { buildWav, parseWav, WavFormat } from './WavSplitter';
import { MemoryAdapter } from '../../../test/memory-adapter';

const FMT: WavFormat = { numChannels: 1, sampleRate: 16000, bitsPerSample: 16, blockAlign: 2, byteRate: 32000 };

function wavBlob(bytes: number[]): Blob {
    return new Blob([buildWav(new Uint8Array(bytes), FMT)], { type: 'audio/wav' });
}

function pcmOf(buffer: ArrayBuffer): number[] {
    const parsed = parseWav(buffer);
    assert.ok(parsed, 'saved file must be a valid WAV');
    return [...new Uint8Array(buffer, parsed.dataOffset, parsed.dataSize)];
}

/** Fake recordings folder: remembers what was written, can be told to fail. */
class FakeSink implements RecordingSink {
    saved: Array<{ path: string; data: ArrayBuffer; extension: string }> = [];
    fail = false;
    async save(data: ArrayBuffer, baseName: string, extension: string): Promise<string> {
        if (this.fail) throw new Error('vault write failed');
        const path = `Recordings/${baseName}.${extension}`;
        this.saved.push({ path, data, extension });
        return path;
    }
}

const STARTED = new Date('2026-09-01T10:20:30.000Z');
const TMP = 'plugins/neurovox/segments-tmp';

function makeArchive(adapter = new MemoryAdapter(), sink = new FakeSink()) {
    const store = new SegmentStore(adapter, `${TMP}/rec-2026-09-01T10-20-30-000Z`);
    return { archive: new RecordingArchive(store, sink, STARTED), adapter, sink, store };
}

describe('RecordingArchive', () => {
    it('spills each segment to disk and joins them into one WAV in the recordings folder', async () => {
        const { archive, adapter, sink } = makeArchive();

        const p0 = await archive.addSegment(wavBlob([1, 2, 3, 4]));
        const p1 = await archive.addSegment(wavBlob([5, 6]));
        assert.ok(p0 && p1, 'segments must be spilled to disk');
        assert.equal(adapter.files.size, 2);

        const path = await archive.finalize();
        assert.equal(path, 'Recordings/recording-2026-09-01T10-20-30-000Z.wav');
        assert.equal(sink.saved.length, 1);
        assert.deepEqual(pcmOf(sink.saved[0].data), [1, 2, 3, 4, 5, 6]);

        // Files are released only in dispose(), after the transcription drain is done too.
        assert.equal(adapter.files.size, 2, 'finalize must not delete files the transcription queue may still read');
        await archive.dispose();
        assert.equal(adapter.files.size, 0);
        assert.equal(adapter.dirs.size, 0, 'the per-recording directory must be removed');
    });

    it('keeps a segment in memory when the disk spill fails and still saves it', async () => {
        const { archive, adapter, sink } = makeArchive();
        adapter.failWrites = true;

        const path = await archive.addSegment(wavBlob([7, 8]));
        assert.equal(path, null, 'a failed spill must be reported so the caller transcribes directly');

        adapter.failWrites = false;
        await archive.addSegment(wavBlob([9, 10]));

        await archive.finalize();
        assert.deepEqual(pcmOf(sink.saved[0].data), [7, 8, 9, 10], 'the in-memory segment must be included in order');
    });

    it('leaves the segment files on disk when the vault write fails, for later recovery', async () => {
        const { archive, adapter, sink } = makeArchive();
        sink.fail = true;
        await archive.addSegment(wavBlob([1, 2]));

        await assert.rejects(() => archive.finalize(), /vault write failed/);
        assert.equal(archive.getSavedPath(), null);

        await archive.dispose();
        assert.equal(adapter.files.size, 1, 'unsaved audio must never be deleted');
    });

    it('saves nothing when no audio was captured', async () => {
        const { archive, sink } = makeArchive();
        assert.equal(await archive.finalize(), null);
        assert.equal(sink.saved.length, 0);
        assert.equal(archive.hasAudio(), false);
    });

    it('writes numbered part files when segments cannot be joined', async () => {
        const { archive, sink } = makeArchive();
        await archive.addSegment(wavBlob([1, 2]));
        await archive.addSegment(new Blob(['not a wav at all, but long enough to exceed the header size!!']));

        const path = await archive.finalize();
        assert.equal(sink.saved.length, 2);
        assert.match(path ?? '', /-part01\.wav$/);
        assert.match(sink.saved[1].path, /-part02\.wav$/);
    });

    it('ignores empty blobs', async () => {
        const { archive } = makeArchive();
        assert.equal(await archive.addSegment(new Blob([])), null);
        assert.equal(archive.hasAudio(), false);
    });
});

describe('recoverOrphanedRecordings', () => {
    it('joins the segments of each orphaned recording directory into the vault and removes the directory', async () => {
        const adapter = new MemoryAdapter();
        const sink = new FakeSink();

        // Two interrupted recordings, one with enough segments to test numeric ordering.
        const a = new SegmentStore(adapter, `${TMP}/rec-2026-09-01T08-00-00-000Z`);
        for (let i = 0; i <= 10; i++) {
            await a.save(`segment_${i}`, wavBlob([i, i]));
        }
        const b = new SegmentStore(adapter, `${TMP}/rec-2026-09-01T09-00-00-000Z`);
        await b.save('segment_0', wavBlob([42, 43]));
        adapter.dirs.add(TMP);

        const recovered = await recoverOrphanedRecordings(adapter, TMP, sink);

        assert.equal(recovered.length, 2);
        assert.ok(recovered.some(p => p.includes('2026-09-01T08-00-00-000Z-recovered')), 'name must carry the recording start time');
        const first = sink.saved.find(s => s.path.includes('T08-00-00'));
        assert.ok(first);
        assert.deepEqual(pcmOf(first.data), [0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10], 'segment_10 must follow segment_9, not segment_1');
        assert.equal(adapter.files.size, 0);
        assert.deepEqual([...adapter.dirs], [TMP], 'only the parent temp dir remains');
    });

    it('recovers loose segment files from the pre-per-directory layout', async () => {
        const adapter = new MemoryAdapter();
        const sink = new FakeSink();
        const legacy = new SegmentStore(adapter, TMP);
        await legacy.save('segment_0', wavBlob([1, 1]));
        await legacy.save('segment_1', wavBlob([2, 2]));

        const recovered = await recoverOrphanedRecordings(adapter, TMP, sink);

        assert.equal(recovered.length, 1);
        assert.deepEqual(pcmOf(sink.saved[0].data), [1, 1, 2, 2]);
        assert.equal(adapter.files.size, 0);
    });

    it('keeps the segments when the vault write fails so a later load can retry', async () => {
        const adapter = new MemoryAdapter();
        const sink = new FakeSink();
        sink.fail = true;
        const store = new SegmentStore(adapter, `${TMP}/rec-x`);
        await store.save('segment_0', wavBlob([1, 1]));
        adapter.dirs.add(TMP);

        const recovered = await recoverOrphanedRecordings(adapter, TMP, sink);

        assert.equal(recovered.length, 0);
        assert.equal(adapter.files.size, 1, 'audio must survive a failed recovery attempt');
    });

    it('is a no-op when there is no temp directory', async () => {
        assert.deepEqual(await recoverOrphanedRecordings(new MemoryAdapter(), TMP, new FakeSink()), []);
    });
});
