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
    private readonly CHUNK_OVERLAP_SECONDS = 2;
    private readonly SAMPLE_RATE = 44100;

    private constructor(
        private plugin: NeuroVoxPlugin,
        private pluginData: PluginData
    ) {}

    public static getInstance(plugin: NeuroVoxPlugin, pluginData: PluginData): RecordingProcessor {
        return this.instance ??= new RecordingProcessor(plugin, pluginData);
    }

    private async saveState(): Promise<void> {
        try {
            const state = {
                ...this.processingState,
                audioBlob: undefined
            };
            await this.plugin.saveData(state);
        } catch (error) {
        }
    }

    private async loadState(): Promise<void> {
        try {
            const state = await this.plugin.loadData();
            if (state) {
                this.processingState = { ...state, audioBlob: undefined };
            }
        } catch (error) {
        }
    }

    public async processRecording(
        audioBlob: Blob,
        activeFile: TFile,
        cursorPosition: EditorPosition,
        audioFilePath?: string,
        shouldSaveAudio: boolean = false
    ): Promise<void> {
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

            // Use provided audioFilePath or save if requested
            let finalPath = audioFilePath || '';
            if (!audioFilePath && shouldSaveAudio) {
                finalPath = await this.saveAudioFile(audioBlob);
            }

            if (audioBlob.size <= this.MAX_AUDIO_SIZE_BYTES) {
                const result = await this.executeProcessingPipelineWithRecovery(audioBlob, finalPath);
                await this.insertResults(result, activeFile, cursorPosition);
            } else {
                await this.processLargeAudioFile(audioBlob, shouldSaveAudio, finalPath, activeFile, cursorPosition);
            }

        } catch (error) {
            this.handleError('Processing failed', error);
            this.processingState.error = error instanceof Error ? error.message : 'Unknown error';
            await this.saveState();
            throw error;
        } finally {
            this.cleanup();
        }
    }

    private async splitAudioBlob(audioBlob: Blob): Promise<Blob[]> {
        if (audioBlob.size <= this.MAX_AUDIO_SIZE_BYTES) {
            return [audioBlob];
        }

        try {
            const arrayBuffer = await audioBlob.arrayBuffer();
            const audioData = await this.convertToFloat32Array(arrayBuffer);

            const bytesPerSample = 4;
            const samplesPerChunk = Math.floor(this.MAX_AUDIO_SIZE_BYTES / bytesPerSample);
            const overlapSamples = this.CHUNK_OVERLAP_SECONDS * this.SAMPLE_RATE;
            
            const chunks: Blob[] = [];
            let start = 0;

            while (start < audioData.length) {
                const idealEnd = Math.min(start + samplesPerChunk, audioData.length);
                let end = idealEnd;
                
                const searchStart = Math.max(idealEnd - 1000, start);
                const searchEnd = Math.min(idealEnd + 1000, audioData.length);
                
                for (let i = searchStart; i < searchEnd; i++) {
                    if (Math.abs(audioData[i]) < 0.01 && 
                        Math.abs(audioData[i + 1]) < 0.01) {
                        end = i;
                        break;
                    }
                }

                const chunkStart = start > 0 ? start - overlapSamples : start;
                const chunkData = audioData.slice(chunkStart, end);
                
                const chunkBuffer = chunkData.buffer.slice(
                    chunkData.byteOffset,
                    chunkData.byteOffset + chunkData.byteLength
                );
                
                chunks.push(new Blob([chunkBuffer], { type: audioBlob.type }));
                start = end;
            }

            return chunks;
        } catch (error) {
            throw error;
        }
    }

    private async convertToFloat32Array(arrayBuffer: ArrayBuffer): Promise<Float32Array> {
        try {
            return new Float32Array(arrayBuffer);
        } catch (error) {
            const view = new DataView(arrayBuffer);
            const samples = new Float32Array(arrayBuffer.byteLength / 4);
            for (let i = 0; i < samples.length; i++) {
                samples[i] = view.getFloat32(i * 4, true);
            }
            return samples;
        }
    }

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

    private async saveAudioFile(audioBlob: Blob): Promise<string> {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const baseFileName = `recording-${timestamp}.wav`;
        const folderPath = this.pluginData.recordingFolderPath || '';
        let fileName = baseFileName;
        let filePath = folderPath ? `${folderPath}/${fileName}` : fileName;
        let count = 1;

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
                
                this.processingState.processedChunks = i + 1;
                this.processingState.totalChunks = chunks.length;
                await this.saveState();
                
                new Notice(`Processing chunk ${i + 1} of ${chunks.length}`);
            } catch (error) {
            }
        }

        if (allResults.length > 0) {
            await this.insertAggregatedResults(allResults, activeFile, cursorPosition);
        } else {
            throw new Error('No chunks were successfully processed');
        }
    }

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

    private async transcribeAudio(audioBuffer: ArrayBuffer): Promise<string> {
        const adapter = this.getAdapter(this.pluginData.transcriptionProvider, 'transcription');
        return adapter.transcribeAudio(audioBuffer, this.pluginData.transcriptionModel);
    }

    private async generateSummary(transcription: string): Promise<string> {
        const adapter = this.getAdapter(this.pluginData.summaryProvider, 'language');
        const prompt = `${this.pluginData.summaryPrompt}\n\n${transcription}`;
        
        return adapter.generateResponse(prompt, this.pluginData.summaryModel, {
            maxTokens: this.pluginData.summaryMaxTokens,
            temperature: this.pluginData.summaryTemperature
        });
    }

    private formatContent(result: ProcessingResult): string {
        let content = '';
        
        if (result.audioFilePath) {
            content = this.pluginData.transcriptionCalloutFormat
                .replace('{audioPath}', result.audioFilePath)
                .replace('{transcription}', result.transcription)
                + '\n';
        } else {
            content = '> [!note] Transcription\n> ' + result.transcription.replace(/\n/g, '\n> ') + '\n';
        }
        
        if (this.pluginData.generateSummary && result.summary) {
            content += '---\n' + this.pluginData.summaryCalloutFormat
                .replace('{summary}', result.summary)
                + '\n\n';
        }
        
        return content;
    }

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

    private async insertAggregatedResults(
        results: ProcessingResult[],
        file: TFile,
        cursorPosition: EditorPosition
    ): Promise<void> {
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

    private handleError(context: string, error: unknown): void {
        const message = error instanceof Error ? error.message : 'Unknown error occurred';
        new Notice(`${context}: ${message}`);
    }

    private showSuccessMessage(): void {
        new Notice(`Recording processed successfully.`);
    }

    private deduplicateChunks(results: ProcessingResult[]): ProcessingResult[] {
        if (results.length <= 1) return results;

        const processed: ProcessingResult[] = [results[0]];
        
        for (let i = 1; i < results.length; i++) {
            const current = results[i];
            const previous = processed[processed.length - 1];
            
            const overlap = this.findLargestOverlap(
                previous.transcription,
                current.transcription
            );
            
            if (overlap) {
                current.transcription = current.transcription.substring(overlap.length);
            }
            
            processed.push(current);
        }
        
        return processed;
    }

    private findLargestOverlap(str1: string, str2: string): string {
        const minOverlapLength = 10;
        let overlap = '';
        
        const end1 = str1.slice(-100);
        const start2 = str2.slice(0, 100);
        
        for (let i = minOverlapLength; i < Math.min(end1.length, start2.length); i++) {
            const endPart = end1.slice(-i);
            if (start2.startsWith(endPart)) {
                overlap = endPart;
            }
        }
        
        return overlap;
    }

    private cleanupTranscription(text: string): string {
        return text
            .replace(/\s+/g, ' ')
            .replace(/(\w)\s+(\W)/g, '$1$2')
            .replace(/(\W)\s+(\w)/g, '$1 $2')
            .replace(/\s+\./g, '.')
            .replace(/\s+,/g, ',')
            .trim();
    }

    private cleanup(): void {
        this.processingState = {
            isProcessing: false,
            currentStep: null,
            startTime: Date.now()
        };
        this.saveState().catch(error => error);
    }
}
