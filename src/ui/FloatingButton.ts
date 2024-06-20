// src/ui/FloatingButton.ts
import { Plugin, WorkspaceLeaf, Notice } from 'obsidian';
import { TimerModal } from '../modals/TimerModal';
import { createButtonWithSvgIcon } from '../utils/SvgUtils';
import { saveAudioFile } from '../utils/FileUtils'; // Make sure to import your file-saving utility
import { icons } from 'src/assets/icons';
import { NeuroVoxSettings } from '../settings/Settings'; // Import the settings type

export class FloatingButton {
    private plugin: Plugin;
    private settings: NeuroVoxSettings; // Add a field to hold the settings
    public buttonEl: HTMLButtonElement;

    constructor(plugin: Plugin, settings: NeuroVoxSettings) { // Accept settings in the constructor
        this.plugin = plugin;
        this.settings = settings; // Assign settings to the field
        this.createButton();
        this.registerEvents();
    }

    private createButton() {
        this.buttonEl = createButtonWithSvgIcon(icons.microphone);
        this.buttonEl.classList.add('neurovox-button', 'floating');
        this.buttonEl.style.display = 'none'; // Initially hidden

        this.buttonEl.addEventListener('click', () => {
            const modal = new TimerModal(this.plugin.app);
            modal.open();
            modal.onStop = async (audioBlob: Blob) => {
                const fileName = `recording-${Date.now()}.mp3`;
                const file = await saveAudioFile(this.plugin.app, audioBlob, fileName, this.settings); // Pass settings here
                new Notice(`Saved recording as ${file.path}`);
            };
        });

        document.body.appendChild(this.buttonEl);
    }

    private registerEvents() {
        this.plugin.registerEvent(this.plugin.app.workspace.on('active-leaf-change', this.toggleButtonVisibility.bind(this)));
    }

    private toggleButtonVisibility(leaf: WorkspaceLeaf | null) {
        const currentButtonParent = this.buttonEl.parentElement;
        if (currentButtonParent) {
            currentButtonParent.removeChild(this.buttonEl);
        }

        if (leaf && leaf.view && leaf.view.getViewType() === 'markdown') {
            const viewContent = leaf.view.containerEl.querySelector('.view-content');
            if (viewContent) {
                viewContent.appendChild(this.buttonEl);
                this.buttonEl.style.display = 'flex';
            }
        } else {
            this.buttonEl.style.display = 'none';
        }
    }
}
