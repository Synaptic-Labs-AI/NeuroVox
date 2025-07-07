import {
    Plugin,
    Notice,
    TFile,
    MarkdownView,
    TAbstractFile,
    WorkspaceLeaf,
    normalizePath,
    FuzzySuggestModal,
    App,
    FuzzyMatch,
    Events
} from 'obsidian';
import { VideoProcessor } from './utils/VideoProcessor';
import { DEFAULT_SETTINGS, NeuroVoxSettings } from './settings/Settings';
import { NeuroVoxSettingTab } from './settings/SettingTab';
import { FloatingButton } from './ui/FloatingButton';
import { ToolbarButton } from './ui/ToolbarButton';
import { TimerModal } from './modals/TimerModal';
import { OpenAIAdapter } from './adapters/OpenAIAdapter';
import { GroqAdapter } from './adapters/GroqAdapter';
import { DeepgramAdapter } from './adapters/DeepgramAdapter';
import { AIProvider, AIAdapter } from './adapters/AIAdapter';
import { PluginData } from './types';
import { RecordingProcessor } from './utils/RecordingProcessor';

/**
 * Modal for selecting audio files with fuzzy search
 */
class AudioFileSuggestModal extends FuzzySuggestModal<TFile> {
    private files: TFile[] = [];
    private resolvePromise: ((file: TFile | null) => void) | null = null;

    constructor(app: App) {
        super(app);
        this.setPlaceholder('🔍 Search audio files...');
    }

    setFiles(files: TFile[]): void {
        this.files = files;
    }

    getItems(): TFile[] {
        return this.files.sort((a, b) => b.stat.mtime - a.stat.mtime);
    }

    getItemText(file: TFile): string {
        return file.path;
    }

    onChooseItem(file: TFile, evt: MouseEvent | KeyboardEvent): void {
        if (!file) {
            return;
        }

        const resolve = this.resolvePromise;
        const selectedFile = file;
        
        this.resolvePromise = null;
        this.close();
        
        if (resolve) {
            setTimeout(() => resolve(selectedFile), 50);
        }
    }

    renderSuggestion(match: FuzzyMatch<TFile>, el: HTMLElement): void {
        const file = match.item;
        
        const container = el.createDiv({ cls: 'neurovox-suggestion' });
        
        container.createEl('div', {
            text: `📄 ${file.path}`,
            cls: 'neurovox-suggestion-path'
        });
        
        container.createEl('div', {
            text: `Modified: ${new Date(file.stat.mtime).toLocaleString()} • Size: ${(file.stat.size / (1024 * 1024)).toFixed(2)}MB`,
            cls: 'neurovox-suggestion-info'
        });
    }

    async awaitSelection(): Promise<TFile | null> {
        return new Promise<TFile | null>((resolve) => {
            this.resolvePromise = resolve;
            this.open();
        });
    }

    onClose(): void {
        if (this.resolvePromise) {
            const resolve = this.resolvePromise;
            this.resolvePromise = null;
            setTimeout(() => resolve(null), 50);
        }
        super.onClose();
    }
}

export default class NeuroVoxPlugin extends Plugin {
    settings: NeuroVoxSettings;
    public aiAdapters: Map<AIProvider, AIAdapter>;
    
    private buttonMap: Map<string, FloatingButton> = new Map();
    toolbarButton: ToolbarButton | null = null;
    public activeLeaf: WorkspaceLeaf | null = null;
    settingTab: NeuroVoxSettingTab | null = null;

    // Custom events emitter
    public events = new Events();

    public recordingProcessor: RecordingProcessor;

    async onload(): Promise<void> {
        try {
            // First load settings
            await this.loadSettings();
            
            // Then initialize everything that depends on settings
            this.initializeAIAdapters();
            await this.validateApiKeys();
            this.registerSettingsTab();
            this.registerCommands();
            this.registerEvents();
            
            this.recordingProcessor = RecordingProcessor.getInstance(this);
            this.initializeUI();
            
            // Register event listener for floating button setting changes and trigger initial state
            this.registerFloatingButtonEvents();
            
            // Trigger initial state
            this.events.trigger('floating-button-setting-changed', this.settings.showFloatingButton);
        } catch (error) {
            console.error("Failed to load plugin:", error);
            new Notice("Failed to initialize NeuroVox plugin");
        }
    }
    
