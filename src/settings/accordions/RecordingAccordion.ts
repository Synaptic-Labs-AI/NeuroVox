// src/settings/accordions/RecordingAccordion.ts

import { BaseAccordion } from "./BaseAccordion";
import { NeuroVoxSettings, AudioQuality } from "../Settings";
import { Setting, DropdownComponent } from "obsidian";
import { AIAdapter, AIProvider, AIModels } from "../../adapters/AIAdapter";
import NeuroVoxPlugin from "../../main";

export class RecordingAccordion extends BaseAccordion {
    private modelDropdown: DropdownComponent | null = null;
    private modelSetting: Setting | null = null;

    constructor(
        containerEl: HTMLElement,
        public settings: NeuroVoxSettings,
        public getAdapter: (provider: AIProvider) => AIAdapter | undefined,
        public plugin: NeuroVoxPlugin
    ) {
        super(containerEl, "🎙 Recording", "Configure recording preferences and select a transcription model.");
    }

    render(): void {
        // Recording Path
        this.createRecordingPathSetting();
        
        // Transcript Path
        this.createTranscriptPathSetting();

        // Audio Quality Setting
        this.createAudioQualitySetting();
        
        // Floating Button Toggle
        this.createFloatingButtonSetting();
        
        // Toolbar Button Toggle
        this.createToolbarButtonSetting();
        
        // Mic Button Color
        this.createMicButtonColorSetting();
        
        // Add this before createTranscriptionModelSetting
        this.createTranscriptionFormatSetting();

        // Transcription Model Selection
        this.createTranscriptionModelSetting();
    }

    public createTranscriptPathSetting(): void {
        new Setting(this.contentEl)
            .setName("Transcript path")
            .setDesc('Specify the folder path to save transcripts relative to the vault root')
            .addText(text => {
                text.setPlaceholder("Transcripts")
                    .setValue(this.settings.transcriptFolderPath)
                    .onChange(async (value: string) => {
                        this.settings.transcriptFolderPath = value.trim() || "Transcripts";
                        await this.plugin.saveSettings();
                    });
            });
    }

    public createRecordingPathSetting(): void {
        new Setting(this.contentEl)
            .setName("Recording path")
            .setDesc('Specify the folder path to save recordings relative to the vault root')
            .addText(text => {
                text.setPlaceholder("Recordings")
                    .setValue(this.settings.recordingFolderPath)
                    .onChange(async (value: string) => {
                        this.settings.recordingFolderPath = value.trim() || "Recordings";
                        await this.plugin.saveSettings();
                    });
            });
    }

    public createAudioQualitySetting(): void {
        new Setting(this.contentEl)
            .setName("Audio quality")
            .setDesc("Set the recording quality (affects file size and clarity)")
            .addDropdown(dropdown => {
                dropdown
                    .addOption(AudioQuality.Low, "Voice optimized (smaller files)")
                    .addOption(AudioQuality.Medium, "CD quality (balanced)")
                    .addOption(AudioQuality.High, "Enhanced quality (larger files)")
                    .setValue(this.settings.audioQuality)
                    .onChange(async (value: string) => {
                        this.settings.audioQuality = value as AudioQuality;
                        await this.plugin.saveSettings();
                    });
            });
    }

    public createFloatingButtonSetting(): void {
        const floatingBtnSetting = new Setting(this.contentEl)
            .setName("Show floating button")
            .setDesc("Show a floating microphone button for quick recording")
            .addToggle(toggle => {
                toggle
                    .setValue(this.settings.showFloatingButton)
                    .onChange(async (value) => {
                        this.settings.showFloatingButton = value;
                        await this.plugin.saveSettings();
                        
                        // Emit an event for the floating button setting change
                        this.plugin.events.trigger('floating-button-setting-changed', value);
                        
                        // Refresh the settings display to show/hide modal toggle
                        this.refresh();
                    });
            });
    }

    public async refresh(): Promise<void> {
        try {
            if (!this.modelDropdown) {
                return;
            }
            
            await this.setupModelDropdown(this.modelDropdown);
        } catch (error) {
            throw error;
        }
    }

