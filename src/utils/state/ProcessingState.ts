/**
 * Represents a single step in the processing pipeline
 */
interface ProcessingStep {
    name: string;
    startTime: number;
    endTime?: number;
}

/**
 * Manages state, timing, and progress for processing operations
 */
export class ProcessingState {
    private isProcessing: boolean = false;
    private currentStep: ProcessingStep | null = null;
    private audioBlob?: Blob;
    private transcription?: string;
    private postProcessing?: string;
    private startTime: number;
    private error?: string;
    private processedChunks?: number;
    private totalChunks?: number;
    private steps: ProcessingStep[] = [];

    constructor() {
        this.startTime = Date.now();
    }

    /**
     * Records the start of a processing step
     */
    public startStep(name: string): void {
        this.currentStep = { name, startTime: performance.now() };
        this.steps.push(this.currentStep);
    }

    /**
     * Records the completion of the current step
     */
    public completeStep(): void {
        if (this.currentStep) {
            this.currentStep.endTime = performance.now();
        }
    }

    /**
     * Returns timings for all completed steps
     */
    public getTimings(): Record<string, number> {
        return Object.fromEntries(
            this.steps
                .filter((step: ProcessingStep) => step.endTime)
                .map((step: ProcessingStep) => [
                    step.name, 
                    step.endTime! - step.startTime
                ])
        );
    }

    /**
     * Updates chunk processing progress
     */
    public updateProgress(processed: number, total: number): void {
        this.processedChunks = processed;
        this.totalChunks = total;
    }

    /**
     * Records an error that occurred during processing
     */
    public setError(error: Error | string): void {
        this.error = error instanceof Error ? error.message : error;
    }

    /**
     * Gets the current processing progress
     */
    public getProgress(): { processed?: number; total?: number } {
        return {
            processed: this.processedChunks,
            total: this.totalChunks
        };
    }

    /**
     * Gets whether processing is currently active
     */
    public getIsProcessing(): boolean {
        return this.isProcessing;
    }

    /**
     * Sets the processing state
     */
    public setIsProcessing(value: boolean): void {
        this.isProcessing = value;
    }

    /**
     * Gets the current error if any
     */
    public getError(): string | undefined {
        return this.error;
    }

    /**
     * Gets how long processing has been running
     */
    public getDuration(): number {
        return Date.now() - this.startTime;
    }

    /**
     * Gets the name of the current processing step
     */
    public getCurrentStepName(): string | null {
        return this.currentStep?.name || null;
    }

    /**
     * Resets the state to initial values
     */
    public reset(): void {
        this.isProcessing = false;
        this.currentStep = null;
        this.audioBlob = undefined;
        this.transcription = undefined;
        this.postProcessing = undefined;
        this.startTime = Date.now();
        this.error = undefined;
        this.processedChunks = undefined;
        this.totalChunks = undefined;
        this.steps = [];
    }

    /**
     * Converts the state to a JSON-compatible object for storage
     */
    public toJSON(): Record<string, any> {
        return {
            isProcessing: this.isProcessing,
            currentStep: this.currentStep,
            transcription: this.transcription,
            postProcessing: this.postProcessing,
            startTime: this.startTime,
            error: this.error,
            processedChunks: this.processedChunks,
            totalChunks: this.totalChunks
        };
    }

    /**
     * Restores state from a saved JSON object
     */
    public fromJSON(data: Record<string, any>): void {
        this.isProcessing = data.isProcessing ?? false;
        this.currentStep = data.currentStep ?? null;
        this.transcription = data.transcription;
        this.postProcessing = data.postProcessing;
        this.startTime = data.startTime ?? Date.now();
        this.error = data.error;
        this.processedChunks = data.processedChunks;
        this.totalChunks = data.totalChunks;
    }
}
