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
    rmdir(normalizedPath: string, recursive: boolean): Promise<void>;
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
 * The segment files are also the recording's durable copy until it has been assembled into
 * a single audio file in the vault (see RecordingArchive), which is why the transcription
 * loop never deletes them: they must outlive a failed or interrupted transcription. Each
 * recording gets its own store directory, and files that survive a crash or app kill are
 * recovered into the vault on the next plugin load.
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

    /**
     * Lists the segment files currently in the store, in ascending numeric id order
     * (segment_0, segment_1, ... segment_10), which is recording order.
     */
    async listFiles(): Promise<string[]> {
        if (!(await this.adapter.exists(this.dir))) return [];
        const listing = await this.adapter.list(this.dir);
        return sortSegmentPaths(listing.files);
    }

    /**
     * Removes the store directory and everything in it. Used once the recording has been
     * safely written to the vault, so the segments are no longer the only copy.
     */
    async removeDir(): Promise<void> {
        try {
            if (await this.adapter.exists(this.dir)) {
                await this.adapter.rmdir(this.dir, true);
            }
        } catch (error) {
            // Leave stragglers for the load-time recovery pass rather than failing the stop.
            console.error('[SegmentStore] Failed to remove segment directory:', error);
        }
        this.initialized = false;
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

/**
 * Orders segment paths by the numeric suffix of their file name so that "segment_10" sorts
 * after "segment_9". Paths without a number keep their relative order at the end.
 */
export function sortSegmentPaths(paths: string[]): string[] {
    const indexOf = (path: string): number => {
        const match = /(\d+)\.[^./]+$/.exec(path);
        return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
    };
    return [...paths].sort((a, b) => indexOf(a) - indexOf(b));
}
