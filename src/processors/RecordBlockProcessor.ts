import { MarkdownPostProcessorContext, Plugin, MarkdownRenderChild } from 'obsidian';
import { FloatingButton } from '../ui/FloatingButton';
import { NeuroVoxSettings } from '../settings/Settings';

/**
 * Registers a Markdown code block processor for the 'record' code block.
 * 
 * @param {Plugin} plugin - The NeuroVox plugin instance.
 * @param {NeuroVoxSettings} settings - The settings for the NeuroVox plugin.
 */
export function registerRecordBlockProcessor(plugin: Plugin, settings: NeuroVoxSettings) {
    plugin.registerMarkdownCodeBlockProcessor('record', (source, el, ctx) => {
        // Create a container for the NeuroVox record content
        const contentContainer = el.createDiv({ cls: 'neurovox-record-content' });

        // Create and append the floating button to the element
        const floatingButton = new FloatingButton(plugin, settings);
        el.appendChild(floatingButton.buttonEl);

        // Store references to be able to update content later
        (el as any).neurovoxContentContainer = contentContainer;
        (el as any).neurovoxFloatingButton = floatingButton;

        // Add a MarkdownRenderChild to manage the lifecycle of the floating button
        ctx.addChild(new class extends MarkdownRenderChild {
            constructor(containerEl: HTMLElement) {
                super(containerEl);
            }

            // Remove the floating button when the MarkdownRenderChild is unloaded
            onunload() {
                floatingButton.removeButton();
            }
        }(el));
    });
}
