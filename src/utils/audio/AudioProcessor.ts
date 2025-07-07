import { Notice } from 'obsidian';
import NeuroVoxPlugin from '../../main';
import { AudioChunker } from './AudioChunker';
import { AudioFileManager } from './AudioFileManager';
import { AudioQuality } from '../../settings/Settings';

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
            console.log('🔍 AudioProcessor: Processing audio, size:', audioBlob.size, 'bytes');
            
            // For existing audio files, skip chunking entirely and process directly
            // The AudioChunker is designed for real-time recording streams, not existing MP3/audio files
            // Chunking existing audio files by bytes creates invalid audio data that can't be decoded
            console.log('🔍 AudioProcessor: Processing existing audio file directly without chunking');
            const finalPath = audioFilePath || await this.audioFileManager.saveAudioFile(audioBlob);
            return { finalPath, audioBlob };

        } catch (error) {
            console.error('❌ AudioProcessor: Error in processAudio:', error);
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
}
