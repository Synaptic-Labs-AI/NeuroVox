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
        // Try to add to queue
        const added = await this.chunkQueue.enqueue(chunk, metadata);
        
        if (!added) {
            console.warn('Failed to add chunk to queue - memory limit reached');
            return false;
        }

        // Start processing if not already running
        if (!this.isProcessing) {
            this.processingPromise = this.startProcessing();
        }

        return true;
    }

    private async startProcessing(): Promise<void> {
        if (this.isProcessing) return;
        
        this.isProcessing = true;
        this.abortController = new AbortController();

        try {
            while (this.isProcessing && !this.abortController.signal.aborted) {
                // Check if we have chunks to process
                const queueItem = this.chunkQueue.dequeue();
                
                if (!queueItem) {
                    // No chunks available, wait a bit
                    await this.sleep(100);
                    continue;
                }

                try {
                    // Process the chunk
                    await this.processChunk(queueItem.chunk, queueItem.metadata);
                } catch (error) {
                    console.error('Error processing chunk:', error);
                    // Continue with next chunk even if one fails
                }
            }
        } finally {
            this.isProcessing = false;
            this.abortController = null;
        }
    }

    private async processChunk(chunk: Blob, metadata: ChunkMetadata): Promise<void> {
        try {
            // Convert blob to ArrayBuffer
            const arrayBuffer = await chunk.arrayBuffer();
            
            // Transcribe the chunk
            const result = await this.transcriptionService.transcribeContent(arrayBuffer);
            
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
            console.error(`Failed to process chunk ${metadata.id}:`, error);
            throw error;
        }
    }

    async finishProcessing(): Promise<string> {
        // Stop accepting new chunks
        this.isProcessing = false;

        // Wait for queue to be processed
        let attempts = 0;
        const maxAttempts = 300; // 30 seconds timeout
        
        while (this.chunkQueue.size() > 0 && attempts < maxAttempts) {
            await this.sleep(100);
            attempts++;
        }

        // Abort if still processing after timeout
        if (this.abortController) {
            this.abortController.abort();
        }

        // Wait for processing to complete
        if (this.processingPromise) {
            try {
                await this.processingPromise;
            } catch (error) {
                console.error('Error waiting for processing to complete:', error);
            }
        }

        // Get final result
        return this.resultCompiler.getFinalResult(
            this.plugin.settings.includeTimestamps || false,
            true // Include metadata
        );
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

    private cleanupBlob(blob: Blob): void {
        // Attempt to revoke object URL if it exists
        try {
            if (blob && typeof URL.revokeObjectURL === 'function') {
                URL.revokeObjectURL(blob as any);
            }
        } catch (e) {
            // Ignore errors
        }
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