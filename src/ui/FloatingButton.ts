import { Plugin, TFile, MarkdownView, Notice, Editor } from 'obsidian';
import { TimerModal } from '../modals/TimerModal';
import { createButtonWithSvgIcon } from '../utils/SvgUtils';
import { icons } from '../assets/icons';
import { NeuroVoxSettings } from '../settings/Settings';
import { transcribeAudio, generateChatCompletion, generateSpeech } from '../processors/openai';
import { saveAudioFile } from '../utils/FileUtils';

// Helper function for debug notices
function debugNotice(message: string) {
    new Notice(`[DEBUG] ${message}`, 5000);  // Display for 5 seconds
}

/**
 * FloatingButton class handles the creation and management of a floating button
 * that interacts with audio recordings and updates the Obsidian editor content.
 */
export class FloatingButton {
    public buttonEl: HTMLButtonElement;
    private contentContainer: HTMLElement;

<<<<<<< HEAD
    constructor(private plugin: Plugin, private settings: NeuroVoxSettings) {
=======
    constructor(plugin: Plugin, settings: NeuroVoxSettings) {
        this.plugin = plugin;
        this.settings = settings;
>>>>>>> 5d40b8d (replaced mediarecorder with recordrtc so it would work for apple. works but only records in wav, so cant replay on apple.)
        this.createButton();
        this.contentContainer = document.createElement('div');
        this.registerEventListeners();
    }

<<<<<<< HEAD
    private createButton(): void {
=======
    private createButton() {
>>>>>>> 5d40b8d (replaced mediarecorder with recordrtc so it would work for apple. works but only records in wav, so cant replay on apple.)
        this.buttonEl = createButtonWithSvgIcon(icons.microphone);
        this.buttonEl.addClass('neurovox-button', 'floating');
        this.buttonEl.addEventListener('click', () => this.openRecordingModal());
    }

<<<<<<< HEAD
    private appendButtonToCurrentNote(): void {
=======
    private appendButtonToCurrentNote() {
>>>>>>> 5d40b8d (replaced mediarecorder with recordrtc so it would work for apple. works but only records in wav, so cant replay on apple.)
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

<<<<<<< HEAD
    private registerEventListeners(): void {
        this.plugin.app.workspace.on('layout-change', this.checkForRecordBlock.bind(this));
        this.plugin.app.workspace.on('active-leaf-change', this.checkForRecordBlock.bind(this));
        this.plugin.app.workspace.on('editor-change', this.checkForRecordBlock.bind(this));
    }

    private checkForRecordBlock(): void {
=======
    private registerEventListeners() {
        this.plugin.app.workspace.on('layout-change', () => {
            this.checkForRecordBlock();
        });

        this.plugin.app.workspace.on('active-leaf-change', () => {
            this.checkForRecordBlock();
        });

        this.plugin.app.workspace.on('editor-change', () => {
            this.checkForRecordBlock();
        });
    }

    private checkForRecordBlock() {
>>>>>>> 5d40b8d (replaced mediarecorder with recordrtc so it would work for apple. works but only records in wav, so cant replay on apple.)
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

<<<<<<< HEAD
    private findRecordBlock(editor: Editor): boolean {
        const content = editor.getValue();
        return content.includes('```record');
    }

    private openRecordingModal(): void {
=======
    private openRecordingModal() {
>>>>>>> 5d40b8d (replaced mediarecorder with recordrtc so it would work for apple. works but only records in wav, so cant replay on apple.)
        const modal = new TimerModal(this.plugin.app);
        modal.onStop = this.processRecording.bind(this);
        modal.open();
    }

<<<<<<< HEAD
    private async processRecording(audioBlob: Blob): Promise<void> {
        try {
            const fileName = `recording-${Date.now()}.wav`;
=======
    private async processRecording(audioBlob: Blob) {
        try {
            debugNotice(`Processing recording. Blob size: ${audioBlob.size}, type: ${audioBlob.type}`);

            const fileName = `recording-${Date.now()}..wav`;
>>>>>>> 5d40b8d (replaced mediarecorder with recordrtc so it would work for apple. works but only records in wav, so cant replay on apple.)
            const file = await saveAudioFile(this.plugin.app, audioBlob, fileName, this.settings);
            debugNotice(`Audio file saved: ${fileName}`);

<<<<<<< HEAD
            const transcription = await transcribeAudio(audioBlob, this.settings);
=======
            debugNotice("Starting transcription...");
            const transcription = await transcribeAudio(audioBlob, this.settings);
            debugNotice(`Transcription completed. Length: ${transcription.length} characters`);

>>>>>>> 5d40b8d (replaced mediarecorder with recordrtc so it would work for apple. works but only records in wav, so cant replay on apple.)
            const summary = await generateChatCompletion(transcription, this.settings);

            let audioSummaryFile: TFile | null = null;
            if (this.settings.enableVoiceGeneration) {
                const audioSummaryArrayBuffer = await generateSpeech(summary, this.settings);
                const audioSummaryBlob = new Blob([audioSummaryArrayBuffer], { type: 'audio/.wav' });
                audioSummaryFile = await saveAudioFile(this.plugin.app, audioSummaryBlob, `summary-${Date.now()}..wav`, this.settings);
            }

            this.updateRecordBlockContent(file, transcription, summary, audioSummaryFile);

            new Notice('Recording processed successfully');
        } catch (error) {
            console.error('Error processing recording:', error);
            debugNotice(`Failed to process recording: ${error.message}`);
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

<<<<<<< HEAD
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
=======
    private updateRecordBlockContent(audioFile: TFile, transcription: string, summary: string, audioSummaryFile: TFile | null) {
        const activeLeaf = this.plugin.app.workspace.activeLeaf;
        if (activeLeaf) {
            const view = activeLeaf.view;
            if (view instanceof MarkdownView) {
                const editor = view.editor;
                const doc = editor.getDoc();
                const lines = doc.lineCount();
                let recordBlockStart = -1;
                let recordBlockEnd = -1;

                for (let i = 0; i < lines; i++) {
                    const line = doc.getLine(i);
                    if (line.trim() === '```record') {
                        recordBlockStart = i;
                    } else if (line.trim() === '```' && recordBlockStart !== -1) {
                        recordBlockEnd = i;
                        break;
                    }
                }

                if (recordBlockStart !== -1 && recordBlockEnd !== -1) {
                    const formattedContent = this.formatContent(audioFile, transcription, summary, audioSummaryFile);
                    doc.replaceRange(
                        formattedContent,
                        { line: recordBlockStart, ch: 0 },
                        { line: recordBlockEnd, ch: doc.getLine(recordBlockEnd).length }
                    );
                    this.removeButton();
                } else {
                    debugNotice("Could not find record block to update");
                }
>>>>>>> 5d40b8d (replaced mediarecorder with recordrtc so it would work for apple. works but only records in wav, so cant replay on apple.)
            }
        }
    }

<<<<<<< HEAD
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
=======
    public removeButton() {
        if (this.buttonEl && this.buttonEl.parentNode) {
            this.buttonEl.parentNode.removeChild(this.buttonEl);
>>>>>>> 5d40b8d (replaced mediarecorder with recordrtc so it would work for apple. works but only records in wav, so cant replay on apple.)
        }

        return { start, end };
    }

    public removeButton(): void {
        this.buttonEl.remove();
    }
}