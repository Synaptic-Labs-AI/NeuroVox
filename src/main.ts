// src/main.ts

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
    FuzzyMatch
} from 'obsidian';
import { VideoProcessor } from './utils/VideoProcessor';
import { DEFAULT_SETTINGS, NeuroVoxSettings } from './settings/Settings';
import { NeuroVoxSettingTab } from './settings/SettingTab';
import { FloatingButton } from './ui/FloatingButton';
import { ToolbarButton } from './ui/ToolbarButton';
import { TimerModal } from './modals/TimerModal';
import { OpenAIAdapter } from './adapters/OpenAIAdapter';
import { GroqAdapter } from './adapters/GroqAdapter';
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

        // Store the resolve callback and file before closing
        const resolve = this.resolvePromise;
        const selectedFile = file;
        
        // Clear the promise first
        this.resolvePromise = null;
        
        // Close the modal
        
        this.close();
        
        // Resolve with the selected file after modal is closed
        if (resolve) {
            setTimeout(() => resolve(selectedFile), 50);
        }
    }

    renderSuggestion(match: FuzzyMatch<TFile>, el: HTMLElement): void {
        const file = match.item;
        
        // Create container for better styling
        const container = el.createDiv({ cls: 'neurovox-suggestion' });
        
        // File path with icon
        container.createEl('div', {
            text: `📄 ${file.path}`,
            cls: 'neurovox-suggestion-path'
        });
        
        // File info
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
            // Only resolve with null if we actually need to
            setTimeout(() => resolve(null), 50);
        }
        super.onClose();
    }
}

export default class NeuroVoxPlugin extends Plugin {
    // Plugin state
    settings: NeuroVoxSettings;
    public aiAdapters: Map<AIProvider, AIAdapter>;
    public pluginData: PluginData;
    
    // UI Components
    floatingButton: FloatingButton | null = null;
    toolbarButton: ToolbarButton | null = null;
    public activeLeaf: WorkspaceLeaf | null = null;

    // Recording Processor
    public recordingProcessor: RecordingProcessor;

    async onload(): Promise<void> {
        try {
            await this.initializePlugin();
        } catch (error) {
            console.error('Failed to initialize NeuroVox plugin:', error);
            new Notice('Failed to initialize NeuroVox plugin');
        }
    }

    public async initializePlugin(): Promise<void> {
        await this.loadPluginData();
        this.initializeAIAdapters();
        this.registerSettingsTab();
        this.registerCommands();
        this.registerEvents();
        
        // Initialize Recording Processor before UI
        this.recordingProcessor = RecordingProcessor.getInstance(this, this.pluginData);
        
        // Initialize UI components
        this.initializeUI();
    }

    public async loadPluginData(): Promise<void> {
        const data = await this.loadData();
        this.pluginData = data ? { ...DEFAULT_SETTINGS, ...data } : { ...DEFAULT_SETTINGS };
        this.settings = this.pluginData;
    }

    public async savePluginData(): Promise<void> {
        await this.saveData(this.pluginData);
    }

    public initializeAIAdapters(): void {
        const adapters: Array<[AIProvider, AIAdapter]> = [
            [AIProvider.OpenAI, new OpenAIAdapter(this.pluginData)],
            [AIProvider.Groq, new GroqAdapter(this.pluginData)]
        ];
        
        this.aiAdapters = new Map<AIProvider, AIAdapter>(adapters);
    }

    public registerSettingsTab(): void {
        this.addSettingTab(new NeuroVoxSettingTab(this.app, this));
    }

