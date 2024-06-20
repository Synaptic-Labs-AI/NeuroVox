// src/processors/RecordBlockProcessor.ts
import { Plugin } from 'obsidian';

export function registerRecordBlockProcessor(plugin: Plugin) {
    plugin.registerMarkdownCodeBlockProcessor('record', (source, el, ctx) => {
        el.createEl('p', { text: 'This is the record block' });
    });
}
