import { AIAdapter, AIProvider } from '../../adapters/AIAdapter';
import NeuroVoxPlugin from '../../main';

/**
 * Result of a transcription operation
 */
export interface TranscriptionResult {
    transcription: string;
    postProcessing?: string;
    /**
     * Why post-processing failed, when it did. Post-processing is a bonus on top of the
     * transcript, so its failure is reported alongside the transcription rather than
     * replacing it — losing a recording because the summarizer choked is never acceptable.
     */
    postProcessingError?: string;
}

/**
 * Handles transcription and post-processing of audio content
 * Uses configured AI adapters to process the content
 */
export class TranscriptionService {
    constructor(private plugin: NeuroVoxPlugin) {}

    /**
     * Transcribes audio content and optionally generates post-processing
     * @param audioBuffer The audio data to transcribe
     * @returns The transcription result
     */
    public async transcribeContent(audioBuffer: ArrayBuffer): Promise<TranscriptionResult> {
        let transcription: string;
        try {
            transcription = await this.transcribeAudio(audioBuffer);
        } catch (error) {
            // Only a transcription failure is fatal: there is nothing to save without it.
            const message = error instanceof Error ? error.message : 'Unknown error';
            throw new Error(`Transcription failed: ${message}`);
        }

        if (!this.plugin.settings.generatePostProcessing) {
            return { transcription };
        }

        try {
            return {
                transcription,
                postProcessing: await this.generatePostProcessing(transcription)
            };
        } catch (error) {
            // Report the failure with the transcript, never instead of it.
            return {
                transcription,
                postProcessingError: error instanceof Error ? error.message : 'Unknown error'
            };
        }
    }

    /**
     * Transcribes audio only, without running post-processing. Used by the streaming path,
     * which transcribes many small chunks and post-processes the assembled result once at the
     * end — running the language model per chunk would be wasteful and would discard a good
     * chunk transcription whenever post-processing failed.
     */
    public async transcribeAudioOnly(audioBuffer: ArrayBuffer, signal?: AbortSignal): Promise<string> {
        return this.transcribeAudio(audioBuffer, signal);
    }

    /**
     * Per-segment time budget of the active transcription provider (e.g. AssemblyAI's
     * upload+poll flow takes minutes; a plain Whisper POST should not). Falls back to the
     * base default when no adapter is configured.
     */
    public getTranscriptionTimeoutMs(): number {
        const adapter = this.plugin.aiAdapters.get(this.plugin.settings.transcriptionProvider);
        return adapter?.getTranscriptionTimeoutMs() ?? 120_000;
    }

    /**
     * Transcribes audio using the configured AI adapter
     */
    private async transcribeAudio(audioBuffer: ArrayBuffer, signal?: AbortSignal): Promise<string> {
        const adapter = this.getAdapter(
            this.plugin.settings.transcriptionProvider,
            'transcription'
        );

        return adapter.transcribeAudio(
            audioBuffer,
            this.plugin.settings.transcriptionModel,
            signal
        );
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
}
