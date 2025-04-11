import { TFile } from 'obsidian';
import NeuroVoxPlugin from '../../main';
import { saveAudioFile, ensureDirectoryExists } from '../FileUtils';

/**
 * Manages audio file operations including naming, storage, and cleanup
 * Leverages FileUtils for core file operations while providing audio-specific functionality
 */
export class AudioFileManager {
    constructor(private plugin: NeuroVoxPlugin) {}

    /**
     * Saves an audio blob to the configured recordings folder with a unique name
     * @param audioBlob The audio data to save
     * @returns Path to the saved audio file
     */
    public async saveAudioFile(audioBlob: Blob): Promise<string> {
        // Ensure the recording folder exists
        const folderPath = this.plugin.settings.recordingFolderPath || '';
        await ensureDirectoryExists(this.plugin.app, folderPath);
        
        // Generate a unique filename with timestamp
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const baseFileName = `recording-${timestamp}.webm`;
        let fileName = baseFileName;
        let filePath = folderPath ? `${folderPath}/${fileName}` : fileName;
        let count = 1;

        // Ensure unique filename
        while (await this.plugin.app.vault.adapter.exists(filePath)) {
            fileName = `recording-${timestamp}-${count}.webm`;
            filePath = folderPath ? `${folderPath}/${fileName}` : fileName;
            count++;
        }

        try {
            // Use FileUtils to save the audio file
            const file = await saveAudioFile(
                this.plugin.app,
                audioBlob,
                fileName,
                this.plugin.settings
            );
            
            if (!file) {
                throw new Error('Failed to create audio file');
            }

            return file.path;
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            throw new Error(`Failed to save audio file: ${message}`);
        }
    }

    /**
     * Removes temporary chunk files after processing is complete
     * @param paths Array of file paths to remove
     */
    public async removeTemporaryFiles(paths: string[]): Promise<void> {
        for (const path of paths) {
            try {
                await this.plugin.app.vault.adapter.remove(path);
            } catch (error) {
                console.error(`Failed to remove temporary file ${path}:`, error);
            }
        }
    }
}
