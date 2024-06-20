// src/commands/SimpleCommand.ts
import { Notice } from 'obsidian';
import NeuroVoxPlugin from '../main';

/**
 * Registers a simple command with the NeuroVoxPlugin instance.
 * 
 * @param {NeuroVoxPlugin} plugin - The plugin instance to which the command will be added.
 */
export function registerSimpleCommand(plugin: NeuroVoxPlugin) {
    plugin.addCommand({
        id: 'open-sample-modal-simple',
        name: 'Open sample modal (simple)',
        callback: () => {
            new Notice('This is a notice!');
        }
    });
}
