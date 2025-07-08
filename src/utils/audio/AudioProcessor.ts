import { Notice } from 'obsidian';
import NeuroVoxPlugin from '../../main';
import { AudioChunker } from './AudioChunker';
import { AudioFileManager } from './AudioFileManager';
import { AudioQuality } from '../../settings/Settings';
import { AIProvider } from '../../adapters/AIAdapter';

/**
 * Processes audio files including chunking, concatenation, and storage
 * Used by RecordingProcessor to handle all audio-related operations
 */
export class AudioProcessor {
    private readonly audioChunker: AudioChunker;
    private readonly audioFileManager: AudioFileManager;

    // Maximum audio size before skipping chunking (25MB)
    private readonly MAX_AUDIO_SIZE_BYTES = 25 * 1024 * 1024;

    // Audio quality settings (sample rates in Hz)
    private readonly SAMPLE_RATES = {
        [AudioQuality.Low]: 22050,    // Voice optimized (smaller files)
        [AudioQuality.Medium]: 32000,  // High quality voice (balanced)
        [AudioQuality.High]: 44100     // CD quality (larger files)
    };

    // Bitrate settings for different quality levels (bits per second)
    private readonly BIT_RATES = {
        [AudioQuality.Low]: 64000,     // Good for voice
        [AudioQuality.Medium]: 128000, // Excellent voice quality
        [AudioQuality.High]: 192000    // Studio quality
    };

    constructor(private plugin: NeuroVoxPlugin) {
        this.audioChunker = new AudioChunker(
            this.getSampleRate(),
            this.getBitRate(),
            'audio/webm; codecs=opus'
        );
        this.audioFileManager = new AudioFileManager(plugin);
    }

    /**
     * Processes an audio blob, handling large files by chunking if necessary
     * @param audioBlob The audio blob to process
     * @param audioFilePath Optional path to save the audio file
     * @returns Object containing paths to audio files and concatenated blob
     */
    public async processAudio(
        audioBlob: Blob,
        audioFilePath?: string
    ): Promise<{
        finalPath: string;
        audioBlob: Blob;
        processedChunks?: number;
        totalChunks?: number;
    }> {
        try {
            const fileSizeMB = audioBlob.size / (1024 * 1024);
            const provider = this.plugin.settings.transcriptionProvider;
            
            // Check provider capabilities
            if (this.canProviderHandleFile(provider, audioBlob.size)) {
                const finalPath = audioFilePath || await this.audioFileManager.saveAudioFile(audioBlob);
                return { finalPath, audioBlob };
            } else {
                throw new Error(this.getLargeFileErrorMessage(provider, fileSizeMB));
            }

        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            throw new Error(`Failed to process audio: ${message}`);
        }
    }

    /**
     * Gets the sample rate based on the current audio quality setting
     */
    private getSampleRate(): number {
        return this.SAMPLE_RATES[this.plugin.settings.audioQuality] || 
               this.SAMPLE_RATES[AudioQuality.Medium];
    }

    /**
     * Gets the bit rate based on the current audio quality setting
     */
    private getBitRate(): number {
        return this.BIT_RATES[this.plugin.settings.audioQuality] || 
               this.BIT_RATES[AudioQuality.Medium];
    }

    /**
     * Checks if the provider can handle the given file size
     */
    private canProviderHandleFile(provider: AIProvider, fileSize: number): boolean {
        const MAX_SIZE_25MB = 25 * 1024 * 1024;
        const MAX_SIZE_2GB = 2 * 1024 * 1024 * 1024;
        
        switch (provider) {
            case AIProvider.Deepgram:
                return fileSize <= MAX_SIZE_2GB; // 2GB limit
            case AIProvider.OpenAI:
            case AIProvider.Groq:
                return fileSize <= MAX_SIZE_25MB; // 25MB limit
            default:
                return fileSize <= MAX_SIZE_25MB; // Conservative default
        }
    }

    /**
     * Generates a helpful error message for files that are too large
     */
    private getLargeFileErrorMessage(provider: AIProvider, fileSizeMB: number): string {
        const fileSize = fileSizeMB.toFixed(1);
        
        switch (provider) {
            case AIProvider.OpenAI:
                return `File too large (${fileSize}MB) for OpenAI. Switch to Deepgram for large files.`;
                       
            case AIProvider.Groq:
                return `File too large (${fileSize}MB) for Groq. Switch to Deepgram for large files.`;
                       
            case AIProvider.Deepgram:
                return `File too large (${fileSize}MB). Split the audio file into smaller segments.`;
                       
            default:
                return `File too large (${fileSize}MB). Switch to Deepgram for large files.`;
        }
    }
}
