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
    private buttonMap: Map<string, FloatingButton> = new Map();
    toolbarButton: ToolbarButton | null = null;
    public activeLeaf: WorkspaceLeaf | null = null;
    settingTab: NeuroVoxSettingTab | null = null;

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
        this.settingTab = new NeuroVoxSettingTab(this.app, this);
        this.addSettingTab(this.settingTab);
    }

    public refreshModelDropdowns(): void {
        if (!this.settingTab?.containerEl) return;

        const containers = this.settingTab.containerEl.querySelectorAll('.neurovox-accordion');
        containers.forEach(container => {
            const header = container.querySelector('.neurovox-accordion-title');
            if (!header?.textContent) return;

            if (header.textContent.includes('Recording')) {
                const recordingAccordion = this.settingTab?.getRecordingAccordion();
                if (recordingAccordion?.modelDropdown) {
                    recordingAccordion.populateModelDropdown(recordingAccordion.modelDropdown);
                }
            } else if (header.textContent.includes('Summarize')) {
                const summaryAccordion = this.settingTab?.getSummaryAccordion();
                if (summaryAccordion?.modelDropdown) {
                    summaryAccordion.populateModelOptions(summaryAccordion.modelDropdown);
                }
            }
        });
    }

    /**
     * Registers plugin commands with proper conditional checks
     * Commands will only be available when appropriate conditions are met
     */
    public registerCommands(): void {
        // Command to start a new recording
        this.addCommand({
            id: 'start-recording',
            name: 'Start recording',
            checkCallback: (checking: boolean) => {
                // Get active markdown view
                const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
                
                // Check if we have an active markdown file
                if (!activeView?.file) {
                    return false;
                }

                // If just checking, return true since conditions are met
                if (checking) {
                    return true;
                }

                // Execute the command
                this.handleRecordingStart();
                return true;
            }
        });

        // Command to process existing audio files
        this.addCommand({
            id: 'process-audio-file',
            name: 'Transcribe existing audio file',
            checkCallback: (checking: boolean) => {
                // Get the active file
                const activeFile = this.app.workspace.getActiveFile();
                
                // Check if we have a file and it's an audio file
                const isValidAudioFile = this.isValidAudioFile(activeFile);
                
                // If conditions aren't met, command isn't available
                if (!activeFile || !isValidAudioFile) {
                    return false;
                }

                // If just checking, return true since conditions are met
                if (checking) {
                    return true;
                }

                // Execute the command
                void this.processExistingAudioFile(activeFile);
                return true;
            }
        });
    }

    /**
     * Checks if a file is a valid audio file for transcription
     * @param file - The file to check
     * @returns boolean indicating if file is a valid audio file
     */
    private isValidAudioFile(file: TFile | null): boolean {
        if (!file) return false;

        const validExtensions = ['mp3', 'wav', 'webm'];
        return validExtensions.includes(file.extension);
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

    /**
     * Handles changes in the active leaf (note)
     */
    public handleActiveLeafChange(leaf: WorkspaceLeaf | null): void {
        this.activeLeaf = leaf;
        
        // Clean up ALL existing buttons
        this.buttonMap.forEach((button, path) => {
            button.remove();
        });
        this.buttonMap.clear();
        
        // Only create new button for markdown views with valid files
        if (leaf?.view instanceof MarkdownView && leaf.view.file) {
            this.createButtonForFile(leaf.view.file);
        }
    }

    public handleLayoutChange(): void {
        // Get current active file's button and show it
        const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (activeView?.file) {
            const button = this.buttonMap.get(activeView.file.path);
            button?.show();
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
    
        if (this.pluginData.showToolbarButton) {
            this.toolbarButton = new ToolbarButton(this, this.pluginData);
        }
    }
    
    private createButtonForFile(file: TFile): void {
        if (!this.pluginData.showFloatingButton) return;
        
        // Remove any existing button for this file first
        const existingButton = this.buttonMap.get(file.path);
        if (existingButton) {
            existingButton.remove();
            this.buttonMap.delete(file.path);
        }
        
        // Create new button instance
        const button = new FloatingButton(
            this,
            this.pluginData,
            () => this.handleRecordingStart()
        );
        
        this.buttonMap.set(file.path, button);
    }
    
    /**
     * Cleans up UI components before reinitializing
     */
    public cleanupUI(): void { 
        // Clean up all buttons
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
        await this.savePluginData();
        this.initializeUI();
    }

    public updateAllButtonColors(): void {
        this.buttonMap.forEach(button => {
            button.updateButtonColor();
        });
    }

    onunload() {
        this.cleanupUI();
    }
}