    /**
     * Register event listeners for floating button setting changes
     */
    private registerFloatingButtonEvents(): void {
        // Listen for floating button setting changes
        this.events.on('floating-button-setting-changed', (isEnabled: boolean) => {
            console.log(`Floating button setting changed to: ${isEnabled}`);
            
            // Always clean up existing buttons first
            this.cleanupUI();
            
            if (isEnabled) {
                // If setting is turned ON, create a button for the active file
                const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
                if (activeView?.file) {
                    this.createButtonForFile(activeView.file);
                }
            }
            // If setting is OFF, we've already cleaned up all buttons
        });
    }

    /**
     * Load plugin settings with proper fallback to defaults and validation
     */
    public async loadSettings(): Promise<void> {
        try {
            console.log("Loading NeuroVox settings...");
            const data = await this.loadData();
            
            // Start with a deep copy of defaults
            this.settings = { ...DEFAULT_SETTINGS };
            
            // Only override with saved settings if data exists and isn't null
            if (data && typeof data === 'object') {
                // Safely merge saved settings with defaults
                Object.keys(DEFAULT_SETTINGS).forEach(key => {
                    if (key in data) {
                        (this.settings as any)[key] = (data as any)[key];
                    }
                });
                console.log("Settings loaded successfully");
            } else {
                console.log("No saved settings found, using defaults");
            }
        } catch (error) {
            console.error("Failed to load settings:", error);
            this.settings = { ...DEFAULT_SETTINGS };
            new Notice("Failed to load NeuroVox settings. Using defaults.");
        }
    }

    /**
     * Save settings to plugin data storage
     */
    public async saveSettings(): Promise<void> {
        try {
            console.log("Saving NeuroVox settings...", this.settings);
            await this.saveData(this.settings);
            this.initializeUI();
            
            // Trigger the floating button setting changed event to ensure UI is in sync
            this.events.trigger('floating-button-setting-changed', this.settings.showFloatingButton);
            
            console.log("Settings saved successfully");
        } catch (error) {
            console.error("Failed to save settings:", error);
            new Notice("Failed to save NeuroVox settings");
        }
    }    private async validateApiKeys(): Promise<void> {
        try {
            // Set API keys from settings
            const openaiAdapter = this.aiAdapters.get(AIProvider.OpenAI);
            const groqAdapter = this.aiAdapters.get(AIProvider.Groq);
            const deepgramAdapter = this.aiAdapters.get(AIProvider.Deepgram);

            if (openaiAdapter) {
                openaiAdapter.setApiKey(this.settings.openaiApiKey);
                await openaiAdapter.validateApiKey();
            }

            if (groqAdapter) {
                groqAdapter.setApiKey(this.settings.groqApiKey);
                await groqAdapter.validateApiKey();
            }

            if (deepgramAdapter) {
                deepgramAdapter.setApiKey(this.settings.deepgramApiKey);
                await deepgramAdapter.validateApiKey();
            }

            // Only show notice if validation fails
            if (openaiAdapter && !openaiAdapter.isReady() && this.settings.openaiApiKey) {
                new Notice('❌ OpenAI API key validation failed');
            }
            if (groqAdapter && !groqAdapter.isReady() && this.settings.groqApiKey) {
                new Notice('❌ Groq API key validation failed');
            }
            if (deepgramAdapter && !deepgramAdapter.isReady() && this.settings.deepgramApiKey) {
                new Notice('❌ Deepgram API key validation failed');
            }
        } catch (error) {
            console.error("API key validation failed:", error);
        }
    }public initializeAIAdapters(): void {
        try {
            const adapters: Array<[AIProvider, AIAdapter]> = [
                [AIProvider.OpenAI, new OpenAIAdapter(this.settings)],
                [AIProvider.Groq, new GroqAdapter(this.settings)],
                [AIProvider.Deepgram, new DeepgramAdapter(this.settings)]
            ];
            
            this.aiAdapters = new Map<AIProvider, AIAdapter>(adapters);
        } catch (error) {
            console.error("Failed to initialize AI adapters:", error);
            throw new Error("Failed to initialize AI adapters");
        }
    }

    public registerSettingsTab(): void {
        this.addSettingTab(new NeuroVoxSettingTab(this.app, this));
    }

    public registerCommands(): void {
        this.addCommand({
            id: 'start-recording',
            name: 'Start recording',
            checkCallback: (checking: boolean) => {
                const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
                if (!activeView?.file) return false;
                if (checking) return true;
                this.handleRecordingStart();
                return true;
            }
        });

        this.addCommand({
            id: 'transcribe-audio',
            name: 'Transcribe audio file',
            callback: async () => {
                const activeFile = this.app.workspace.getActiveFile();
                if (!activeFile || !this.isValidAudioFile(activeFile)) {
                    new Notice('❌ Active file is not a valid audio file');
                    return;
                }
                new Notice(`🎵 Transcribing: ${activeFile.path}`);
                await this.processExistingAudioFile(activeFile);
            }
        });

        this.addCommand({
            id: 'transcribe-video',
            name: 'Transcribe video file',
            checkCallback: (checking: boolean) => {
                const activeFile = this.app.workspace.getActiveFile();
                const isValidVideo = this.isValidVideoFile(activeFile);
                
                if (!activeFile || !isValidVideo) return false;
                if (checking) return true;

                void this.processVideoFile(activeFile);
                return true;
            }
        });
    }

