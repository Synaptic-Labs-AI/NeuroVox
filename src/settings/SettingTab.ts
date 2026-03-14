// src/settings/SettingTab.ts

import { App, PluginSettingTab } from 'obsidian';
import { ModelHookupAccordion } from './accordions/ModelHookupAccordion';
import { RecordingAccordion } from './accordions/RecordingAccordion';
import { PostProcessingAccordion } from './accordions/PostProcessingAccordion';
import { AIAdapter, AIProvider } from '../adapters/AIAdapter';
import NeuroVoxPlugin from '../main';

export class NeuroVoxSettingTab extends PluginSettingTab {
    plugin: NeuroVoxPlugin;
    private recordingAccordion: RecordingAccordion | null = null;
    private postProcessingAccordion: PostProcessingAccordion | null = null;

    constructor(app: App, plugin: NeuroVoxPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();

        // Create all containers first, in the desired display order
        const modelHookupContainer = containerEl.createDiv();
        const recordingContainer = containerEl.createDiv();
        const postProcessingContainer = containerEl.createDiv();

        // Helper to get adapter with runtime validation
        const getAdapter = (provider: AIProvider): AIAdapter => {
            const adapter = this.plugin.aiAdapters.get(provider);
            if (!adapter) {
                throw new Error(`Adapter not found for provider: ${provider}`);
            }
            return adapter;
        };

        // Create Recording and Post-Processing accordions first
        this.recordingAccordion = new RecordingAccordion(
            recordingContainer,
            this.plugin.settings,
            getAdapter,
            this.plugin
        );

        this.postProcessingAccordion = new PostProcessingAccordion(
            postProcessingContainer,
            this.plugin.settings,
            getAdapter,
            this.plugin
        );

        // Create ModelHookup (includes Moonshine local model management)
        const modelHookupAccordion = new ModelHookupAccordion(
            modelHookupContainer,
            this.plugin.settings,
            getAdapter,
            this.plugin
        );

        // Set the accordions now that they're properly initialized
        modelHookupAccordion.setAccordions(this.recordingAccordion, this.postProcessingAccordion);

        // Render all accordions in order
        modelHookupAccordion.render();
        this.recordingAccordion.render();
        this.postProcessingAccordion.render();
    }

    getRecordingAccordion(): RecordingAccordion | null {
        return this.recordingAccordion;
    }

    getPostProcessingAccordion(): PostProcessingAccordion | null {
        return this.postProcessingAccordion;
    }
}
