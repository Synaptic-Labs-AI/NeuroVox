import { ChunkMetadata, TranscriptionChunk, StreamingCallbacks } from '../../types';
import { SegmentStore } from '../audio/SegmentStore';
import { ResultCompiler } from './ResultCompiler';
import { TranscriptionService } from './TranscriptionService';
import { Logger } from '../Logger';
import NeuroVoxPlugin from '../../main';

/** A queued segment: audio lives on disk, only the path is held in memory. */
interface PendingSegment {
    path: string;
    metadata: ChunkMetadata;
}

export class StreamingTranscriptionService {
    private pending: PendingSegment[] = [];
    private store: SegmentStore;
    private resultCompiler: ResultCompiler;
    private transcriptionService: TranscriptionService;
    private isProcessing: boolean = false;
    private processedChunks: Set<string> = new Set();
    private callbacks: StreamingCallbacks;
    private abortController: AbortController | null = null;
    private processingPromise: Promise<void> | null = null;
    private lastError: Error | null = null;
    private drainRequested: boolean = false;
    private chunksHandled: number = 0;
    private failedChunks: number = 0;

    constructor(
        private plugin: NeuroVoxPlugin,
        callbacks?: StreamingCallbacks,
        store?: SegmentStore
    ) {
        this.store = store ?? new SegmentStore(
            plugin.app.vault.adapter,
            `${plugin.manifest.dir}/segments-tmp`
        );
        this.resultCompiler = new ResultCompiler();
        this.transcriptionService = new TranscriptionService(plugin);
        this.callbacks = callbacks || {};
    }

    /**
     * Accepts a recording segment: the blob is spilled to disk immediately and only its path
     * is queued, so queued audio never accumulates in memory (the OOM risk on mobile).
     * Returns false if the segment could not be written to disk — the caller should then
     * transcribe the blob directly rather than dropping it.
     */
    async addChunk(chunk: Blob, metadata: ChunkMetadata): Promise<boolean> {
        Logger.log('[StreamingTranscription] Adding chunk:', metadata.id, 'size:', chunk.size);

        let path: string;
        try {
            path = await this.store.save(metadata.id, chunk);
        } catch (error) {
            console.error('[StreamingTranscription] Failed to spill segment to disk:', error);
            return false;
        }

        this.pending.push({ path, metadata });

        // Start processing if not already running
        if (!this.isProcessing) {
            Logger.log('[StreamingTranscription] Starting processing...');
            this.processingPromise = this.startProcessing();
        }

        return true;
    }

    private async startProcessing(): Promise<void> {
        if (this.isProcessing) return;

        this.isProcessing = true;
        this.abortController = new AbortController();
        const signal = this.abortController.signal;
        Logger.log('[StreamingTranscription] Started processing loop');

        try {
            while (!signal.aborted) {
                const item = this.pending.shift();

                if (!item) {
                    // Queue is empty: exit once a drain has been requested (recording
                    // stopped and no more chunks are coming), otherwise wait for more.
                    if (this.drainRequested) break;
                    await this.sleep(100);
                    continue;
                }

                Logger.log('[StreamingTranscription] Processing segment:', item.metadata.id);
                // Per-segment abort scope: the timeout aborts it, so an abandoned request
                // that resolves late cannot add its text to a transcript that already
                // counted the segment as failed, and AssemblyAI stops polling instead of
                // running out its remaining budget. The drain-level signal propagates in.
                const callController = new AbortController();
                const propagateAbort = () => callController.abort();
                signal.addEventListener('abort', propagateAbort, { once: true });
                try {
                    // The disk read shares the segment's budget: a vault-adapter call that
                    // hangs (rather than rejects) must fail this segment, not stall the
                    // drain forever — the stall abort can't interrupt an await that never
                    // settles, so it must never be the only line of defense.
                    await this.withTimeout(
                        (async () => {
                            const buffer = await this.store.read(item.path);
                            await this.processChunk(buffer, item.metadata, callController.signal);
                        })(),
                        this.getSegmentTimeoutMs(),
                        item.metadata.id,
                        callController
                    );
                    Logger.log('[StreamingTranscription] Segment processed successfully');
                } catch (error) {
                    // Remember the failure so an all-failed run can surface the real cause,
                    // then continue with the next segment.
                    this.lastError = error instanceof Error ? error : new Error(String(error));
                    this.failedChunks++;
                    console.error('[StreamingTranscription] Segment processing failed:', error);
                } finally {
                    signal.removeEventListener('abort', propagateAbort);
                    this.chunksHandled++;
                    // The file is deleted whether transcription succeeded or failed (a
                    // failed segment is reported via the incomplete-transcript marker).
                    // Bounded: a hung delete leaves the file for the load-time sweep
                    // rather than stalling the drain.
                    await Promise.race([this.store.remove(item.path), this.sleep(5_000)]);
                }
            }
        } finally {
            this.isProcessing = false;
            this.abortController = null;
            Logger.log('[StreamingTranscription] Processing loop ended');
        }
    }

