// src/utils/FileUtils.ts
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
    const fileManager = app.fileManager;
    let filePath = await fileManager.getAvailablePathForAttachment(fileName);

    // prepend the folder path from settings to the file path
    const folderPath = settings.recordingFolderPath;
    filePath = `${folderPath}/${filePath}`;

    // Check if the specified folder exists, if not, create it
    const folder = app.vault.getAbstractFileByPath(folderPath);
    if (!folder) {
        console.log(`Folder ${folderPath} does not exist. Creating...`);
        await app.vault.createFolder(folderPath);
    } else if (!(folder instanceof TFolder)) {
        throw new Error(`${folderPath} is not a folder`);
    }

    const arrayBuffer = await audioBlob.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);

    const existingFile = app.vault.getAbstractFileByPath(filePath);
    if (existingFile) {
        // If the file already exists, remove it first
        await app.vault.delete(existingFile);
    }

    const file = await app.vault.createBinary(filePath, uint8Array);
    console.log(`Saved recording as ${file.path}`);
    return file;
}
