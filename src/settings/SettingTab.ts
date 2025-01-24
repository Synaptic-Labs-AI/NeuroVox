// src/settings/SettingTab.ts

import { App, PluginSettingTab } from 'obsidian';
import { ModelHookupAccordion } from './accordions/ModelHookupAccordion';
import { RecordingAccordion } from './accordions/RecordingAccordion';
import { SummaryAccordion } from './accordions/SummaryAccordion';
import { AIProvider } from '../adapters/AIAdapter';
import NeuroVoxPlugin from '../main';

export class NeuroVoxSettingTab extends PluginSettingTab {
    plugin: NeuroVoxPlugin;
    private recordingAccordion: RecordingAccordion | null = null;
    private summaryAccordion: SummaryAccordion | null = null;

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
        const summaryContainer = containerEl.createDiv();

        // Create Recording and Summary accordions first
        this.recordingAccordion = new RecordingAccordion(
            recordingContainer,
            this.plugin.settings,
            (provider: AIProvider) => this.plugin.aiAdapters.get(provider)!,
            this.plugin
        );
        
        this.summaryAccordion = new SummaryAccordion(
            summaryContainer,
            this.plugin.settings,
            (provider: AIProvider) => this.plugin.aiAdapters.get(provider)!,
            this.plugin
        );

        // Create ModelHookup after accordions are initialized
        const modelHookupAccordion = new ModelHookupAccordion(
            modelHookupContainer, 
            this.plugin.settings,
            (provider: AIProvider) => this.plugin.aiAdapters.get(provider)!,
            this.plugin
        );

        // Set the accordions now that they're properly initialized
        modelHookupAccordion.setAccordions(this.recordingAccordion, this.summaryAccordion);

        // Render all accordions in order
        modelHookupAccordion.render();
        this.recordingAccordion.render();
        this.summaryAccordion.render();
    }

    getRecordingAccordion(): RecordingAccordion | null {
        return this.recordingAccordion;
    }

    getSummaryAccordion(): SummaryAccordion | null {
        return this.summaryAccordion;
    }
}
