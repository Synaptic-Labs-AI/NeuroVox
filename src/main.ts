// src/main.ts

import { 
    Plugin, 
    Notice, 
    TFile, 
    EditorPosition, 
    MarkdownView, 
    TFolder,
    TAbstractFile, 
    WorkspaceLeaf 
} from 'obsidian';
import { DEFAULT_SETTINGS, NeuroVoxSettings } from './settings/Settings';
import { NeuroVoxSettingTab } from './settings/SettingTab';
import { FloatingButton } from './ui/FloatingButton';
import { ToolbarButton } from './ui/ToolbarButton';
import { TimerModal } from './modals/TimerModal';
import { OpenAIAdapter } from './adapters/OpenAIAdapter';
import { GroqAdapter } from './adapters/GroqAdapter';
import { AIProvider, AIAdapter } from './adapters/AIAdapter';
import { PluginData } from './types'; // Import PluginData

export default class NeuroVoxPlugin extends Plugin {
    // Plugin state
    settings: NeuroVoxSettings;
    public aiAdapters: Map<AIProvider, AIAdapter>;
    private pluginData: PluginData;
    
    // UI Components
    floatingButton: FloatingButton | null = null;
    toolbarButton: ToolbarButton | null = null;
    public activeLeaf: WorkspaceLeaf | null = null;

    /**
     * Plugin initialization
     */
    async onload(): Promise<void> {
        console.log('Loading NeuroVox plugin');

        try {
            await this.initializePlugin();
        } catch (error) {
            console.error('Failed to initialize NeuroVox plugin:', error);
            new Notice('Failed to initialize NeuroVox plugin');
        }
    }

    /**
     * Initializes all plugin components
     */
    public async initializePlugin(): Promise<void> {
        await this.loadPluginData(); // Load all data at once
        this.initializeAIAdapters();
        this.registerSettingsTab();
        this.registerCommands();
        this.registerEvents();
        this.initializeUI();
    }

    /**
     * Loads plugin data including button position
     */
    private async loadPluginData(): Promise<void> {
        const data = await this.loadData();
        this.pluginData = data ? { ...DEFAULT_SETTINGS, ...data } : { ...DEFAULT_SETTINGS };
        this.settings = this.pluginData; // Ensure settings reference the same data
        console.log('Plugin data loaded:', this.pluginData);
    }

    /**
     * Saves all plugin data including button position
     */
    public async savePluginData(): Promise<void> {
        console.log('Saving plugin data:', this.pluginData);
        await this.saveData(this.pluginData);
        console.log('Plugin data saved successfully.');
    }

    /**
     * Initializes AI service adapters
     */
    public initializeAIAdapters(): void {
        this.aiAdapters = new Map([
            [AIProvider.OpenAI, new OpenAIAdapter(this.settings)],
            [AIProvider.Groq, new GroqAdapter(this.settings)]
        ]);
    }

    /**
     * Registers the settings tab
     */
    public registerSettingsTab(): void {
        this.addSettingTab(new NeuroVoxSettingTab(this.app, this));
    }

    /**
     * Registers plugin commands
     */
    public registerCommands(): void {
        this.addCommand({
            id: 'start-neurovox-recording',
            name: 'Start NeuroVox Recording',
            callback: () => this.openRecordingModal()
        });
    }

    /**
     * Registers workspace events
     */
    public registerEvents(): void {
        this.registerEvent(
            this.app.workspace.on('active-leaf-change', this.handleActiveLeafChange.bind(this))
        );

        this.registerEvent(
            this.app.workspace.on('layout-change', this.handleLayoutChange.bind(this))
        );

        this.registerEvent(
            this.app.vault.on('delete', this.handleFileDelete.bind(this))
        );
    }

    /**
     * Handles active leaf changes
     */
    public handleActiveLeafChange(leaf: WorkspaceLeaf | null): void {
        this.activeLeaf = leaf;
        
        if (this.floatingButton) {
            if (leaf?.view instanceof MarkdownView) {
                this.floatingButton.show();
            } else {
                this.floatingButton.hide();
            }
        }
    }

    /**
     * Handles workspace layout changes
     */
    public handleLayoutChange(): void {
        if (this.floatingButton) {
            this.floatingButton.show();
        }
    }

    /**
     * Handles file deletion
     */
    public handleFileDelete(file: TAbstractFile): void {
        if (!(file instanceof TFile)) {
            return;
        }
        // Handle any cleanup needed when files are deleted
    }

    /**
     * Initializes UI components
     */
    public initializeUI(): void {
        console.log('Initializing UI components');
        
        // Clean up existing UI elements
        this.cleanupUI();

        // Initialize floating button if enabled
        if (this.pluginData.showFloatingButton) {
            console.log('Creating floating button');
            this.floatingButton = FloatingButton.getInstance(
                this,
                this.pluginData, // Use unified pluginData
                () => this.openRecordingModal()
            );
        }

        // Initialize toolbar button if enabled
        if (this.pluginData.showToolbarButton) {
            console.log('Creating toolbar button');
            this.toolbarButton = new ToolbarButton(this, this.pluginData); // Use pluginData
        }
    }

    /**
     * Cleans up UI components
     */
    public cleanupUI(): void {
        console.log('Cleaning up UI components');
        
        if (this.floatingButton) {
            console.log('Removing floating button');
            this.floatingButton.remove();
            this.floatingButton = null;
        }
        
        if (this.toolbarButton) {
            console.log('Removing toolbar button');
            this.toolbarButton.remove();
            this.toolbarButton = null;
        }
    }

