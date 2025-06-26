import { ChunkMetadata } from '../../types';
import { DeviceDetection } from '../DeviceDetection';

interface QueueItem {
    chunk: Blob;
    metadata: ChunkMetadata;
}

export class ChunkQueue {
    private queue: QueueItem[] = [];
    private maxQueueSize: number;
    private memoryLimit: number; // in bytes
    private currentMemoryUsage: number = 0;
    private deviceDetection: DeviceDetection;
    private processingCount: number = 0;
    private onMemoryWarning?: (usage: number) => void;
    private paused: boolean = false;

    constructor(maxQueueSize?: number, memoryLimit?: number, onMemoryWarning?: (usage: number) => void) {
        this.deviceDetection = DeviceDetection.getInstance();
        const options = this.deviceDetection.getOptimalStreamingOptions();
        
        this.maxQueueSize = maxQueueSize || options.maxQueueSize;
        this.memoryLimit = (memoryLimit || options.memoryLimit) * 1024 * 1024; // Convert MB to bytes
        this.onMemoryWarning = onMemoryWarning;
    }

    async enqueue(chunk: Blob, metadata: ChunkMetadata): Promise<boolean> {
        // Check if we can accept this chunk
        if (!this.canAcceptChunk(chunk.size)) {
            // Trigger memory warning
            if (this.onMemoryWarning) {
                this.onMemoryWarning(this.getMemoryUsagePercent());
            }
            return false;
        }

        // Add to queue
        this.queue.push({ chunk, metadata });
        this.currentMemoryUsage += chunk.size;

        // Check if we should pause (backpressure)
        if (this.shouldPause()) {
            this.paused = true;
        }

        return true;
    }

    dequeue(): QueueItem | null {
        const item = this.queue.shift();
        if (item) {
            this.currentMemoryUsage -= item.chunk.size;
            
            // Resume if we were paused and now have space
            if (this.paused && !this.shouldPause()) {
                this.paused = false;
            }
        }
        return item || null;
    }

    peek(): QueueItem | null {
        return this.queue[0] || null;
    }

    size(): number {
        return this.queue.length;
    }

    isEmpty(): boolean {
        return this.queue.length === 0;
    }

    isPaused(): boolean {
        return this.paused;
    }

    canAcceptChunk(chunkSize: number): boolean {
        // Check queue size limit
        if (this.queue.length >= this.maxQueueSize) {
            return false;
        }

        // Check memory limit
        if (this.currentMemoryUsage + chunkSize > this.memoryLimit) {
            return false;
        }

        // Check system memory if constrained
        if (this.deviceDetection.isMemoryConstrained()) {
            return false;
        }

        return true;
    }

    private shouldPause(): boolean {
        // Pause if queue is 80% full or memory usage is above 80%
        const queuePercent = this.queue.length / this.maxQueueSize;
        const memoryPercent = this.currentMemoryUsage / this.memoryLimit;
        
        return queuePercent >= 0.8 || memoryPercent >= 0.8;
    }

    getMemoryUsage(): number {
        return this.currentMemoryUsage;
    }

    getMemoryUsagePercent(): number {
        return (this.currentMemoryUsage / this.memoryLimit) * 100;
    }

    setProcessing(count: number): void {
        this.processingCount = count;
    }

    getProcessingCount(): number {
        return this.processingCount;
    }

    // Clear all chunks and free memory
    clear(): void {
        // Explicitly clear blob references to help GC
        for (const item of this.queue) {
            // Revoke any object URLs if they exist
            if (item.chunk && typeof URL.revokeObjectURL === 'function') {
                try {
                    // This will fail silently if the blob wasn't created from an object URL
                    URL.revokeObjectURL(item.chunk as any);
                } catch (e) {
                    // Ignore
                }
            }
        }
        
        this.queue = [];
        this.currentMemoryUsage = 0;
        this.processingCount = 0;
        this.paused = false;
    }

    // Get all pending chunks (for error recovery)
    getAllPending(): QueueItem[] {
        return [...this.queue];
    }

    // Get stats for monitoring
    getStats() {
        return {
            queueSize: this.queue.length,
            maxQueueSize: this.maxQueueSize,
            memoryUsage: this.currentMemoryUsage,
            memoryLimit: this.memoryLimit,
            memoryPercent: this.getMemoryUsagePercent(),
            isPaused: this.paused,
            processingCount: this.processingCount
        };
    }
}