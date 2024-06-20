// src/processors/RecordBlockProcessor.ts

import { MarkdownPostProcessorContext, Plugin, MarkdownRenderChild } from 'obsidian';
import { FloatingButton } from '../ui/FloatingButton';
import { NeuroVoxSettings } from '../settings/Settings';

export function registerRecordBlockProcessor(plugin: Plugin, settings: NeuroVoxSettings) {
    plugin.registerMarkdownCodeBlockProcessor('record', (source, el, ctx) => {
        const contentContainer = el.createDiv({ cls: 'neurovox-record-content' });
        const floatingButton = new FloatingButton(plugin, settings, contentContainer);
        
        el.appendChild(floatingButton.buttonEl);

        // Store references to be able to update content later
        (el as any).neurovoxContentContainer = contentContainer;
        (el as any).neurovoxFloatingButton = floatingButton;

        ctx.addChild(new class extends MarkdownRenderChild {
            constructor(containerEl: HTMLElement) {
                super(containerEl);
            }

            onunload() {
                floatingButton.removeButton();
            }
        }(el));
    });
}