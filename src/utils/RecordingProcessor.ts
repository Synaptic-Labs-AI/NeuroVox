import { Notice, TFile, EditorPosition } from 'obsidian';
import NeuroVoxPlugin from '../main';
import { AudioProcessor } from './audio/AudioProcessor';
import { TranscriptionService, TranscriptionResult } from './transcription/TranscriptionService';
import { DocumentInserter } from './document/DocumentInserter';
import { ProcessingState } from './state/ProcessingState';

/**
 * Configuration for the processing pipeline
 */
interface ProcessingConfig {
    maxRetries: number;
    retryDelay: number;
}

/**
 * Handles the processing of audio recordings by coordinating between specialized modules:
 * - AudioProcessor: Handles audio chunking, concatenation, and file operations
 * - TranscriptionService: Manages AI transcription and post-processing
 * - DocumentInserter: Handles formatting and inserting content into notes
 * - ProcessingState: Manages state persistence and tracking
 */
export class RecordingProcessor {
    private static instance: RecordingProcessor | null = null;
    private readonly processingState: ProcessingState;
    private readonly audioProcessor: AudioProcessor;
    private readonly transcriptionService: TranscriptionService;
    private readonly documentInserter: DocumentInserter;

    private readonly config: ProcessingConfig = {
        maxRetries: 3,
        retryDelay: 1000
    };

    private constructor(private plugin: NeuroVoxPlugin) {
        this.processingState = new ProcessingState();
        this.audioProcessor = new AudioProcessor(plugin);
        this.transcriptionService = new TranscriptionService(plugin);
        this.documentInserter = new DocumentInserter(plugin);
    }

    public static getInstance(plugin: NeuroVoxPlugin): RecordingProcessor {
        return this.instance ??= new RecordingProcessor(plugin);
    }

    /**
     * Processes a recording: transcribes audio and inserts the content into the document
     */
    public async processRecording(
        audioBlob: Blob,
        activeFile: TFile,
        cursorPosition: EditorPosition,
        audioFilePath?: string
    ): Promise<void> {
        await this.loadState();

        if (this.processingState.getIsProcessing()) {
            throw new Error('Recording is already in progress.');
        }

        try {
            this.processingState.setIsProcessing(true);
            await this.saveState();

            this.processingState.reset();
            
            // Process the audio file
            this.processingState.startStep('Audio Processing');
            const audioResult = await this.audioProcessor.processAudio(audioBlob, audioFilePath);
            this.processingState.completeStep();

            // Update progress if chunks were processed
            if (audioResult.processedChunks && audioResult.totalChunks) {
                this.processingState.updateProgress(
                    audioResult.processedChunks,
                    audioResult.totalChunks
                );
            }

            // Transcribe the audio
            this.processingState.startStep('Transcription');
            const audioBuffer = await audioResult.audioBlob.arrayBuffer();
            const result = await this.executeWithRetry(() => 
                this.transcriptionService.transcribeContent(audioBuffer)
            );
            this.processingState.completeStep();

            // Insert the content
            this.processingState.startStep('Content Insertion');
            await this.documentInserter.insertContent(
                {
                    transcription: result.transcription,
                    postProcessing: result.postProcessing,
                    audioFilePath: audioResult.finalPath
                },
                activeFile,
                cursorPosition
            );
            this.processingState.completeStep();

        } catch (error) {
            this.handleError('Processing failed', error);
            this.processingState.setError(error as Error);
            await this.saveState();
            throw error;
        } finally {
            this.processingState.setIsProcessing(false);
            await this.saveState();
        }
    }

    /**
     * Executes an operation with retry logic
     */
    private async executeWithRetry<T>(
        operation: () => Promise<T>,
        retryCount = 0
    ): Promise<T> {
        try {
            return await operation();
        } catch (error) {
            if (retryCount < this.config.maxRetries) {
                await new Promise(resolve => setTimeout(resolve, this.config.retryDelay));
                return this.executeWithRetry(operation, retryCount + 1);
            }
            throw error;
        }
    }

    /**
     * Saves the current processing state
     */
    private async saveState(): Promise<void> {
        try {
            await this.plugin.saveData(this.processingState.toJSON());
        } catch (error) {
            console.error("Failed to save processing state:", error);
        }
    }

    /**
     * Loads the processing state
     */
    private async loadState(): Promise<void> {
        try {
            const state = await this.plugin.loadData();
            if (state) {
                this.processingState.fromJSON(state);
            }
        } catch (error) {
            console.error("Failed to load processing state:", error);
        }
    }

    /**
     * Handles error display
     */
    private handleError(context: string, error: unknown): void {
        const message = error instanceof Error ? error.message : 'Unknown error occurred';
        new Notice(`${context}: ${message}`);
    }
}
