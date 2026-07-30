// src/utils/audio/SegmentStore.ts

import { normalizePath } from 'obsidian';

/**
 * The subset of Obsidian's DataAdapter that SegmentStore needs. Narrowed so tests
 * can supply an in-memory implementation without stubbing the full adapter.
 */
export interface SegmentStoreAdapter {
    exists(normalizedPath: string): Promise<boolean>;
    mkdir(normalizedPath: string): Promise<void>;
    writeBinary(normalizedPath: string, data: ArrayBuffer): Promise<void>;
    readBinary(normalizedPath: string): Promise<ArrayBuffer>;
    remove(normalizedPath: string): Promise<void>;
    list(normalizedPath: string): Promise<{ files: string[]; folders: string[] }>;
}

/**
 * Spills recording segments to disk so that queued audio does not accumulate in memory.
 *
 * Rotated segments used to sit in a Blob queue (up to several uncompressed-WAV segments,
 * each copied again for transcription), which is what put long recordings at OOM risk on
 * mobile. Instead each segment is written to a temp file under the plugin directory as soon
 * as it is rotated, the queue holds only paths, and each file is read back one at a time
 * for transcription and deleted immediately after. Peak audio memory is therefore bounded
 * by a single segment regardless of recording length or transcription backlog.
 *
 * Files also survive a crash or app kill mid-recording; sweep() clears leftovers on the
 * next plugin load.
 */
export class SegmentStore {
    private initialized = false;

    private dir: string;

    constructor(
        private adapter: SegmentStoreAdapter,
        dir: string
    ) {
        this.dir = normalizePath(dir);
    }

    /** Directory the store writes into (vault-relative). */
    getDir(): string {
        return this.dir;
    }

    private async ensureDir(): Promise<void> {
        if (this.initialized) return;
        if (!(await this.adapter.exists(this.dir))) {
            await this.adapter.mkdir(this.dir);
        }
        this.initialized = true;
    }

    /**
     * Writes a segment blob to disk and returns its path. The blob is fully released by the
     * caller afterwards; the returned path is the only reference kept.
     */
    async save(id: string, blob: Blob): Promise<string> {
        await this.ensureDir();
        // Sanitize the id defensively; ids are internal ("segment_3") but a path
        // separator here must never escape the temp dir.
        const safeId = id.replace(/[^a-zA-Z0-9_-]/g, '_');
        const path = `${this.dir}/${safeId}.bin`;
        await this.adapter.writeBinary(path, await blob.arrayBuffer());
        return path;
    }

    async read(path: string): Promise<ArrayBuffer> {
        return this.adapter.readBinary(path);
    }

    /** Removes a segment file. Missing files are treated as already removed. */
    async remove(path: string): Promise<void> {
        try {
            await this.adapter.remove(path);
        } catch {
            // Already gone (double-delete, or a sweep raced us) — not an error.
        }
    }

    /**
     * Deletes every file in the store's directory. Called on plugin load to clear segments
     * orphaned by a crash, and on abort. Returns the number of files removed.
     */
    async sweep(): Promise<number> {
        if (!(await this.adapter.exists(this.dir))) return 0;
        let removed = 0;
        const listing = await this.adapter.list(this.dir);
        for (const file of listing.files) {
            try {
                await this.adapter.remove(file);
                removed++;
            } catch {
                // Leave stragglers for the next sweep rather than failing the load.
            }
        }
        return removed;
    }
}
