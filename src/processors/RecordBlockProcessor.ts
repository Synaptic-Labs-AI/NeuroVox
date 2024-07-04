import { MarkdownPostProcessorContext, Plugin, MarkdownRenderChild } from 'obsidian';
import { FloatingButton } from '../ui/FloatingButton';
import { NeuroVoxSettings } from '../settings/Settings';

interface NeuroVoxElement extends HTMLElement {
    neurovoxContentContainer?: HTMLDivElement;
    neurovoxFloatingButton?: FloatingButton;
}

/**
 * Registers a Markdown code block processor for the 'record' code block.
 * 
 * @param plugin - The NeuroVox plugin instance.
 * @param settings - The settings for the NeuroVox plugin.
 */
export function registerRecordBlockProcessor(plugin: Plugin, settings: NeuroVoxSettings): void {
    plugin.registerMarkdownCodeBlockProcessor('record', (source: string, el: NeuroVoxElement, ctx: MarkdownPostProcessorContext) => {
        // Create a container for the NeuroVox record content
        const contentContainer = el.createDiv({ cls: 'neurovox-record-content' });

        // Create and append the floating button to the element
        const floatingButton = new FloatingButton(plugin, settings);
        el.appendChild(floatingButton.buttonEl);

        // Store references to be able to update content later
        el.neurovoxContentContainer = contentContainer;
        el.neurovoxFloatingButton = floatingButton;

        // Add a MarkdownRenderChild to manage the lifecycle of the floating button
        ctx.addChild(new class extends MarkdownRenderChild {
            constructor(containerEl: HTMLElement) {
                super(containerEl);
            }

            onunload(): void {
                floatingButton.removeButton();
            }
        }(el));
    });
}