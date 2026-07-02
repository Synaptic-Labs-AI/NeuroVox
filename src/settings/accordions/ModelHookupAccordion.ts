// src/settings/accordions/ModelHookupAccordion.ts

import { BaseAccordion } from "./BaseAccordion";
import { NeuroVoxSettings } from "../Settings";
import { Setting, Notice } from "obsidian";
import { AIAdapter, AIProvider } from "../../adapters/AIAdapter";
import { MoonshineAdapter, MoonshineModelStatus } from "../../adapters/MoonshineAdapter";
import NeuroVoxPlugin from "../../main";
import { RecordingAccordion } from "./RecordingAccordion";
import { PostProcessingAccordion } from "./PostProcessingAccordion";

export class ModelHookupAccordion extends BaseAccordion {
    private recordingAccordion: RecordingAccordion | null = null;
    private postProcessingAccordion: PostProcessingAccordion | null = null;
    private moonshineStatusEl: HTMLElement | null = null;
    private moonshineButtonEl: HTMLButtonElement | null = null;
    private moonshineProgressEl: HTMLElement | null = null;

    constructor(
        containerEl: HTMLElement,
        public settings: NeuroVoxSettings,
        public getAdapter: (provider: AIProvider) => AIAdapter,
        public plugin: NeuroVoxPlugin
    ) {
        super(
            containerEl,
            "🔑 API Keys & Local Models",
            "Configure API keys for cloud providers or download local models."
        );
    }

    setAccordions(recording: RecordingAccordion, postProcessing: PostProcessingAccordion): void {
        this.recordingAccordion = recording;
        this.postProcessingAccordion = postProcessing;
    }

    private async refreshAccordions(): Promise<void> {
        const promises: Promise<void>[] = [];
        if (this.recordingAccordion) {
            promises.push(this.recordingAccordion.refresh());
        }
        if (this.postProcessingAccordion) {
            promises.push(this.postProcessingAccordion.refresh());
        }
        await Promise.all(promises);
    }