    public createToolbarButtonSetting(): void {
        new Setting(this.contentEl)
            .setName("Show toolbar button")
            .setDesc("Show a microphone button in the toolbar")
            .addToggle(toggle => {
                toggle
                    .setValue(this.settings.showToolbarButton)
                    .onChange(async (value: boolean) => {
                        this.settings.showToolbarButton = value;
                        if (value) {
                            // Initialize toolbar button if it doesn't exist
                            if (!this.plugin.toolbarButton) {
                                this.plugin.initializeUI();
                            }
                        } else {
                            // Remove toolbar button if it exists
                            if (this.plugin.toolbarButton) {
                                this.plugin.toolbarButton.remove();
                                this.plugin.toolbarButton = null;
                            }
                        }
                        await this.plugin.saveSettings();
                    });
            });
    }

    public createMicButtonColorSetting(): void {
        new Setting(this.contentEl)
            .setName("Mic button color")
            .setDesc("Choose the color for the microphone buttons")
            .addColorPicker(color => {
                color
                    .setValue(this.settings.micButtonColor)
                    .onChange(async (value: string) => {
                        this.settings.micButtonColor = value;
                        // Update all floating button colors using public method
                        this.plugin.updateAllButtonColors();
                        await this.plugin.saveSettings();
                    });
            });
    }

    public createTranscriptionFormatSetting(): void {
        new Setting(this.contentEl)
            .setName("Transcription format")
            .setDesc("Customize the transcription callout format. Use {audioPath} for audio file path and {transcription} for the transcribed text")
            .addTextArea(text => {
                text.setPlaceholder(">[!info]- Transcription\n>![[{audioPath}]]\n>{transcription}")
                    .setValue(this.settings.transcriptionCalloutFormat)
                    .onChange(async (value) => {
                        this.settings.transcriptionCalloutFormat = value;
                        await this.plugin.saveSettings();
                    });
                text.inputEl.rows = 4;
                text.inputEl.style.width = "100%";
            });
    }

    private createTranscriptionModelSetting(): void {
        if (this.modelSetting) {
            this.modelSetting.settingEl.remove();
        }

        this.modelSetting = new Setting(this.contentEl)
            .setName("Transcription model")
            .setDesc("Select the AI model for transcription")
            .addDropdown(dropdown => {
                this.modelDropdown = dropdown;
                this.setupModelDropdown(dropdown);
                
                dropdown.onChange(async (value) => {
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

        for (const provider of [AIProvider.OpenAI, AIProvider.Groq]) {
            const apiKey = this.settings[`${provider}ApiKey` as keyof NeuroVoxSettings];
            if (apiKey) {
                const adapter = this.getAdapter(provider);
                if (adapter) {
                    const models = adapter.getAvailableModels('transcription');
                    if (models.length > 0) {
                        hasValidProvider = true;
                        const group = document.createElement("optgroup");
                        group.label = `${provider.toUpperCase()} Models`;
                        
                        models.forEach(model => {
                            const option = document.createElement("option");
                            option.value = model.id;
                            option.text = `${model.name}`;
                            group.appendChild(option);
                        });
                        
                        dropdown.selectEl.appendChild(group);
                    }
                }
            }
        }

        if (!hasValidProvider) {
            dropdown.addOption("none", "No API keys configured");
            dropdown.setDisabled(true);
            this.settings.transcriptionModel = '';
        } else {
            dropdown.setDisabled(false);
            
            if (!this.settings.transcriptionModel || !this.getProviderFromModel(this.settings.transcriptionModel)) {
                const firstOption = dropdown.selectEl.querySelector('option:not([value="none"])') as HTMLOptionElement;
                if (firstOption) {
                    const modelId = firstOption.value;
                    const provider = this.getProviderFromModel(modelId);
                    if (provider) {
                        this.settings.transcriptionProvider = provider;
                        this.settings.transcriptionModel = modelId;
                        dropdown.setValue(modelId);
                        await this.plugin.saveSettings();
                    }
                }
            } else {
                dropdown.setValue(this.settings.transcriptionModel);
            }
        }

        await this.plugin.saveSettings();
    }

    public getProviderFromModel(modelId: string): AIProvider | null {
        for (const [provider, models] of Object.entries(AIModels)) {
            if (models.some(model => model.id === modelId)) {
                return provider as AIProvider;
            }
        }
        return null;
    }
}
