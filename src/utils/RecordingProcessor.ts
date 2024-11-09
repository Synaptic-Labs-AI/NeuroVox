import { Plugin, Notice, TFile, EditorPosition, TFolder } from 'obsidian';
import { AIProvider, AIAdapter } from '../adapters/AIAdapter';
import { PluginData } from '../types';
import NeuroVoxPlugin from '../main';

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

/**
 * Handles the processing of audio recordings including saving,
 * transcription, summarization, and file insertion
 */
export class RecordingProcessor {
    private static instance: RecordingProcessor | null = null;
    private isProcessing = false;
    private currentStep: ProcessingStep | null = null;
    private steps: ProcessingStep[] = [];

    private readonly config: ProcessingConfig = {
        maxRetries: 3,
        retryDelay: 1000
    };

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

    /**
     * Main processing pipeline for audio recordings
     */
    public async processRecording(
        audioBlob: Blob,
        activeFile: TFile,
        cursorPosition: EditorPosition
    ): Promise<void> {
        if (this.isProcessing) {
            throw new Error('Recording is already in progress.');
        }

        try {
            this.isProcessing = true;
            this.steps = [];
            
            await this.validateRequirements();
            const savedFilePath = await this.saveAudioFile(audioBlob);
            const result = await this.executeProcessingPipeline(audioBlob, savedFilePath);
            await this.insertResults(result, activeFile, cursorPosition);
            this.showSuccessMessage(result.timings);
        } catch (error) {
            this.handleError('Processing failed', error);
            throw error;
        } finally {
            this.cleanup();
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
        const fileName = `recording-${timestamp}.wav`;
        const folderPath = this.pluginData.recordingFolderPath || '';
        const filePath = folderPath ? `${folderPath}/${fileName}` : fileName;

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
        let content = `\n>[!info]- Transcription\n>![[${result.audioFilePath}]]\n>${result.transcription}\n`;
        
        if (this.pluginData.generateSummary && result.summary) {
            content += `---\n>[!summary]- Summary\n>${result.summary}\n\n`;
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
            const currentContent = await this.plugin.app.vault.read(file);
            const newContent = cursorPosition
                ? this.insertAtPosition(currentContent, content, cursorPosition)
                : currentContent + content;
            
            await this.plugin.app.vault.modify(file, newContent);
        });
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
                .filter(step => step.endTime)
                .map(step => [step.name, step.endTime! - step.startTime])
        );
    }

    /**
     * Error handling and notifications
     */
    private handleError(context: string, error: unknown): void {
        const message = error instanceof Error ? error.message : 'Unknown error occurred';
        console.error(`${context}:`, error);
        new Notice(`${context}: ${message}`);
    }

    private showSuccessMessage(timings: Record<string, number>): void {
        const timingMessages = Object.entries(timings)
            .map(([step, time]) => `${step}: ${time.toFixed(2)} ms`)
            .join('\n');
            
        new Notice(`Recording processed successfully.\n${timingMessages}`);
        console.log('Processing completed with timings:', timings);
    }

    private cleanup(): void {
        this.isProcessing = false;
        this.currentStep = null;
    }
}