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
