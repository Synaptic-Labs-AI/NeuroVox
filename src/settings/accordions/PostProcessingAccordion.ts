// src/settings/accordions/PostProcessingAccordion.ts

import { BaseAccordion } from "./BaseAccordion";
import { NeuroVoxSettings } from "../Settings";
import { Setting, TextComponent, TextAreaComponent, SliderComponent } from "obsidian";
import { AIAdapter, AIModel, AIProvider, AIModels, getModelInfo } from "../../adapters/AIAdapter";
import NeuroVoxPlugin from "../../main";

// Providers that support post-processing (language) and expose a /models catalog.
const LANGUAGE_PROVIDERS = [AIProvider.OpenAI, AIProvider.Groq, AIProvider.OpenRouter];

export class PostProcessingAccordion extends BaseAccordion {
    private modelInput: TextComponent | null = null;
    private datalistEl: HTMLDataListElement | null = null;
    private modelSetting: Setting | null = null;
    private promptArea: TextAreaComponent | null = null;
    private maxTokensSlider: SliderComponent | null = null;
    private temperatureSlider: SliderComponent | null = null;

    // Maps a selectable model id -> its provider, rebuilt whenever the list refreshes.
    private modelLookup: Map<string, AIProvider> = new Map();

    public async refresh(): Promise<void> {
        if (!this.modelInput) {
            return;
        }

        await this.setupModelSelector();

        if (this.settings.postProcessingModel) {
            await this.updateMaxTokensLimit(this.settings.postProcessingModel)
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
            "📝 Post-Processing",
            "Configure AI post-processing preferences and customize the prompt template."
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
            .setName("Enable AI post-processing")
            .setDesc("Automatically generate AI post-processing after transcription")
            .addToggle(toggle => {
                toggle
                    .setValue(this.settings.generatePostProcessing)
                    .onChange(async (value) => {
                        this.settings.generatePostProcessing = value;
                        await this.plugin.saveSettings();
                    });
            });
    }

    private addModelSelection(): void {
        if (this.modelSetting) {
            this.modelSetting.settingEl.remove();
        }

        this.modelSetting = new Setting(this.contentEl)
            .setName("Post-processing model")
            .setDesc("Type to search models from your configured providers (OpenAI, Groq, OpenRouter)")
            .addText(text => {
                this.modelInput = text;

                // Wire the input to a datalist for native type-to-filter behaviour.
                const datalistId = "neurovox-postprocessing-models";
                this.datalistEl = createEl("datalist");
                this.datalistEl.id = datalistId;
                text.inputEl.setAttribute("list", datalistId);
                text.inputEl.after(this.datalistEl);
                text.inputEl.addClass("neurovox-full-width");

                // A pre-filled value makes the native datalist filter down to just that one
                // option. Treat the box as a search field: clear it on focus so the whole
                // catalog is browsable, and restore the committed selection on blur if the
                // user didn't pick a valid model.
                text.inputEl.addEventListener("focus", () => {
                    text.inputEl.value = "";
                });
                text.inputEl.addEventListener("blur", () => {
                    if (!this.modelLookup.has(text.inputEl.value.trim())) {
                        text.inputEl.value = this.settings.postProcessingModel;
                    }
                });

                void this.setupModelSelector();

                text.onChange(async (value: string) => {
                    const modelId = value.trim();
                    const provider = this.getProviderFromModel(modelId);

                    // Only persist selections we can resolve to a provider, so an
                    // in-progress search string doesn't clobber a valid choice.
                    if (!modelId || !provider) {
                        return;
                    }

                    this.settings.postProcessingModel = modelId;
                    this.settings.postProcessingProvider = provider;
                    await this.plugin.saveSettings();
                    await this.updateMaxTokensLimit(modelId);
                    this.updateSelectedModelDesc();
                });
            });
    }

    private async setupModelSelector(): Promise<void> {
        if (!this.modelInput || !this.datalistEl) {
            return;
        }

        this.modelLookup.clear();
        this.datalistEl.empty();

        // Gather models from every configured language provider (live catalog when
        // available, static fallback otherwise).
        const fetches = LANGUAGE_PROVIDERS.map(async provider => {
            const apiKey = this.settings[`${provider}ApiKey` as keyof NeuroVoxSettings];
            if (!apiKey) {
                return { provider, models: [] as AIModel[] };
            }
            const adapter = this.getAdapter(provider);
            const models = adapter ? await adapter.fetchLanguageModels() : [];
            return { provider, models };
        });

        const results = await Promise.all(fetches);
        let hasValidProvider = false;

        for (const { provider, models } of results) {
            for (const model of models) {
                if (this.modelLookup.has(model.id)) {
                    continue;
                }
                hasValidProvider = true;
                this.modelLookup.set(model.id, provider);

                const option = createEl("option");
                option.value = model.id;
                option.label = `${provider.toUpperCase()} — ${model.name}`;
                this.datalistEl.appendChild(option);
            }
        }

        if (!hasValidProvider) {
            this.modelInput.setValue("");
            this.modelInput.setPlaceholder("No API keys configured");
            this.modelInput.setDisabled(true);
            this.settings.postProcessingModel = '';
        } else {
            this.modelInput.setDisabled(false);
            this.modelInput.setPlaceholder("Search models…");

            const current = this.settings.postProcessingModel;
            if (!current || !this.modelLookup.has(current)) {
                // Default to the first available model.
                const firstId = Array.from(this.modelLookup.keys())[0];
                if (firstId) {
                    this.settings.postProcessingModel = firstId;
                    this.settings.postProcessingProvider = this.modelLookup.get(firstId)!;
                    this.modelInput.setValue(firstId);
                }
            } else {
                this.modelInput.setValue(current);
            }
        }

        this.updateSelectedModelDesc();
        await this.plugin.saveSettings();
    }

    /**
     * Reflects the committed model in the setting description so the active choice stays
     * visible even while the search box is being edited/cleared.
     */
    private updateSelectedModelDesc(): void {
        if (!this.modelSetting) return;
        const id = this.settings.postProcessingModel;
        this.modelSetting.setDesc(
            id
                ? `Type to search • Selected: ${id}`
                : "Type to search models from your configured providers (OpenAI, Groq, OpenRouter)"
        );
    }

    private addPromptTemplate(): void {
        new Setting(this.contentEl)
            .setName("Post-processing template")
            .setDesc("Customize the prompt used for generating summaries. Use {transcript} as a placeholder for the transcribed text.")
            .addTextArea(text => {
                this.promptArea = text;
                text
                    .setPlaceholder("Please process the following transcript: {transcript}")
                    .setValue(this.settings.postProcessingPrompt)
                    .onChange(async (value) => {
                        this.settings.postProcessingPrompt = value;
                        await this.plugin.saveSettings();
                    });
                
                text.inputEl.rows = 4;
                text.inputEl.addClass("neurovox-full-width");
            });
    }

    private addSummaryFormat(): void {
        new Setting(this.contentEl)
            .setName("Post-processing format")
            .setDesc("Customize the post-processing callout format. Use {postProcessing} for the generated content")
            .addTextArea(text => {
                text.setPlaceholder(">[!note]- Post-Processing\n>{postProcessing}")
                    .setValue(this.settings.postProcessingCalloutFormat)
                    .onChange(async (value) => {
                        this.settings.postProcessingCalloutFormat = value;
                        await this.plugin.saveSettings();
                    });
                text.inputEl.rows = 4;
                text.inputEl.addClass("neurovox-full-width");
            });
    }

    private addMaxTokens(): void {
        new Setting(this.contentEl)
            .setName("Maximum post-processing length")
            .setDesc("Set the maximum number of tokens for the post-processing output")
            .addSlider(slider => {
                this.maxTokensSlider = slider;
                slider
                    .setLimits(100, 4096, 100)
                    .setValue(this.settings.postProcessingMaxTokens)
                    .onChange(async (value) => {
                        this.settings.postProcessingMaxTokens = value;
                        await this.plugin.saveSettings();
                    });
            });
    }

    private addTemperatureControl(): void {
        new Setting(this.contentEl)
            .setName("Post-processing creativity")
            .setDesc("Adjust the creativity level of the post-processing (0 = more focused, 1 = more creative)")
            .addSlider(slider => {
                this.temperatureSlider = slider;
                slider
                    .setLimits(0, 1, 0.1)
                    .setValue(this.settings.postProcessingTemperature)
                    .onChange(async (value) => {
                        this.settings.postProcessingTemperature = value;
                        await this.plugin.saveSettings();
                    });
            });
    }

    private getProviderFromModel(modelId: string): AIProvider | null {
        // Prefer the live fetched lookup, then fall back to the static catalog.
        const fromLookup = this.modelLookup.get(modelId);
        if (fromLookup) {
            return fromLookup;
        }
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
                this.settings.postProcessingMaxTokens = maxTokens;
                await this.plugin.saveSettings();
            }
        }
    }
}
