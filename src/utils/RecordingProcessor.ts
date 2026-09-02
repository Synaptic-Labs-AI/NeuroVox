import { Notice, TFile, EditorPosition } from 'obsidian';
import NeuroVoxPlugin from '../main';
import { AudioProcessor } from './audio/AudioProcessor';
import { TranscriptionService, TranscriptionResult } from './transcription/TranscriptionService';
import { WavSegment } from './audio/WavSplitter';
import { DocumentInserter, InsertContent } from './document/DocumentInserter';
import { ProcessingState } from './state/ProcessingState';
import { AIAdapter, AIProvider } from '../adapters/AIAdapter';
import { isRetryable } from '../adapters/ApiError';

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
            this.processingState.setIsProcessing(true);
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
            let result: TranscriptionResult;
            if (audioResult.segments) {
                result = await this.transcribeSegments(audioResult.segments);
            } else {
                const audioBuffer = await audioResult.audioBlob.arrayBuffer();
                result = await this.executeWithRetry(() =>
                    this.transcriptionService.transcribeContent(audioBuffer)
                );
            }
            this.processingState.completeStep();

            if (result.postProcessingError) {
                new Notice(`⚠️ Post-processing failed, saving the transcription anyway: ${result.postProcessingError}`, 12000);
            }

            // Insert the content
            this.processingState.startStep('Content Insertion');
            await this.insertOrRescue(
                {
                    transcription: result.transcription,
                    postProcessing: result.postProcessing,
                    postProcessingError: result.postProcessingError,
                    audioFilePath: audioResult.finalPath
                },
                activeFile,
                cursorPosition
            );
            this.processingState.completeStep();

        } catch (error: unknown) {
            this.handleError('Processing failed', error);
            this.processingState.setError(error instanceof Error ? error : new Error(String(error)));
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
        cursorPosition: EditorPosition,
        audioFilePath?: string
    ): Promise<void> {
        if (this.processingState.getIsProcessing()) {
            throw new Error('Recording is already in progress.');
        }

        try {
            this.processingState.setIsProcessing(true);
            this.processingState.reset();

            // Skip audio processing since we already have the transcription
            this.processingState.startStep('Content Processing');

            // Generate post-processing if enabled. A failure here is recorded and carried
            // forward — the transcript is the thing the user actually spoke, and it gets
            // written to the note whether or not the summary succeeds.
            let postProcessing: string | undefined;
            let postProcessingError: string | undefined;
            if (this.plugin.settings.generatePostProcessing) {
                this.processingState.startStep('Post-processing');
                try {
                    postProcessing = await this.executeWithRetry(() =>
                        this.generatePostProcessing(transcriptionResult)
                    );
                } catch (error: unknown) {
                    postProcessingError = error instanceof Error ? error.message : 'Unknown error';
                    new Notice(`⚠️ Post-processing failed, saving the transcription anyway: ${postProcessingError}`, 12000);
                }
                this.processingState.completeStep();
            }

            // Insert the content
            this.processingState.startStep('Content Insertion');
            await this.insertOrRescue(
                {
                    transcription: transcriptionResult,
                    postProcessing,
                    postProcessingError,
                    audioFilePath
                },
                activeFile,
                cursorPosition
            );
            this.processingState.completeStep();

        } catch (error: unknown) {
            this.handleError('Processing failed', error);
            this.processingState.setError(error instanceof Error ? error : new Error(String(error)));
            throw error;
        } finally {
            this.processingState.setIsProcessing(false);
        }
    }

    /**
     * Transcribes a recording that was too large for a single provider request, one segment
     * at a time, then post-processes the assembled transcript once. Any segment failing
     * (after retries) fails the run: the audio file is untouched, so the user can retry.
     */
    private async transcribeSegments(segments: WavSegment[]): Promise<TranscriptionResult> {
        const texts: string[] = [];
        for (let i = 0; i < segments.length; i++) {
            this.processingState.updateProgress(i, segments.length);
            const buffer = await segments[i].blob.arrayBuffer();
            const text = await this.executeWithRetry(() =>
                this.transcriptionService.transcribeAudioOnly(buffer)
            );
            if (text.trim()) texts.push(text.trim());
        }
        this.processingState.updateProgress(segments.length, segments.length);

        const transcription = texts.join('\n\n');
        if (!transcription) {
            throw new Error('No transcription result received');
        }
        if (!this.plugin.settings.generatePostProcessing) {
            return { transcription };
        }
        try {
            const postProcessing = await this.executeWithRetry(() => this.generatePostProcessing(transcription));
            return { transcription, postProcessing };
        } catch (error: unknown) {
            // Same contract as TranscriptionService.transcribeContent: report the failure
            // alongside the transcript, never instead of it.
            return {
                transcription,
                postProcessingError: error instanceof Error ? error.message : 'Unknown error'
            };
        }
    }

    /**
     * Leaves a pointer to a saved recording in the note when its transcription failed, so
     * the audio is one click away from a retry rather than buried in the recordings folder.
     */
    public async insertRecordingFallback(
        audioFilePath: string,
        errorMessage: string,
        activeFile: TFile,
        cursorPosition: EditorPosition
    ): Promise<void> {
        await this.documentInserter.insertRecordingFallback(audioFilePath, errorMessage, activeFile, cursorPosition);
    }

    /**
     * Writes the content into the note, falling back to the clipboard if that write fails.
     *
     * Insertion is the last step, so by the time it runs the recording is gone and the
     * transcript exists only in memory. If the vault write fails there is nowhere else for
     * the text to go, and losing it is the single worst outcome of the whole pipeline.
     */
    private async insertOrRescue(
        content: InsertContent,
        activeFile: TFile,
        cursorPosition: EditorPosition
    ): Promise<void> {
        try {
            await this.documentInserter.insertContent(content, activeFile, cursorPosition);
        } catch (error) {
            try {
                await navigator.clipboard.writeText(content.transcription);
                new Notice('📋 Could not write to the note. The transcription was copied to your clipboard instead.', 15000);
            } catch {
                // Clipboard unavailable too: leave the text in the console as a last resort
                // so it is at least recoverable from the developer tools.
                console.error('[NeuroVox] Unable to save transcription anywhere. Transcript follows:\n', content.transcription);
                new Notice('❌ Could not save the transcription to the note or the clipboard. See the developer console to recover it.', 15000);
            }
            throw error;
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
    private getAdapter(provider: AIProvider, category: 'transcription' | 'language'): AIAdapter {
        const adapter = this.plugin.aiAdapters.get(provider);
        if (!adapter) {
            throw new Error(`${provider} adapter not found`);
        }

        if (adapter.requiresApiKey() && !adapter.getApiKey()) {
            throw new Error(`${provider} API key is not configured (needed for ${category})`);
        }

        // Deliberately not gated on the cached isReady() flag. That flag goes false on any
        // failed validation — including a network blip at plugin load — and never recovers
        // on its own, which would silently disable this category for the rest of the
        // session. Credentials are verified up front by the pre-flight check; if the key has
        // gone bad since, the provider's own error is more useful than a stale local flag.
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
            // A rejected key or a bad request parameter fails identically every time.
            // Retrying it three more times only makes the user wait longer for the same
            // error — which is exactly what made the original failure so frustrating.
            if (!isRetryable(error)) {
                throw error;
            }
            if (retryCount < this.config.maxRetries) {
                await new Promise(resolve => window.setTimeout(resolve, this.config.retryDelay));
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