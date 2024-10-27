import { App, PluginSettingTab } from 'obsidian';
import { ModelHookupAccordion } from './accordions/ModelHookupAccordion';
import { RecordingAccordion } from './accordions/RecordingAccordion';
import { SummaryAccordion } from './accordions/SummaryAccordion';
import { AIProvider, AIAdapter } from '../adapters/AIAdapter';
import NeuroVoxPlugin from '../main'; // Corrected import as default

export class NeuroVoxSettingTab extends PluginSettingTab {
    plugin: NeuroVoxPlugin;

    constructor(app: App, plugin: NeuroVoxPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();
    
        containerEl.createEl('h2', { text: 'NeuroVox Settings' });
    
        // ModelHookup Accordion
        const modelHookupContainer = containerEl.createDiv();
        new ModelHookupAccordion(
            modelHookupContainer, 
            this.plugin.settings,
            this.plugin
        ).render();
    
        // Recording Accordion
        const recordingContainer = containerEl.createDiv();
        new RecordingAccordion(
            recordingContainer,
            this.plugin.settings,
            (provider: AIProvider) => this.plugin.aiAdapters.get(provider)!,
            this.plugin  // Pass plugin instance
        ).render();
    
        // Summary Accordion - Fixed by adding plugin instance
        const summaryContainer = containerEl.createDiv();
        new SummaryAccordion(
            summaryContainer,
            this.plugin.settings,
            (provider: AIProvider) => this.plugin.aiAdapters.get(provider)!,
            this.plugin  // Add this line to pass plugin instance
        ).render();
    }
}