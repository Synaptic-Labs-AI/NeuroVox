import { ChunkMetadata, TranscriptionChunk, StreamingCallbacks } from '../../types';
import { ChunkQueue } from '../audio/ChunkQueue';
import { ResultCompiler } from './ResultCompiler';
import { TranscriptionService } from './TranscriptionService';
import { DeviceDetection } from '../DeviceDetection';
import { Logger } from '../Logger';
import NeuroVoxPlugin from '../../main';

export class StreamingTranscriptionService {
    private chunkQueue: ChunkQueue;
    private resultCompiler: ResultCompiler;
    private transcriptionService: TranscriptionService;
    private deviceDetection: DeviceDetection;
    private isProcessing: boolean = false;
    private processedChunks: Set<string> = new Set();
    private callbacks: StreamingCallbacks;
    private abortController: AbortController | null = null;
    private processingPromise: Promise<void> | null = null;
    private lastError: Error | null = null;
    private chunksReceived: number = 0;
    private drainRequested: boolean = false;
    private chunksHandled: number = 0;

    constructor(
        private plugin: NeuroVoxPlugin,
        callbacks?: StreamingCallbacks
    ) {
        this.deviceDetection = DeviceDetection.getInstance();
        const options = this.deviceDetection.getOptimalStreamingOptions();
        
        this.chunkQueue = new ChunkQueue(
            options.maxQueueSize,
            options.memoryLimit,
            callbacks?.onMemoryWarning
        );
        
        this.resultCompiler = new ResultCompiler();
        this.transcriptionService = new TranscriptionService(plugin);
        this.callbacks = callbacks || {};
    }

