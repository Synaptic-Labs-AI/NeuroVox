// src/settings/accordions/SummaryAccordion.ts

import { BaseAccordion } from "./BaseAccordion";
import { NeuroVoxSettings } from "../Settings";
import { Setting, DropdownComponent, TextAreaComponent, SliderComponent } from "obsidian";
import { AIAdapter, AIProvider, AIModels, getModelInfo } from "../../adapters/AIAdapter";
import NeuroVoxPlugin from "../../main";

export class SummaryAccordion extends BaseAccordion {
    private modelDropdown: DropdownComponent | null = null;
    private modelSetting: Setting | null = null;
    private promptArea: TextAreaComponent | null = null;
    private maxTokensSlider: SliderComponent | null = null;
    private temperatureSlider: SliderComponent | null = null;

    public async refresh(): Promise<void> {
        try {
            if (!this.modelDropdown) {
                return;
            }
            
            await this.setupModelDropdown(this.modelDropdown);
            
            if (this.settings.summaryModel) {
                await this.updateMaxTokensLimit(this.settings.summaryModel);
            }
        } catch (error) {
            throw error;
        }
    }

    constructor(
        containerEl: HTMLElement,
        public settings: NeuroVoxSettings,
        public getAdapter: (provider: AIProvider) => AIAdapter | undefined,
        public plugin: NeuroVoxPlugin
    ) {
        super(
            containerEl, 
            "📝 Summarize", 
            "Configure AI summary generation preferences and customize the prompt template."
        );
    }

    render(): void {
        this.addEnableToggle();
        this.addModelSelection();
        this.addPromptTemplate();
        this.addSummaryFormat();
        this.addMaxTokens();
        this.addTemperatureControl();
    }

    private addEnableToggle(): void {
        new Setting(this.contentEl)
            .setName("Enable AI summary")
            .setDesc("Automatically generate an AI summary after transcription")
            .addToggle(toggle => {
                toggle
                    .setValue(this.settings.generateSummary)
                    .onChange(async (value) => {
                        this.settings.generateSummary = value;
                        await this.plugin.saveSettings();
                    });
            });
    }

    private addModelSelection(): void {
        if (this.modelSetting) {
            this.modelSetting.settingEl.remove();
        }

        this.modelSetting = new Setting(this.contentEl)
            .setName("Summary model")
            .setDesc("Select the AI model for generating summaries")
            .addDropdown(dropdown => {
                this.modelDropdown = dropdown;
                
                this.setupModelDropdown(dropdown);
                
                dropdown.onChange(async (value: string) => {
                    this.settings.summaryModel = value;
                    const provider = this.getProviderFromModel(value);
                    if (provider) {
                        this.settings.summaryProvider = provider;
                        await this.plugin.saveSettings();
                    }

                    await this.updateMaxTokensLimit(value);
                });
            });
    }

    private async setupModelDropdown(dropdown: DropdownComponent): Promise<void> {
        dropdown.selectEl.empty();
        let hasValidProvider = false;
        
        for (const provider of [AIProvider.OpenAI, AIProvider.Groq]) {
            const apiKey = this.settings[`${provider}ApiKey` as keyof NeuroVoxSettings];
            if (apiKey) {
                const models = AIModels[provider].filter(model => model.category === 'language');
                if (models.length > 0) {
                    hasValidProvider = true;
                    const group = document.createElement("optgroup");
                    group.label = `${provider.toUpperCase()} Models`;
                    
                    models.forEach(model => {
                        const option = document.createElement("option");
                        option.value = model.id;
                        option.text = model.name;
                        group.appendChild(option);
                    });
                    
                    dropdown.selectEl.appendChild(group);
                }
            }
        }

        if (!hasValidProvider) {
            dropdown.addOption("none", "No API keys configured");
            dropdown.setDisabled(true);
            this.settings.summaryModel = '';
        } else {
            dropdown.setDisabled(false);
            
            if (!this.settings.summaryModel) {
                const firstOption = dropdown.selectEl.querySelector('option:not([value="none"])') as HTMLOptionElement;
                if (firstOption) {
                    const modelId = firstOption.value;
                    const provider = this.getProviderFromModel(modelId);
                    if (provider) {
                        this.settings.summaryProvider = provider;
                        this.settings.summaryModel = modelId;
                        dropdown.setValue(modelId);
                    }
                }
            } else {
                dropdown.setValue(this.settings.summaryModel);
            }
        }

        await this.plugin.saveSettings();
    }

    private addPromptTemplate(): void {
        new Setting(this.contentEl)
            .setName("Summary prompt template")
            .setDesc("Customize the prompt used for generating summaries. Use {transcript} as a placeholder for the transcribed text.")
            .addTextArea(text => {
                this.promptArea = text;
                text
                    .setPlaceholder("Please provide a concise summary of the following transcript: {transcript}")
                    .setValue(this.settings.summaryPrompt)
                    .onChange(async (value) => {
                        this.settings.summaryPrompt = value;
                        await this.plugin.saveSettings();
                    });
                
                text.inputEl.rows = 4;
                text.inputEl.style.width = "100%";
            });
    }

    private addSummaryFormat(): void {
        new Setting(this.contentEl)
            .setName("Summary format")
            .setDesc("Customize the summary callout format. Use {summary} for the generated summary")
            .addTextArea(text => {
                text.setPlaceholder(">[!summary]- Summary\n>{summary}")
                    .setValue(this.settings.summaryCalloutFormat)
                    .onChange(async (value) => {
                        this.settings.summaryCalloutFormat = value;
                        await this.plugin.saveSettings();
                    });
                text.inputEl.rows = 4;
                text.inputEl.style.width = "100%";
            });
    }

    private addMaxTokens(): void {
        new Setting(this.contentEl)
            .setName("Maximum summary length")
            .setDesc("Set the maximum number of tokens for the generated summary")
            .addSlider(slider => {
                this.maxTokensSlider = slider;
                slider
                    .setLimits(100, 4096, 100)
                    .setValue(this.settings.summaryMaxTokens)
                    .setDynamicTooltip()
                    .onChange(async (value) => {
                        this.settings.summaryMaxTokens = value;
                        await this.plugin.saveSettings();
                    });
            });
    }

    private addTemperatureControl(): void {
        new Setting(this.contentEl)
            .setName("Summary creativity")
            .setDesc("Adjust the creativity level of the summary (0 = more focused, 1 = more creative)")
            .addSlider(slider => {
                this.temperatureSlider = slider;
                slider
                    .setLimits(0, 1, 0.1)
                    .setValue(this.settings.summaryTemperature)
                    .setDynamicTooltip()
                    .onChange(async (value) => {
                        this.settings.summaryTemperature = value;
                        await this.plugin.saveSettings();
                    });
            });
    }

    private getProviderFromModel(modelId: string): AIProvider | null {
        for (const [provider, models] of Object.entries(AIModels)) {
            if (models.some(model => model.id === modelId)) {
                return provider as AIProvider;
            }
        }
        return null;
    }

    private async updateMaxTokensLimit(modelId: string): Promise<void> {
        const model = getModelInfo(modelId);
        const maxTokens = model?.maxTokens || 1000;
        
        if (this.maxTokensSlider) {
            this.maxTokensSlider.sliderEl.max = maxTokens.toString();
            
            const currentValue = parseInt(this.maxTokensSlider.sliderEl.value);
            if (currentValue > maxTokens) {
                this.maxTokensSlider.setValue(maxTokens);
                this.settings.summaryMaxTokens = maxTokens;
                await this.plugin.saveSettings();
            }
        }
    }
}
