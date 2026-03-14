import { ChunkMetadata, TranscriptionChunk, StreamingCallbacks } from '../../types';
import { ChunkQueue } from '../audio/ChunkQueue';
import { ResultCompiler } from './ResultCompiler';
import { TranscriptionService } from './TranscriptionService';
import { DeviceDetection } from '../DeviceDetection';
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
        console.log('[StreamingTranscription] Adding chunk:', metadata.id, 'size:', chunk.size);

        // Try to add to queue
        const added = await this.chunkQueue.enqueue(chunk, metadata);

        if (!added) {
            console.log('[StreamingTranscription] Failed to add chunk to queue');
            return false;
        }

        // Start processing if not already running
        if (!this.isProcessing) {
            console.log('[StreamingTranscription] Starting processing...');
            this.processingPromise = this.startProcessing();
        }

        return true;
    }

    private async startProcessing(): Promise<void> {
        if (this.isProcessing) return;

        this.isProcessing = true;
        this.abortController = new AbortController();
        console.log('[StreamingTranscription] Started processing loop');

        try {
            while (this.isProcessing && !this.abortController.signal.aborted) {
                // Check if we have chunks to process
                const queueItem = this.chunkQueue.dequeue();

                if (!queueItem) {
                    // No chunks available, wait a bit
                    await this.sleep(100);
                    continue;
                }

                console.log('[StreamingTranscription] Processing chunk:', queueItem.metadata.id);
                try {
                    // Process the chunk
                    await this.processChunk(queueItem.chunk, queueItem.metadata);
                    console.log('[StreamingTranscription] Chunk processed successfully');
                } catch (error) {
                    // Log and continue with next chunk
                    console.error('[StreamingTranscription] Chunk processing failed:', error);
                }
            }
        } finally {
            this.isProcessing = false;
            this.abortController = null;
            console.log('[StreamingTranscription] Processing loop ended');
        }
    }

    private async processChunk(chunk: Blob, metadata: ChunkMetadata): Promise<void> {
        try {
            // Convert blob to ArrayBuffer
            const arrayBuffer = await chunk.arrayBuffer();
            console.log('[StreamingTranscription] Transcribing chunk, size:', arrayBuffer.byteLength);

            // Transcribe the chunk
            const result = await this.transcriptionService.transcribeContent(arrayBuffer);
            console.log('[StreamingTranscription] Chunk transcribed:', result.transcription?.substring(0, 50));

            // Create transcription chunk
            const transcriptionChunk: TranscriptionChunk = {
                metadata,
                transcript: result.transcription,
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

    async finishProcessing(): Promise<string> {
        console.log('[StreamingTranscription] Finishing processing, queue size:', this.chunkQueue.size(), 'processed:', this.processedChunks.size);

        // Stop accepting new chunks
        this.isProcessing = false;

        // Wait for queue to be processed
        let attempts = 0;
        const maxAttempts = 300; // 30 seconds timeout

        while (this.chunkQueue.size() > 0 && attempts < maxAttempts) {
            await this.sleep(100);
            attempts++;
        }

        console.log('[StreamingTranscription] Queue drained, attempts:', attempts);

        // Abort if still processing after timeout
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

        // Get final result
        const result = this.resultCompiler.getFinalResult(
            this.plugin.settings.includeTimestamps || false,
            true // Include metadata
        );
        console.log('[StreamingTranscription] Final result length:', result.length, 'segments:', this.resultCompiler.getSegmentCount());

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
    }

    private cleanupBlob(_blob: Blob): void {
        // Note: URL.revokeObjectURL only works on URL strings created by URL.createObjectURL,
        // not on Blob objects directly. Blobs are garbage collected when no longer referenced.
        // This method is kept for potential future cleanup logic.
    }

    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    isQueuePaused(): boolean {
        return this.chunkQueue.isPaused();
    }

    getMemoryUsage(): number {
        return this.chunkQueue.getMemoryUsage();
    }
}