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
        if (this.processingState.getIsProcessing()) {
            throw new Error('Recording is already in progress.');
        }

        try {
            console.log('🔍 RecordingProcessor: Starting processRecording...');
            this.processingState.setIsProcessing(true);
            this.processingState.reset();
            
            // Process the audio file
            console.log('🔍 RecordingProcessor: Starting audio processing...');
            this.processingState.startStep('Audio Processing');
            const audioResult = await this.audioProcessor.processAudio(audioBlob, audioFilePath);
            this.processingState.completeStep();
            console.log('🔍 RecordingProcessor: Audio processing completed');

            // Update progress if chunks were processed
            if (audioResult.processedChunks && audioResult.totalChunks) {
                this.processingState.updateProgress(
                    audioResult.processedChunks,
                    audioResult.totalChunks
                );
            }

            // Transcribe the audio
            console.log('🔍 RecordingProcessor: Starting transcription...');
            this.processingState.startStep('Transcription');
            const audioBuffer = await audioResult.audioBlob.arrayBuffer();
            console.log('🔍 RecordingProcessor: Audio buffer size:', audioBuffer.byteLength);
            const result = await this.executeWithRetry(() => 
                this.transcriptionService.transcribeContent(audioBuffer)
            );
            this.processingState.completeStep();
            console.log('🔍 RecordingProcessor: Transcription completed, length:', result.transcription.length);

            // Insert the content
            console.log('🔍 RecordingProcessor: Starting content insertion...');
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
            console.log('🔍 RecordingProcessor: Content insertion completed');

        } catch (error) {
            console.error('❌ RecordingProcessor: Error in processRecording:', error);
            this.handleError('Processing failed', error);
            this.processingState.setError(error as Error);
            throw error;
        } finally {
            this.processingState.setIsProcessing(false);
        }
    }

    /**
     * Processes a streaming transcription result: inserts pre-transcribed content into the document
     */
    public async processStreamingResult(
        transcriptionResult: string,
        activeFile: TFile,
        cursorPosition: EditorPosition
    ): Promise<void> {
        if (this.processingState.getIsProcessing()) {
            throw new Error('Recording is already in progress.');
        }

        try {
            this.processingState.setIsProcessing(true);
            this.processingState.reset();
            
            // Skip audio processing since we already have the transcription
            this.processingState.startStep('Content Processing');
            
            // Generate post-processing if enabled
            let postProcessing: string | undefined;
            if (this.plugin.settings.generatePostProcessing) {
                this.processingState.startStep('Post-processing');
                postProcessing = await this.executeWithRetry(() => 
                    this.generatePostProcessing(transcriptionResult)
                );
                this.processingState.completeStep();
            }

            // Insert the content
            this.processingState.startStep('Content Insertion');
            await this.documentInserter.insertContent(
                {
                    transcription: transcriptionResult,
                    postProcessing
                    // No audioFilePath for streaming mode
                },
                activeFile,
                cursorPosition
            );
            this.processingState.completeStep();

        } catch (error) {
            this.handleError('Processing failed', error);
            this.processingState.setError(error as Error);
            throw error;
        } finally {
            this.processingState.setIsProcessing(false);
        }
    }

    /**
     * Generates post-processing content using the configured AI adapter
     */
    private async generatePostProcessing(transcription: string): Promise<string> {
        const adapter = this.getAdapter(
            this.plugin.settings.postProcessingProvider,
            'language'
        );

        const prompt = `${this.plugin.settings.postProcessingPrompt}\n\n${transcription}`;
        
        return adapter.generateResponse(
            prompt,
            this.plugin.settings.postProcessingModel,
            {
                maxTokens: this.plugin.settings.postProcessingMaxTokens,
                temperature: this.plugin.settings.postProcessingTemperature
            }
        );
    }

    /**
     * Gets and validates the appropriate AI adapter
     */
    private getAdapter(provider: any, category: 'transcription' | 'language'): any {
        const adapter = this.plugin.aiAdapters.get(provider);
        if (!adapter) {
            throw new Error(`${provider} adapter not found`);
        }

        if (!adapter.isReady(category)) {
            const apiKey = adapter.getApiKey();
            if (!apiKey) {
                throw new Error(`${provider} API key is not configured`);
            }
            throw new Error(
                `${provider} adapter is not ready for ${category}. Please check your settings and model availability.`
            );
        }

        return adapter;
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
     * Handles error display
     */
    private handleError(context: string, error: unknown): void {
        const message = error instanceof Error ? error.message : 'Unknown error occurred';
        new Notice(`${context}: ${message}`);
    }
}