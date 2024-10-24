// src/main.ts
import { App, Plugin, PluginSettingTab, Setting, MarkdownView, Notice, TFile, EditorPosition } from 'obsidian';
import { DEFAULT_SETTINGS, NeuroVoxSettings } from './settings/Settings';
import { NeuroVoxSettingTab } from './settings/SettingTab';
import { FloatingButton } from './ui/FloatingButton';
import { ToolbarButton } from './ui/ToolbarButton';
import { TimerModal } from './modals/TimerModal';
import { saveAudioFile } from './utils/FileUtils';
import { transcribeAudio, generateChatCompletion, generateSpeech } from './processors/openai';

/**
 * NeuroVoxPlugin is the main class for the NeuroVox Obsidian plugin.
 * It handles plugin initialization, settings management, and core functionality.
 */
export default class NeuroVoxPlugin extends Plugin {
    /** Stores the plugin settings */
    settings: NeuroVoxSettings;

    /** Floating microphone button instance */
    floatingButton: FloatingButton | null = null;

    /** Toolbar microphone button instance */
    toolbarButton: ToolbarButton | null = null;

    /**
     * Runs when the plugin is loaded.
     * Initializes settings, UI components, and sets up event listeners.
     */
    async onload() {
        console.log('Loading NeuroVox plugin');

        // Load saved settings or use defaults
        await this.loadSettings();

        // Register the settings tab to the Obsidian settings panel
        this.addSettingTab(new NeuroVoxSettingTab(this.app, this));

        // Initialize UI components based on settings
        this.initializeUI();

        // Register a command to start recording via command palette
        this.addCommand({
            id: 'start-neurovox-recording',
            name: 'Start NeuroVox Recording',
            callback: () => {
                this.openRecordingModal();
            }
        });
    }

    /**
     * Runs when the plugin is unloaded.
     * Performs cleanup tasks.
     */
    onunload() {
        console.log('Unloading NeuroVox plugin');

        // Remove UI components
        this.floatingButton?.remove();
        this.toolbarButton?.remove();
    }

    /**
     * Loads the plugin settings.
     * Merges saved settings with default settings.
     */
    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    /**
     * Saves the current plugin settings.
     */
    async saveSettings() {
        await this.saveData(this.settings);
    }

    /**
     * Initializes the UI components based on user settings.
     */
    initializeUI() {
        if (this.settings.showFloatingButton) {
            this.floatingButton = new FloatingButton(this, this.settings);
        }

        if (this.settings.showToolbarButton) {
            this.toolbarButton = new ToolbarButton(this, this.settings);
        }

        // Apply the saved microphone button color
        document.documentElement.style.setProperty('--mic-button-color', this.settings.micButtonColor);
    }

    /**
     * Opens the recording modal.
     */
    async openRecordingModal() {
        const activeLeaf = this.app.workspace.activeLeaf;
        if (activeLeaf?.view instanceof MarkdownView) {
            const activeFile = activeLeaf.view.file;
            if (!activeFile) {
                new Notice('No active file to insert transcription.');
                return;
            }
            const editor = activeLeaf.view.editor;
            const cursorPosition = editor.getCursor();

            const modal = new TimerModal(this.app);
            modal.onStop = (audioBlob: Blob) => {
                this.processRecording(audioBlob, activeFile, cursorPosition);
            };
            modal.open();
        } else {
            new Notice('No active note found to insert transcription.');
        }
    }

    /**
     * Processes the recorded audio: transcribes, summarizes, and inserts into the correct note.
     * @param audioBlob The recorded audio blob.
     * @param activeFile The file where the recording was initiated.
     * @param cursorPosition The cursor position at the time of recording.
     */
    public async processRecording(audioBlob: Blob, activeFile: TFile, cursorPosition: EditorPosition) {
        try {
            // Enforce file size limit
            const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25MB
            if (audioBlob.size > MAX_FILE_SIZE) {
                new Notice('Recording is too long to process. Please record a shorter audio.');
                return;
            }

            // Save the audio file
            const fileName = `recording-${Date.now()}.wav`;
            const audioFile = await saveAudioFile(this.app, audioBlob, fileName, this.settings);

            // Transcribe the audio
            new Notice('Transcribing audio, please wait...');
            const transcription = await transcribeAudio(audioBlob, this.settings);

            // Generate summary
            new Notice('Generating summary, please wait...');
            const summary = await generateChatCompletion(transcription, this.settings);

            let audioSummaryFile: TFile | null = null;
            if (this.settings.enableVoiceGeneration) {
                // Generate speech from summary
                const audioSummaryArrayBuffer = await generateSpeech(summary, this.settings);
                const audioSummaryBlob = new Blob([audioSummaryArrayBuffer], { type: 'audio/wav' });
                const summaryFileName = `summary-${Date.now()}.wav`;
                audioSummaryFile = await saveAudioFile(this.app, audioSummaryBlob, summaryFileName, this.settings);
            }

            // Format the content with callout blocks
            const formattedContent = this.formatContent(audioFile, transcription, summary, audioSummaryFile);

            // Insert the content into the original note
            await this.insertContentIntoNote(activeFile, formattedContent);

            new Notice('Recording processed successfully.');
        } catch (error) {
            console.error('Error processing recording:', error);
            new Notice('Failed to process recording.');
        }
    }

    /**
     * Formats the transcription and summary into Obsidian callout blocks.
     * @param audioFile The audio file of the original recording.
     * @param transcription The transcribed text.
     * @param summary The AI-generated summary.
     * @param audioSummaryFile The audio file of the summary (if generated).
     * @returns The formatted markdown content.
     */
    public formatContent(audioFile: TFile, transcription: string, summary: string, audioSummaryFile: TFile | null): string {
        let content = `\n>[!summary]- Summary\n>${summary}\n\n`;
        content += `>[!info]- Transcription\n>![[${audioFile.path}]]\n>${transcription}\n\n`;

        if (audioSummaryFile) {
            content += `>[!info]- Summary Audio\n>![[${audioSummaryFile.path}]]\n\n`;
        }

        return content;
    }

    /**
     * Inserts the formatted content at the end of the specified note.
     * @param file The file to insert content into.
     * @param content The content to insert.
     */
    public async insertContentIntoNote(file: TFile, content: string) {
        try {
            const data = await this.app.vault.read(file);
            const newData = data + content;
            await this.app.vault.modify(file, newData);
        } catch (error) {
            console.error('Error inserting content into note:', error);
            new Notice('Failed to insert transcription into the note.');
        }
    }
}