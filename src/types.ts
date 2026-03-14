// src/types.ts

import { App, Events, Plugin, TFile, WorkspaceLeaf } from 'obsidian';
import { NeuroVoxSettings } from './settings/Settings';
import { AIAdapter, AIProvider } from './adapters/AIAdapter';
import { RecordingProcessor } from './utils/RecordingProcessor';
import { ToolbarButton } from './ui/ToolbarButton';
import { FloatingButton } from './ui/FloatingButton';

// =============================================================================
// API Response Types
// =============================================================================

/**
 * OpenAI/Groq Chat Completion Response
 */
export interface ChatCompletionResponse {
    id: string;
    object: string;
    created: number;
    model: string;
    choices: Array<{
        index: number;
        message: {
            role: string;
            content: string;
        };
        finish_reason: string;
    }>;
    usage?: {
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
    };
}

/**
 * OpenAI/Groq Transcription Response
 */
export interface TranscriptionResponse {
    text: string;
}

/**
 * Deepgram Transcription Response
 */
export interface DeepgramTranscriptionResponse {
    metadata?: {
        transaction_key: string;
        request_id: string;
        sha256: string;
        created: string;
        duration: number;
        channels: number;
    };
    results: {
        channels: Array<{
            alternatives: Array<{
                transcript: string;
                confidence: number;
                words?: Array<{
                    word: string;
                    start: number;
                    end: number;
                    confidence: number;
                }>;
            }>;
        }>;
    };
}

/**
 * Deepgram Projects Response (for API key validation)
 */
export interface DeepgramProjectsResponse {
    projects: Array<{
        project_id: string;
        name: string;
    }>;
}

/**
 * Moonshine/Transformers.js Transcription Response
 */
export interface MoonshineTranscriptionResponse {
    text: string;
}

/**
 * Transformers.js progress callback data
 */
export interface TransformersProgressData {
    status: 'initiate' | 'download' | 'progress' | 'done' | 'ready';
    name?: string;
    file?: string;
    progress?: number;
    loaded?: number;
    total?: number;
}

/**
 * Union type for all possible API responses that can be parsed
 */
export type AIApiResponse =
    | ChatCompletionResponse
    | TranscriptionResponse
    | DeepgramTranscriptionResponse
    | MoonshineTranscriptionResponse;

// =============================================================================
// Browser Compatibility Types
// =============================================================================

/**
 * Chrome/Edge Performance Memory API
 */
export interface PerformanceMemory {
    usedJSHeapSize: number;
    totalJSHeapSize: number;
    jsHeapSizeLimit: number;
}

/**
 * WebGPU types (subset needed for feature detection)
 */
interface GPUAdapter {
    readonly name: string;
    requestDevice(): Promise<unknown>;
}

interface GPU {
    requestAdapter(): Promise<GPUAdapter | null>;
}

/**
 * Transformers.js module interface (for dynamic loading)
 */
interface TransformersModule {
    pipeline: (
        task: string,
        model: string,
        options?: Record<string, unknown>
    ) => Promise<(audio: Float32Array, options?: Record<string, unknown>) => Promise<{ text: string }>>;
    env: Record<string, unknown>;
}

/**
 * Extended Window interface for browser compatibility
 */
declare global {
    interface Window {
        webkitAudioContext?: typeof AudioContext;
        gc?: () => void;
        Transformers?: TransformersModule;
    }

    interface Navigator {
        gpu?: GPU;
    }

    interface Performance {
        memory?: PerformanceMemory;
    }
}

// =============================================================================
// Core Types
// =============================================================================

export interface Position {
    x: number;
    y: number;
}

export interface PluginData extends NeuroVoxSettings {
    buttonPosition?: Position;
}

export interface ChunkMetadata {
    id: string;
    index: number;
    duration: number;
    timestamp: number;
    size: number;
}

export interface StreamingOptions {
    chunkDuration: number;  // 5-10 seconds
    maxQueueSize: number;   // 3-5 chunks max in memory
    bitrate: number;        // Lower for mobile
    processingMode: 'streaming' | 'batch';
    memoryLimit: number;    // MB
}

export interface TranscriptionChunk {
    metadata: ChunkMetadata;
    transcript: string;
    processed: boolean;
}

export interface StreamingCallbacks {
    onChunkReady?: (chunk: Blob, metadata: ChunkMetadata) => Promise<void>;
    onProgress?: (processed: number, total: number) => void;
    onMemoryWarning?: (usage: number) => void;
}

export interface NeuroVoxPlugin extends Plugin {
    settings: NeuroVoxSettings;
    aiAdapters: Map<AIProvider, AIAdapter>;
    toolbarButton: ToolbarButton | null;
    activeLeaf: WorkspaceLeaf | null;
    recordingProcessor: RecordingProcessor;
    events: Events;
    
    saveSettings(): Promise<void>;
    refreshFloatingButtons(): void;
    updateAllButtonColors(): void;
    cleanupUI(): void;
    handleRecordingStart(): void;
}
