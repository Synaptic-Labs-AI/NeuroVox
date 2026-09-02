// src/utils/audio/RecordingArchive.ts

import { SegmentStore, SegmentStoreAdapter, sortSegmentPaths } from './SegmentStore';
import { joinWavBuffers } from './WavJoiner';

/**
 * Where finished recordings go. Abstracted so the archive can be tested without a vault;
 * in production this is AudioFileManager writing into the configured recordings folder.
 */
export interface RecordingSink {
    /**
     * Writes one audio file and returns its vault path. `baseName` has no extension;
     * the sink is responsible for making the final name unique.
     */
    save(data: ArrayBuffer, baseName: string, extension: string): Promise<string>;
}

interface ArchivedPart {
    /** Segment file on disk, when the spill succeeded. */
    path?: string;
    /** In-memory fallback when the disk write failed: better than losing the audio. */
    blob?: Blob;
}

/** Name stem for a recording that began at `startedAt`. */
export function recordingBaseName(startedAt: Date): string {
    return `recording-${startedAt.toISOString().replace(/[:.]/g, '-')}`;
}

/**
 * Keeps every byte of a recording safe until it is written to the vault.
 *
 * Transcription can fail for many reasons (bad key, provider outage, timeout, a note write
 * that throws), and before this class existed a failure anywhere in that chain lost the
 * audio with it. The archive spills each recorder segment to disk the moment it exists,
 * then on stop joins the segments into one WAV in the recordings folder *before* the
 * transcription drain runs. Whatever happens afterwards, the recording exists as a file
 * the user can re-process with the "Transcribe audio file" command.
 *
 * The segment files double as the transcription queue's input (see
 * StreamingTranscriptionService.enqueue), so they are only deleted in dispose(), after both
 * the vault write and the drain are done.
 */
export class RecordingArchive {
    private parts: ArchivedPart[] = [];
    private savedPath: string | null = null;

    constructor(
        private store: SegmentStore,
        private sink: RecordingSink,
        private startedAt: Date
    ) {}

    /**
     * Records one segment of audio. Spills it to disk and returns the path, or returns null
     * when the disk write failed (the blob is then retained in memory for finalize()).
     */
    async addSegment(blob: Blob): Promise<string | null> {
        if (blob.size === 0) return null;
        const index = this.parts.length;
        try {
            const path = await this.store.save(`segment_${index}`, blob);
            this.parts.push({ path });
            return path;
        } catch (error) {
            console.error('[RecordingArchive] Failed to spill segment to disk; keeping it in memory:', error);
            this.parts.push({ blob });
            return null;
        }
    }

    hasAudio(): boolean {
        return this.parts.length > 0;
    }

    /** Vault path of the saved recording, once finalize() has succeeded. */
    getSavedPath(): string | null {
        return this.savedPath;
    }

    /**
     * Joins the segments into one audio file in the vault and returns its path (null when
     * there is nothing to save). Throws when the write fails; the segment files are left in
     * place so the recording can still be recovered on the next plugin load.
     */
    async finalize(): Promise<string | null> {
        if (this.savedPath) return this.savedPath;
        if (this.parts.length === 0) return null;

        const buffers: ArrayBuffer[] = [];
        for (const part of this.parts) {
            if (part.path) {
                buffers.push(await this.store.read(part.path));
            } else if (part.blob) {
                buffers.push(await part.blob.arrayBuffer());
            }
        }

        this.savedPath = await saveJoined(buffers, this.sink, recordingBaseName(this.startedAt));
        return this.savedPath;
    }

    /**
     * Releases the segment files, but only once the recording is safely in the vault. If
     * finalize() never succeeded the files stay on disk for load-time recovery.
     */
    async dispose(): Promise<void> {
        if (this.savedPath) {
            await this.store.removeDir();
        }
        this.parts = [];
    }
}

/**
 * Writes the joined recording through the sink. Segments that cannot be joined (not PCM
 * WAV, or mismatched formats) are written as separate numbered part files instead, so the
 * audio is never discarded just because it could not be stitched.
 */
async function saveJoined(buffers: ArrayBuffer[], sink: RecordingSink, baseName: string): Promise<string> {
    const joined = joinWavBuffers(buffers);
    if (joined) {
        // buildWav allocates an exactly-sized buffer, so the view's buffer is the file.
        return sink.save(joined.buffer, baseName, 'wav');
    }

    let firstPath = '';
    for (let i = 0; i < buffers.length; i++) {
        const path = await sink.save(buffers[i], `${baseName}-part${String(i + 1).padStart(2, '0')}`, 'wav');
        if (!firstPath) firstPath = path;
    }
    return firstPath;
}

/**
 * Recovers recordings whose segments were left on disk by a crash, force-quit, or a failed
 * vault write. Each per-recording directory under `tmpDir` (and, for installs upgraded
 * mid-recording, loose files directly in it) is joined and written through the sink, then
 * deleted. Returns the vault paths of the recovered files.
 */
export async function recoverOrphanedRecordings(
    adapter: SegmentStoreAdapter,
    tmpDir: string,
    sink: RecordingSink
): Promise<string[]> {
    if (!(await adapter.exists(tmpDir))) return [];

    const recovered: string[] = [];
    const listing = await adapter.list(tmpDir);

    for (const dir of listing.folders) {
        const files = sortSegmentPaths((await adapter.list(dir)).files);
        if (files.length === 0) {
            await adapter.rmdir(dir, true).catch(() => { /* leave for next time */ });
            continue;
        }
        try {
            recovered.push(await recoverFiles(adapter, files, sink, dir));
            await adapter.rmdir(dir, true);
        } catch (error) {
            console.error('[RecordingArchive] Could not recover recording segments in', dir, error);
        }
    }

    // Pre-per-directory layout: segments sat directly in tmpDir.
    const loose = sortSegmentPaths(listing.files);
    if (loose.length > 0) {
        try {
            recovered.push(await recoverFiles(adapter, loose, sink, tmpDir));
            for (const file of loose) {
                await adapter.remove(file).catch(() => { /* leave for next time */ });
            }
        } catch (error) {
            console.error('[RecordingArchive] Could not recover loose recording segments:', error);
        }
    }

    return recovered;
}

async function recoverFiles(
    adapter: SegmentStoreAdapter,
    files: string[],
    sink: RecordingSink,
    sourceDir: string
): Promise<string> {
    const buffers: ArrayBuffer[] = [];
    for (const file of files) {
        buffers.push(await adapter.readBinary(file));
    }
    // Directory names carry the recording's start time (see TimerModal); fall back to now.
    const stamp = /rec-(.+)$/.exec(sourceDir)?.[1];
    const baseName = stamp ? `recording-${stamp}-recovered` : `${recordingBaseName(new Date())}-recovered`;
    return saveJoined(buffers, sink, baseName);
}
