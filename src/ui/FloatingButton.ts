// src/ui/FloatingButton.ts

import { Plugin, Notice, TFile } from 'obsidian';
import { TimerModal } from '../modals/TimerModal';
import { createButtonWithSvgIcon } from '../utils/SvgUtils';
import { icons } from '../assets/icons';
import { NeuroVoxSettings } from '../settings/Settings';
import { transcribeAudio, generateChatCompletion, generateSpeech } from '../processors/openai';
import { saveAudioFile } from '../utils/FileUtils';

export class FloatingButton {
    private plugin: Plugin;
    private settings: NeuroVoxSettings;
    private contentContainer: HTMLElement;
    public buttonEl: HTMLButtonElement;

    constructor(plugin: Plugin, settings: NeuroVoxSettings, contentContainer: HTMLElement) {
        this.plugin = plugin;
        this.settings = settings;
        this.contentContainer = contentContainer;
        this.createButton();
    }

    private createButton() {
        this.buttonEl = createButtonWithSvgIcon(icons.microphone);
        this.buttonEl.addClass('neurovox-button', 'floating');
        this.buttonEl.addEventListener('click', () => this.openRecordingModal());
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
            const fileName = `recording-${Date.now()}.mp3`;
            const filePath = `${this.settings.recordingFolderPath}/${fileName}`;
            const file = await saveAudioFile(this.plugin.app, audioBlob, filePath, this.settings);
            
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
                const audioSummaryBlob = await generateSpeech(summary, this.settings);
                const summaryFileName = `summary-${Date.now()}.mp3`;
                const summaryFilePath = `${this.settings.recordingFolderPath}/${summaryFileName}`;
                audioSummaryFile = await saveAudioFile(this.plugin.app, audioSummaryBlob, summaryFilePath, this.settings);
                console.log('Audio summary generated:', audioSummaryFile.path);
            }

            // Update content in the record block
            this.updateRecordBlockContent(file, transcription, summary, audioSummaryFile);

            // Remove the floating button
            this.removeButton();

            new Notice('Recording processed successfully');
        } catch (error) {
            console.error('Error processing recording:', error);
            new Notice('Error processing recording. Check console for details.');
        }
    }

    private updateRecordBlockContent(audioFile: TFile, transcription: string, summary: string, audioSummaryFile: TFile | null) {
        const content = `
## Generations
${audioSummaryFile ? `![[${audioSummaryFile.path}]]\n` : ''}
${summary}

## Transcript
![[${audioFile.path}]]
${transcription}
        `;

        this.contentContainer.innerHTML = content;
    }

    public removeButton() {
        if (this.buttonEl && this.buttonEl.parentNode) {
            this.buttonEl.parentNode.removeChild(this.buttonEl);
        }
    }
}