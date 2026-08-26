// src/settings/sections/ApiKeysSection.ts

import { Notice } from 'obsidian';
import type { Setting, SettingDefinition } from 'obsidian';
import { NeuroVoxSettings } from '../Settings';
import type { SettingsSection } from '../SettingsSection';
import { AIAdapter, AIProvider } from '../../adapters/AIAdapter';
import { MoonshineAdapter, MoonshineModelStatus } from '../../adapters/MoonshineAdapter';
import NeuroVoxPlugin from '../../main';

/** Settings keys holding a cloud provider's API key. */
type ApiKeySetting = Extract<keyof NeuroVoxSettings, `${string}ApiKey`>;

interface ApiKeyField {
    provider: AIProvider;
    key: ApiKeySetting;
    name: string;
    desc: string;
    placeholder: string;
    aliases: string[];
}

const API_KEY_FIELDS: ApiKeyField[] = [
    {
        provider: AIProvider.OpenAI,
        key: 'openaiApiKey',
        name: 'OpenAI API key',
        desc: 'Enter your OpenAI API key',
        placeholder: 'sk-...',
        aliases: ['openai', 'whisper', 'gpt', 'token', 'credentials'],
    },
    {
        provider: AIProvider.Groq,
        key: 'groqApiKey',
        name: 'Groq API key',
        desc: 'Enter your Groq API key',
        placeholder: 'gsk_...',
        aliases: ['groq', 'llama', 'token', 'credentials'],
    },
    {
        provider: AIProvider.Deepgram,
        key: 'deepgramApiKey',
        name: 'Deepgram API key',
        desc: 'Enter your Deepgram API key',
        placeholder: 'Enter your Deepgram API key...',
        aliases: ['deepgram', 'nova', 'token', 'credentials'],
    },
    {
        provider: AIProvider.OpenRouter,
        key: 'openrouterApiKey',
        name: 'OpenRouter API key',
        desc: 'Enter your OpenRouter API key (used for post-processing)',
        placeholder: 'sk-or-...',
        aliases: ['openrouter', 'token', 'credentials'],
    },
    {
        provider: AIProvider.AssemblyAI,
        key: 'assemblyaiApiKey',
        name: 'AssemblyAI API key',
        desc: 'Enter your AssemblyAI API key (used for transcription)',
        placeholder: 'Enter your AssemblyAI API key...',
        aliases: ['assemblyai', 'assembly', 'token', 'credentials'],
    },
];

/**
 * API keys for the cloud providers.
 *
 * Every field is a `render` definition: the input needs `type="password"` and
 * the row's description doubles as live validation feedback, neither of which
 * a declarative `control` can express. The name and description are still
 * picked up by settings search.
 */
export class ApiKeysSection implements SettingsSection {
    public readonly title = '🔑 API Keys';
    public readonly description = 'Configure API keys for cloud providers.';

    private moonshineStatusEl: HTMLElement | null = null;
    private moonshineButtonEl: HTMLButtonElement | null = null;
    private moonshineProgressEl: HTMLElement | null = null;

    constructor(
        public plugin: NeuroVoxPlugin,
        public getAdapter: (provider: AIProvider) => AIAdapter | undefined,
        /** Rebuilds the model lists that depend on which keys are configured. */
        private onKeysChanged: () => Promise<void>
    ) {}

    private get settings(): NeuroVoxSettings {
        return this.plugin.settings;
    }

    getDefinitions(): SettingDefinition[] {
        return API_KEY_FIELDS.map(field => ({
            name: field.name,
            desc: field.desc,
            aliases: ['API key', ...field.aliases],
            render: (setting: Setting) => this.renderApiKey(setting, field),
        }));

        // TEMPORARILY HIDDEN: the local (Moonshine) model feature is still in
        // development. Re-enable by appending `...this.moonshineDefinitions()`
        // to the array above, together with the Moonshine optgroup block in
        // RecordingSection.setupModelDropdown().
    }

    async refresh(): Promise<void> {
        // Nothing here depends on the other sections' state.
    }

    private renderApiKey(setting: Setting, field: ApiKeyField): void {
        setting.addText(text => {
            text.setPlaceholder(field.placeholder).setValue(this.settings[field.key]);
            text.inputEl.type = 'password';

            text.onChange(async (value: string) => {
                const trimmedValue = value.trim();
                this.settings[field.key] = trimmedValue;
                await this.plugin.saveSettings();

                const adapter = this.getAdapter(field.provider);
                if (!adapter) {
                    return;
                }

                adapter.setApiKey(trimmedValue);
                const isValid = await adapter.validateApiKey();

                if (!isValid) {
                    setting.setDesc('❌ Invalid API key. Please check your credentials.');
                    return;
                }

                setting.setDesc('✅ API key validated successfully');
                try {
                    await this.onKeysChanged();
                } catch {
                    setting.setDesc('✅ API key valid, but failed to update model lists');
                }
            });
        });
    }

    // ---------------------------------------------------------------------
    // Local model (Moonshine) — retained but not currently surfaced.
    // ---------------------------------------------------------------------

