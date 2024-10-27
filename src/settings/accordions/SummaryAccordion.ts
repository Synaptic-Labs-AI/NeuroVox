// src/settings/accordions/SummaryAccordion.ts

import { BaseAccordion } from "./BaseAccordion";
import { NeuroVoxSettings } from "../Settings";
import { Setting, DropdownComponent, TextAreaComponent } from "obsidian";
import { AIAdapter, AIProvider, AIModels, getModelInfo } from "../../adapters/AIAdapter";
import NeuroVoxPlugin from "../../main";

export class SummaryAccordion extends BaseAccordion {
    public modelDropdown: DropdownComponent;
    public promptArea: TextAreaComponent;

    constructor(
        containerEl: HTMLElement,
        public settings: NeuroVoxSettings,
        public getAdapter: (provider: AIProvider) => AIAdapter,
        public plugin: NeuroVoxPlugin
    ) {
        super(
            containerEl, 
            "📝 Summary Settings", 
            "Configure AI summary generation preferences and customize the prompt template."
        );
    }

    render(): void {
        this.addEnableToggle();
        this.addModelSelection();
        this.addPromptTemplate();
        this.addMaxTokens();
        this.addTemperatureControl();
    }

    public addEnableToggle(): void {
        new Setting(this.contentEl)
            .setName("Enable AI Summary")
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

    public addModelSelection(): void {
        new Setting(this.contentEl)
            .setName("Summary Model")
            .setDesc("Select the AI model for generating summaries")
            .addDropdown(dropdown => {
                this.modelDropdown = dropdown;
                this.populateModelOptions(dropdown);
                
                dropdown
                    .setValue(this.settings.summaryModel)
                    .onChange(async (value) => {
                        this.settings.summaryModel = value;
                        this.settings.summaryProvider = this.getProviderFromModel(value);
                        await this.plugin.saveSettings();
                        
                        // Update max tokens based on model capabilities
                        this.updateMaxTokensLimit(value);
                    });
            });
    }

    public addPromptTemplate(): void {
        new Setting(this.contentEl)
            .setName("Summary Prompt Template")
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
                
                // Style the textarea
                text.inputEl.rows = 4;
                text.inputEl.style.width = "100%";
            });
    }

    public addMaxTokens(): void {
        new Setting(this.contentEl)
            .setName("Maximum Summary Length")
            .setDesc("Set the maximum number of tokens for the generated summary")
            .addSlider(slider => {
                slider
                    .setLimits(100, 2000, 100)
                    .setValue(this.settings.summaryMaxTokens)
                    .setDynamicTooltip()
                    .onChange(async (value) => {
                        this.settings.summaryMaxTokens = value;
                        await this.plugin.saveSettings();
                    });
            });
    }

    public addTemperatureControl(): void {
        new Setting(this.contentEl)
            .setName("Summary Creativity")
            .setDesc("Adjust the creativity level of the summary (0 = more focused, 1 = more creative)")
            .addSlider(slider => {
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

    public populateModelOptions(dropdown: DropdownComponent): void {
        // Clear existing options
        dropdown.selectEl.empty();
        
        // Add OpenAI Models if API key exists
        if (this.settings.openaiApiKey) {
            const openaiModels = AIModels[AIProvider.OpenAI].filter(
                model => model.category === 'language'
            );
            if (openaiModels.length > 0) {
                this.addModelGroup(dropdown, "OpenAI Models", openaiModels);
            }
        }
        
        // Add Groq Models if API key exists
        if (this.settings.groqApiKey) {
            const groqModels = AIModels[AIProvider.Groq].filter(
                model => model.category === 'language'
            );
            if (groqModels.length > 0) {
                this.addModelGroup(dropdown, "Groq Models", groqModels);
            }
        }

        // If no models are available, add a placeholder option
        if (dropdown.selectEl.options.length === 0) {
            dropdown.addOption("none", "No API Keys Configured");
            dropdown.setDisabled(true);
        } else {
            dropdown.setDisabled(false);
        }
    }

    public addModelGroup(
        dropdown: DropdownComponent, 
        groupName: string, 
        models: { id: string; name: string }[]
    ): void {
        const group = document.createElement("optgroup");
        group.label = groupName;
        
        models.forEach(model => {
            const option = document.createElement("option");
            option.value = model.id;
            option.text = model.name;
            group.appendChild(option);
        });
        
        dropdown.selectEl.appendChild(group);
    }

    public getProviderFromModel(modelId: string): AIProvider {
        for (const [provider, models] of Object.entries(AIModels)) {
            if (models.some(model => model.id === modelId)) {
                return provider as AIProvider;
            }
        }
        return AIProvider.OpenAI; // Default fallback
    }

    /**
     * Updates the max tokens limit based on the selected model
     */
    public updateMaxTokensLimit(modelId: string): void {
        const model = getModelInfo(modelId);
        const maxTokens = model?.maxTokens || 1000; // Fallback to 1000 if model not found
        
        const tokenSlider = this.contentEl.querySelector('.neurovox-token-slider input[type="range"]') as HTMLInputElement;
        
        if (tokenSlider) {
            tokenSlider.max = maxTokens.toString();
            if (parseInt(tokenSlider.value) > maxTokens) {
                tokenSlider.value = maxTokens.toString();
                this.settings.summaryMaxTokens = maxTokens;
                this.plugin.saveSettings();
            }
        }
    }
}