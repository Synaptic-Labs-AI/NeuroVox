// src/ui/FloatingButton.ts

import { Plugin, Notice } from 'obsidian';
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
            // Save the original audio recording
            const fileName = `recording-${Date.now()}.mp3`;
            const file = await saveAudioFile(this.plugin.app, audioBlob, fileName, this.settings);
            
            // Transcribe the audio
            const transcription = await transcribeAudio(audioBlob, this.settings);

            // Generate summary
            const summary = await generateChatCompletion(transcription, this.settings);

            // Generate audio summary if enabled
            let audioSummary: Blob | null = null;
            if (this.settings.enableVoiceGeneration) {
                audioSummary = await generateSpeech(summary, this.settings);
            }

            // Update content in the record block
            this.updateRecordBlockContent(file.path, transcription, summary, audioSummary);

            // Remove the floating button
            this.removeButton();

            new Notice('Recording processed successfully');
        } catch (error) {
            console.error('Error processing recording:', error);
            new Notice('Error processing recording. Check console for details.');
        }
    }

    private updateRecordBlockContent(audioPath: string, transcription: string, summary: string, audioSummary: Blob | null) {
        const content = `
## Generations
${audioSummary ? `<audio controls src="${URL.createObjectURL(audioSummary)}"></audio>\n` : ''}
${summary}

## Transcript
<audio controls src="${this.plugin.app.vault.adapter.getResourcePath(audioPath)}"></audio>
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