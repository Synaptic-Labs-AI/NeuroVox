// src/settings/SettingTab.ts
import { App, PluginSettingTab, Setting } from "obsidian";
import NeuroVoxPlugin from "../main";

export class NeuroVoxSettingTab extends PluginSettingTab {
	plugin: NeuroVoxPlugin;

/**
 * Constructs a new instance of the class.
 * @param app The main application object.
 * @param plugin The NeuroVoxPlugin instance to be used with this class.
 */
constructor(app: App, plugin: NeuroVoxPlugin) {
    super(app, plugin);
    this.plugin = plugin;
}

/**
 * Displays the settings UI for the plugin.
 * This method initializes and renders various settings components allowing the user to configure the plugin.
 * Each setting component is responsible for a specific configuration option, such as API keys, model selection,
 * token limits, prompt settings, and audio settings.
 */
display(): void {
    const { containerEl } = this;

    containerEl.empty();

    // General settings
    new Setting(containerEl)
        .setName("OpenAI API Key")
        .setDesc("Enter your OpenAI API Key")
        .addText((text) => {
            text.inputEl.type = "password";
            text.setPlaceholder("Enter API Key")
                .setValue(this.plugin.settings.openaiApiKey)
                .onChange(async (value) => {
                    this.plugin.settings.openaiApiKey = value;
                    await this.plugin.saveSettings();
                });
        });

    new Setting(containerEl)
        .setName("OpenAI Model")
        .setDesc("Select the OpenAI Model to use")
        .addText((text) =>
            text
                .setPlaceholder("Enter model name")
                .setValue(this.plugin.settings.openaiModel)
                .onChange(async (value) => {
                    this.plugin.settings.openaiModel = value;
                    await this.plugin.saveSettings();
                })
        );

    new Setting(containerEl)
        .setName(`Max Tokens (${this.plugin.settings.maxTokens})`)
        .setDesc("Maximum number of tokens")
        .addSlider((slider) => {
            slider
                .setLimits(0, 128000, 500)
                .setValue(this.plugin.settings.maxTokens)
                .onChange(async (value) => {
                    this.plugin.settings.maxTokens = value;
                    this.display();
                    await this.plugin.saveSettings();
                });
        });

    new Setting(containerEl)
        .setName("Prompt")
        .setDesc("This prompt is used when generating summaries.")
        .addTextArea((text) => {
            text.inputEl.style.width = "100%";
            text.inputEl.style.height = "64px";
            text.inputEl.style.resize = "vertical";
            text.setPlaceholder("Enter prompt")
                .setValue(this.plugin.settings.prompt)
                .onChange(async (value) => {
                    this.plugin.settings.prompt = value;
                    await this.plugin.saveSettings();
                });
        });

    // Audio settings
    new Setting(containerEl)
        .setName("Generate Audio Summary")
        .setDesc("Enable or disable audio summary generation")
        .addToggle((toggle) =>
            toggle
                .setValue(this.plugin.settings.generateAudioSummary)
                .onChange(async (value) => {
                    this.plugin.settings.generateAudioSummary = value;
                    await this.plugin.saveSettings();
                })
        );

    new Setting(containerEl)
        .setName("Enable AI Voice Generation of Summaries")
        .setDesc(
            "Whether to enable AI voice generation from transcription summaries"
        )
        .addToggle((toggle) =>
            toggle
                .setValue(this.plugin.settings.enableVoiceGeneration)
                .onChange(async (value) => {
                    this.plugin.settings.enableVoiceGeneration = value;
                    await this.plugin.saveSettings();
                })
        );

    new Setting(containerEl)
        .setName("Voice Choice")
        .setDesc("Select the voice for audio summary")
        .addDropdown((dropdown) => {
            dropdown
                .addOption("alloy", "Alloy")
                .addOption("echo", "Echo")
                .addOption("fable", "Fable")
                .addOption("onyx", "Onyx")
                .addOption("nova", "Nova")
                .addOption("shimmer", "Shimmer")
                .setValue(this.plugin.settings.voiceChoice)
                .onChange(async (value) => {
                    this.plugin.settings.voiceChoice = value;
                    await this.plugin.saveSettings();
                });
        });

    new Setting(containerEl)
        .setName(`Voice Speed (${this.plugin.settings.voiceSpeed})`)
        .setDesc("Set the speed of the voice")
        .addSlider((slider) => {
            slider
                .setLimits(0.25, 4, 0.25)
                .setValue(this.plugin.settings.voiceSpeed)
                .onChange(async (value) => {
                    this.plugin.settings.voiceSpeed = value;
                    this.display();
                    await this.plugin.saveSettings();
                });
        });

    new Setting(containerEl)
        .setName("Enable HD Voice")
        .setDesc("When enabled, use HD voice for audio summaries")
        .addToggle((toggle) =>
            toggle
                .setValue(this.plugin.settings.voiceMode === "hd")
                .onChange(async (value) => {
                    this.plugin.settings.voiceMode = value
                        ? "hd"
                        : "standard";
                    await this.plugin.saveSettings();
                })
        );

    new Setting(containerEl)
        .setName("Save Recording")
        .setDesc("Enable or disable saving recordings")
        .addToggle((toggle) =>
            toggle
                .setValue(this.plugin.settings.saveRecording)
                .onChange(async (value) => {
                    this.plugin.settings.saveRecording = value;
                    await this.plugin.saveSettings();
                })
        );

    // Add the folder path setting
    new Setting(containerEl)
        .setName("Recording Folder Path")
        .setDesc(
            'Specify the folder path to save recordings relative to the vault root. For a folder in the root directory, enter its name (e.g., "Recordings"). For a nested folder, use forward slashes to indicate the path (e.g., "Audio/Recordings").'
        )
        .addText((text) =>
            text
                .setPlaceholder("Enter folder path")
                .setValue(this.plugin.settings.recordingFolderPath)
                .onChange(async (value) => {
                    this.plugin.settings.recordingFolderPath = value;
                    await this.plugin.saveSettings();
                })
        );
	}
}
