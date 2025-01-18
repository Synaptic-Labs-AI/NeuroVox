// src/settings/SettingTab.ts

import { App, PluginSettingTab } from 'obsidian';
import { ModelHookupAccordion } from './accordions/ModelHookupAccordion';
import { RecordingAccordion } from './accordions/RecordingAccordion';
import { SummaryAccordion } from './accordions/SummaryAccordion';
import { AIProvider } from '../adapters/AIAdapter';
import NeuroVoxPlugin from '../main'; // Corrected import as default

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
    
        // ModelHookup Accordion
        const modelHookupContainer = containerEl.createDiv();
        new ModelHookupAccordion(
            modelHookupContainer, 
            this.plugin.settings,
            this.plugin
        ).render();
    
        // Recording Accordion
        const recordingContainer = containerEl.createDiv();
        this.recordingAccordion = new RecordingAccordion(
            recordingContainer,
            this.plugin.settings,
            (provider: AIProvider) => this.plugin.aiAdapters.get(provider)!,
            this.plugin
        );
        this.recordingAccordion.render();
    
        // Summary Accordion
        const summaryContainer = containerEl.createDiv();
        this.summaryAccordion = new SummaryAccordion(
            summaryContainer,
            this.plugin.settings,
            (provider: AIProvider) => this.plugin.aiAdapters.get(provider)!,
            this.plugin
        );
        this.summaryAccordion.render();
    }

    getRecordingAccordion(): RecordingAccordion | null {
        return this.recordingAccordion;
    }

    getSummaryAccordion(): SummaryAccordion | null {
        return this.summaryAccordion;
    }
}