    private async processChunk(
        arrayBuffer: ArrayBuffer,
        metadata: ChunkMetadata,
        signal?: AbortSignal
    ): Promise<void> {
        Logger.log('[StreamingTranscription] Transcribing segment, size:', arrayBuffer.byteLength);

        // Transcribe the chunk only. Post-processing is applied once to the assembled
        // transcript after recording stops, not per chunk.
        const transcription = await this.transcriptionService.transcribeAudioOnly(arrayBuffer, signal);

        // If this call was aborted (per-segment timeout or drain abort), the segment has
        // already been counted as failed — a result arriving late must be discarded, not
        // added to the transcript alongside the "Incomplete" warning it caused.
        if (signal?.aborted) {
            Logger.log('[StreamingTranscription] Discarding late result for aborted segment:', metadata.id);
            return;
        }
        Logger.log('[StreamingTranscription] Segment transcribed:', metadata.id, 'chars:', transcription?.length ?? 0, 'text:', transcription?.substring(0, 60));

        const transcriptionChunk: TranscriptionChunk = {
            metadata,
            transcript: transcription,
            processed: true
        };

        this.resultCompiler.addSegment(transcriptionChunk);
        this.processedChunks.add(metadata.id);

        // Notify progress
        if (this.callbacks.onProgress) {
            const totalChunks = this.processedChunks.size + this.pending.length;
            this.callbacks.onProgress(this.processedChunks.size, totalChunks);
        }
    }

    /**
     * Per-segment transcription budget. Derived from the active provider (AssemblyAI's
     * upload+poll flow legitimately takes minutes; a plain Whisper POST should not), so the
     * drain-stall timeout below always dominates the slowest expected single segment.
     */
    private getSegmentTimeoutMs(): number {
        return this.transcriptionService.getTranscriptionTimeoutMs();
    }

    private withTimeout<T>(promise: Promise<T>, ms: number, label: string, controller?: AbortController): Promise<T> {
        return new Promise<T>((resolve, reject) => {
            const timer = window.setTimeout(() => {
                // The underlying request cannot be cancelled (Obsidian's requestUrl has no
                // abort support); it is abandoned. Aborting the controller makes the
                // abandoned call discard its eventual result (and stops AssemblyAI polls).
                controller?.abort();
                reject(new Error(`Transcription timed out after ${Math.round(ms / 1000)}s (${label})`));
            }, ms);
            promise.then(
                value => { window.clearTimeout(timer); resolve(value); },
                (error: unknown) => {
                    window.clearTimeout(timer);
                    reject(error instanceof Error ? error : new Error(String(error)));
                }
            );
        });
    }

    /**
     * Transcribes a recording blob (or one segment of it) directly, bypassing the disk
     * queue, and adds the result to the compiler. Used on stop when no rotation occurred and
     * as the fallback when a segment cannot be written to disk. Errors are recorded rather
     * than thrown so one failed segment doesn't discard the whole transcript;
     * finishProcessing() surfaces the error only if nothing transcribed at all.
     */
    async transcribeFinalBlob(chunk: Blob, metadata: ChunkMetadata): Promise<void> {
        // Same per-call abort scope as the queue path: a late result from a timed-out
        // request must not mutate the compiler after this recording was finalized.
        const controller = new AbortController();
        try {
            const buffer = await chunk.arrayBuffer();
            await this.withTimeout(
                this.processChunk(buffer, metadata, controller.signal),
                this.getSegmentTimeoutMs(),
                metadata.id,
                controller
            );
        } catch (error) {
            this.lastError = error instanceof Error ? error : new Error(String(error));
            this.failedChunks++;
        }
    }

