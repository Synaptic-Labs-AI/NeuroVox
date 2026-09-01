import NeuroVoxPlugin from '../../main';
import { saveAudioFile, ensureDirectoryExists } from '../FileUtils';
import { RecordingSink } from './RecordingArchive';

/** File extension for the audio container a blob's MIME type describes. */
const EXTENSION_BY_MIME: Record<string, string> = {
    'audio/wav': 'wav',
    'audio/x-wav': 'wav',
    'audio/wave': 'wav',
    'audio/webm': 'webm',
    'audio/mpeg': 'mp3',
    'audio/mp4': 'm4a',
    'audio/ogg': 'ogg'
};

/**
 * Manages audio file operations including naming, storage, and cleanup
 * Leverages FileUtils for core file operations while providing audio-specific functionality
 */
export class AudioFileManager implements RecordingSink {
    constructor(private plugin: NeuroVoxPlugin) {}

    /**
     * Saves an audio blob to the configured recordings folder with a unique name
     * @param audioBlob The audio data to save
     * @returns Path to the saved audio file
     */
    public async saveAudioFile(audioBlob: Blob): Promise<string> {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        return this.save(audioBlob, `recording-${timestamp}`, this.extensionFor(audioBlob));
    }

    /**
     * Writes audio into the recordings folder as `<baseName>.<extension>`, suffixing a
     * counter if that name is taken. Returns the vault path of the new file.
     */
    public async save(data: ArrayBuffer | Blob, baseName: string, extension: string): Promise<string> {
        // Ensure the recording folder exists
        const folderPath = this.plugin.settings.recordingFolderPath || '';
        await ensureDirectoryExists(this.plugin.app, folderPath);

        let fileName = `${baseName}.${extension}`;
        let filePath = folderPath ? `${folderPath}/${fileName}` : fileName;
        let count = 1;

        // Ensure unique filename. The vault index is the native source of truth for
        // vault content (adapter.exists hits the filesystem and can disagree with it).
        while (this.plugin.app.vault.getAbstractFileByPath(filePath)) {
            fileName = `${baseName}-${count}.${extension}`;
            filePath = folderPath ? `${folderPath}/${fileName}` : fileName;
            count++;
        }

        try {
            const blob = data instanceof Blob ? data : new Blob([data]);
            // Use FileUtils to save the audio file
            const file = await saveAudioFile(
                this.plugin.app,
                blob,
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
     * Picks the extension matching the blob's container. The recorder produces PCM WAV, so
     * defaulting to the MIME-derived extension keeps the saved file playable in Obsidian.
     */
    private extensionFor(blob: Blob): string {
        return EXTENSION_BY_MIME[blob.type.split(';')[0].trim().toLowerCase()] || 'wav';
    }
}
