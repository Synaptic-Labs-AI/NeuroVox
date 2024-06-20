// src/processors/RecordBlockProcessor.ts
import { Plugin } from 'obsidian';

/**
 * Registers a markdown code block processor for the 'record' type.
 * 
 * @param {Plugin} plugin - The plugin instance where the processor is to be registered.
 */
export function registerRecordBlockProcessor(plugin: Plugin) {
    plugin.registerMarkdownCodeBlockProcessor('record', (source, el, ctx) => {
        el.createEl('p', { text: 'This is the record block' });
    });
}
