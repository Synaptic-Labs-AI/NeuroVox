import { App, TFile, TFolder } from 'obsidian';
import { NeuroVoxSettings } from '../settings/Settings';

/**
 * Saves an audio file to the specified location within the app's file system.
 * 
 * @param {App} app - The main application object which provides access to file management functions.
 * @param {Blob} audioBlob - The audio data as a Blob object to be saved.
 * @param {string} fileName - The desired name of the file including its extension.
 * @param {NeuroVoxSettings} settings - Configuration settings which include the path where the recording should be saved.
 * @returns {Promise<TFile>} A promise that resolves to the TFile object representing the saved file.
 * @throws {Error} Throws an error if the target path is not a folder.
 */
export async function saveAudioFile(app: App, audioBlob: Blob, fileName: string, settings: NeuroVoxSettings): Promise<TFile> {
    try {
        const folderPath = settings.recordingFolderPath;
        const filePath = `${folderPath}/${fileName}`;

        console.log(`Attempting to save audio file to path: ${filePath}`);

        await ensureDirectoryExists(app, folderPath);

        const arrayBuffer = await audioBlob.arrayBuffer();
        const uint8Array = new Uint8Array(arrayBuffer);

        console.log(`Writing file to vault at path: ${filePath}`);
        const file = await app.vault.createBinary(filePath, uint8Array);
        if (!file) {
            throw new Error('File creation failed and returned null');
        }
        console.log(`Successfully saved recording as ${file.path}`);
        return file;
    } catch (error) {
        console.error('Error saving audio file:', error);
        throw error;
    }
}

/**
 * Ensures that the directory specified by the folderPath exists.
 * Creates the directory if it does not exist.
 * 
 * @param {App} app - The main application object which provides access to file management functions.
 * @param {string} folderPath - The path of the folder to ensure exists.
 * @throws {Error} Throws an error if a part of the path is not a folder.
 */
async function ensureDirectoryExists(app: App, folderPath: string) {
    const parts = folderPath.split('/');
    let currentPath = '';

    for (const part of parts) {
        currentPath = currentPath ? `${currentPath}/${part}` : part;
        try {
            const folder = app.vault.getAbstractFileByPath(currentPath);
            if (!folder) {
                console.log(`Creating folder: ${currentPath}`);
                await app.vault.createFolder(currentPath);
            } else if (folder instanceof TFolder) {
                console.log(`Folder already exists: ${currentPath}`);
            } else {
                throw new Error(`${currentPath} is not a folder`);
            }
        } catch (error) {
            console.error(`Error ensuring directory exists: ${error.message}`);
            throw error;
        }
    }
}
