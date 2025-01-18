import { Notice, TFile, EditorPosition, TFolder } from 'obsidian';
import { AIProvider, AIAdapter } from '../adapters/AIAdapter';
import { PluginData } from '../types';
import NeuroVoxPlugin from '../main';
import { ConfirmationModal, ConfirmationResult } from 'src/modals';

/**
 * Represents a single step in the processing pipeline
 */
interface ProcessingStep {
    name: string;
    startTime: number;
    endTime?: number;
}

/**
 * Configuration for the processing pipeline
 */
interface ProcessingConfig {
    maxRetries: number;
    retryDelay: number;
}

/**
 * Result of the processing pipeline
 */
interface ProcessingResult {
    transcription: string;
    summary?: string;
    timings: Record<string, number>;
    audioFilePath: string;
    audioBlob: Blob;
}

interface ProcessingState {
    isProcessing: boolean;
    currentStep: ProcessingStep | null;
    audioBlob?: Blob;
    transcription?: string;
    summary?: string;
    startTime: number;
    error?: string;
    processedChunks?: number;
    totalChunks?: number;
}

/**
 * Handles the processing of audio recordings including saving,
 * transcription, summarization, and file insertion
 */
export class RecordingProcessor {
    private static instance: RecordingProcessor | null = null;
    private processingState: ProcessingState = {
        isProcessing: false,
        currentStep: null,
        startTime: Date.now()
    };
    private steps: ProcessingStep[] = [];
    private currentStep: ProcessingStep | null = null;

    private readonly config: ProcessingConfig = {
        maxRetries: 3,
        retryDelay: 1000
    };

    private readonly MAX_AUDIO_SIZE_MB = 25;
    private readonly MAX_AUDIO_SIZE_BYTES = this.MAX_AUDIO_SIZE_MB * 1024 * 1024;
    private readonly CHUNK_OVERLAP_SECONDS = 2; // Overlap between chunks to prevent cutting words
    private readonly SAMPLE_RATE = 44100; // Standard sample rate for WAV files

    private constructor(
        private plugin: NeuroVoxPlugin,
        private pluginData: PluginData
    ) {}

    /**
     * Gets the singleton instance of RecordingProcessor
     */
    public static getInstance(plugin: NeuroVoxPlugin, pluginData: PluginData): RecordingProcessor {
        return this.instance ??= new RecordingProcessor(plugin, pluginData);
    }

    // Add state persistence methods
    private async saveState(): Promise<void> {
        try {
            const state = {
                ...this.processingState,
                audioBlob: undefined // Don't persist blob data
            };
            await this.plugin.saveData(state);
        } catch (error) {
            console.error('Failed to save processing state:', error);
        }
    }

    private async loadState(): Promise<void> {
        try {
            const state = await this.plugin.loadData();
            if (state) {
                this.processingState = { ...state, audioBlob: undefined };
            }
        } catch (error) {
            console.error('Failed to load processing state:', error);
        }
    }

    /**
     * Main processing pipeline for audio recordings
     */
    public async processRecording(
        audioBlob: Blob,
        activeFile: TFile,
        cursorPosition: EditorPosition,
        audioFilePath?: string
    ): Promise<void> {
        // Save initial state
        this.processingState.audioBlob = audioBlob;
        this.processingState.startTime = Date.now();
        await this.saveState();

        if (this.processingState.isProcessing) {
            throw new Error('Recording is already in progress.');
        }

        try {
            this.processingState.isProcessing = true;
            await this.saveState();

            this.steps = [];
            
            await this.validateRequirements();

            // Only show save dialog for new recordings, not existing files
            const shouldSaveAudio = audioFilePath ? true : await this.confirmSave();
            
            console.log('🎵 Processing audio file:', {
                size: `${(audioBlob.size / (1024 * 1024)).toFixed(2)}MB`,
                type: audioBlob.type,
                path: audioFilePath
            });

            if (audioBlob.size <= this.MAX_AUDIO_SIZE_BYTES) {
                const finalPath = audioFilePath || (shouldSaveAudio ? await this.saveAudioFile(audioBlob) : '');
                const result = await this.executeProcessingPipelineWithRecovery(audioBlob, finalPath);
                await this.insertResults(result, activeFile, cursorPosition);
            } else {
                await this.processLargeAudioFile(audioBlob, shouldSaveAudio, audioFilePath, activeFile, cursorPosition);
            }

            const timings = this.calculateTotalTimings();
            console.log('⏱️ Processing timings:', timings);
            
            this.showSuccessMessage(timings);
        } catch (error) {
            this.handleError('Processing failed', error);
            // Save error state for potential recovery
            this.processingState.error = error instanceof Error ? error.message : 'Unknown error';
            await this.saveState();
            throw error;
        } finally {
            this.cleanup();
        }
    }

