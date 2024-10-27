// src/settings/accordions/RecordingAccordion.ts

import { BaseAccordion } from "./BaseAccordion";
import { NeuroVoxSettings } from "../Settings";
import { Setting, DropdownComponent } from "obsidian";
import { AIAdapter, AIProvider } from "../../adapters/AIAdapter";
import type { AIModels } from "../../adapters/AIAdapter"; // Import as type
import NeuroVoxPlugin from "../../main";

export class RecordingAccordion extends BaseAccordion {
    public modelDropdown: DropdownComponent;

    constructor(
        containerEl: HTMLElement,
        public settings: NeuroVoxSettings,
        public getAdapter: (provider: AIProvider) => AIAdapter,
        public plugin: NeuroVoxPlugin
    ) {
        super(containerEl, "🎙 Recording Settings", "Configure recording preferences and select a transcription model.");
    }

    render(): void {
        // Recording Path
        this.createRecordingPathSetting();
        
        // Save Recording Toggle
        this.createSaveRecordingSetting();
        
        // Floating Button Toggle
        this.createFloatingButtonSetting();
        
        // Toolbar Button Toggle
        this.createToolbarButtonSetting();
        
        // Mic Button Color
        this.createMicButtonColorSetting();
        
        // Transcription Model Selection
        this.createTranscriptionModelSetting();
    }

    public createRecordingPathSetting(): void {
        new Setting(this.contentEl)
            .setName("Recording Path")
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
            .setName("Save Recording")
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
        new Setting(this.contentEl)
            .setName("Show Floating Button")
            .setDesc("Show a floating microphone button for quick recording")
            .addToggle(toggle => {
                toggle
                    .setValue(this.settings.showFloatingButton)
                    .onChange(async (value: boolean) => {
                        console.log('Floating button toggle changed:', value);
                        this.settings.showFloatingButton = value;
                        await this.plugin.saveSettings();
                        
                        // Reinitialize UI after settings are saved
                        this.plugin.initializeUI();
                    });
            });
    }

    public createToolbarButtonSetting(): void {
        new Setting(this.contentEl)
            .setName("Show Toolbar Button")
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
            .setName("Mic Button Color")
            .setDesc("Choose the color for the microphone buttons")
            .addColorPicker(color => {
                color
                    .setValue(this.settings.micButtonColor)
                    .onChange(async (value: string) => {
                        this.settings.micButtonColor = value;
                        // Update floating button color if it exists
                        if (this.plugin.floatingButton) {
                            this.plugin.floatingButton.updateButtonColor();
                        }
                        await this.plugin.saveSettings();
                    });
            });
    }

    public createTranscriptionModelSetting(): void {
        new Setting(this.contentEl)
            .setName("Transcription Model")
            .setDesc("Select the AI model for transcription")
            .addDropdown(dropdown => {
                this.modelDropdown = dropdown;
                this.populateModelDropdown(dropdown);
                
                dropdown.setValue(this.settings.transcriptionModel)
                    .onChange(async (value: string) => {
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
        // Add OpenAI Models
        if (this.settings.openaiApiKey) {
            const adapter = this.getAdapter(AIProvider.OpenAI);
            const openaiModels = adapter.getAvailableModels('transcription');
            openaiModels.forEach((model) => {
                dropdown.addOption(model.id, model.name);
            });
        }
        
        // Add Groq Models
        if (this.settings.groqApiKey) {
            const adapter = this.getAdapter(AIProvider.Groq);
            const groqModels = adapter.getAvailableModels('transcription');
            groqModels.forEach((model) => {
                dropdown.addOption(model.id, model.name);
            });
        }
    }

    public getProviderFromModel(modelId: string): AIProvider | null {
        // Try OpenAI
        const openaiAdapter = this.getAdapter(AIProvider.OpenAI);
        if (openaiAdapter.getAvailableModels('transcription').some(model => model.id === modelId)) {
            return AIProvider.OpenAI;
        }
        
        // Try Groq
        const groqAdapter = this.getAdapter(AIProvider.Groq);
        if (groqAdapter.getAvailableModels('transcription').some(model => model.id === modelId)) {
            return AIProvider.Groq;
        }

        return null;
    }
}