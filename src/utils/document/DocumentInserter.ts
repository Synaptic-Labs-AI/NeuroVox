import { EditorPosition, Notice, TFile } from 'obsidian';
import NeuroVoxPlugin from '../../main';

/**
 * Content to be inserted into a document
 */
export interface InsertContent {
    transcription: string;
    postProcessing?: string;
    /** Rendered as a warning callout beneath the transcript when post-processing failed. */
    postProcessingError?: string;
    audioFilePath?: string;
}

/**
 * Handles formatting and insertion of content into notes
 * Used by RecordingProcessor to insert transcriptions and post-processing
 */
export class DocumentInserter {
    constructor(private plugin: NeuroVoxPlugin) {}

    /**
     * Inserts formatted content at the specified position in a file
     * @param content The content to insert
     * @param file The target file
     * @param position The cursor position for insertion
     */
    public async insertContent(
        content: InsertContent,
        file: TFile,
        position: EditorPosition
    ): Promise<void> {
        try {
            const formattedContent = this.formatContent(content);
            await this.insertAtPosition(formattedContent, file, position);
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            new Notice(`Content insertion failed: ${message}`);
            throw error;
        }
    }

    /**
     * Checks if a format string uses Obsidian callout syntax
     */
    private isCalloutFormat(format: string): boolean {
        return format.includes('>[!');
    }

    /**
     * Formats lines based on whether callout syntax is being used
     * Ensures we don't double up on '>' characters
     */
    private formatLines(content: string, useCallout: boolean): string {
        return content.split('\n')
            .map(line => {
                if (!useCallout) return line;
                if (!line.trim()) return '>'; // Empty lines just get a single '>'
                // If line already starts with '>', return as is, otherwise add '>'
                return line.startsWith('>') ? line : `>${line}`;
            })
            .join('\n');
    }

    /**
     * Formats the content according to configured callout formats
     */
    private formatContent(content: InsertContent): string {
        let format = this.plugin.settings.transcriptionCalloutFormat;
        
        // If there's no audio file path, remove the audio file link from the format
        if (!content.audioFilePath) {
            format = format
                .replace(/!?\[\[{audioPath}\]\]\n?/, '') // Remove audio file link and optional newline
                .replace('[[{audioPath}]]', '') // Also try without newline
                .replace('{audioPath}', ''); // Fallback for any other format
        }
        
        // Format transcription content
        let formattedContent = format
            .replace('{audioPath}', content.audioFilePath || '')
            .replace('{transcription}', content.transcription);

        // Only use callout formatting if the format includes callout syntax
        const useTranscriptionCallout = this.isCalloutFormat(format);
        formattedContent = this.formatLines(formattedContent, useTranscriptionCallout);
        
        // Add post-processing if enabled
        if (this.plugin.settings.generatePostProcessing && content.postProcessing) {
            const postFormat = this.plugin.settings.postProcessingCalloutFormat;
            const usePostCallout = this.isCalloutFormat(postFormat);
            
            let postContent = postFormat
                .replace('{postProcessing}', content.postProcessing);
            
            postContent = this.formatLines(postContent, usePostCallout);
            formattedContent += '\n---\n' + postContent + '\n\n';
        } else if (content.postProcessingError) {
            // Say in the note itself that the summary is missing and why, so a silently
            // absent callout is never mistaken for "post-processing had nothing to add".
            formattedContent += '\n---\n' + this.formatFailureCallout(content.postProcessingError) + '\n\n';
        }
        
        return formattedContent + '\n';
    }

    /**
     * Renders a post-processing failure as an Obsidian warning callout. The transcript above
     * it is intact; this only explains the missing summary.
     */
    private formatFailureCallout(error: string): string {
        const body = error
            .split('\n')
            .map(line => `>${line.trim()}`)
            .join('\n');
        return `>[!warning]- Post-processing failed\n${body}\n>\n>The transcription above was saved. Check your post-processing model and API key in NeuroVox settings, then rerun post-processing if you want a summary.`;
    }

    /**
     * Inserts content at the specified position in a file
     */
    private async insertAtPosition(
        content: string,
        file: TFile,
        position: EditorPosition
    ): Promise<void> {
        const fileContent = await this.plugin.app.vault.read(file);
        const lines = fileContent.split('\n');
        const offset = lines
            .slice(0, position.line)
            .reduce((acc, line) => acc + line.length + 1, 0) + position.ch;
        
        const updatedContent = fileContent.slice(0, offset) + content + fileContent.slice(offset);
        await this.plugin.app.vault.modify(file, updatedContent);
    }
}
