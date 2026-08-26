// src/settings/sections/RecordingSection.ts

import type { DropdownComponent, Setting, SettingDefinition } from 'obsidian';
import { AudioQuality, NeuroVoxSettings } from '../Settings';
import type { SettingsSection } from '../SettingsSection';
import { AIAdapter, AIModels, AIProvider, getDynamicModels } from '../../adapters/AIAdapter';
// TEMPORARILY HIDDEN: local model feature is still in development. Re-enable
// together with the Moonshine optgroup block in setupModelDropdown() below.
// import { MoonshineAdapter, MoonshineModelStatus } from "../../adapters/MoonshineAdapter";
import NeuroVoxPlugin from '../../main';

/** Cloud providers offering transcription, in dropdown order. */
const TRANSCRIPTION_PROVIDERS = [
    AIProvider.OpenAI,
    AIProvider.Groq,
    AIProvider.Deepgram,
    AIProvider.AssemblyAI,
];

/**
 * Recording preferences and transcription model selection.
 *
 * Everything but the model dropdown is a plain `control` definition bound
 * straight to a settings key. The dropdown is built imperatively because its
 * options are per-provider optgroups fetched from live model catalogs.
 */
export class RecordingSection implements SettingsSection {
    public readonly title = '🎙 Recording';
    public readonly description =
        'Configure recording preferences and select a transcription model.';

