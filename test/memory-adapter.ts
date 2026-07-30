// test/memory-adapter.ts
//
// In-memory stand-in for Obsidian's DataAdapter, shared by test files. Lives outside
// src/**/*.test.ts so importing it doesn't re-register another file's test suites.

import type { SegmentStoreAdapter } from '../src/utils/audio/SegmentStore';

export class MemoryAdapter implements SegmentStoreAdapter {
    files = new Map<string, ArrayBuffer>();
    dirs = new Set<string>();
    failWrites = false;

    async exists(path: string): Promise<boolean> {
        return this.dirs.has(path) || this.files.has(path);
    }
    async mkdir(path: string): Promise<void> {
        this.dirs.add(path);
    }
    async writeBinary(path: string, data: ArrayBuffer): Promise<void> {
        if (this.failWrites) throw new Error('disk full');
        this.files.set(path, data);
    }
    async readBinary(path: string): Promise<ArrayBuffer> {
        const data = this.files.get(path);
        if (!data) throw new Error(`no such file: ${path}`);
        return data;
    }
    async remove(path: string): Promise<void> {
        if (!this.files.delete(path)) throw new Error(`no such file: ${path}`);
    }
    async list(path: string): Promise<{ files: string[]; folders: string[] }> {
        return {
            files: [...this.files.keys()].filter(f => f.startsWith(`${path}/`)),
            folders: []
        };
    }
}
