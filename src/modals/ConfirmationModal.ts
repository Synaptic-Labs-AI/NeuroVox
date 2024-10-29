import { App, Modal, ButtonComponent } from 'obsidian';

/**
 * Interface for configuration options of the confirmation dialog
 */
export interface ConfirmationOptions {
    title?: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
}

/**
 * A reusable confirmation dialog modal that returns a promise with the user's choice
 */
export class ConfirmationModal extends Modal {
    private result: Promise<boolean>;
    private resolvePromise: (value: boolean) => void;
    private options: Required<ConfirmationOptions>;

    constructor(app: App, options: ConfirmationOptions) {
        super(app);

        // Set default values for optional properties
        this.options = {
            title: 'Confirm Action',
            confirmText: 'Save Recording',
            cancelText: "Don't Save",
            ...options
        };

        this.result = new Promise((resolve) => {
            this.resolvePromise = resolve;
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
            .setClass('neurovox-button-danger')
            .onClick(() => {
                this.resolvePromise(false);
                this.close();
            });

        // Confirm button
        new ButtonComponent(buttonContainer)
            .setButtonText(this.options.confirmText)
            .setClass('neurovox-button-primary')
            .setCta()
            .onClick(() => {
                this.resolvePromise(true);
                this.close();
            });
    }

    /**
     * Gets the user's choice from the confirmation dialog
     * @returns Promise resolving to true if confirmed, false if cancelled
     */
    public async getResult(): Promise<boolean> {
        return this.result;
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}