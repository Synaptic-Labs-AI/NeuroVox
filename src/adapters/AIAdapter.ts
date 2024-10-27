export enum AIProvider {
    OpenAI = 'openai',
    Groq = 'groq',
}

// Export the interface
export interface AIModel {
    id: string;
    name: string;
    category: 'transcription' | 'language';
    maxTokens?: number;
}

export interface AIAdapter {
    generateResponse(prompt: string, model: string, options?: { maxTokens?: number }): Promise<string>;
    transcribeAudio(audioBlob: Blob, model: string): Promise<string>;
    validateApiKey(): Promise<boolean>;
    getAvailableModels(category: 'transcription' | 'language'): AIModel[];
    setApiKey(apiKey: string): void;
    getApiKey(): string;
    isReady(): boolean;
}

// Update model definitions to only include maxTokens for language models
export const AIModels: Record<AIProvider, AIModel[]> = {
    [AIProvider.OpenAI]: [
        // Transcription Models (no maxTokens)
        { 
            id: 'whisper-1', 
            name: 'Whisper 1', 
            category: 'transcription'
        },
        // Language Models (include maxTokens)
        { 
            id: 'gpt-4o', 
            name: 'GPT 4o', 
            category: 'language',
            maxTokens: 2000 
        },
        { 
            id: 'gpt-4o-mini', 
            name: 'GPT 4o Mini', 
            category: 'language',
            maxTokens: 2000 
        },
        { 
            id: 'o1-preview', 
            name: 'O1 Preview', 
            category: 'language',
            maxTokens: 2000 
        },
        { 
            id: 'o1-mini', 
            name: 'O1 Mini', 
            category: 'language',
            maxTokens: 2000 
        },
    ],
    [AIProvider.Groq]: [
        // Transcription Models (no maxTokens)
        { 
            id: 'distil-whisper-large-v3-en', 
            name: 'Distil-Whisper Large v3 EN', 
            category: 'transcription'
        },
        { 
            id: 'gemma2-9b-it', 
            name: 'Gemma 2 9B IT', 
            category: 'language'
        },
        { 
            id: 'gemma-7b-it', 
            name: 'Gemma 7B IT', 
            category: 'language'
        },
        { 
            id: 'llama3-groq-70b-versatile', 
            name: 'Llama 3 Groq 70B Versatile', 
            category: 'language'
        },
        { 
            id: 'llama3-groq-8b-instant', 
            name: 'Llama 3 Groq 8B Instant', 
            category: 'language'
        },
        { 
            id: 'llama3-3b-preview', 
            name: 'Llama 3.2 3B Preview', 
            category: 'language'
        },
    ],
};

// Helper function to get model info
export function getModelInfo(modelId: string): AIModel | undefined {
    for (const models of Object.values(AIModels)) {
        const model = models.find(m => m.id === modelId);
        if (model) return model;
    }
    return undefined;
}