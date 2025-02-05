// src/settings/accordions/RecordingAccordion.ts

import { BaseAccordion } from "./BaseAccordion";
import { NeuroVoxSettings } from "../Settings";
import { Setting, DropdownComponent } from "obsidian";
import { AIAdapter, AIProvider, AIModels } from "../../adapters/AIAdapter";
import NeuroVoxPlugin from "../../main";

export class RecordingAccordion extends BaseAccordion {
    public modelDropdown!: DropdownComponent;

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
        
        // Save Recording Toggle
        this.createSaveRecordingSetting();
        
        // Floating Button Toggle
        this.createFloatingButtonSetting();

        if (this.settings.showFloatingButton) {
            this.createModalToggleSetting();
        }
        
        // Toolbar Button Toggle
        this.createToolbarButtonSetting();
        
        // Mic Button Color
        this.createMicButtonColorSetting();
        
        // Add this before createTranscriptionModelSetting
        this.createTranscriptionFormatSetting();

        // Transcription Model Selection
        this.createTranscriptionModelSetting();
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

    public createSaveRecordingSetting(): void {
        new Setting(this.contentEl)
            .setName("Save recording")
            .setDesc("Save the audio file after recording")
            .addToggle(toggle => {
                toggle
                    .setValue(this.settings.saveRecording)
                    .onChange(async (value: boolean) => {
                        this.settings.saveRecording = value;
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
                        
                        // Refresh the settings display to show/hide modal toggle
                        this.refresh();
                    });
            });
    }

    public createModalToggleSetting(): void {
        const modalToggleSetting = new Setting(this.contentEl)
            .setName("Use recording modal")
            .setDesc("When enabled, shows a modal with controls. When disabled, use direct recording through the mic button.")
            .setClass('neurovox-modal-toggle-setting')
            .addToggle(toggle => {
                toggle
                    .setValue(this.settings.useRecordingModal)
                    .onChange(async (value) => {
                        this.settings.useRecordingModal = value;
                        await this.plugin.saveSettings();
                    });
            });

        // Add some indentation to show it's related to the floating button
        modalToggleSetting.settingEl.style.paddingLeft = '2em';
        modalToggleSetting.settingEl.style.borderLeft = '2px solid var(--background-modifier-border)';
    }

    /**
     * Refreshes the accordion content
     */
    public refresh(): void {
        const { contentEl } = this;
        contentEl.empty();
        this.render();
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

    public createTranscriptionModelSetting(): void {
        const setting = new Setting(this.contentEl)
            .setName("Transcription model")
            .setDesc("Select the AI model for transcription")
            .addDropdown(dropdown => {
                this.modelDropdown = dropdown;
                this.populateModelDropdown(dropdown);
                dropdown.setValue(this.settings.transcriptionModel);
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

    public populateModelDropdown(dropdown: DropdownComponent): void {
        let hasModels = false;
        const options: Record<string, string> = {};

        // Add OpenAI and Groq models
        [AIProvider.OpenAI, AIProvider.Groq].forEach(provider => {
            const apiKey = this.settings[`${provider}ApiKey` as keyof NeuroVoxSettings];
            if (apiKey) {
                const adapter = this.getAdapter(provider);
                if (adapter) {
                    const models = adapter.getAvailableModels('transcription');
                    if (models.length > 0) {
                        hasModels = true;
                        // Add a header option for the provider
                        options[`${provider.toUpperCase()}_HEADER`] = `--- ${provider.toUpperCase()} Models ---`;
                        // Add all models for this provider
                        models.forEach(model => {
                            options[model.id] = model.name;
                        });
                    }
                }
            }
        });

        // If no models are available, add a placeholder option
        if (!hasModels) {
            options["none"] = "No API keys configured";
            dropdown.setDisabled(true);
        } else {
            dropdown.setDisabled(false);
        }

        dropdown.addOptions(options);
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
