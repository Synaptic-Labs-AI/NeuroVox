// src/processing/RecordingProcessor.ts

import { Plugin, Notice, TFile, EditorPosition } from 'obsidian';
import { AIProvider, AIAdapter } from '../adapters/AIAdapter';
import { PluginData } from '../types';
import NeuroVoxPlugin from '../main';

interface ProcessingStep {
    name: string;
    startTime: number;
    endTime?: number;
}

interface ProcessingResult {
    transcription: string;
    summary?: string;
    timings: Record<string, number>;
    audioBlob: Blob
}

export class RecordingProcessor {
    private static instance: RecordingProcessor | null = null;
    private isProcessing: boolean = false;
    private currentStep: ProcessingStep | null = null;
    private steps: ProcessingStep[] = [];

    private constructor(
        private plugin: NeuroVoxPlugin,
        private pluginData: PluginData
    ) {}

    /**
     * Gets the singleton instance of RecordingProcessor
     */
    public static getInstance(plugin: NeuroVoxPlugin, pluginData: PluginData): RecordingProcessor {
        if (!RecordingProcessor.instance) {
            RecordingProcessor.instance = new RecordingProcessor(plugin, pluginData);
        }
        return RecordingProcessor.instance;
    }

    /**
     * Main processing pipeline for audio recording
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
    
            // Validate requirements before processing
            await this.validateRequirements();
    
            // Process the recording
            const result = await this.executeProcessingPipeline(audioBlob);
    
            // Insert the results into the note - now passing audioBlob from result
            await this.insertResults(
                result,
                activeFile,
                cursorPosition,
                audioBlob
            );
    
            // Show success message
            this.showSuccessMessage(result.timings);
    
        } catch (error) {
            this.handleError('Processing failed', error);
            throw error;
        } finally {
            this.isProcessing = false;
            this.currentStep = null;
        }
    }

    /**
     * Validates all requirements before processing starts
     */
    private async validateRequirements(): Promise<void> {
        // Get and validate transcription adapter
        const transcriptionAdapter = this.getAdapter(
            this.pluginData.transcriptionProvider,
            'transcription'
        );

        // If summary is enabled, validate summary adapter
        if (this.pluginData.generateSummary) {
            const summaryAdapter = this.getAdapter(
                this.pluginData.summaryProvider,
                'language'
            );
        }
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
                `${provider} adapter is not ready for ${category}. ` +
                'Please check your settings and model availability.'
            );
        }

        return adapter;
    }

    /**
     * Executes the main processing pipeline
     */
    private async executeProcessingPipeline(audioBlob: Blob): Promise<ProcessingResult> {
        const timings: Record<string, number> = {};
        
        // Step 1: Convert audio
        const audioBuffer = await this.executeStep(
            'Audio Conversion',
            () => this.blobToArrayBuffer(audioBlob)
        );
        
        // Step 2: Transcribe
        const transcription = await this.executeStep(
            'Transcription',
            () => this.transcribeAudio(audioBuffer)
        );
        
        // Step 3: Summarize (if enabled)
        let summary: string | undefined;
        if (this.pluginData.generateSummary) {
            summary = await this.executeStep(
                'Summarization',
                () => this.generateSummary(transcription)
            );
        }

        return {
            transcription,
            summary,
            timings: this.calculateTimings(),
            audioBlob
        };
    }

    /**
     * Executes a processing step with timing and progress tracking
     */
    private async executeStep<T>(
        stepName: string, 
        operation: () => Promise<T>
    ): Promise<T> {
        this.startStep(stepName);
        
        try {
            const result = await operation();
            this.completeStep();
            return result;
        } catch (error) {
            this.handleError(`${stepName} failed`, error);
            throw error;
        }
    }

    /**
     * Converts blob to array buffer
     */
    private async blobToArrayBuffer(blob: Blob): Promise<ArrayBuffer> {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as ArrayBuffer);
            reader.onerror = reject;
            reader.readAsArrayBuffer(blob);
        });
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
        
        return adapter.generateResponse(
            prompt,
            this.pluginData.summaryModel,
            {
                maxTokens: this.pluginData.summaryMaxTokens,
                temperature: this.pluginData.summaryTemperature
            }
        );
    }

    /**
     * Formats content for insertion
     */
    private formatContent(
        audioBlob: Blob, 
        transcription: string, 
        summary?: string
    ): string {
        const blobName = (audioBlob as any).name || 'audio.wav';
        let content = `\n>[!info]- Transcription\n>![[${blobName}]]\n>${transcription}\n`;
        
        if (this.pluginData.generateSummary && summary) {
            content += `---\n\n>[!summary]- Summary\n>${summary}\n\n`;
        }
        
        return content;
    }

    /**
     * Inserts processed content into note
     */
    /**
 * Inserts processed content into note
 */
private async insertResults(
    result: ProcessingResult,
    file: TFile,
    cursorPosition: EditorPosition,
    audioBlob: Blob  // Add audioBlob parameter
): Promise<void> {
    const content = this.formatContent(
        audioBlob,           // Pass the blob first
        result.transcription,
        result.summary
    );

    await this.executeStep(
        'Content Insertion',
        async () => {
            const currentContent = await this.plugin.app.vault.read(file);
            if (cursorPosition) {
                const offset = this.getOffsetFromPosition(currentContent, cursorPosition);
                const beforeCursor = currentContent.slice(0, offset);
                const afterCursor = currentContent.slice(offset);
                await this.plugin.app.vault.modify(
                    file, 
                    beforeCursor + content + afterCursor
                );
            } else {
                await this.plugin.app.vault.modify(
                    file, 
                    currentContent + content
                );
            }
        }
    );
}

    /**
     * Calculates offset for cursor position
     */
    private getOffsetFromPosition(content: string, position: EditorPosition): number {
        const lines = content.split('\n');
        let offset = 0;
        
        for (let i = 0; i < position.line; i++) {
            offset += lines[i].length + 1;
        }
        
        return offset + position.ch;
    }

    /**
     * Timing and progress tracking methods
     */
    private startStep(name: string): void {
        this.currentStep = {
            name,
            startTime: performance.now()
        };
        this.steps.push(this.currentStep);
    }

    private completeStep(): void {
        if (this.currentStep) {
            this.currentStep.endTime = performance.now();
        }
    }

    private calculateTimings(): Record<string, number> {
        const timings: Record<string, number> = {};
        
        this.steps.forEach(step => {
            if (step.endTime) {
                timings[step.name] = step.endTime - step.startTime;
            }
        });
        
        return timings;
    }

    /**
     * Error handling and notification methods
     */
    private handleError(context: string, error: unknown): void {
        const message = error instanceof Error ? error.message : 'Unknown error occurred';
        console.error(`${context}:`, error);
        new Notice(`${context}: ${message}`);
    }

    private showSuccessMessage(timings: Record<string, number>): void {
        let message = 'Recording processed successfully.\n';
        Object.entries(timings).forEach(([step, time]) => {
            message += `${step}: ${time.toFixed(2)} ms\n`;
        });
        new Notice(message);
        console.log('Processing completed with timings:', timings);
    }
}