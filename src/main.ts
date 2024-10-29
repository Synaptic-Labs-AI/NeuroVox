// src/main.ts

import { 
    Plugin, 
    Notice, 
    TFile,  
    MarkdownView, 
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
import { PluginData } from './types';
import { RecordingProcessor } from './utils/RecordingProcessor';

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
        console.log('Loading NeuroVox plugin');

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
        console.log('Plugin data loaded:', this.pluginData);
    }

    public async savePluginData(): Promise<void> {
        console.log('Saving plugin data:', this.pluginData);
        await this.saveData(this.pluginData);
        console.log('Plugin data saved successfully.');
    }

    public initializeAIAdapters(): void {
        const adapters: Array<[AIProvider, AIAdapter]> = [
            [AIProvider.OpenAI, new OpenAIAdapter(this.pluginData)],
            [AIProvider.Groq, new GroqAdapter(this.pluginData)]
        ];
        
        this.aiAdapters = new Map<AIProvider, AIAdapter>(adapters);
    }

    public registerSettingsTab(): void {
        // Adjusted to pass only two arguments
        this.addSettingTab(new NeuroVoxSettingTab(this.app, this));
    }

    public registerCommands(): void {
        this.addCommand({
            id: 'start-neurovox-recording',
            name: 'Start NeuroVox Recording',
            callback: () => this.handleRecordingStart()
        });

        this.addCommand({
            id: 'process-audio-file',
            name: 'Transcribe Existing Audio File',
            checkCallback: (checking: boolean) => {
                // Get the active file
                const activeFile = this.app.workspace.getActiveFile();
                
                // Check if it's an audio file
                const isAudioFile = activeFile?.extension === 'mp3' || 
                                  activeFile?.extension === 'wav' ||
                                  activeFile?.extension === 'webm';
    
                // If checking, return true if it's an audio file
                if (checking) return isAudioFile;
    
                if (isAudioFile && activeFile) {
                    this.processExistingAudioFile(activeFile);
                }
    
                return false;
            }
        });
    }

    public async processExistingAudioFile(file: TFile): Promise<void> {
        try {
            // Read the audio file as an array buffer
            const audioBuffer = await this.app.vault.readBinary(file);
            
            // Convert to blob for processing
            const blob = new Blob([audioBuffer], { type: 'audio/wav' });
            
            // Create new markdown file name based on audio file
            const newFileName = `${file.basename}-transcript.md`;
            
            // Create a new markdown file
            const newFile = await this.app.vault.create(
                newFileName,
                '' // Initial empty content
            );
    
            // Use existing recording processor to handle transcription and summary
            await this.recordingProcessor.processRecording(
                blob,
                newFile,
                { line: 0, ch: 0 } // Start at beginning of file
            );
    
            // Open the new file
            await this.app.workspace.getLeaf().openFile(newFile);
            
            new Notice('Audio file processed successfully!');
        } catch (error) {
            console.error('Error processing audio file:', error);
            new Notice('Error processing audio file. Check console for details.');
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
        console.log('Initializing UI components');
        
        this.cleanupUI();

        if (this.pluginData.showFloatingButton) {
            console.log('Creating floating button');
            this.floatingButton = FloatingButton.getInstance(
                this,
                this.pluginData,
                () => this.handleRecordingStart()
            );
        }

        if (this.pluginData.showToolbarButton) {
            console.log('Creating toolbar button');
            this.toolbarButton = new ToolbarButton(this, this.pluginData);
        }
    }

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

    private modalInstance: TimerModal | null = null;

    public handleRecordingStart(): void {
        const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
        
        if (!activeView) {
            new Notice('No active note found to insert transcription.');
            return;
        }
    
        const activeFile = activeView.file;  // Separate declaration for type narrowing
        if (!activeFile) {
            new Notice('No active file found.');
            return;
        }
    
        if (this.pluginData.useRecordingModal) {
            // Check if modal is already open
            if (this.modalInstance) {
                return;
            }
            this.modalInstance = new TimerModal(this.app);
            this.modalInstance.onStop = async (audioBlob: Blob) => {
                await this.recordingProcessor.processRecording(
                    audioBlob, 
                    activeFile,  // Now TypeScript knows this is definitely a TFile
                    activeView.editor.getCursor()
                );
            };
            
            // Fix async type mismatch
            const originalOnClose = this.modalInstance.onClose?.bind(this.modalInstance);
            this.modalInstance.onClose = async () => {
                if (originalOnClose) {
                    await originalOnClose();
                }
                this.modalInstance = null;
                return Promise.resolve();
            };
            
            this.modalInstance.open();
        } else {
            return;
        }
    }

    public openRecordingModal(activeView: MarkdownView): void {
        const file = activeView.file;
        if (!file) {
            new Notice('No active file found');
            return;
        }
    
        const modal = new TimerModal(this.app);
        modal.onStop = async (audioBlob: Blob) => {
            await this.recordingProcessor.processRecording(
                audioBlob, 
                file,
                activeView.editor.getCursor()
            );
        };
        modal.open();
    }

    async saveSettings(): Promise<void> {
        console.log('Saving settings:', this.settings);
        await this.savePluginData();
        this.initializeUI();
    }

    onunload() {
        console.log('Unloading NeuroVox plugin...');
        this.cleanupUI();
    }
}
