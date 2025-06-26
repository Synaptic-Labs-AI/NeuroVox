import { TranscriptionChunk, ChunkMetadata } from '../../types';

interface CompiledSegment {
    startTime: number;
    endTime: number;
    text: string;
    chunkId: string;
}

export class ResultCompiler {
    private segments: CompiledSegment[] = [];
    private totalDuration: number = 0;
    private startTimestamp: number;

    constructor(startTimestamp?: number) {
        this.startTimestamp = startTimestamp || Date.now();
    }

    addSegment(chunk: TranscriptionChunk): void {
        const segment: CompiledSegment = {
            startTime: chunk.metadata.timestamp - this.startTimestamp,
            endTime: (chunk.metadata.timestamp - this.startTimestamp) + chunk.metadata.duration,
            text: chunk.transcript.trim(),
            chunkId: chunk.metadata.id
        };

        // Insert in order by start time
        const insertIndex = this.segments.findIndex(s => s.startTime > segment.startTime);
        if (insertIndex === -1) {
            this.segments.push(segment);
        } else {
            this.segments.splice(insertIndex, 0, segment);
        }

        // Update total duration
        this.totalDuration = Math.max(this.totalDuration, segment.endTime);
    }

    getPartialResult(includeTimestamps: boolean = false): string {
        if (this.segments.length === 0) return '';

        if (includeTimestamps) {
            return this.segments
                .map(seg => `[${this.formatTime(seg.startTime)}] ${seg.text}`)
                .join('\n\n');
        } else {
            // Detect gaps and add ellipsis if needed
            let result = '';
            for (let i = 0; i < this.segments.length; i++) {
                const segment = this.segments[i];
                const prevSegment = i > 0 ? this.segments[i - 1] : null;
                
                // Check for gap
                if (prevSegment && segment.startTime - prevSegment.endTime > 1000) { // 1 second gap
                    result += '\n\n...\n\n';
                } else if (i > 0) {
                    result += ' ';
                }
                
                result += segment.text;
            }
            return result;
        }
    }

    getFinalResult(includeTimestamps: boolean = false, includeMetadata: boolean = false): string {
        if (this.segments.length === 0) return '';

        let result = '';

        if (includeMetadata) {
            const recordingDate = new Date(this.startTimestamp).toLocaleString();
            const duration = this.formatTime(this.totalDuration);
            result += `## Recording Information\n`;
            result += `- Date: ${recordingDate}\n`;
            result += `- Duration: ${duration}\n`;
            result += `- Segments: ${this.segments.length}\n\n`;
            result += `---\n\n`;
        }

        result += includeTimestamps ? '## Transcription with Timestamps\n\n' : '## Transcription\n\n';
        result += this.getPartialResult(includeTimestamps);

        return result;
    }

    private formatTime(milliseconds: number): string {
        const totalSeconds = Math.floor(milliseconds / 1000);
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }

    getSegmentCount(): number {
        return this.segments.length;
    }

    getTotalDuration(): number {
        return this.totalDuration;
    }

    clear(): void {
        this.segments = [];
        this.totalDuration = 0;
    }

    // For error recovery - get unprocessed segments
    getMissingSegments(processedChunkIds: Set<string>): number[] {
        const allIndices = new Set(Array.from({ length: this.segments.length }, (_, i) => i));
        const processedIndices = new Set(
            this.segments
                .map((seg, index) => processedChunkIds.has(seg.chunkId) ? index : -1)
                .filter(index => index !== -1)
        );
        
        return Array.from(allIndices).filter(index => !processedIndices.has(index));
    }
}