// src/settings/accordions/ModelHookupAccordion.ts

import { BaseAccordion } from "./BaseAccordion";
import { NeuroVoxSettings } from "../Settings";
import { Setting } from "obsidian";
import { AIProvider } from "../../adapters/AIAdapter";
import NeuroVoxPlugin from "../../main";
import { RecordingAccordion } from "./RecordingAccordion";
import { PostProcessingAccordion } from "./PostProcessingAccordion";

export class ModelHookupAccordion extends BaseAccordion {
    private recordingAccordion!: RecordingAccordion;
    private postProcessingAccordion!: PostProcessingAccordion;

    constructor(
        containerEl: HTMLElement,
        public settings: NeuroVoxSettings,
        public getAdapter: (provider: AIProvider) => any,
        public plugin: NeuroVoxPlugin
    ) {
        super(
            containerEl,
            "🔑 API Keys",
            "Configure API keys for AI providers."
        );
    }

    setAccordions(recording: RecordingAccordion, postProcessing: PostProcessingAccordion): void {
        this.recordingAccordion = recording;
        this.postProcessingAccordion = postProcessing;
    }

    private async refreshAccordions(): Promise<void> {
        await Promise.all([
            this.recordingAccordion.refresh(),
            this.postProcessingAccordion.refresh()
        ]);
    }

    render(): void {
        const openaiSetting = new Setting(this.contentEl)
            .setName("OpenAI API Key")
            .setDesc("Enter your OpenAI API key")
            .addText(text => {
                text
                    .setPlaceholder("sk-...")
                    .setValue(this.settings.openaiApiKey);
                text.inputEl.type = "password";
                text.onChange(async (value: string) => {
                        const trimmedValue = value.trim();
                        this.settings.openaiApiKey = trimmedValue;
                        await this.plugin.saveSettings();

                        const adapter = this.getAdapter(AIProvider.OpenAI);
                        if (!adapter) {
                            return;
                        }

                        adapter.setApiKey(trimmedValue);
                        const isValid = await adapter.validateApiKey();

                        if (isValid) {
                            openaiSetting.setDesc("✅ API key validated successfully");
                            try {
                                await this.refreshAccordions();
                            } catch (error) {
                                openaiSetting.setDesc("✅ API key valid, but failed to update model lists");
                            }
                        } else {
                            openaiSetting.setDesc("❌ Invalid API key. Please check your credentials.");
                        }
                    });
            });

        const groqSetting = new Setting(this.contentEl)
            .setName("Groq API Key")
            .setDesc("Enter your Groq API key")
            .addText(text => {
                text
                    .setPlaceholder("gsk_...")
                    .setValue(this.settings.groqApiKey);
                text.inputEl.type = "password";
                text.onChange(async (value: string) => {
                        const trimmedValue = value.trim();
                        this.settings.groqApiKey = trimmedValue;
                        await this.plugin.saveSettings();

                        const adapter = this.getAdapter(AIProvider.Groq);
                        if (!adapter) {
                            return;
                        }

                        adapter.setApiKey(trimmedValue);
                        const isValid = await adapter.validateApiKey();

                        if (isValid) {
                            groqSetting.setDesc("✅ API key validated successfully");
                            try {
                                await this.refreshAccordions();
                            } catch (error) {
                                groqSetting.setDesc("✅ API key valid, but failed to update model lists");
                            }
                        } else {
                            groqSetting.setDesc("❌ Invalid API key. Please check your credentials.");
                        }
                    });
            });

        const deepgramSetting = new Setting(this.contentEl)
            .setName("Deepgram API Key")
            .setDesc("Enter your Deepgram API key")
            .addText(text => {
                text
                    .setPlaceholder("Enter your Deepgram API key...")
                    .setValue(this.settings.deepgramApiKey);
                text.inputEl.type = "password";
                text.onChange(async (value: string) => {
                        const trimmedValue = value.trim();
                        this.settings.deepgramApiKey = trimmedValue;
                        await this.plugin.saveSettings();

                        const adapter = this.getAdapter(AIProvider.Deepgram);
                        if (!adapter) {
                            return;
                        }

                        adapter.setApiKey(trimmedValue);
                        const isValid = await adapter.validateApiKey();

                        if (isValid) {
                            deepgramSetting.setDesc("✅ API key validated successfully");
                            try {
                                await this.refreshAccordions();
                            } catch (error) {
                                deepgramSetting.setDesc("✅ API key valid, but failed to update model lists");
                            }
                        } else {
                            deepgramSetting.setDesc("❌ Invalid API key. Please check your credentials.");
                        }
                    });
            });
    }
}
