// src/commands/SimpleCommand.ts
import { Notice } from 'obsidian';
import NeuroVoxPlugin from '../main';

export function registerSimpleCommand(plugin: NeuroVoxPlugin) {
    plugin.addCommand({
        id: 'open-sample-modal-simple',
        name: 'Open sample modal (simple)',
        callback: () => {
            new Notice('This is a notice!');
        }
    });
}