    private isValidAudioFile(file: TFile | null): boolean {
        if (!file) return false;
        const validExtensions = ['mp3', 'wav', 'webm', 'm4a'];
        return validExtensions.includes(file.extension.toLowerCase());
    }

    private isValidVideoFile(file: TFile | null): boolean {
        if (!file) return false;
        const validExtensions = ['mp4', 'webm', 'mov'];
        return validExtensions.includes(file.extension.toLowerCase());
    }

    private getAudioMimeType(extension: string): string {
        const mimeTypes: Record<string, string> = {
            'mp3': 'audio/mpeg',
            'wav': 'audio/wav',
            'webm': 'audio/webm',
            'm4a': 'audio/mp4'
        };
        return mimeTypes[extension.toLowerCase()] || 'audio/wav';
    }

    private getVideoMimeType(extension: string): string {
        const mimeTypes: Record<string, string> = {
            'mp4': 'video/mp4',
            'webm': 'video/webm',
            'mov': 'video/quicktime'
        };
        return mimeTypes[extension.toLowerCase()] || 'video/mp4';
    }

    public async processExistingAudioFile(file: TFile): Promise<void> {
        try {
            console.log('🔍 NeuroVox: Starting audio file processing for:', file.path);
            
            const adapter = this.aiAdapters.get(this.settings.transcriptionProvider);
            if (!adapter) {
                throw new Error(`Transcription provider ${this.settings.transcriptionProvider} not found`);
            }

            console.log('🔍 NeuroVox: Using adapter:', this.settings.transcriptionProvider);
            
            if (!adapter.getApiKey()) {
                throw new Error(`API key not set for ${this.settings.transcriptionProvider}`);
            }

            console.log('🔍 NeuroVox: API key is configured');

            const timestamp = new Date().toISOString().slice(0, 19).replace(/[-:]/g, '').replace('T', '-');
            const sanitizedName = file.basename.replace(/[\\/:*?"<>|]/g, '');
            const transcriptsFolder = this.settings.transcriptFolderPath || 'Transcripts';
            const baseFileName = `${transcriptsFolder}/${timestamp}-${sanitizedName}.md`;
            let newFileName = baseFileName;
            let count = 1;

            const normalizedPath = normalizePath(transcriptsFolder);
            if (!await this.app.vault.adapter.exists(normalizedPath)) {
                await this.app.vault.createFolder(normalizedPath);
            }

            while (await this.app.vault.adapter.exists(newFileName)) {
                newFileName = `${transcriptsFolder}/${timestamp}-${sanitizedName}-${count}.md`;
                count++;
            }

            const initialContent = [
                '---',
                `source: ${file.path}`,
                `date: ${new Date().toISOString()}`,
                `type: audio-transcription`,
                `size: ${(file.stat.size / (1024 * 1024)).toFixed(2)}MB`,
                '---',
                '',
                '# 🎵 Audio Transcription',
                '',
                ''
            ].join('\n');

            console.log('🔍 NeuroVox: Creating transcript file:', newFileName);
            const newFile = await this.app.vault.create(newFileName, initialContent);
            await this.app.workspace.getLeaf().openFile(newFile);

            console.log('🔍 NeuroVox: Reading audio file...');
            const audioBuffer = await this.app.vault.readBinary(file);
            const blob = new Blob([audioBuffer], { 
                type: this.getAudioMimeType(file.extension) 
            });

            console.log('🔍 NeuroVox: Audio blob created, size:', blob.size, 'bytes');
            new Notice('🎙️ Processing audio file...');

            console.log('🔍 NeuroVox: Starting processing with RecordingProcessor...');
            await this.recordingProcessor.processRecording(
                blob,
                newFile,
                { line: initialContent.split('\n').length, ch: 0 },
                file.path
            );

            console.log('🔍 NeuroVox: Processing completed successfully!');
            new Notice('✨ Transcription completed successfully!');
            
        } catch (error) {
            console.error('❌ NeuroVox: Error in processExistingAudioFile:', error);
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            new Notice(`❌ Failed to process audio file: ${errorMessage}`);
            throw error;
        }
    }

    public async processVideoFile(file: TFile): Promise<void> {
        try {
            const videoProcessor = await VideoProcessor.getInstance(this);
            await videoProcessor.processVideo(file);
        } catch (error) {
            new Notice('❌ Failed to process video file');
            throw error;
        }
    }

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

    public handleActiveLeafChange(leaf: WorkspaceLeaf | null): void {
        this.activeLeaf = leaf;
        
        // Always clean up existing buttons
        this.buttonMap.forEach((button, path) => {
            button.remove();
        });
        this.buttonMap.clear();
        
        // Only create a new button if the setting is enabled
        if (this.settings.showFloatingButton && leaf?.view instanceof MarkdownView && leaf.view.file) {
            this.createButtonForFile(leaf.view.file);
        }
    }

    public handleLayoutChange(): void {
        // Only show buttons if the setting is enabled
        if (this.settings.showFloatingButton) {
            const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
            if (activeView?.file) {
                const button = this.buttonMap.get(activeView.file.path);
                if (button) {
                    button.show();
                } else {
                    // Create a button if it doesn't exist
                    this.createButtonForFile(activeView.file);
                }
            }
        }
    }

    public handleFileDelete(file: TAbstractFile): void {
        if (file instanceof TFile) {
            const button = this.buttonMap.get(file.path);
            if (button) {
                button.remove();
                this.buttonMap.delete(file.path);
            }
        }
    }

    public initializeUI(): void {
        this.cleanupUI();
    
        if (this.settings.showToolbarButton) {
            this.toolbarButton = new ToolbarButton(this, this.settings);
        }
    }
    
    private createButtonForFile(file: TFile): void {
        // The decision to create a button should be made by the caller
        
        const existingButton = this.buttonMap.get(file.path);
        if (existingButton) {
            existingButton.remove();
            this.buttonMap.delete(file.path);
        }
        
        const button = new FloatingButton(
            this,
            this.settings,
            () => this.handleRecordingStart()
        );
        
        this.buttonMap.set(file.path, button);
    }
    
    public cleanupUI(): void { 
        this.buttonMap.forEach(button => button.remove());
        this.buttonMap.clear();
        
        if (this.toolbarButton) {
            this.toolbarButton.remove();
            this.toolbarButton = null;
        }
    }

    private modalInstance: TimerModal | null = null;

    public handleRecordingStart(): void {
        const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (!activeView) {
            new Notice('❌ No active note found to insert transcription.');
            return;
        }
    
        const activeFile = activeView.file;
        if (!activeFile) {
            new Notice('❌ No active file found.');
            return;
        }        if (this.settings.useRecordingModal) {
            if (this.modalInstance) return;
            
            this.modalInstance = new TimerModal(this);
            this.modalInstance.onStop = async (result: Blob | string) => {
                try {
                    if (typeof result === 'string') {
                        // Streaming mode - transcription already done
                        await this.recordingProcessor.processStreamingResult(
                            result,
                            activeFile,
                            activeView.editor.getCursor()
                        );
                    } else {
                        // Legacy mode - need to transcribe
                        const adapter = this.aiAdapters.get(this.settings.transcriptionProvider);
                        if (!adapter) {
                            throw new Error(`Transcription provider ${this.settings.transcriptionProvider} not found`);
                        }

                        if (!adapter.getApiKey()) {
                            throw new Error(`API key not set for ${this.settings.transcriptionProvider}`);
                        }

                        await this.recordingProcessor.processRecording(
                            result, 
                            activeFile,
                            activeView.editor.getCursor()
                        );
                    }
                } catch (error) {
                    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                    new Notice(`❌ Failed to process recording: ${errorMessage}`);
                }
            };
            
            const originalOnClose = this.modalInstance.onClose?.bind(this.modalInstance);
            this.modalInstance.onClose = async () => {
                if (originalOnClose) {
                    await originalOnClose();
                }
                this.modalInstance = null;
                return Promise.resolve();
            };
            
            this.modalInstance.open();
        }
    }

    public updateAllButtonColors(): void {
        this.buttonMap.forEach(button => {
            button.updateButtonColor();
        });
    }
    
    /**
     * Refreshes all floating buttons based on current settings
     * This ensures UI is in sync with settings when they change
     */
    public refreshFloatingButtons(): void {
        // Trigger the floating button setting changed event
        // This will use the same event handler as the toggle button
        this.events.trigger('floating-button-setting-changed', this.settings.showFloatingButton);
    }

    onunload() {
        // Make sure to save settings on plugin unload
        this.saveSettings().catch(error => {
            console.error("Failed to save settings on unload:", error);
        });
        this.cleanupUI();
    }
}