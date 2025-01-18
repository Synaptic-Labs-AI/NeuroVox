// src/settings/accordions/ModelHookupAccordion.ts

import { BaseAccordion } from "./BaseAccordion";
import { NeuroVoxSettings } from "../Settings";
import { Setting } from "obsidian";
import NeuroVoxPlugin from '../../main';
import { AIProvider } from '../../adapters/AIAdapter';

export class ModelHookupAccordion extends BaseAccordion {
    constructor(
        containerEl: HTMLElement, 
        public settings: NeuroVoxSettings,
        public plugin: NeuroVoxPlugin
    ) {
        super(containerEl, "🔌 AI provider hookup", "Configure your API keys for OpenAI and Groq services.");
    }

    render(): void {
        // OpenAI API Key Input
        const openaiSetting = new Setting(this.contentEl)
            .setName("OpenAI API key")
            .setDesc("Enter your OpenAI API key for transcription and summarization")
            .addText(text => {
                text.setPlaceholder("sk-...")
                    .setValue(this.settings.openaiApiKey)
                    .onChange(async (value: string) => {
                        const trimmedValue = value.trim();
                        this.settings.openaiApiKey = trimmedValue;
                        
                        // Update adapter and validate
                        const adapter = this.plugin.aiAdapters.get(AIProvider.OpenAI);
                        if (adapter) {
                            adapter.setApiKey(trimmedValue);
                            const isValid = await adapter.validateApiKey();
                            openaiSetting.setDesc(
                                isValid 
                                    ? "✅ API key validated successfully"
                                    : "❌ Invalid API key. Please check your credentials."
                            );
                        }
                        
                        await this.plugin.saveSettings();
                    });
            });

        // Groq API Key Input
        const groqSetting = new Setting(this.contentEl)
            .setName("Groq API key")
            .setDesc("Enter your Groq API key for faster processing")
            .addText(text => {
                text.setPlaceholder("gsk_...")
                    .setValue(this.settings.groqApiKey)
                    .onChange(async (value: string) => {
                        const trimmedValue = value.trim();
                        this.settings.groqApiKey = trimmedValue;
                        
                        // Update adapter and validate
                        const adapter = this.plugin.aiAdapters.get(AIProvider.Groq);
                        if (adapter) {
                            adapter.setApiKey(trimmedValue);
                            const isValid = await adapter.validateApiKey();
                            groqSetting.setDesc(
                                isValid 
                                    ? "✅ API key validated successfully"
                                    : "❌ Invalid API key. Please check your credentials."
                            );
                        }
                        
                        await this.plugin.saveSettings();
                    });
            });

        // Add validation status indicators
        this.validateInitialKeys(openaiSetting, groqSetting);
    }

    /**
     * Validates initial API keys and updates status indicators
     */
    private async validateInitialKeys(openaiSetting: Setting, groqSetting: Setting): Promise<void> {
        // Validate OpenAI key
        const openaiAdapter = this.plugin.aiAdapters.get(AIProvider.OpenAI);
        if (openaiAdapter && this.settings.openaiApiKey) {
            const isValidOpenAI = await openaiAdapter.validateApiKey();
            openaiSetting.setDesc(
                isValidOpenAI 
                    ? "✅ API key validated successfully"
                    : "❌ Invalid API key. Please check your credentials."
            );
        }

        // Validate Groq key
        const groqAdapter = this.plugin.aiAdapters.get(AIProvider.Groq);
        if (groqAdapter && this.settings.groqApiKey) {
            const isValidGroq = await groqAdapter.validateApiKey();
            groqSetting.setDesc(
                isValidGroq 
                    ? "✅ API key validated successfully"
                    : "❌ Invalid API key. Please check your credentials."
            );
        }
    }
}
