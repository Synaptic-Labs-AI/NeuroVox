import { Plugin, TFile, MarkdownView, Notice, Editor } from 'obsidian';
import { TimerModal } from '../modals/TimerModal';
import { createButtonWithSvgIcon } from '../utils/SvgUtils';
import { icons } from '../assets/icons';
import { NeuroVoxSettings } from '../settings/Settings';
import { transcribeAudio, generateChatCompletion, generateSpeech } from '../processors/openai';
import { saveAudioFile } from '../utils/FileUtils';

/**
 * FloatingButton class handles the creation and management of a floating button
 * that interacts with audio recordings and updates the Obsidian editor content.
 */
export class FloatingButton {
    public buttonEl: HTMLButtonElement;
    private contentContainer: HTMLElement;

    constructor(private plugin: Plugin, private settings: NeuroVoxSettings) {
        this.createButton();
        this.contentContainer = document.createElement('div');
        this.registerEventListeners();
    }

    private createButton(): void {
        this.buttonEl = createButtonWithSvgIcon(icons.microphone);
        this.buttonEl.addClass('neurovox-button', 'floating');
        this.buttonEl.addEventListener('click', () => this.openRecordingModal());
    }

    private appendButtonToCurrentNote(): void {
        const activeLeaf = this.plugin.app.workspace.activeLeaf;
        if (activeLeaf?.view instanceof MarkdownView) {
            const view = activeLeaf.view;
            const container = view.containerEl;
            const editor = view.editor;

            const recordBlockFound = this.findRecordBlock(editor);

            if (recordBlockFound) {
                container.appendChild(this.buttonEl);
            } else {
                this.removeButton();
            }
        }
    }

    private registerEventListeners(): void {
        this.plugin.app.workspace.on('layout-change', this.checkForRecordBlock.bind(this));
        this.plugin.app.workspace.on('active-leaf-change', this.checkForRecordBlock.bind(this));
        this.plugin.app.workspace.on('editor-change', this.checkForRecordBlock.bind(this));
    }

    private checkForRecordBlock(): void {
        const activeLeaf = this.plugin.app.workspace.activeLeaf;
        if (activeLeaf?.view instanceof MarkdownView) {
            const view = activeLeaf.view;
            const editor = view.editor;

            const recordBlockFound = this.findRecordBlock(editor);

            if (recordBlockFound) {
                this.appendButtonToCurrentNote();
            } else {
                this.removeButton();
            }
        }
    }

    private findRecordBlock(editor: Editor): boolean {
        const content = editor.getValue();
        return content.includes('```record');
    }

    private openRecordingModal(): void {
        const modal = new TimerModal(this.plugin.app);
        modal.onStop = this.processRecording.bind(this);
        modal.open();
    }

    private async processRecording(audioBlob: Blob): Promise<void> {
        try {
            const fileName = `recording-${Date.now()}.wav`;
            const file = await saveAudioFile(this.plugin.app, audioBlob, fileName, this.settings);

            const transcription = await transcribeAudio(audioBlob, this.settings);
            const summary = await generateChatCompletion(transcription, this.settings);

            let audioSummaryFile: TFile | null = null;
            if (this.settings.enableVoiceGeneration) {
                const audioSummaryArrayBuffer = await generateSpeech(summary, this.settings);
                const audioSummaryBlob = new Blob([audioSummaryArrayBuffer], { type: 'audio/wav' });
                audioSummaryFile = await saveAudioFile(this.plugin.app, audioSummaryBlob, `summary-${Date.now()}.wav`, this.settings);
            }

            this.updateRecordBlockContent(file, transcription, summary, audioSummaryFile);

            new Notice('Recording processed successfully');
        } catch (error) {
            console.error('Error processing recording:', error);
            new Notice('Failed to process recording');
        }
    }

    private formatContent(audioFile: TFile, transcription: string, summary: string, audioSummaryFile: TFile | null): string {
        let content = '## Generations\n';
        if (audioSummaryFile) {
            content += `![[${audioSummaryFile.path}]]\n`;
        }
        content += `${summary}\n\n## Transcription\n![[${audioFile.path}]]\n${transcription}\n`;
        return content;
    }

    private updateRecordBlockContent(audioFile: TFile, transcription: string, summary: string, audioSummaryFile: TFile | null): void {
        const activeLeaf = this.plugin.app.workspace.activeLeaf;
        if (activeLeaf?.view instanceof MarkdownView) {
            const view = activeLeaf.view;
            const editor = view.editor;

            const { start, end } = this.findRecordBlockRange(editor);

            if (start !== -1 && end !== -1) {
                const formattedContent = this.formatContent(audioFile, transcription, summary, audioSummaryFile);
                editor.replaceRange(
                    formattedContent,
                    { line: start, ch: 0 },
                    { line: end, ch: editor.getLine(end).length }
                );
                this.removeButton();
            } else {
                console.warn("Could not find record block to update");
            }
        }
    }

    private findRecordBlockRange(editor: Editor): { start: number, end: number } {
        const content = editor.getValue();
        const lines = content.split('\n');
        let start = -1;
        let end = -1;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (line === '```record') {
                start = i;
            } else if (line === '```' && start !== -1) {
                end = i;
                break;
            }
        }

        return { start, end };
    }

    public removeButton(): void {
        this.buttonEl.remove();
    }
}