    public registerCommands(): void {
        // Command to start a new recording
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

        // Command to transcribe any audio file
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

        // Add video transcription command
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
        console.log('📝 Processing file:', {
            name: file.basename,
            path: file.path,
            size: file.stat.size
        });

        try {
            const adapter = this.aiAdapters.get(this.pluginData.transcriptionProvider);
            if (!adapter) {
                throw new Error(`Transcription provider ${this.pluginData.transcriptionProvider} not found`);
            }

            if (!adapter.getApiKey()) {
                throw new Error(`API key not set for ${this.pluginData.transcriptionProvider}`);
            }

            console.log('🔑 Validated API configuration:', {
                provider: this.pluginData.transcriptionProvider,
                model: this.pluginData.transcriptionModel
            });

            const timestamp = new Date().toISOString().slice(0, 19).replace(/[-:]/g, '').replace('T', '-');
            const sanitizedName = file.basename.replace(/[\\/:*?"<>|]/g, '');
            const transcriptsFolder = 'Transcripts';
            const baseFileName = `${transcriptsFolder}/${timestamp}-${sanitizedName}.md`;
            let newFileName = baseFileName;
            let count = 1;

            console.log('📁 Creating transcripts folder...');
            const normalizedPath = normalizePath(transcriptsFolder);
            if (!await this.app.vault.adapter.exists(normalizedPath)) {
                await this.app.vault.createFolder(normalizedPath);
                console.log('✅ Created transcripts folder');
            }

            console.log('📄 Generating unique filename...');
            while (await this.app.vault.adapter.exists(newFileName)) {
                newFileName = `Transcripts/${timestamp}-${sanitizedName}-${count}.md`;
                count++;
            }
            console.log('✅ Using filename:', newFileName);

            console.log('📝 Creating initial note...');
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

            const newFile = await this.app.vault.create(newFileName, initialContent);
            await this.app.workspace.getLeaf().openFile(newFile);
            console.log('✅ Created and opened note:', newFileName);

            console.log('🎵 Reading audio file...');
            const audioBuffer = await this.app.vault.readBinary(file);
            console.log('✅ Read audio file:', {
                size: `${(audioBuffer.byteLength / (1024 * 1024)).toFixed(2)}MB`,
                type: this.getAudioMimeType(file.extension)
            });

            const blob = new Blob([audioBuffer], { 
                type: this.getAudioMimeType(file.extension) 
            });

            new Notice('🎙️ Processing audio file...');
            console.log('🚀 Starting transcription process with:', {
                provider: this.pluginData.transcriptionProvider,
                model: this.pluginData.transcriptionModel,
                generateSummary: this.pluginData.generateSummary,
                summaryModel: this.pluginData.generateSummary ? this.pluginData.summaryModel : 'disabled'
            });

            await this.recordingProcessor.processRecording(
                blob,
                newFile,
                { line: initialContent.split('\n').length, ch: 0 },
                file.path
            );

            new Notice('✨ Transcription completed successfully!');
            
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            console.error('❌ Error processing audio file:', {
                error,
                message: errorMessage,
                stack: error instanceof Error ? error.stack : undefined
            });
            new Notice(`❌ Failed to process audio file: ${errorMessage}`);
            throw error;
        }
    }

    public async processVideoFile(file: TFile): Promise<void> {
        try {
            const videoProcessor = await VideoProcessor.getInstance(this, this.pluginData);
            await videoProcessor.processVideo(file);
        } catch (error) {
            console.error('Error processing video file:', error);
            new Notice('Failed to process video file. Please check console for details.');
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
        
        if (this.floatingButton) {
            if (leaf?.view instanceof MarkdownView) {
                this.floatingButton.show();
            } else {
                this.floatingButton.hide();
            }
        }
    }

    public handleLayoutChange(): void {
        if (this.floatingButton) {
            this.floatingButton.show();
        }
    }

    public handleFileDelete(file: TAbstractFile): void {
        if (file instanceof TFile) {
            // Handle cleanup if needed
        }
    }

    public initializeUI(): void {
        this.cleanupUI();

        if (this.pluginData.showFloatingButton) {
            this.floatingButton = FloatingButton.getInstance(
                this,
                this.pluginData,
                () => this.handleRecordingStart()
            );
        }

        if (this.pluginData.showToolbarButton) {
            this.toolbarButton = new ToolbarButton(this, this.pluginData);
        }
    }

    public cleanupUI(): void { 
        if (this.floatingButton) {
            this.floatingButton.remove();
            this.floatingButton = null;
        }
        
        if (this.toolbarButton) {
            this.toolbarButton.remove();
            this.toolbarButton = null;
        }
    }

    private modalInstance: TimerModal | null = null;

    public handleRecordingStart(): void {
        const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (!activeView) {
            new Notice('No active note found to insert transcription.');
            return;
        }
    
        const activeFile = activeView.file;
        if (!activeFile) {
            new Notice('No active file found.');
            return;
        }
    
        if (this.pluginData.useRecordingModal) {
            if (this.modalInstance) return;
            
            this.modalInstance = new TimerModal(this.app);
            this.modalInstance.onStop = async (audioBlob: Blob) => {
                try {
                    console.log('🎙️ Recording stopped, processing audio:', {
                        size: `${(audioBlob.size / (1024 * 1024)).toFixed(2)}MB`,
                        type: audioBlob.type
                    });

                    const adapter = this.aiAdapters.get(this.pluginData.transcriptionProvider);
                    if (!adapter) {
                        throw new Error(`Transcription provider ${this.pluginData.transcriptionProvider} not found`);
                    }

                    if (!adapter.getApiKey()) {
                        throw new Error(`API key not set for ${this.pluginData.transcriptionProvider}`);
                    }

                    console.log('🔑 Using transcription provider:', {
                        provider: this.pluginData.transcriptionProvider,
                        model: this.pluginData.transcriptionModel
                    });

                    await this.recordingProcessor.processRecording(
                        audioBlob, 
                        activeFile,
                        activeView.editor.getCursor()
                    );
                } catch (error) {
                    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                    console.error('❌ Failed to process recording:', {
                        error,
                        message: errorMessage,
                        stack: error instanceof Error ? error.stack : undefined
                    });
                    new Notice(`Failed to process recording: ${errorMessage}`);
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

    public async saveSettings(): Promise<void> {
        await this.savePluginData();
        this.initializeUI();
    }

    onunload() {
        this.cleanupUI();
    }
}
