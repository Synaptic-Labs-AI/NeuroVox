import { App, TFile, TFolder } from 'obsidian';
import { NeuroVoxSettings } from '../settings/Settings';

/**
 * Ensures that the directory exists, creating it if necessary
 * @returns The normalized folder path
 */
async function ensureDirectoryExists(app: App, folderPath: string): Promise<string> {
    // Normalize the path and remove any leading/trailing slashes
    const normalizedPath = folderPath.replace(/^\/+|\/+$/g, '');
    
    if (!normalizedPath) {
        return ''; // Root folder
    }

    const parts = normalizedPath.split('/');
    let currentPath = '';

    for (const part of parts) {
        currentPath = currentPath ? `${currentPath}/${part}` : part;
        const folder = app.vault.getAbstractFileByPath(currentPath);
        
        if (!folder) {
            await app.vault.createFolder(currentPath);
        } else if (!(folder instanceof TFolder)) {
            throw new Error(`Path "${currentPath}" exists but is not a folder`);
        }
    }

    return normalizedPath;
}

/**
 * Saves an audio file to the specified location within the app's file system.
 */
export async function saveAudioFile(
    app: App, 
    audioBlob: Blob, 
    fileName: string, 
    settings: NeuroVoxSettings
): Promise<TFile | null> {
    // Ensure we have a folder path
    const folderPath = settings.recordingFolderPath || '';
    
    // Ensure the directory exists and get normalized path
    const normalizedFolder = await ensureDirectoryExists(app, folderPath);
    
    // Create the full file path
    const filePath = normalizedFolder 
        ? `${normalizedFolder}/${fileName}`
        : fileName;

    // Convert blob to array buffer
    const arrayBuffer = await audioBlob.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);

    // Create the file
    const file = await app.vault.createBinary(filePath, uint8Array);
    if (!file) {
        throw new Error(`Failed to create audio file: ${filePath}`);
    }

    return file;
}
