import { MarkdownView, Notice } from 'obsidian';
import NeuroVoxPlugin from '../main';
import { TimerModal } from '../modals/TimerModal';
import { NeuroVoxSettings } from '../settings/Settings';

/**
 * ToolbarButton handles the creation and functionality of the toolbar microphone button.
 */
export class ToolbarButton {
    public ribbonIconEl: HTMLElement;
    public plugin: NeuroVoxPlugin;
    public settings: NeuroVoxSettings;

    constructor(plugin: NeuroVoxPlugin, settings: NeuroVoxSettings) {
        this.plugin = plugin;
        this.settings = settings;
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
     * Removes the toolbar button from the ribbon.
     */
    public remove(): void {
        this.ribbonIconEl.detach();
    }
}