    render(): void {
        const openaiSetting = new Setting(this.contentEl)
            .setName("OpenAI API key")
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
                            } catch {
                                openaiSetting.setDesc("✅ API key valid, but failed to update model lists");
                            }
                        } else {
                            openaiSetting.setDesc("❌ Invalid API key. Please check your credentials.");
                        }
                    });
            });

        const groqSetting = new Setting(this.contentEl)
            .setName("Groq API key")
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
                            } catch {
                                groqSetting.setDesc("✅ API key valid, but failed to update model lists");
                            }
                        } else {
                            groqSetting.setDesc("❌ Invalid API key. Please check your credentials.");
                        }
                    });
            });

        const deepgramSetting = new Setting(this.contentEl)
            .setName("Deepgram API key")
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
                            } catch {
                                deepgramSetting.setDesc("✅ API key valid, but failed to update model lists");
                            }
                        } else {
                            deepgramSetting.setDesc("❌ Invalid API key. Please check your credentials.");
                        }
                    });
            });

        const openrouterSetting = new Setting(this.contentEl)
            .setName("OpenRouter API key")
            .setDesc("Enter your OpenRouter API key (used for post-processing)")
            .addText(text => {
                text
                    .setPlaceholder("sk-or-...")
                    .setValue(this.settings.openrouterApiKey);
                text.inputEl.type = "password";
                text.onChange(async (value: string) => {
                        const trimmedValue = value.trim();
                        this.settings.openrouterApiKey = trimmedValue;
                        await this.plugin.saveSettings();

                        const adapter = this.getAdapter(AIProvider.OpenRouter);
                        if (!adapter) {
                            return;
                        }

                        adapter.setApiKey(trimmedValue);
                        const isValid = await adapter.validateApiKey();

                        if (isValid) {
                            openrouterSetting.setDesc("✅ API key validated successfully");
                            try {
                                await this.refreshAccordions();
                            } catch {
                                openrouterSetting.setDesc("✅ API key valid, but failed to update model lists");
                            }
                        } else {
                            openrouterSetting.setDesc("❌ Invalid API key. Please check your credentials.");
                        }
                    });
            });

        const assemblyaiSetting = new Setting(this.contentEl)
            .setName("AssemblyAI API key")
            .setDesc("Enter your AssemblyAI API key (used for transcription)")
            .addText(text => {
                text
                    .setPlaceholder("Enter your AssemblyAI API key...")
                    .setValue(this.settings.assemblyaiApiKey);
                text.inputEl.type = "password";
                text.onChange(async (value: string) => {
                        const trimmedValue = value.trim();
                        this.settings.assemblyaiApiKey = trimmedValue;
                        await this.plugin.saveSettings();

                        const adapter = this.getAdapter(AIProvider.AssemblyAI);
                        if (!adapter) {
                            return;
                        }

                        adapter.setApiKey(trimmedValue);
                        const isValid = await adapter.validateApiKey();

                        if (isValid) {
                            assemblyaiSetting.setDesc("✅ API key validated successfully");
                            try {
                                await this.refreshAccordions();
                            } catch {
                                assemblyaiSetting.setDesc("✅ API key valid, but failed to update model lists");
                            }
                        } else {
                            assemblyaiSetting.setDesc("❌ Invalid API key. Please check your credentials.");
                        }
                    });
            });

        // Moonshine Local Model Section
        this.createMoonshineSection();
    }

    private createMoonshineSection(): void {
        // Separator
        this.contentEl.createEl('hr', { cls: 'neurovox-separator' });

        // Section header
        const headerEl = this.contentEl.createDiv({ cls: 'neurovox-local-model-header' });
        headerEl.createEl('h4', { text: '🖥️ Local model (no API key required)' });

        // Model selection
        new Setting(this.contentEl)
            .setName("Moonshine model")
            .setDesc("Select model size. Tiny is faster (~50 MB), base is more accurate (~400 MB).")
            .addDropdown(dropdown => {
                dropdown
                    .addOption("moonshine-tiny", "Moonshine tiny (27m params)")
                    .addOption("moonshine-base", "Moonshine base (62m params)")
                    .setValue(this.settings.moonshineModel)
                    .onChange(async (value) => {
                        this.settings.moonshineModel = value;
                        await this.plugin.saveSettings();
                        this.updateMoonshineUI();
                    });
            });

        // Status and button
        const moonshineSetting = new Setting(this.contentEl)
            .setName("Model status");

        this.moonshineStatusEl = moonshineSetting.descEl;

        // Progress bar
        this.moonshineProgressEl = this.contentEl.createDiv({ cls: 'neurovox-progress-container neurovox-hidden' });
        const progressBar = this.moonshineProgressEl.createDiv({ cls: 'neurovox-progress-bar' });
        progressBar.createDiv({ cls: 'neurovox-progress-fill' });
        this.moonshineProgressEl.createDiv({ cls: 'neurovox-progress-text', text: 'Downloading...' });

        moonshineSetting.addButton(button => {
            this.moonshineButtonEl = button.buttonEl;
            button.onClick(() => this.handleMoonshineButton());
        });

        // Add styles
        this.addMoonshineStyles();

        // Initial UI update
        this.updateMoonshineUI();
    }

    private updateMoonshineUI(): void {
        const adapter = this.getAdapter(AIProvider.Moonshine) as MoonshineAdapter;
        if (!adapter || !this.moonshineStatusEl || !this.moonshineButtonEl) return;

        const status = adapter.getModelStatus(this.settings.moonshineModel);
        const modelName = this.settings.moonshineModel === 'moonshine-tiny' ? 'Tiny' : 'Base';

        switch (status) {
            case MoonshineModelStatus.NotDownloaded:
                this.moonshineStatusEl.textContent = `${modelName} model not downloaded`;
                this.moonshineButtonEl.textContent = 'Download';
                this.moonshineButtonEl.removeClass('mod-warning');
                this.moonshineButtonEl.addClass('mod-cta');
                this.moonshineButtonEl.disabled = false;
                this.hideProgress();
                break;

            case MoonshineModelStatus.Downloading:
                this.moonshineStatusEl.textContent = `Downloading ${modelName} model...`;
                this.moonshineButtonEl.textContent = 'Downloading...';
                this.moonshineButtonEl.disabled = true;
                this.showProgress(adapter.getDownloadProgress());
                break;

            case MoonshineModelStatus.Ready:
                this.moonshineStatusEl.textContent = `✅ ${modelName} model ready`;
                this.moonshineButtonEl.textContent = 'Delete';
                this.moonshineButtonEl.removeClass('mod-cta');
                this.moonshineButtonEl.addClass('mod-warning');
                this.moonshineButtonEl.disabled = false;
                this.hideProgress();
                break;

            case MoonshineModelStatus.Error:
                this.moonshineStatusEl.textContent = `❌ Failed to load ${modelName} model`;
                this.moonshineButtonEl.textContent = 'Retry';
                this.moonshineButtonEl.removeClass('mod-warning');
                this.moonshineButtonEl.addClass('mod-cta');
                this.moonshineButtonEl.disabled = false;
                this.hideProgress();
                break;
        }
    }

    private async handleMoonshineButton(): Promise<void> {
        const adapter = this.getAdapter(AIProvider.Moonshine) as MoonshineAdapter;
        if (!adapter) return;

        const status = adapter.getModelStatus(this.settings.moonshineModel);

        if (status === MoonshineModelStatus.Ready) {
            // Delete/unload the model
            await adapter.unloadModel();
            new Notice('Moonshine model unloaded');
            this.updateMoonshineUI();
            await this.refreshAccordions();
        } else {
            // Download/load the model
            try {
                this.updateMoonshineUI();

                // Poll for progress updates
                const progressInterval = window.setInterval(() => {
                    if (adapter.isDownloading()) {
                        this.showProgress(adapter.getDownloadProgress());
                    }
                }, 500);

                await adapter.ensureModelLoaded(this.settings.moonshineModel);

                window.clearInterval(progressInterval);
                this.updateMoonshineUI();
                await this.refreshAccordions();

                new Notice('Moonshine model downloaded and ready!');
            } catch (error) {
                this.updateMoonshineUI();
                const message = error instanceof Error ? error.message : 'Unknown error';
                new Notice(`Failed to download model: ${message}`);
            }
        }
    }

    private showProgress(percent: number): void {
        if (!this.moonshineProgressEl) return;
        this.moonshineProgressEl.removeClass('neurovox-hidden');

        const fill = this.moonshineProgressEl.querySelector('.neurovox-progress-fill') as HTMLElement;
        const text = this.moonshineProgressEl.querySelector('.neurovox-progress-text') as HTMLElement;

        if (fill) fill.style.width = `${percent}%`;
        if (text) text.textContent = `Downloading... ${percent}%`;
    }

    private hideProgress(): void {
        if (!this.moonshineProgressEl) return;
        this.moonshineProgressEl.addClass('neurovox-hidden');
    }

    private addMoonshineStyles(): void {
        if (document.getElementById('neurovox-moonshine-styles')) return;

        const style = createEl('style');
        style.id = 'neurovox-moonshine-styles';
        style.textContent = `
            .neurovox-separator {
                margin: 1.5em 0;
                border: none;
                border-top: 1px solid var(--background-modifier-border);
            }
            .neurovox-local-model-header h4 {
                margin: 0 0 0.5em 0;
                color: var(--text-normal);
            }
            .neurovox-progress-container {
                margin: 0.5em 0 1em 0;
                padding: 0.5em;
            }
            .neurovox-progress-bar {
                height: 6px;
                background: var(--background-modifier-border);
                border-radius: 3px;
                overflow: hidden;
            }
            .neurovox-progress-fill {
                height: 100%;
                width: 0%;
                background: var(--interactive-accent);
                transition: width 0.3s ease;
            }
            .neurovox-progress-text {
                margin-top: 0.25em;
                font-size: 0.8em;
                color: var(--text-muted);
            }
        `;
        document.head.appendChild(style);
    }
}