    async finishProcessing(): Promise<string> {
        Logger.log('[StreamingTranscription] Finishing processing, queue size:', this.pending.length, 'processed:', this.processedChunks.size);

        // Ask the consumer loop to exit once the queue is empty. It must keep running until
        // then — stopping it immediately drops every segment still waiting in the queue,
        // truncating long recordings to whatever had already finished.
        this.drainRequested = true;

        // Wait for the loop to drain the queue. The stall timeout is progress-aware: as
        // long as segments keep completing (success or failure) we keep waiting. Because
        // every segment is individually bounded by getSegmentTimeoutMs(), a stall longer
        // than that budget means the loop itself is stuck, so we add a margin and bail.
        const idleTimeoutMs = this.getSegmentTimeoutMs() + 30_000;
        let idleMs = 0;
        let lastHandled = this.chunksHandled;

        while (this.isProcessing && idleMs < idleTimeoutMs) {
            await this.sleep(100);
            if (this.chunksHandled !== lastHandled) {
                lastHandled = this.chunksHandled;
                idleMs = 0;
            } else {
                idleMs += 100;
            }
        }

        // Abort only if the loop is still stuck after the stall timeout
        if (this.abortController) {
            this.abortController.abort();
        }

        // Wait for processing to complete. Bounded: if the loop is stuck in an await that
        // ignores the abort signal, waiting here forever would leave the stop flow — and
        // the recording modal, whose close path waits on us — permanently wedged.
        if (this.processingPromise) {
            try {
                await Promise.race([this.processingPromise, this.sleep(10_000)]);
            } catch (error) {
                console.error('[StreamingTranscription] Processing promise error:', error);
            }
        }
        this.processingPromise = null;

        // Segments still queued at this point were dropped (stall abort, or a wedged loop
        // abandoned above). Count them honestly and release their files.
        const dropped = this.pending.length;
        for (const item of this.pending.splice(0)) {
            await Promise.race([this.store.remove(item.path), this.sleep(2_000)]);
        }

        const processedCount = this.processedChunks.size;
        const failed = this.failedChunks;
        const lastError = this.lastError;
        Logger.log('[StreamingTranscription] Drain complete. processed:', processedCount, 'failed:', failed, 'dropped:', dropped);

        let result = this.resultCompiler.getFinalResult(
            this.plugin.settings.includeTimestamps || false,
            true // Include metadata
        );

        // Never present a partial transcript as complete: if segments failed or were
        // dropped, say so in the note itself.
        const missing = failed + dropped;
        if (missing > 0 && result.length > 0) {
            const cause = lastError ? ` Last error: ${lastError.message}` : '';
            result += `\n\n> [!warning] Incomplete transcript\n> ${missing} segment${missing === 1 ? '' : 's'} could not be transcribed.${cause}`;
        }
        Logger.log('[StreamingTranscription] Final result length:', result.length, 'segments:', this.resultCompiler.getSegmentCount());

        // Reset ALL per-recording state so a reused instance starts clean. Resetting only
        // the drain flags is not enough: a second drain would embed this recording's
        // transcript in the next one, re-report these failures, and — if the next run
        // failed entirely — return this run's text instead of throwing.
        this.resultCompiler.clear();
        this.processedChunks.clear();
        this.failedChunks = 0;
        this.lastError = null;
        this.drainRequested = false;
        this.chunksHandled = 0;

        // If no chunk was transcribed but at least one failed, surface the real cause
        // instead of an opaque "no transcription result" downstream.
        if (processedCount === 0 && lastError) {
            throw new Error(`Transcription failed: ${lastError.message}`);
        }

        return result;
    }

    getPartialResult(): string {
        return this.resultCompiler.getPartialResult(
            this.plugin.settings.includeTimestamps || false
        );
    }

    getStats() {
        return {
            queueSize: this.pending.length,
            processedChunks: this.processedChunks.size,
            failedChunks: this.failedChunks,
            totalDuration: this.resultCompiler.getTotalDuration(),
            segmentCount: this.resultCompiler.getSegmentCount()
        };
    }

    abort(): void {
        this.isProcessing = false;
        if (this.abortController) {
            this.abortController.abort();
        }
        this.cleanup();
    }

    private cleanup(): void {
        // Release queued segment files before dropping their paths.
        const leftovers = this.pending.splice(0);
        for (const item of leftovers) {
            void this.store.remove(item.path);
        }
        this.resultCompiler.clear();
        this.processedChunks.clear();
        this.isProcessing = false;
        this.abortController = null;
        this.processingPromise = null;
        this.lastError = null;
        this.drainRequested = false;
        this.chunksHandled = 0;
        this.failedChunks = 0;
    }

    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => window.setTimeout(resolve, ms));
    }
}