    private modelDropdown: DropdownComponent | null = null;

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
                name: 'Recording path',
                desc: 'Specify the folder path to save recordings relative to the vault root',
                aliases: ['folder', 'location', 'audio'],
                control: {
                    type: 'text',
                    key: 'recordingFolderPath',
                    placeholder: 'Recordings',
                },
            },
            {
                name: 'Transcript path',
                desc: 'Specify the folder path to save transcripts relative to the vault root',
                aliases: ['folder', 'location', 'notes'],
                control: {
                    type: 'text',
                    key: 'transcriptFolderPath',
                    placeholder: 'Transcripts',
                },
            },
            {
                name: 'Audio quality',
                desc: 'Set the recording quality (affects file size and clarity)',
                aliases: ['bitrate', 'sample rate', 'file size'],
                control: {
                    type: 'dropdown',
                    key: 'audioQuality',
                    options: {
                        [AudioQuality.Low]: 'Voice optimized (smaller files)',
                        [AudioQuality.Medium]: 'CD quality (balanced)',
                        [AudioQuality.High]: 'Enhanced quality (larger files)',
                    },
                },
            },
            {
                name: 'Show floating button',
                desc: 'Show a floating microphone button for quick recording',
                aliases: ['microphone', 'mic', 'overlay'],
                control: { type: 'toggle', key: 'showFloatingButton' },
            },
            {
                name: 'Show toolbar button',
                desc: 'Show a microphone button in the toolbar',
                aliases: ['microphone', 'mic', 'ribbon'],
                control: { type: 'toggle', key: 'showToolbarButton' },
            },
            {
                name: 'Mic button color',
                desc: 'Choose the color for the microphone buttons',
                aliases: ['colour', 'microphone', 'theme'],
                control: { type: 'color', key: 'micButtonColor' },
            },
            {
                name: 'Transcription format',
                desc: 'Customize the transcription callout format. Use {audioPath} for audio file path and {transcription} for the transcribed text',
                aliases: ['callout', 'template', 'output'],
                control: {
                    type: 'textarea',
                    key: 'transcriptionCalloutFormat',
                    placeholder: '>[!info]- Transcription\n>![[{audioPath}]]\n>{transcription}',
                    rows: 4,
                },
            },
            {
                name: 'Transcription model',
                desc: 'Select the AI model for transcription',
                aliases: ['whisper', 'speech to text', 'provider'],
                render: (setting: Setting) => this.renderModelDropdown(setting),
            },
        ];
    }

    async refresh(): Promise<void> {
        if (!this.modelDropdown) {
            return;
        }

        await this.setupModelDropdown(this.modelDropdown);
    }

    private renderModelDropdown(setting: Setting): void {
        setting.addDropdown(dropdown => {
            this.modelDropdown = dropdown;
            void this.setupModelDropdown(dropdown);

            dropdown.onChange(async (value: string) => {
                this.settings.transcriptionModel = value;
                const provider = this.getProviderFromModel(value);
                if (provider) {
                    this.settings.transcriptionProvider = provider;
                    await this.plugin.saveSettings();
                }
            });
        });
    }

    private async setupModelDropdown(dropdown: DropdownComponent): Promise<void> {
        dropdown.selectEl.empty();
        let hasValidProvider = false;

        // Cloud providers (require API keys)
        for (const provider of TRANSCRIPTION_PROVIDERS) {
            const apiKey = this.settings[`${provider}ApiKey` as keyof NeuroVoxSettings];
            if (!apiKey) {
                continue;
            }
            const adapter = this.getAdapter(provider);
            if (!adapter) {
                continue;
            }

            // Live catalog where the provider publishes one, static list otherwise.
            const models = await adapter.fetchTranscriptionModels();
            if (models.length === 0) {
                continue;
            }

            hasValidProvider = true;
            const group = createEl('optgroup');
            group.label = `${provider.toUpperCase()} Models`;

            for (const model of models) {
                const option = createEl('option');
                option.value = model.id;
                option.text = model.name;
                group.appendChild(option);
            }

            dropdown.selectEl.appendChild(group);
        }

        // Moonshine local models (require download, not API key)
        // TEMPORARILY HIDDEN: local model feature is still in development and
        // hidden from the transcription-model dropdown for release. Re-enable by
        // uncommenting the block below.
        // const moonshineAdapter = this.getAdapter(AIProvider.Moonshine) as MoonshineAdapter | undefined;
        // if (moonshineAdapter) {
        //     const downloadedModels = AIModels[AIProvider.Moonshine].filter(model => {
        //         const status = moonshineAdapter.getModelStatus(model.id);
        //         return status === MoonshineModelStatus.Ready;
        //     });
        //
        //     if (downloadedModels.length > 0) {
        //         hasValidProvider = true;
        //         const group = createEl("optgroup");
        //         group.label = "LOCAL Models (No API)";
        //
        //         downloadedModels.forEach(model => {
        //             const option = createEl("option");
        //             option.value = model.id;
        //             option.text = `${model.name}`;
        //             group.appendChild(option);
        //         });
        //
        //         dropdown.selectEl.appendChild(group);
        //     }
        // }

        if (!hasValidProvider) {
            dropdown.addOption('none', 'No models available - add an API key');
            dropdown.setDisabled(true);
            this.settings.transcriptionModel = '';
        } else {
            dropdown.setDisabled(false);

            if (
                !this.settings.transcriptionModel ||
                !this.getProviderFromModel(this.settings.transcriptionModel)
            ) {
                const firstOption = dropdown.selectEl.querySelector<HTMLOptionElement>(
                    'option:not([value="none"])'
                );
                if (firstOption) {
                    const modelId = firstOption.value;
                    const provider = this.getProviderFromModel(modelId);
                    if (provider) {
                        this.settings.transcriptionProvider = provider;
                        this.settings.transcriptionModel = modelId;
                        dropdown.setValue(modelId);
                    }
                }
            } else {
                dropdown.setValue(this.settings.transcriptionModel);
            }
        }

        await this.plugin.saveSettings();
    }

    public getProviderFromModel(modelId: string): AIProvider | null {
        // Check the live catalogs first: a model fetched from the provider won't be in the
        // static table, and failing to resolve it would silently reject the user's choice.
        for (const provider of Object.keys(AIModels) as AIProvider[]) {
            if (getDynamicModels(provider)?.some(model => model.id === modelId)) {
                return provider;
            }
        }
        for (const [provider, models] of Object.entries(AIModels)) {
            if (models.some(model => model.id === modelId)) {
                return provider as AIProvider;
            }
        }
        return null;
    }
}