    /**
     * Opens the recording modal
     */
    public async openRecordingModal(): Promise<void> {
        const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
        
        if (!activeView) {
            new Notice('No active note found to insert transcription.');
            return;
        }

        const activeFile = activeView.file;
        if (!activeFile) {
            new Notice('No active file to insert transcription.');
            return;
        }

        const modal = new TimerModal(this.app);
        modal.onStop = (audioBlob: Blob) => {
            this.processRecording(audioBlob, activeFile, activeView.editor.getCursor());
        };
        modal.open();
    }

    /**
     * Processes recorded audio into transcription and summary
     */
    public async processRecording(
        audioBlob: Blob,
        activeFile: TFile,
        cursorPosition: EditorPosition
    ): Promise<void> {
        try {
            const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25MB
            if (audioBlob.size > MAX_FILE_SIZE) {
                new Notice('Recording is too long to process. Please record a shorter audio.');
                return;
            }

            const audioFile = await this.saveAudioFile(
                audioBlob,
                `recording-${Date.now()}.wav`
            );

            const adapter = this.aiAdapters.get(this.pluginData.currentProvider);
            if (!adapter?.isReady()) {
                new Notice('Selected AI provider is not ready.');
                return;
            }

            new Notice('Transcribing audio, please wait...');
            const transcription = await adapter.transcribeAudio(
                audioBlob,
                this.pluginData.transcriptionModel
            );

            let summary = '';
            if (this.pluginData.generateSummary) {
                new Notice('Generating summary, please wait...');
                summary = await adapter.generateResponse(
                    transcription,
                    this.pluginData.summaryModel,
                    { maxTokens: this.pluginData.summaryMaxTokens }
                );
            }

            const content = this.formatContent(audioFile, transcription, summary);
            await this.insertContentIntoNote(activeFile, content, cursorPosition);

            new Notice('Recording processed successfully.');
        } catch (error) {
            console.error('Error processing recording:', error);
            new Notice('Failed to process recording.');
        }
    }

    /**
     * Saves audio file to vault
     */
    public async saveAudioFile(audioBlob: Blob, fileName: string): Promise<TFile> {
        const folderPath = this.pluginData.recordingFolderPath;
        await this.ensureRecordingFolder(folderPath);

        const arrayBuffer = await this.blobToArrayBuffer(audioBlob);
        return await this.app.vault.createBinary(`${folderPath}/${fileName}`, arrayBuffer);
    }

    /**
     * Ensures recording folder exists
     */
    public async ensureRecordingFolder(folderPath: string): Promise<void> {
        const folder = this.app.vault.getAbstractFileByPath(folderPath);
        if (!folder) {
            await this.app.vault.createFolder(folderPath);
        } else if (!(folder instanceof TFolder)) {
            throw new Error(`${folderPath} exists but is not a folder`);
        }
    }

    /**
     * Converts blob to array buffer
     */
    public async blobToArrayBuffer(blob: Blob): Promise<ArrayBuffer> {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as ArrayBuffer);
            reader.onerror = reject;
            reader.readAsArrayBuffer(blob);
        });
    }

    /**
     * Formats content for note insertion
     */
    public formatContent(audioFile: TFile, transcription: string, summary: string): string {
        let content = `\n>[!info]- Transcription\n>![[${audioFile.path}]]\n>${transcription}\n\n`;
        
        if (this.pluginData.generateSummary && summary) {
            content += `---\n\n>[!summary]- Summary\n>${summary}\n\n`;
        }
        
        return content;
    }

    /**
     * Inserts content into note
     */
    public async insertContentIntoNote(
        file: TFile,
        content: string,
        cursorPosition?: EditorPosition
    ): Promise<void> {
        try {
            const currentContent = await this.app.vault.read(file);
            if (cursorPosition) {
                // If cursor position provided, insert at that location
                const beforeCursor = currentContent.slice(0, this.getOffsetFromPosition(currentContent, cursorPosition));
                const afterCursor = currentContent.slice(this.getOffsetFromPosition(currentContent, cursorPosition));
                await this.app.vault.modify(file, beforeCursor + content + afterCursor);
            } else {
                // Otherwise append to end
                await this.app.vault.modify(file, currentContent + content);
            }
        } catch (error) {
            console.error('Error inserting content into note:', error);
            throw new Error('Failed to insert content into note');
        }
    }

    /**
     * Gets character offset from cursor position
     */
    public getOffsetFromPosition(content: string, position: EditorPosition): number {
        const lines = content.split('\n');
        let offset = 0;
        
        for (let i = 0; i < position.line; i++) {
            offset += lines[i].length + 1; // +1 for newline character
        }
        
        return offset + position.ch;
    }

    /**
     * Plugin cleanup on unload
     */
    onunload() {
        if (this.floatingButton) {
            this.floatingButton.remove();
            this.floatingButton = null;
        }
        
        if (this.toolbarButton) {
            this.toolbarButton.remove();
            this.toolbarButton = null;
        }
    }

    /**
     * Saves plugin settings
     */
    async saveSettings(): Promise<void> {
        console.log('Saving settings:', this.settings);
        // Since settings and pluginData are the same, just save pluginData
        await this.savePluginData();
        this.initializeUI();
    }
}
