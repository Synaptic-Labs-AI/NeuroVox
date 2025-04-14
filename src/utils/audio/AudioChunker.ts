/**
 * Handles splitting and combining audio files into manageable chunks
 * Used by the AudioProcessor for handling large audio files
 */
export class AudioChunker {
    private readonly MAX_AUDIO_SIZE_MB = 25;
    private readonly MAX_AUDIO_SIZE_BYTES = this.MAX_AUDIO_SIZE_MB * 1024 * 1024;
    private readonly CHUNK_OVERLAP_SECONDS = 2;

    constructor(private readonly sampleRate: number) {}

    /**
     * Splits an audio blob into smaller chunks if necessary
     * @param audioBlob The audio blob to potentially split
     * @returns Array of audio blobs (single item if no split needed)
     */
    public async splitAudioBlob(audioBlob: Blob): Promise<Blob[]> {
        if (audioBlob.size <= this.MAX_AUDIO_SIZE_BYTES) {
            return [audioBlob];
        }

        try {
            // Instead of decoding the entire file at once, process it in segments
            const chunks: Blob[] = [];
            const chunkSize = this.MAX_AUDIO_SIZE_BYTES;
            let offset = 0;

            while (offset < audioBlob.size) {
                const end = Math.min(offset + chunkSize, audioBlob.size);
                const chunk = audioBlob.slice(offset, end);
                
                // Create a small audio context just for this chunk
                const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({
                    sampleRate: this.sampleRate
                });
                
                // Process the chunk
                const arrayBuffer = await chunk.arrayBuffer();
                const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
                const processedChunk = await this.bufferToBlob(audioContext, audioBuffer, audioBlob.type);
                chunks.push(processedChunk);
                
                // Clean up the audio context
                await audioContext.close();
                
                offset += chunkSize;
            }
            
            return chunks;
        } catch (error) {
            console.error('Error splitting audio:', error);
            return [audioBlob];
        }
    }

    /**
     * Concatenates multiple audio chunks back into a single blob
     * @param chunks Array of audio blobs to combine
     * @returns Single concatenated audio blob
     */
    public async concatenateAudioChunks(chunks: Blob[]): Promise<Blob> {
        try {
            const firstChunk = chunks[0];
            const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({
                sampleRate: this.sampleRate
            });
            
            const processedChunks: Blob[] = [];
            for (const chunk of chunks) {
                const processedChunk = await this.processChunk(chunk, firstChunk.type, audioContext);
                processedChunks.push(processedChunk);
            }
            
            await audioContext.close();
            return new Blob(processedChunks, { type: firstChunk.type });
            
        } catch (error) {
            console.error('Error concatenating audio:', error);
            return chunks[0];
        }
    }

    /**
     * Creates a chunk from the audio buffer
     */
    private async createChunk(
        audioContext: AudioContext,
        audioBuffer: AudioBuffer,
        startTime: number,
        endTime: number,
        mimeType: string
    ): Promise<Blob> {
        // Create a new buffer for this chunk
        const chunkBuffer = audioContext.createBuffer(
            audioBuffer.numberOfChannels,
            Math.ceil((endTime - startTime) * audioBuffer.sampleRate),
            audioBuffer.sampleRate
        );
        
        // Copy data for each channel
        for (let channel = 0; channel < audioBuffer.numberOfChannels; channel++) {
            const channelData = audioBuffer.getChannelData(channel);
            const chunkData = chunkBuffer.getChannelData(channel);
            const startSample = Math.floor(startTime * audioBuffer.sampleRate);
            const endSample = Math.ceil(endTime * audioBuffer.sampleRate);
            chunkData.set(channelData.subarray(startSample, endSample));
        }
        
        return await this.bufferToBlob(audioContext, chunkBuffer, mimeType);
    }

    /**
     * Processes a single chunk for concatenation
     */
    private async processChunk(
        chunk: Blob,
        mimeType: string,
        audioContext: AudioContext
    ): Promise<Blob> {
        try {
            const arrayBuffer = await chunk.arrayBuffer();
            const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
            return await this.bufferToBlob(audioContext, audioBuffer, mimeType);
        } catch (error) {
            console.error('Error processing chunk:', error);
            return chunk;
        }
    }

    /**
     * Converts an AudioBuffer to a Blob using MediaRecorder
     */
    private async bufferToBlob(
        audioContext: AudioContext,
        buffer: AudioBuffer,
        mimeType: string
    ): Promise<Blob> {
        return new Promise<Blob>((resolve) => {
            const source = audioContext.createBufferSource();
            source.buffer = buffer;
            const destination = audioContext.createMediaStreamDestination();
            source.connect(destination);
            
            const recorder = new MediaRecorder(destination.stream, { mimeType });
            const chunks: Blob[] = [];
            
            recorder.ondataavailable = (e) => {
                if (e.data.size > 0) chunks.push(e.data);
            };
            
            recorder.onstop = () => {
                resolve(new Blob(chunks, { type: mimeType }));
            };
            
            recorder.start();
            source.start(0);
            
            setTimeout(() => {
                source.stop();
                recorder.stop();
            }, buffer.duration * 1000);
        });
    }
}