    private async confirmSave(): Promise<boolean> {
        const confirmModal = new ConfirmationModal(this.plugin.app, {
            title: 'Recording Options',
            message: 'How would you like to handle this recording?',
            confirmText: 'Save and Process',
            processOnlyText: 'Process Only',
            cancelText: 'Cancel'
        });
        confirmModal.open();
        const result = await confirmModal.getResult();

        switch (result) {
            case ConfirmationResult.SaveAndProcess:
                return true;
            case ConfirmationResult.ProcessOnly:
                return false;
            case ConfirmationResult.Cancel:
                throw new Error('Recording cancelled');
            default:
                return false;
        }
    }

    /**
     * Splits the audio blob into smaller chunks under the size limit with overlap
     * to prevent cutting words at chunk boundaries
     */
    private async splitAudioBlob(audioBlob: Blob): Promise<Blob[]> {
        if (audioBlob.size <= this.MAX_AUDIO_SIZE_BYTES) {
            return [audioBlob];
        }

        try {
            // Convert blob to array buffer for processing
            const arrayBuffer = await audioBlob.arrayBuffer();
            const audioData = await this.convertToFloat32Array(arrayBuffer);

            // Calculate chunk sizes in samples
            const bytesPerSample = 4; // 32-bit float
            const samplesPerChunk = Math.floor(this.MAX_AUDIO_SIZE_BYTES / bytesPerSample);
            const overlapSamples = this.CHUNK_OVERLAP_SECONDS * this.SAMPLE_RATE;
            
            const chunks: Blob[] = [];
            let start = 0;

            while (start < audioData.length) {
                // Find the next zero crossing point near the chunk boundary
                const idealEnd = Math.min(start + samplesPerChunk, audioData.length);
                let end = idealEnd;
                
                // Look for zero crossing within 1000 samples of ideal end
                const searchStart = Math.max(idealEnd - 1000, start);
                const searchEnd = Math.min(idealEnd + 1000, audioData.length);
                
                for (let i = searchStart; i < searchEnd; i++) {
                    if (Math.abs(audioData[i]) < 0.01 && // Near zero amplitude
                        Math.abs(audioData[i + 1]) < 0.01) { // Check next sample too
                        end = i;
                        break;
                    }
                }

                // Create chunk with overlap
                const chunkStart = start > 0 ? start - overlapSamples : start;
                const chunkData = audioData.slice(chunkStart, end);
                
                // Convert back to blob
                const chunkBuffer = chunkData.buffer.slice(
                    chunkData.byteOffset,
                    chunkData.byteOffset + chunkData.byteLength
                );
                
                chunks.push(new Blob([chunkBuffer], { type: audioBlob.type }));
                
                // Update start position for next chunk
                start = end;
                
                // Log progress
                console.log('🎵 Created chunk', chunks.length, 'of approximately', 
                    Math.ceil(audioData.length / samplesPerChunk));
            }

            return chunks;
        } catch (error) {
            console.error('Error splitting audio:', error);
            throw error;
        }
    }

    /**
     * Converts an ArrayBuffer to Float32Array, handling different audio formats
     */
    private async convertToFloat32Array(arrayBuffer: ArrayBuffer): Promise<Float32Array> {
        try {
            // Try direct conversion first
            return new Float32Array(arrayBuffer);
        } catch (error) {
            console.warn('Direct Float32Array conversion failed, using alternative method');
            // If direct conversion fails, try to handle different audio formats
            const view = new DataView(arrayBuffer);
            const samples = new Float32Array(arrayBuffer.byteLength / 4);
            for (let i = 0; i < samples.length; i++) {
                samples[i] = view.getFloat32(i * 4, true);
            }
            return samples;
        }
    }

