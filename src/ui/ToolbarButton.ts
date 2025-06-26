// src/ui/ToolbarButton.ts

import { MarkdownView, Notice, setIcon } from 'obsidian';
import NeuroVoxPlugin from '../main';
import { TimerModal } from '../modals/TimerModal';
import { PluginData } from '../types';
/**
 * ToolbarButton handles the creation and functionality of the toolbar microphone button.
 */
export class ToolbarButton {
    public ribbonIconEl: HTMLElement;
    public plugin: NeuroVoxPlugin;
    public pluginData: PluginData;

    constructor(plugin: NeuroVoxPlugin, pluginData: PluginData) {
        this.plugin = plugin;
        this.pluginData = pluginData;
        this.createButton();
    }

    /**
     * Creates the toolbar microphone button and adds it to the ribbon.
     */
    public createButton(): void {
        this.ribbonIconEl = this.plugin.addRibbonIcon(
            'mic-vocal', 
            'Start recording',
            (evt: MouseEvent) => {
                this.openRecordingModal();
            }
        );
        this.ribbonIconEl.addClass('neurovox-toolbar-button'); 
    }

    /**
     * Opens the recording modal.
     */
    public openRecordingModal(): void {
        const activeLeaf = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
        if (activeLeaf) {
            const activeFile = activeLeaf.file;
            if (!activeFile) {
                new Notice('No active file to insert transcription.');
                return;
            }
            const editor = activeLeaf.editor;
            const cursorPosition = editor.getCursor();

            const modal = new TimerModal(this.plugin);
            modal.onStop = async (result: Blob | string) => {
                // Handle both streaming (string) and legacy (Blob) results
                if (typeof result === 'string') {
                    // Streaming mode - transcription already done
                    await this.plugin.recordingProcessor.processStreamingResult(result, activeFile, cursorPosition);
                } else {
                    // Legacy mode - need to transcribe
                    await this.plugin.recordingProcessor.processRecording(result, activeFile, cursorPosition);
                }
            };
            modal.open();
        } else {
            new Notice('No active note found to insert transcription.');
        }
    }

    /**
     * Removes the toolbar button from the ribbon.
     */
    public remove(): void {
        this.ribbonIconEl.detach();
    }
}
