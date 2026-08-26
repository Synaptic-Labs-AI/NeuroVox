// src/settings/sections/PostProcessingSection.ts

import type {
    Setting,
    SettingDefinition,
    SliderComponent,
    TextComponent,
} from 'obsidian';
import { NeuroVoxSettings } from '../Settings';
import type { SettingsSection } from '../SettingsSection';
import { AIAdapter, AIModel, AIModels, AIProvider, getModelInfo } from '../../adapters/AIAdapter';
import NeuroVoxPlugin from '../../main';

// Providers that support post-processing (language) and expose a /models catalog.
const LANGUAGE_PROVIDERS = [AIProvider.OpenAI, AIProvider.Groq, AIProvider.OpenRouter];

/**
 * AI post-processing preferences.
 *
 * The model picker and the token-budget slider are `render` definitions: the
 * first is a datalist-backed search box over live model catalogs, and the
 * second has an upper bound that follows the selected model's context window.
 */
export class PostProcessingSection implements SettingsSection {
    public readonly title = '📝 Post-Processing';
    public readonly description =
        'Configure AI post-processing preferences and customize the prompt template.';

    private modelInput: TextComponent | null = null;
    private modelSetting: Setting | null = null;
    private datalistEl: HTMLDataListElement | null = null;
    private maxTokensSlider: SliderComponent | null = null;

    // Maps a selectable model id -> its provider, rebuilt whenever the list refreshes.
    private modelLookup: Map<string, AIProvider> = new Map();

    constructor(
        public plugin: NeuroVoxPlugin,
        public getAdapter: (provider: AIProvider) => AIAdapter | undefined
    ) {}

    private get settings(): NeuroVoxSettings {
        return this.plugin.settings;
    }

    getDefinitions(): SettingDefinition[] {
        return [
            {
                name: 'Enable AI post-processing',
                desc: 'Automatically generate AI post-processing after transcription',
                aliases: ['summary', 'summarize', 'llm'],
                control: { type: 'toggle', key: 'generatePostProcessing' },
            },
            {
                name: 'Post-processing model',
                desc: 'Type to search models from your configured providers (OpenAI, Groq, OpenRouter)',
                aliases: ['llm', 'provider', 'summary'],
                render: (setting: Setting) => this.renderModelSelector(setting),
            },
            {
                name: 'Post-processing template',
                desc: 'Customize the prompt used for generating summaries. Use {transcript} as a placeholder for the transcribed text.',
                aliases: ['prompt', 'instructions', 'summary'],
                control: {
                    type: 'textarea',
                    key: 'postProcessingPrompt',
                    placeholder: 'Please process the following transcript: {transcript}',
                    rows: 4,
                },
            },
            {
                name: 'Post-processing format',
                desc: 'Customize the post-processing callout format. Use {postProcessing} for the generated content',
                aliases: ['callout', 'template', 'output'],
                control: {
                    type: 'textarea',
                    key: 'postProcessingCalloutFormat',
                    placeholder: '>[!note]- Post-Processing\n>{postProcessing}',
                    rows: 4,
                },
            },
            {
                name: 'Maximum post-processing length',
                desc: 'Set the maximum number of tokens for the post-processing output',
                aliases: ['tokens', 'length', 'budget'],
                render: (setting: Setting) => this.renderMaxTokens(setting),
            },
            {
                name: 'Post-processing creativity',
                desc: 'Adjust the creativity level of the post-processing (0 = more focused, 1 = more creative)',
                aliases: ['temperature', 'randomness'],
                control: {
                    type: 'slider',
                    key: 'postProcessingTemperature',
                    min: 0,
                    max: 1,
                    step: 0.1,
                },
            },
        ];
    }

    async refresh(): Promise<void> {
        if (!this.modelInput) {
            return;
        }

        await this.setupModelSelector();

        if (this.settings.postProcessingModel) {
            await this.updateMaxTokensLimit(this.settings.postProcessingModel);
        }
    }

    private renderModelSelector(setting: Setting): void {
        this.modelSetting = setting;

        setting.addText(text => {
            this.modelInput = text;

            // Wire the input to a datalist for native type-to-filter behaviour.
            const datalistId = 'neurovox-postprocessing-models';
            this.datalistEl = createEl('datalist');
            this.datalistEl.id = datalistId;
            text.inputEl.setAttribute('list', datalistId);
            text.inputEl.after(this.datalistEl);
            text.inputEl.addClass('neurovox-full-width');

            // A pre-filled value makes the native datalist filter down to just that one
            // option. Treat the box as a search field: clear it on focus so the whole
            // catalog is browsable, and restore the committed selection on blur if the
            // user didn't pick a valid model.
            text.inputEl.addEventListener('focus', () => {
                text.inputEl.value = '';
            });
            text.inputEl.addEventListener('blur', () => {
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

                const option = createEl('option');
                option.value = model.id;
                option.label = `${provider.toUpperCase()} — ${model.name}`;
                this.datalistEl.appendChild(option);
            }
        }

        if (!hasValidProvider) {
            this.modelInput.setValue('');
            this.modelInput.setPlaceholder('No API keys configured');
            this.modelInput.setDisabled(true);
            this.settings.postProcessingModel = '';
        } else {
            this.modelInput.setDisabled(false);
            this.modelInput.setPlaceholder('Search models…');

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
                : 'Type to search models from your configured providers (OpenAI, Groq, OpenRouter)'
        );
    }

    private renderMaxTokens(setting: Setting): void {
        setting.addSlider(slider => {
            this.maxTokensSlider = slider;
            slider
                .setLimits(100, 4096, 100)
                .setValue(this.settings.postProcessingMaxTokens)
                .onChange(async (value: number) => {
                    this.settings.postProcessingMaxTokens = value;
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
