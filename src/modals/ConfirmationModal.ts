import { App, Modal, ButtonComponent } from 'obsidian';

export interface ConfirmationOptions {
    title?: string;
    message: string;
    confirmText?: string;
    processOnlyText?: string;  // New option
    cancelText?: string;
}

export enum ConfirmationResult {
    SaveAndProcess,
    ProcessOnly,
    Cancel
}

export class ConfirmationModal extends Modal {
    private result: Promise<ConfirmationResult>;
    private resolvePromise: (value: ConfirmationResult) => void;
    private options: Required<ConfirmationOptions>;

    constructor(app: App, options: ConfirmationOptions) {
        super(app);

        this.options = {
            title: 'Recording Options',
            confirmText: 'Save and Process',
            processOnlyText: 'Process Only',
            cancelText: 'Cancel',
            ...options
        };

        this.result = new Promise((resolve) => {
            this.resolvePromise = resolve;
        });

        // Handle escape key and clicking outside modal
        this.modalEl.addEventListener('click', (event: MouseEvent) => {
            if (event.target === this.modalEl) {
                this.resolvePromise(ConfirmationResult.Cancel);
                this.close();
            }
        });
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass('neurovox-confirmation-modal');
        
        // Create modal content
        contentEl.createEl('h2', { text: this.options.title });
        contentEl.createEl('p', { text: this.options.message });
        
        // Create button container
        const buttonContainer = contentEl.createDiv({
            cls: 'neurovox-confirmation-buttons'
        });

        // Cancel button
        new ButtonComponent(buttonContainer)
            .setButtonText(this.options.cancelText)
            .setClass('neurovox-button-secondary')
            .onClick(() => {
                this.resolvePromise(ConfirmationResult.Cancel);
                this.close();
            });

        // Process only button
        new ButtonComponent(buttonContainer)
            .setButtonText(this.options.processOnlyText)
            .setClass('neurovox-button-warning')
            .onClick(() => {
                this.resolvePromise(ConfirmationResult.ProcessOnly);
                this.close();
            });

        // Save and process button
        new ButtonComponent(buttonContainer)
            .setButtonText(this.options.confirmText)
            .setClass('neurovox-button-primary')
            .setCta()
            .onClick(() => {
                this.resolvePromise(ConfirmationResult.SaveAndProcess);
                this.close();
            });
    }

    /**
     * Gets the user's choice from the confirmation dialog
     * @returns Promise resolving to true if confirmed, false if cancelled
     */
    public async getResult(): Promise<ConfirmationResult> {
        return this.result;
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
        
        // Ensure promise is resolved if modal is closed without selection
        if (this.resolvePromise) {
            this.resolvePromise(ConfirmationResult.Cancel);
        }
    }
}
