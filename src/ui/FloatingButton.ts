import { Plugin, TFile, MarkdownView, Notice } from 'obsidian';
import { TimerModal } from '../modals/TimerModal';
import { createButtonWithSvgIcon } from '../utils/SvgUtils';
import { icons } from '../assets/icons';
import { NeuroVoxSettings } from '../settings/Settings';
import { transcribeAudio, generateChatCompletion, generateSpeech } from '../processors/openai';
import { saveAudioFile } from '../utils/FileUtils';

export class FloatingButton {
    private plugin: Plugin;
    private settings: NeuroVoxSettings;
    public buttonEl: HTMLButtonElement;
    private contentContainer: HTMLElement;

    constructor(plugin: Plugin, settings: NeuroVoxSettings) {
        this.plugin = plugin;
        this.settings = settings;
        this.createButton();
        this.contentContainer = document.createElement('div');
        this.registerEventListeners();
    }

    private createButton() {
        this.buttonEl = createButtonWithSvgIcon(icons.microphone);
        this.buttonEl.addClass('neurovox-button', 'floating');
        this.buttonEl.addEventListener('click', () => this.openRecordingModal());
    }

    private appendButtonToCurrentNote() {
        const activeLeaf = this.plugin.app.workspace.activeLeaf;
        if (activeLeaf) {
            const view = activeLeaf.view;
            if (view instanceof MarkdownView) {
                const container = view.containerEl;
                const editor = view.editor;
                const doc = editor.getDoc();
                const lines = doc.lineCount();
                let recordBlockFound = false;

                for (let i = 0; i < lines; i++) {
                    const line = doc.getLine(i);
                    if (line.trim() === '```record') {
                        recordBlockFound = true;
                        break;
                    }
                }

                if (recordBlockFound) {
                    container.appendChild(this.buttonEl);
                } else {
                    this.removeButton();
                }
            }
        }
    }

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
        const activeLeaf = this.plugin.app.workspace.activeLeaf;
        if (activeLeaf) {
            const view = activeLeaf.view;
            if (view instanceof MarkdownView) {
                const editor = view.editor;
                const doc = editor.getDoc();
                const lines = doc.lineCount();
                let recordBlockFound = false;

                for (let i = 0; i < lines; i++) {
                    const line = doc.getLine(i);
                    if (line.trim() === '```record') {
                        recordBlockFound = true;
                        break;
                    }
                }

                if (recordBlockFound) {
                    this.appendButtonToCurrentNote();
                } else {
                    this.removeButton();
                }
            }
        }
    }

    private openRecordingModal() {
        const modal = new TimerModal(this.plugin.app);
        modal.onStop = async (audioBlob: Blob) => {
            await this.processRecording(audioBlob);
        };
        modal.open();
    }

    private async processRecording(audioBlob: Blob) {
        try {
            console.log('Processing recording started');
            console.log(`Audio blob size: ${audioBlob.size} bytes`);
            console.log(`Audio blob type: ${audioBlob.type}`);

            // Save the original audio recording
            const fileName = `recording-${Date.now()}.wav`;
            const file = await saveAudioFile(this.plugin.app, audioBlob, fileName, this.settings);

            console.log(`Saved recording as ${file.path}`);

            // Transcribe the audio
            console.log('Starting transcription');
            const transcription = await transcribeAudio(audioBlob, this.settings);
            console.log('Transcription completed:', transcription);

            // Generate summary
            console.log('Generating summary');
            const summary = await generateChatCompletion(transcription, this.settings);
            console.log('Summary generated:', summary);

            // Generate audio summary if enabled
            let audioSummaryFile: TFile | null = null;
            if (this.settings.enableVoiceGeneration) {
                console.log('Generating audio summary');
                const audioSummaryArrayBuffer = await generateSpeech(summary, this.settings);
                const audioSummaryBlob = new Blob([audioSummaryArrayBuffer], { type: 'audio/wav' });
                audioSummaryFile = await saveAudioFile(this.plugin.app, audioSummaryBlob, `summary-${Date.now()}.wav`, this.settings);
                console.log('Audio summary generated:', audioSummaryFile.path);
            }

            // Update content in the record block
            this.updateRecordBlockContent(file, transcription, summary, audioSummaryFile);

            // Replace the `record` block in the note
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
                        const formattedContent = this.formatContent(file, transcription, summary, audioSummaryFile);
                        doc.replaceRange(
                            formattedContent,
                            { line: recordBlockStart, ch: 0 },
                            { line: recordBlockEnd, ch: doc.getLine(recordBlockEnd).length }
                        );
                        this.removeButton(); // Remove the button after replacing the block
                    }
                }
            }

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
        content += `${summary}\n\n`;
        content += '## Transcription\n';
        content += `![[${audioFile.path}]]\n`;
        content += `${transcription}\n`;
        return content;
    }

    private updateRecordBlockContent(audioFile: TFile, transcription: string, summary: string, audioSummaryFile: TFile | null) {
        // Clear the content container
        while (this.contentContainer.firstChild) {
            this.contentContainer.removeChild(this.contentContainer.firstChild);
        }

        // Create and append generations section
        const generationsHeader = document.createElement('h2');
        generationsHeader.textContent = 'Generations';
        this.contentContainer.appendChild(generationsHeader);

        if (audioSummaryFile) {
            const audioSummaryLink = document.createElement('a');
            audioSummaryLink.href = audioSummaryFile.path;
            audioSummaryLink.textContent = audioSummaryFile.path;
            this.contentContainer.appendChild(audioSummaryLink);
            this.contentContainer.appendChild(document.createElement('br'));
        }

        const summaryParagraph = document.createElement('p');
        summaryParagraph.textContent = summary;
        this.contentContainer.appendChild(summaryParagraph);

        // Create and append transcript section
        const transcriptHeader = document.createElement('h2');
        transcriptHeader.textContent = 'Transcript';
        this.contentContainer.appendChild(transcriptHeader);

        const audioFileLink = document.createElement('a');
        audioFileLink.href = audioFile.path;
        audioFileLink.textContent = audioFile.path;
        this.contentContainer.appendChild(audioFileLink);
        this.contentContainer.appendChild(document.createElement('br'));

        const transcriptionParagraph = document.createElement('p');
        transcriptionParagraph.textContent = transcription;
        this.contentContainer.appendChild(transcriptionParagraph);

        // Remove the floating button
        this.removeButton();
    }

    public removeButton() {
        if (this.buttonEl && this.buttonEl.parentNode) {
            this.buttonEl.parentNode.removeChild(this.buttonEl);
        }
    }
}