    /** @see the note in {@link getDefinitions}. */
    private moonshineDefinitions(): SettingDefinition[] {
        return [
            {
                name: '🖥️ Local model (no API key required)',
                desc: 'Runs transcription on this device instead of a cloud provider.',
                aliases: ['moonshine', 'local', 'offline'],
            },
            {
                name: 'Moonshine model',
                desc: 'Select model size. Tiny is faster (~50 MB), base is more accurate (~400 MB).',
                aliases: ['moonshine', 'local', 'offline'],
                control: {
                    type: 'dropdown',
                    key: 'moonshineModel',
                    options: {
                        'moonshine-tiny': 'Moonshine tiny (27m params)',
                        'moonshine-base': 'Moonshine base (62m params)',
                    },
                },
            },
            {
                name: 'Model status',
                desc: 'Download or remove the local model.',
                aliases: ['moonshine', 'local', 'download'],
                render: (setting: Setting) => this.renderMoonshineStatus(setting),
            },
        ];
    }

    private renderMoonshineStatus(setting: Setting): void {
        this.moonshineStatusEl = setting.descEl;

        this.moonshineProgressEl = setting.settingEl.createDiv({
            cls: 'neurovox-progress-container neurovox-hidden',
        });
        const progressBar = this.moonshineProgressEl.createDiv({ cls: 'neurovox-progress-bar' });
        progressBar.createDiv({ cls: 'neurovox-progress-fill' });
        this.moonshineProgressEl.createDiv({
            cls: 'neurovox-progress-text',
            text: 'Downloading...',
        });

        setting.addButton(button => {
            this.moonshineButtonEl = button.buttonEl;
            button.onClick(() => void this.handleMoonshineButton());
        });

        this.updateMoonshineUI();
    }

    private updateMoonshineUI(): void {
        const adapter = this.getAdapter(AIProvider.Moonshine) as MoonshineAdapter | undefined;
        if (!adapter || !this.moonshineStatusEl || !this.moonshineButtonEl) return;

        const status = adapter.getModelStatus(this.settings.moonshineModel);
        const modelName = this.settings.moonshineModel === 'moonshine-tiny' ? 'Tiny' : 'Base';

        switch (status) {
            case MoonshineModelStatus.NotDownloaded:
                this.moonshineStatusEl.setText(`${modelName} model not downloaded`);
                this.moonshineButtonEl.setText('Download');
                this.moonshineButtonEl.removeClass('mod-warning');
                this.moonshineButtonEl.addClass('mod-cta');
                this.moonshineButtonEl.disabled = false;
                this.hideProgress();
                break;

            case MoonshineModelStatus.Downloading:
                this.moonshineStatusEl.setText(`Downloading ${modelName} model...`);
                this.moonshineButtonEl.setText('Downloading...');
                this.moonshineButtonEl.disabled = true;
                this.showProgress(adapter.getDownloadProgress());
                break;

            case MoonshineModelStatus.Ready:
                this.moonshineStatusEl.setText(`✅ ${modelName} model ready`);
                this.moonshineButtonEl.setText('Delete');
                this.moonshineButtonEl.removeClass('mod-cta');
                this.moonshineButtonEl.addClass('mod-warning');
                this.moonshineButtonEl.disabled = false;
                this.hideProgress();
                break;

            case MoonshineModelStatus.Error:
                this.moonshineStatusEl.setText(`❌ Failed to load ${modelName} model`);
                this.moonshineButtonEl.setText('Retry');
                this.moonshineButtonEl.removeClass('mod-warning');
                this.moonshineButtonEl.addClass('mod-cta');
                this.moonshineButtonEl.disabled = false;
                this.hideProgress();
                break;
        }
    }

    private async handleMoonshineButton(): Promise<void> {
        const adapter = this.getAdapter(AIProvider.Moonshine) as MoonshineAdapter | undefined;
        if (!adapter) return;

        const status = adapter.getModelStatus(this.settings.moonshineModel);

        if (status === MoonshineModelStatus.Ready) {
            await adapter.unloadModel();
            new Notice('Moonshine model unloaded');
            this.updateMoonshineUI();
            await this.onKeysChanged();
            return;
        }

        try {
            this.updateMoonshineUI();

            // Poll for progress updates.
            const progressInterval = window.setInterval(() => {
                if (adapter.isDownloading()) {
                    this.showProgress(adapter.getDownloadProgress());
                }
            }, 500);

            await adapter.ensureModelLoaded(this.settings.moonshineModel);

            window.clearInterval(progressInterval);
            this.updateMoonshineUI();
            await this.onKeysChanged();

            new Notice('Moonshine model downloaded and ready!');
        } catch (error) {
            this.updateMoonshineUI();
            const message = error instanceof Error ? error.message : 'Unknown error';
            new Notice(`Failed to download model: ${message}`);
        }
    }

    private showProgress(percent: number): void {
        if (!this.moonshineProgressEl) return;
        this.moonshineProgressEl.removeClass('neurovox-hidden');

        const fill = this.moonshineProgressEl.querySelector<HTMLElement>('.neurovox-progress-fill');
        const text = this.moonshineProgressEl.querySelector<HTMLElement>('.neurovox-progress-text');

        if (fill) fill.style.width = `${percent}%`;
        if (text) text.setText(`Downloading... ${percent}%`);
    }

    private hideProgress(): void {
        this.moonshineProgressEl?.addClass('neurovox-hidden');
    }
}
