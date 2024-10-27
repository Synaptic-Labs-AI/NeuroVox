// src/ui/ToolbarButton.ts

import { MarkdownView, Notice } from 'obsidian';
import NeuroVoxPlugin from '../main';
import { TimerModal } from '../modals/TimerModal';
import { PluginData } from '../types';
import { icons } from '../assets/icons'; // Ensure you have imported icons

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
            'microphone', // Icon ID, ensure 'microphone' is a valid icon in Obsidian
            'Start NeuroVox Recording', // Tooltip
            (evt: MouseEvent) => {
                this.openRecordingModal();
            }
        );
        this.ribbonIconEl.addClass('neurovox-toolbar-button');
        this.updateButtonColor(); // Apply initial color
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

            const modal = new TimerModal(this.plugin.app);
            modal.onStop = (audioBlob: Blob) => {
                this.plugin.processRecording(audioBlob, activeFile, cursorPosition);
            };
            modal.open();
        } else {
            new Notice('No active note found to insert transcription.');
        }
    }

    /**
     * Updates the toolbar button color based on settings.
     */
    public updateButtonColor(): void {
        const color = this.pluginData.micButtonColor;
        this.ribbonIconEl.style.backgroundColor = color;
    }

    /**
     * Removes the toolbar button from the ribbon.
     */
    public remove(): void {
        this.ribbonIconEl.detach();
    }
}
