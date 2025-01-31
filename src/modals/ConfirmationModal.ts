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

/**
 * Modal for confirming user actions with enhanced mobile support
 * 📱 Added mobile-specific handling and UI adjustments
 */
export class ConfirmationModal extends Modal {
    private result: Promise<ConfirmationResult>;
    private resolvePromise: (value: ConfirmationResult) => void;
    private options: Required<ConfirmationOptions>;
    private isMobile: boolean;

    constructor(app: App, options: ConfirmationOptions) {
        super(app);
        
        this.isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
        
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

        this.setupModalInteractions();
    }

    /**
     * Sets up modal interaction handlers with mobile support
     * 📱 Enhanced touch event handling
     */
    private setupModalInteractions(): void {
        // Prevent touch events from bubbling on modal content
        this.contentEl.addEventListener('touchstart', (e) => {
            e.stopPropagation();
        }, { passive: true });

        // Handle clicks/touches outside modal
        const handleOutsideInteraction = (event: MouseEvent | TouchEvent) => {
            const target = event.target as HTMLElement;
            if (target === this.modalEl) {
                event.preventDefault();
                event.stopPropagation();
                this.resolvePromise(ConfirmationResult.Cancel);
                this.close();
            }
        };

        // Desktop mouse events
        this.modalEl.addEventListener('click', handleOutsideInteraction);
        
        // Mobile touch events
        this.modalEl.addEventListener('touchstart', handleOutsideInteraction, { passive: false });
        this.modalEl.addEventListener('touchend', (e) => e.preventDefault(), { passive: false });
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        
        // Add mobile-specific class
        contentEl.addClass('neurovox-confirmation-modal');
        if (this.isMobile) {
            contentEl.addClass('is-mobile');
        }
        
        // Create modal content with larger touch targets for mobile
        const titleEl = contentEl.createEl('h2', { 
            text: this.options.title,
            cls: this.isMobile ? 'mobile-title' : ''
        });

        const messageEl = contentEl.createEl('p', { 
            text: this.options.message,
            cls: this.isMobile ? 'mobile-message' : ''
        });
        
        // Create button container with mobile-optimized spacing
        const buttonContainer = contentEl.createDiv({
            cls: `neurovox-confirmation-buttons ${this.isMobile ? 'is-mobile' : ''}`
        });

        // Cancel button
        const cancelBtn = new ButtonComponent(buttonContainer)
            .setButtonText(this.options.cancelText)
            .setClass('neurovox-button-secondary')
            .onClick(() => {
                this.resolvePromise(ConfirmationResult.Cancel);
                this.close();
            });

        // Process only button
        const processBtn = new ButtonComponent(buttonContainer)
            .setButtonText(this.options.processOnlyText)
            .setClass('neurovox-button-warning')
            .onClick(() => {
                this.resolvePromise(ConfirmationResult.ProcessOnly);
                this.close();
            });

        // Save and process button
        const saveBtn = new ButtonComponent(buttonContainer)
            .setButtonText(this.options.confirmText)
            .setClass('neurovox-button-primary')
            .setCta()
            .onClick(() => {
                this.resolvePromise(ConfirmationResult.SaveAndProcess);
                this.close();
            });

        // Add mobile-specific button classes and event handling
        if (this.isMobile) {
            [cancelBtn, processBtn, saveBtn].forEach(btn => {
                btn.buttonEl.addClass('mobile-button');
                btn.buttonEl.addEventListener('touchstart', (e) => e.stopPropagation(), { passive: true });
            });
        }
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
