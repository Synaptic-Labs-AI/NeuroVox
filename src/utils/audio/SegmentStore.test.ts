// src/utils/audio/SegmentStore.test.ts
//
// Unit tests for the disk spill store, using an in-memory adapter in place of
// Obsidian's DataAdapter. Run with: npm test

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { SegmentStore } from './SegmentStore';
import { MemoryAdapter } from '../../../test/memory-adapter';

describe('SegmentStore', () => {
    it('round-trips a segment through disk', async () => {
        const adapter = new MemoryAdapter();
        const store = new SegmentStore(adapter, 'plugins/neurovox/segments-tmp');

        const path = await store.save('segment_0', new Blob(['audio-bytes']));
        assert.match(path, /segments-tmp\/segment_0\.bin$/);
        assert.ok(adapter.dirs.has('plugins/neurovox/segments-tmp'), 'temp dir must be created');

        const buffer = await store.read(path);
        assert.equal(new TextDecoder().decode(buffer), 'audio-bytes');

        await store.remove(path);
        assert.equal(adapter.files.size, 0);
    });

    it('sanitizes ids so they cannot escape the temp dir', async () => {
        const adapter = new MemoryAdapter();
        const store = new SegmentStore(adapter, 'tmp');

        const path = await store.save('../../evil/../id', new Blob(['x']));
        assert.ok(path.startsWith('tmp/'), 'path must stay under the temp dir');
        assert.doesNotMatch(path, /\.\.\//);
    });

    it('tolerates removing a file that is already gone', async () => {
        const store = new SegmentStore(new MemoryAdapter(), 'tmp');
        await store.remove('tmp/never-existed.bin'); // must not throw
    });

    it('sweep removes every file and reports the count', async () => {
        const adapter = new MemoryAdapter();
        const store = new SegmentStore(adapter, 'tmp');
        await store.save('a', new Blob(['1']));
        await store.save('b', new Blob(['2']));

        const removed = await store.sweep();
        assert.equal(removed, 2);
        assert.equal(adapter.files.size, 0);
    });

    it('sweep on a missing dir is a no-op', async () => {
        const store = new SegmentStore(new MemoryAdapter(), 'tmp');
        assert.equal(await store.sweep(), 0);
    });
});