    async addChunk(chunk: Blob, metadata: ChunkMetadata): Promise<boolean> {
        Logger.log('[StreamingTranscription] Adding chunk:', metadata.id, 'size:', chunk.size);

        // Try to add to queue
        const added = await this.chunkQueue.enqueue(chunk, metadata);

        if (!added) {
            Logger.log('[StreamingTranscription] Failed to add chunk to queue');
            return false;
        }

        this.chunksReceived++;

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
                // Check if we have chunks to process
                const queueItem = this.chunkQueue.dequeue();

                if (!queueItem) {
                    // Queue is empty: exit once a drain has been requested (recording
                    // stopped and no more chunks are coming), otherwise wait for more.
                    if (this.drainRequested) break;
                    await this.sleep(100);
                    continue;
                }

                Logger.log('[StreamingTranscription] Processing chunk:', queueItem.metadata.id);
                try {
                    // Process the chunk
                    await this.processChunk(queueItem.chunk, queueItem.metadata);
                    Logger.log('[StreamingTranscription] Chunk processed successfully');
                } catch (error) {
                    // Remember the failure so an all-failed run can surface the real cause,
                    // then continue with the next chunk.
                    this.lastError = error instanceof Error ? error : new Error(String(error));
                    console.error('[StreamingTranscription] Chunk processing failed:', error);
                } finally {
                    this.chunksHandled++;
                }
            }
        } finally {
            this.isProcessing = false;
            this.abortController = null;
            Logger.log('[StreamingTranscription] Processing loop ended');
        }
    }

    private async processChunk(chunk: Blob, metadata: ChunkMetadata): Promise<void> {
        try {
            // Convert blob to ArrayBuffer
            const arrayBuffer = await chunk.arrayBuffer();
            Logger.log('[StreamingTranscription] Transcribing chunk, size:', arrayBuffer.byteLength);

            // Transcribe the chunk only. Post-processing is applied once to the assembled
            // transcript after recording stops, not per chunk.
            const transcription = await this.transcriptionService.transcribeAudioOnly(arrayBuffer);
            Logger.log('[StreamingTranscription] Chunk transcribed:', transcription?.substring(0, 50));

            // Create transcription chunk
            const transcriptionChunk: TranscriptionChunk = {
                metadata,
                transcript: transcription,
                processed: true
            };

            // Add to result compiler
            this.resultCompiler.addSegment(transcriptionChunk);
            this.processedChunks.add(metadata.id);

            // Notify progress
            if (this.callbacks.onProgress) {
                const totalChunks = this.processedChunks.size + this.chunkQueue.size();
                this.callbacks.onProgress(this.processedChunks.size, totalChunks);
            }

            // Clean up the blob to free memory
            this.cleanupBlob(chunk);

        } catch (error) {
            console.error('[StreamingTranscription] processChunk error:', error);
            throw error;
        }
    }

    /**
     * Whether any time-sliced chunk was received during recording. RecordRTC's
     * StereoAudioRecorder does not emit timeSlice chunks, so in practice this stays false and
     * the whole recording is transcribed via transcribeFinalBlob() on stop.
     */
    hasReceivedChunks(): boolean {
        return this.chunksReceived > 0;
    }

    /**
     * Transcribes a recording blob (or one segment of it) directly, bypassing the streaming
     * queue, and adds the result to the compiler. Used on stop when no streamed chunks were
     * produced. Errors are recorded rather than thrown so that, when a long recording is
     * transcribed segment by segment, one failed segment doesn't discard the whole transcript;
     * finishProcessing() surfaces the error only if nothing transcribed at all.
     */
    async transcribeFinalBlob(chunk: Blob, metadata: ChunkMetadata): Promise<void> {
        try {
            await this.processChunk(chunk, metadata);
        } catch (error) {
            this.lastError = error instanceof Error ? error : new Error(String(error));
        }
    }

    async finishProcessing(): Promise<string> {
        Logger.log('[StreamingTranscription] Finishing processing, queue size:', this.chunkQueue.size(), 'processed:', this.processedChunks.size);

        // Ask the consumer loop to exit once the queue is empty. It must keep running until
        // then — stopping it immediately (as this method used to) drops every segment still
        // waiting in the queue, truncating long recordings to whatever had already finished.
        this.drainRequested = true;

        // Wait for the loop to drain the queue. The timeout is progress-aware: as long as
        // chunks keep completing (success or failure) we keep waiting; we bail out only
        // after a sustained stall, so many queued segments never outlast a fixed cap.
        const idleTimeoutMs = 90_000;
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

        Logger.log('[StreamingTranscription] Queue drained, remaining:', this.chunkQueue.size());

        // Abort only if the loop is still stuck after the stall timeout
        if (this.abortController) {
            this.abortController.abort();
        }

        // Wait for processing to complete
        if (this.processingPromise) {
            try {
                await this.processingPromise;
            } catch (error) {
                console.error('[StreamingTranscription] Processing promise error:', error);
            }
        }
        this.isProcessing = false;

        // If no chunk was transcribed but at least one failed, surface the real cause instead
        // of an opaque "no transcription result" downstream.
        if (this.processedChunks.size === 0 && this.lastError) {
            throw new Error(`Transcription failed: ${this.lastError.message}`);
        }

        // Get final result
        const result = this.resultCompiler.getFinalResult(
            this.plugin.settings.includeTimestamps || false,
            true // Include metadata
        );
        Logger.log('[StreamingTranscription] Final result length:', result.length, 'segments:', this.resultCompiler.getSegmentCount());

        return result;
    }

    getPartialResult(): string {
        return this.resultCompiler.getPartialResult(
            this.plugin.settings.includeTimestamps || false
        );
    }

    getStats() {
        return {
            queueStats: this.chunkQueue.getStats(),
            processedChunks: this.processedChunks.size,
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
        this.chunkQueue.clear();
        this.resultCompiler.clear();
        this.processedChunks.clear();
        this.isProcessing = false;
        this.abortController = null;
        this.processingPromise = null;
        this.lastError = null;
        this.chunksReceived = 0;
        this.drainRequested = false;
        this.chunksHandled = 0;
    }

    private cleanupBlob(_blob: Blob): void {
        // Note: URL.revokeObjectURL only works on URL strings created by URL.createObjectURL,
        // not on Blob objects directly. Blobs are garbage collected when no longer referenced.
        // This method is kept for potential future cleanup logic.
    }

    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => window.setTimeout(resolve, ms));
    }

    isQueuePaused(): boolean {
        return this.chunkQueue.isPaused();
    }

    getMemoryUsage(): number {
        return this.chunkQueue.getMemoryUsage();
    }
}