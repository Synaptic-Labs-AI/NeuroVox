import { ButtonComponent, setIcon } from 'obsidian';

interface TouchableButtonOptions {
    container: HTMLElement;
    text: string;
    icon?: string;
    classes?: string[];
    onClick: () => void;
    ariaLabel?: string;
    isCta?: boolean;
}

/**
 * A button component with enhanced touch handling for mobile devices
 * 📱 Optimized for touch interactions with debouncing and visual feedback
 */
export class TouchableButton extends ButtonComponent {
    private isProcessingAction = false;
    private readonly DEBOUNCE_TIME = 1000;
    private actionTimeout: NodeJS.Timeout | null = null;

    constructor(options: TouchableButtonOptions) {
        super(options.container);
        this.setupButton(options);
    }

    private setupButton(options: TouchableButtonOptions): void {
        // Set button text and classes
        this.setButtonText(options.text);
        
        if (options.icon) {
            setIcon(this.buttonEl, options.icon);
        }

        if (options.classes) {
            options.classes.forEach(cls => this.buttonEl.addClass(cls));
        }

        if (options.ariaLabel) {
            this.buttonEl.setAttribute('aria-label', options.ariaLabel);
        }

        if (options.isCta) {
            this.setCta();
        }

        // Add touch-specific classes and attributes
        this.buttonEl.addClass('touch-button');
        this.buttonEl.setAttribute('data-state', 'ready');
        this.buttonEl.setAttribute('role', 'button');
        this.buttonEl.setAttribute('tabindex', '0');

        // Set up touch handling
        this.setupTouchHandlers(options.onClick);
    }

    private setupTouchHandlers(onClick: () => void): void {
        let touchStartTime = 0;
        let isLongPress = false;

        // Handle touch start
        const handleTouchStart = (e: TouchEvent) => {
            e.preventDefault();
            e.stopPropagation();
            
            if (this.isProcessingAction) return;
            
            touchStartTime = Date.now();
            isLongPress = false;
            
            this.buttonEl.addClass('is-touching');
            
            // Detect long press
            setTimeout(() => {
                if (this.buttonEl.matches(':active')) {
                    isLongPress = true;
                    this.buttonEl.addClass('is-long-press');
                }
            }, 500);
        };
        
        // Handle touch end
        const handleTouchEnd = async (e: TouchEvent) => {
            e.preventDefault();
            e.stopPropagation();
            
            this.buttonEl.removeClass('is-touching');
            this.buttonEl.removeClass('is-long-press');
            
            if (this.isProcessingAction || isLongPress) return;
            
            const touchDuration = Date.now() - touchStartTime;
            if (touchDuration > 1000) return; // Ignore long touches
            
            // Process the action
            await this.processButtonAction(onClick);
        };
        
        // Handle touch cancel
        const handleTouchCancel = () => {
            this.buttonEl.removeClass('is-touching');
            this.buttonEl.removeClass('is-long-press');
        };
        
        // Add touch event listeners
        this.buttonEl.addEventListener('touchstart', handleTouchStart, { passive: false });
        this.buttonEl.addEventListener('touchend', handleTouchEnd, { passive: false });
        this.buttonEl.addEventListener('touchcancel', handleTouchCancel);
        
        // Override click handler for non-touch devices
        this.onClick(async (e) => {
            e.preventDefault();
            if (!this.isProcessingAction) {
                await this.processButtonAction(onClick);
            }
        });
    }

    /**
     * Processes button actions with proper state management and feedback
     * 🎯 Handles action processing with proper cleanup
     */
    private async processButtonAction(onClick: () => void): Promise<void> {
        if (this.isProcessingAction) return;

        // Visual feedback
        this.buttonEl.setAttribute('data-state', 'processing');
        this.buttonEl.addClass('is-processing');
        this.isProcessingAction = true;

        try {
            // Clear any existing timeout
            if (this.actionTimeout) {
                clearTimeout(this.actionTimeout);
            }

            // Execute the action
            await onClick();

            // Set debounce timeout
            this.actionTimeout = setTimeout(() => {
                this.isProcessingAction = false;
                this.buttonEl.setAttribute('data-state', 'ready');
                this.buttonEl.removeClass('is-processing');
            }, this.DEBOUNCE_TIME);

        } catch (error) {
            // Reset state on error
            this.isProcessingAction = false;
            this.buttonEl.setAttribute('data-state', 'error');
            this.buttonEl.addClass('has-error');
            
            // Clear error state after delay
            setTimeout(() => {
                this.buttonEl.setAttribute('data-state', 'ready');
                this.buttonEl.removeClass('has-error');
            }, 2000);
        }
    }

    /**
     * Cleanup resources and event listeners
     */
    public cleanup(): void {
        if (this.actionTimeout) {
            clearTimeout(this.actionTimeout);
            this.actionTimeout = null;
        }
        this.buttonEl.remove();
    }
}