    /**
     * Validates all requirements before processing
     */
    private async validateRequirements(): Promise<void> {
        const transcriptionAdapter = this.getAdapter(
            this.pluginData.transcriptionProvider,
            'transcription'
        );

        if (this.pluginData.generateSummary) {
            this.getAdapter(this.pluginData.summaryProvider, 'language');
        }

        await this.ensureRecordingFolderExists();
    }

    /**
     * Gets and validates an AI adapter
     */
    private getAdapter(provider: AIProvider, category: 'transcription' | 'language'): AIAdapter {
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
     * Ensures the recording folder exists
     */
    private async ensureRecordingFolderExists(): Promise<void> {
        const folderPath = this.pluginData.recordingFolderPath;
        if (!folderPath) return;

        const parts = folderPath.split('/').filter(Boolean);
        let currentPath = '';

        for (const part of parts) {
            currentPath = currentPath ? `${currentPath}/${part}` : part;
            const folder = this.plugin.app.vault.getAbstractFileByPath(currentPath);
            
            if (!folder) {
                await this.plugin.app.vault.createFolder(currentPath);
            } else if (!(folder instanceof TFolder)) {
                throw new Error(`${currentPath} exists but is not a folder`);
            }
        }
    }

    /**
     * Saves the audio file to the configured location
     */
    private async saveAudioFile(audioBlob: Blob): Promise<string> {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const baseFileName = `recording-${timestamp}.wav`;
        const folderPath = this.pluginData.recordingFolderPath || '';
        let fileName = baseFileName;
        let filePath = folderPath ? `${folderPath}/${fileName}` : fileName;
        let count = 1;

        // Check if file exists and modify the filename if necessary
        while (await this.plugin.app.vault.adapter.exists(filePath)) {
            fileName = `recording-${timestamp}-${count}.wav`;
            filePath = folderPath ? `${folderPath}/${fileName}` : fileName;
            count++;
        }

        try {
            const arrayBuffer = await audioBlob.arrayBuffer();
            const file = await this.plugin.app.vault.createBinary(
                filePath,
                new Uint8Array(arrayBuffer)
            );

            if (!file) {
                throw new Error('Failed to create audio file');
            }

            return file.path;
        } catch (error) {
            this.handleError('Failed to save audio file', error);
            throw error;
        }
    }

    /**
     * Executes the main processing pipeline
     */
    private async executeProcessingPipeline(
        audioBlob: Blob,
        audioFilePath: string
    ): Promise<ProcessingResult> {
        const audioBuffer = await this.executeStep(
            'Audio Conversion',
            async () => await audioBlob.arrayBuffer()
        );

        const transcription = await this.executeStep(
            'Transcription',
            () => this.transcribeAudio(audioBuffer)
        );

        const summary = this.pluginData.generateSummary
            ? await this.executeStep(
                'Summarization',
                () => this.generateSummary(transcription)
            )
            : undefined;

        return {
            transcription,
            summary,
            timings: this.calculateTimings(),
            audioFilePath,
            audioBlob
        };
    }

    private async executeProcessingPipelineWithRecovery(
        audioBlob: Blob,
        audioFilePath: string
    ): Promise<ProcessingResult> {
        try {
            const result = await this.executeProcessingPipeline(audioBlob, audioFilePath);
            return result;
        } catch (error) {
            // Try to recover from saved state
            if (this.processingState.transcription) {
                return {
                    transcription: this.processingState.transcription,
                    summary: this.processingState.summary,
                    timings: this.calculateTimings(),
                    audioFilePath,
                    audioBlob
                };
            }
            throw error;
        }
    }

    private async processLargeAudioFile(
        audioBlob: Blob,
        shouldSaveAudio: boolean,
        audioFilePath: string | undefined,
        activeFile: TFile,
        cursorPosition: EditorPosition
    ): Promise<void> {
        const chunks = await this.splitAudioBlob(audioBlob);
        const allResults: ProcessingResult[] = [];
        
        for (let i = 0; i < chunks.length; i++) {
            try {
                const chunk = chunks[i];
                const chunkPath = audioFilePath || (shouldSaveAudio ? await this.saveAudioFile(chunk) : '');
                const result = await this.executeProcessingPipelineWithRecovery(chunk, chunkPath);
                allResults.push(result);
                
                // Save progress after each chunk
                this.processingState.processedChunks = i + 1;
                this.processingState.totalChunks = chunks.length;
                await this.saveState();
                
                // Show progress
                new Notice(`Processing chunk ${i + 1} of ${chunks.length}`);
            } catch (error) {
                console.error(`Error processing chunk ${i + 1}:`, error);
                // Continue with remaining chunks despite errors
            }
        }

        if (allResults.length > 0) {
            await this.insertAggregatedResults(allResults, activeFile, cursorPosition);
        } else {
            throw new Error('No chunks were successfully processed');
        }
    }

    /**
     * Executes a single processing step with retry logic
     */
    private async executeStep<T>(
        stepName: string,
        operation: () => Promise<T>,
        retryCount = 0
    ): Promise<T> {
        this.startStep(stepName);
        try {
            const result = await operation();
            this.completeStep();
            return result;
        } catch (error) {
            if (retryCount < this.config.maxRetries) {
                await new Promise(resolve => setTimeout(resolve, this.config.retryDelay));
                return this.executeStep(stepName, operation, retryCount + 1);
            }
            this.handleError(`${stepName} failed after ${retryCount} retries`, error);
            throw error;
        }
    }

    /**
     * Handles audio transcription
     */
    private async transcribeAudio(audioBuffer: ArrayBuffer): Promise<string> {
        const adapter = this.getAdapter(this.pluginData.transcriptionProvider, 'transcription');
        return adapter.transcribeAudio(audioBuffer, this.pluginData.transcriptionModel);
    }

    /**
     * Generates summary if enabled
     */
    private async generateSummary(transcription: string): Promise<string> {
        const adapter = this.getAdapter(this.pluginData.summaryProvider, 'language');
        const prompt = `${this.pluginData.summaryPrompt}\n\n${transcription}`;
        
        return adapter.generateResponse(prompt, this.pluginData.summaryModel, {
            maxTokens: this.pluginData.summaryMaxTokens,
            temperature: this.pluginData.summaryTemperature
        });
    }

    /**
     * Formats content for insertion into note
     */
    private formatContent(result: ProcessingResult): string {
        let content = '';
        
        // Only include audio player if there's a file path
        if (result.audioFilePath) {
            content = this.pluginData.transcriptionCalloutFormat
                .replace('{audioPath}', result.audioFilePath)
                .replace('{transcription}', result.transcription)
                + '\n';
        } else {
            // Use a simpler format without audio player
            content = '> [!note] Transcription\n> ' + result.transcription.replace(/\n/g, '\n> ') + '\n';
        }
        
        if (this.pluginData.generateSummary && result.summary) {
            content += '---\n' + this.pluginData.summaryCalloutFormat
                .replace('{summary}', result.summary)
                + '\n\n';
        }
        
        return content;
    }

    /**
     * Inserts results into the specified note
     */
    private async insertResults(
        result: ProcessingResult,
        file: TFile,
        cursorPosition: EditorPosition
    ): Promise<void> {
        const content = this.formatContent(result);

        await this.executeStep('Content Insertion', async () => {
            const fileContent = await this.plugin.app.vault.read(file);
            const updatedContent = this.insertAtPosition(fileContent, content, cursorPosition);
            await this.plugin.app.vault.modify(file, updatedContent);
        });
    }

    /**
     * Inserts aggregated results into the specified note with smart chunk handling
     */
    private async insertAggregatedResults(
        results: ProcessingResult[],
        file: TFile,
        cursorPosition: EditorPosition
    ): Promise<void> {
        // Merge transcriptions and summaries from each chunk, then insert once
        let combinedTranscription = '';
        let combinedSummary = '';
        for (const r of results) {
            combinedTranscription += r.transcription + '\n';
            if (r.summary) combinedSummary += r.summary + '\n';
        }
        const merged: ProcessingResult = {
            transcription: combinedTranscription.trim(),
            summary: combinedSummary.trim() || undefined,
            timings: {},
            audioFilePath: results.map(r => r.audioFilePath).join(', '),
            audioBlob: new Blob()
        };
        await this.insertResults(merged, file, cursorPosition);
    }

    /**
     * Inserts content at specific position in text
     */
    private insertAtPosition(
        content: string,
        newContent: string,
        position: EditorPosition
    ): string {
        const lines = content.split('\n');
        const offset = lines
            .slice(0, position.line)
            .reduce((acc, line) => acc + line.length + 1, 0) + position.ch;
        
        return content.slice(0, offset) + newContent + content.slice(offset);
    }

    /**
     * Step tracking methods
     */
    private startStep(name: string): void {
        this.currentStep = { name, startTime: performance.now() };
        this.steps.push(this.currentStep);
    }

    private completeStep(): void {
        if (this.currentStep) {
            this.currentStep.endTime = performance.now();
        }
    }

    private calculateTimings(): Record<string, number> {
        return Object.fromEntries(
            this.steps
                .filter((step: ProcessingStep) => step.endTime)
                .map((step: ProcessingStep) => [step.name, step.endTime! - step.startTime])
        );
    }

    /**
     * Calculates total timings from all processing steps
     */
    private calculateTotalTimings(): Record<string, number> {
        const totalTimings: Record<string, number> = {};
        for (const step of this.steps) {
            if (step.endTime) {
                totalTimings[step.name] = (totalTimings[step.name] || 0) + (step.endTime - step.startTime);
            }
        }
        return totalTimings;
    }

    /**
     * Error handling and notifications
     */
    private handleError(context: string, error: unknown): void {
        const message = error instanceof Error ? error.message : 'Unknown error occurred';
        console.error(`${context}:`, error);
        
        // Log detailed error information
        if (error instanceof Error) {
            console.error('Error details:', {
                name: error.name,
                message: error.message,
                stack: error.stack
            });
        }
        
        new Notice(`${context}: ${message}`);
    }

    private showSuccessMessage(timings: Record<string, number>): void {
        const timingMessages = Object.entries(timings)
            .map(([step, time]) => `${step}: ${time.toFixed(2)} ms`)
            .join('\n');
            
        new Notice(`Recording processed successfully.`);
    }

    /**
     * Removes duplicate content from overlapping chunks using text similarity
     */
    private deduplicateChunks(results: ProcessingResult[]): ProcessingResult[] {
        if (results.length <= 1) return results;

        const processed: ProcessingResult[] = [results[0]];
        
        for (let i = 1; i < results.length; i++) {
            const current = results[i];
            const previous = processed[processed.length - 1];
            
            // Find the overlap between chunks
            const overlap = this.findLargestOverlap(
                previous.transcription,
                current.transcription
            );
            
            // Remove the overlapping part from the current chunk
            if (overlap) {
                current.transcription = current.transcription.substring(overlap.length);
            }
            
            processed.push(current);
        }
        
        return processed;
    }

    /**
     * Finds the largest overlapping text between two strings
     */
    private findLargestOverlap(str1: string, str2: string): string {
        const minOverlapLength = 10; // Minimum characters to consider as overlap
        let overlap = '';
        
        // Get the end of first string and start of second string
        const end1 = str1.slice(-100); // Look at last 100 characters
        const start2 = str2.slice(0, 100); // Look at first 100 characters
        
        // Find the longest matching sequence
        for (let i = minOverlapLength; i < Math.min(end1.length, start2.length); i++) {
            const endPart = end1.slice(-i);
            if (start2.startsWith(endPart)) {
                overlap = endPart;
            }
        }
        
        return overlap;
    }

    /**
     * Cleans up transcription text by removing artifacts and normalizing spacing
     */
    private cleanupTranscription(text: string): string {
        return text
            .replace(/\s+/g, ' ') // Normalize spaces
            .replace(/(\w)\s+(\W)/g, '$1$2') // Remove spaces before punctuation
            .replace(/(\W)\s+(\w)/g, '$1 $2') // Ensure space after punctuation
            .replace(/\s+\./g, '.') // Remove spaces before periods
            .replace(/\s+,/g, ',') // Remove spaces before commas
            .trim();
    }

    private cleanup(): void {
        this.processingState = {
            isProcessing: false,
            currentStep: null,
            startTime: Date.now()
        };
        this.saveState().catch(console.error);
    }
}
