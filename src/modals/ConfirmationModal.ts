import { App, Modal, Platform } from 'obsidian';
import { TouchableButton } from '../ui/TouchableButton';

export interface ConfirmationOptions {
    title?: string;
    message: string;
    confirmText?: string;
    processOnlyText?: string;
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
    private isMobile: boolean;
    private buttons: TouchableButton[] = [];

    constructor(app: App, options: ConfirmationOptions) {
        super(app);

        // Use Obsidian's built-in platform detection for mobile
        this.isMobile = Platform.isMobile;

        // Merge default options
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

        this.setupBackdropInteraction();
    }

    private setupBackdropInteraction(): void {
        // Use a single 'pointerup' or 'click' event for the backdrop
        // to simplify cross-platform handling
        const closeOnBackdrop = (e: Event) => {
            if (e.target === this.modalEl) {
                e.preventDefault();
                e.stopPropagation();
                this.resolvePromise(ConfirmationResult.Cancel);
                this.close();
            }
        };

        // Enable the same event for both desktop and mobile
        // (pointerup evenly works across mouse, touch, pen, etc.)
        this.modalEl.addEventListener('pointerup', closeOnBackdrop, { passive: false });
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();

        // Add a container class to style for both desktop and mobile
        contentEl.addClass('confirmation-modal-container');
        if (this.isMobile) {
            contentEl.addClass('is-mobile');
        }

        // Title
        contentEl.createEl('h2', {
            text: this.options.title,
            cls: this.isMobile ? 'mobile-title' : ''
        });

        // Message
        contentEl.createEl('p', {
            text: this.options.message,
            cls: this.isMobile ? 'mobile-message' : ''
        });

        // Button container
        const buttonContainer = contentEl.createDiv({
            cls: `confirmation-buttons ${this.isMobile ? 'is-mobile' : ''}`
        });

        // Cancel button
        this.buttons.push(
            new TouchableButton({
                container: buttonContainer,
                text: this.options.cancelText,
                classes: ['neurovox-button-secondary'],
                onClick: () => {
                    this.resolvePromise(ConfirmationResult.Cancel);
                    this.close();
                }
            })
        );

        // Process Only button
        this.buttons.push(
            new TouchableButton({
                container: buttonContainer,
                text: this.options.processOnlyText,
                classes: ['neurovox-button-warning'],
                onClick: () => {
                    this.resolvePromise(ConfirmationResult.ProcessOnly);
                    this.close();
                }
            })
        );

        // Save and Process button
        this.buttons.push(
            new TouchableButton({
                container: buttonContainer,
                text: this.options.confirmText,
                classes: ['neurovox-button-primary'],
                isCta: true,
                onClick: () => {
                    this.resolvePromise(ConfirmationResult.SaveAndProcess);
                    this.close();
                }
            })
        );

        // For mobile, add extra classes
        if (this.isMobile) {
            this.buttons.forEach(btn => {
                btn.buttonEl.addClass('mobile-button');
            });
        }
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();

        // Clean up buttons
        this.buttons.forEach(btn => btn.cleanup());
        this.buttons = [];

        // If closed without explicit selection
        if (this.resolvePromise) {
            this.resolvePromise(ConfirmationResult.Cancel);
        }
    }

    public async getResult(): Promise<ConfirmationResult> {
        return this.result;
    }
}
