// src/settings/accordions/SummaryAccordion.ts

import { BaseAccordion } from "./BaseAccordion";
import { NeuroVoxSettings } from "../Settings";
import { Setting, DropdownComponent, TextAreaComponent, SliderComponent } from "obsidian";
import { AIAdapter, AIProvider, AIModels, getModelInfo } from "../../adapters/AIAdapter";
import NeuroVoxPlugin from "../../main";

export class SummaryAccordion extends BaseAccordion {
    public modelDropdown: DropdownComponent;
    public promptArea: TextAreaComponent;
    public maxTokensSlider: SliderComponent;
    public temperatureSlider: SliderComponent;

    constructor(
        containerEl: HTMLElement,
        public settings: NeuroVoxSettings,
        public getAdapter: (provider: AIProvider) => AIAdapter | undefined,
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

    /**
     * Adds a toggle to enable or disable AI summary generation.
     */
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

    /**
     * Adds a dropdown to select the AI model for summary generation.
     */
    public addModelSelection(): void {
        new Setting(this.contentEl)
            .setName("Summary Model")
            .setDesc("Select the AI model for generating summaries")
            .addDropdown(dropdown => {
                this.modelDropdown = dropdown;
                this.populateModelOptions(dropdown);
                
                dropdown.setValue(this.settings.summaryModel)
                    .onChange(async (value: string) => {
                        this.settings.summaryModel = value;
                        const provider = this.getProviderFromModel(value);
                        if (provider) {
                            this.settings.summaryProvider = provider;
                            await this.plugin.saveSettings();
                        }

                        // Update max tokens based on model capabilities
                        await this.updateMaxTokensLimit(value);
                    });
            });
    }

    /**
     * Adds a textarea to customize the summary prompt template.
     */
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

    /**
     * Adds a slider to set the maximum number of tokens for the summary.
     */
    public addMaxTokens(): void {
        new Setting(this.contentEl)
            .setName("Maximum Summary Length")
            .setDesc("Set the maximum number of tokens for the generated summary")
            .addSlider(slider => {
                this.maxTokensSlider = slider;
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

    /**
     * Adds a slider to control the creativity level of the summary.
     */
    public addTemperatureControl(): void {
        new Setting(this.contentEl)
            .setName("Summary Creativity")
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

    /**
     * Populates the model dropdown with available OpenAI and Groq models.
     * @param dropdown The dropdown component to populate.
     */
    public populateModelOptions(dropdown: DropdownComponent): void {
        // Clear existing options
        dropdown.selectEl.empty();

        // Add OpenAI and Groq models
        [AIProvider.OpenAI, AIProvider.Groq].forEach(provider => {
            const apiKey = this.settings[`${provider}ApiKey` as keyof NeuroVoxSettings];
            if (apiKey) {
                const adapter = this.getAdapter(provider);
                if (adapter) {
                    const models = adapter.getAvailableModels('language');
                    if (models.length > 0) {
                        this.addModelGroup(dropdown, `${provider.toUpperCase()} Models`, models);
                    }
                }
            }
        });

        // If no models are available, add a placeholder option
        if (dropdown.selectEl.options.length === 0) {
            dropdown.addOption("none", "No API Keys Configured");
            dropdown.setDisabled(true);
        } else {
            dropdown.setDisabled(false);
        }
    }

    /**
     * Adds a group of models under a specific label in the dropdown.
     * @param dropdown The dropdown component.
     * @param groupName The name of the model group (e.g., "OpenAI Models").
     * @param models The list of models to add.
     */
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

    /**
     * Determines the AI provider based on the selected model ID.
     * @param modelId The ID of the selected model.
     * @returns The corresponding AIProvider or a default AIProvider if not found.
     */
    public getProviderFromModel(modelId: string): AIProvider {
        for (const [provider, models] of Object.entries(AIModels)) {
            if (models.some(model => model.id === modelId)) {
                return provider as AIProvider;
            }
        }
        return AIProvider.OpenAI; // Default fallback
    }

    /**
     * Updates the maximum tokens slider based on the selected model's capabilities.
     * @param modelId The ID of the selected model.
     */
    public async updateMaxTokensLimit(modelId: string): Promise<void> {
        const model = getModelInfo(modelId);
        const maxTokens = model?.maxTokens || 1000; // Fallback to 1000 if model not found
        
        if (this.maxTokensSlider) {
            this.maxTokensSlider.sliderEl.max = maxTokens.toString();
            // Ensure the current value does not exceed the new max
            const currentValue = parseInt(this.maxTokensSlider.sliderEl.value);
            if (currentValue > maxTokens) {
                this.maxTokensSlider.setValue(maxTokens);
                this.settings.summaryMaxTokens = maxTokens;
                await this.plugin.saveSettings();
            }
        }
    }
}
