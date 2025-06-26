// src/types.ts

import { App, Events, Plugin, TFile, WorkspaceLeaf } from 'obsidian';
import { NeuroVoxSettings } from './settings/Settings';
import { AIAdapter, AIProvider } from './adapters/AIAdapter';
import { RecordingProcessor } from './utils/RecordingProcessor';
import { ToolbarButton } from './ui/ToolbarButton';
import { FloatingButton } from './ui/FloatingButton';

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
