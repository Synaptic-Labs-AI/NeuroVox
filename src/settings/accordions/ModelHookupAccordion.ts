// src/settings/accordions/ModelHookupAccordion.ts

import { BaseAccordion } from "./BaseAccordion";
import { NeuroVoxSettings } from "../Settings";
import { Setting } from "obsidian";
import NeuroVoxPlugin from '../../main';

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
        new Setting(this.contentEl)
            .setName("OpenAI API key")
            .setDesc("Enter your OpenAI API key for transcription and summarization")
            .addText(text => {
                text.setPlaceholder("sk-...")
                    .setValue(this.settings.openaiApiKey)
                    .onChange(async (value: string) => {
                        this.settings.openaiApiKey = value.trim();
                        await this.plugin.saveSettings();
                        this.plugin.refreshModelDropdowns();
                    });
            });

        // Groq API Key Input
        new Setting(this.contentEl)
            .setName("Groq API key")
            .setDesc("Enter your Groq API key for faster processing")
            .addText(text => {
                text.setPlaceholder("gsk_...")
                    .setValue(this.settings.groqApiKey)
                    .onChange(async (value: string) => {
                        this.settings.groqApiKey = value.trim();
                        await this.plugin.saveSettings();
                        this.plugin.refreshModelDropdowns();
                    });
            });
    }
}