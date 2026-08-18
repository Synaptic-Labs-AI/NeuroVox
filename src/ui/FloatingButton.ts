// src/ui/FloatingButton.ts

import { MarkdownView, Notice, Platform, setIcon } from 'obsidian';
import { ButtonPositionManager } from '../utils/ButtonPositionManager';
import { PluginData, Position } from '../types';
import NeuroVoxPlugin from '../main'; // Import the actual class instead of interface
import { AudioRecordingManager } from '../utils/RecordingManager';

export class FloatingButton {
    private static instance: FloatingButton | null = null;
    public buttonEl: HTMLButtonElement | null;
    public containerEl: HTMLDivElement | null;
    public activeLeafContainer: HTMLElement | null = null;
    public resizeObserver: ResizeObserver | null = null;
    public positionManager: ButtonPositionManager | null = null;
    public resizeTimeout: number | null = null;
    public audioManager: AudioRecordingManager | null = null;
    public isRecording: boolean = false;
    public isProcessing: boolean = false;

    /** Bottom bars that the floating button must stay clear of on mobile. */
    private static readonly MOBILE_BAR_SELECTORS = '.mobile-navbar, .mobile-tab-bar';

    public constructor(
        public plugin: NeuroVoxPlugin,
        public pluginData: PluginData,
        public onClickCallback: () => void
    ) {
        // Ensure only one instance exists
        if (FloatingButton.instance) {
            FloatingButton.instance.remove();
        }
        this.buttonEl = null;
        this.containerEl = null;
        this.initializeComponents();
    }

    public static getInstance(
        plugin: NeuroVoxPlugin,
        pluginData: PluginData,
        onClickCallback: () => void
    ): FloatingButton {
        if (!FloatingButton.instance || FloatingButton.instance.isInvalid()) {
            if (FloatingButton.instance) {
                FloatingButton.instance.remove();
            }
            FloatingButton.instance = new FloatingButton(plugin, pluginData, onClickCallback);
        }
        return FloatingButton.instance;
    }

    private isInvalid(): boolean {
        return !this.containerEl?.isConnected || !this.buttonEl?.isConnected;
    }

    /**
     * Reads a numeric CSS custom property. Variables are read from the body so
     * that platform specific overrides (e.g. `body.is-mobile`) are picked up.
     */
    private getCssNumber(name: string, fallback: number): number {
        const value = parseInt(getComputedStyle(document.body).getPropertyValue(name));
        return Number.isFinite(value) ? value : fallback;
    }

    public getComputedSize(): number {
        return this.getCssNumber('--neurovox-floating-button-size', 48);
    }

    public getComputedMargin(): number {
        return this.getCssNumber('--neurovox-button-margin', 20);
    }

    public getComputedResizeDelay(): number {
        return this.getCssNumber('--neurovox-resize-delay', 100);
    }

    /**
     * Space to keep free at the bottom of the note so the button never lands
     * under Obsidian's mobile navigation bar. The bar is measured when it can
     * be found, otherwise the platform fallback in styles.css is used.
     */
    public getBottomInset(): number {
        const fallback = this.getCssNumber('--neurovox-button-bottom-inset', 0);

        if (!this.activeLeafContainer) return fallback;

        const containerRect = this.activeLeafContainer.getBoundingClientRect();
        if (containerRect.height === 0) return fallback;

        let measured = 0;
        document.body.querySelectorAll(FloatingButton.MOBILE_BAR_SELECTORS).forEach(bar => {
            if (!bar.instanceOf(HTMLElement) || bar.offsetParent === null) return;
            const barRect = bar.getBoundingClientRect();
            if (barRect.height === 0) return;
            // Only the part of the bar that overlaps the note counts.
            measured = Math.max(measured, containerRect.bottom - barRect.top);
        });

        return Math.min(
            Math.max(measured, fallback),
            Math.max(containerRect.height / 2, 0)
        );
    }

    public initializeComponents(): void {
        this.setupResizeObserver();
        this.createElements();
        this.setupWorkspaceEvents();
    }

    public setupResizeObserver(): void {
        this.resizeObserver = new ResizeObserver(() => {
            if (this.activeLeafContainer && this.pluginData.showFloatingButton) {
                window.requestAnimationFrame(() => {
                    this.refreshBounds();
                });
            }
        });
    }

    public createElements(): void {
        this.createContainer();
        this.createButton();
        this.attachToActiveLeaf();
        // Initialize Position Manager AFTER attaching to active leaf
        // to ensure activeLeafContainer is available
    }

    public createContainer(): void {
        this.containerEl = createDiv();
        this.containerEl.classList.add('neurovox-button-container');
    }

    /* Handles button click events independently of drag behavior.
    * This ensures recording only starts on direct clicks, not after drags.
    */
    public createButton(): void {
        if (!this.containerEl) return;
        
        this.buttonEl = createEl('button');
        this.buttonEl.classList.add('neurovox-button', 'floating');
        this.buttonEl.setAttribute('aria-label', 'Start recording (drag to move)');
        setIcon(this.buttonEl, 'mic');
        
        // Modify click handler to check drag state
        this.buttonEl.addEventListener('click', (event: MouseEvent) => {
            // Stop if we're dragging or just finished dragging
            if (this.positionManager?.isDragging || this.positionManager?.hasMoved) {
                event.preventDefault();
                event.stopPropagation();
                return;
            }
            void this.handleClick(event);
        });
        
        this.updateButtonColor();
        this.containerEl.appendChild(this.buttonEl);
    }

    public async initializePositionManager(): Promise<void> {
        if (!this.containerEl || !this.buttonEl || !this.activeLeafContainer) return;

        this.positionManager = new ButtonPositionManager(
            this.containerEl,
            this.buttonEl,
            this.activeLeafContainer,
            this.getComputedSize(),
            this.getComputedMargin(),
            this.getBottomInset(),
            this.handlePositionChange.bind(this),
            (position: Position) => { void this.handleDragEnd(position); },
            this.onClickCallback
        );

        // Use a short timeout to ensure the container is rendered
        window.setTimeout(() => {
            void this.setInitialPosition();
        }, 0);
    }

    public handlePositionChange(x: number, y: number): void {
        if (!this.containerEl) return;
        
        window.requestAnimationFrame(() => {
            if (this.containerEl) {
                this.containerEl.style.transform = `translate3d(${x}px, ${y}px, 0)`;
            }
        });
    }

    public async handleDragEnd(position: Position): Promise<void> {
        this.pluginData.buttonPosition = position; // Directly update pluginData
        await this.plugin.saveSettings(); // Save all data
    }

    /**
     * The area the button may occupy inside the note, with the mobile
     * navigation bar excluded from the bottom.
     */
    private getBounds(): { minX: number; minY: number; maxX: number; maxY: number } | null {
        if (!this.activeLeafContainer) return null;

        const containerRect = this.activeLeafContainer.getBoundingClientRect();
        const size = this.getComputedSize();
        const margin = this.getComputedMargin();

        return {
            minX: margin,
            minY: margin,
            maxX: Math.max(margin, containerRect.width - size - margin),
            maxY: Math.max(margin, containerRect.height - size - margin - this.getBottomInset())
        };
    }

    /**
     * Re-measures the mobile navigation bar and keeps the button inside the
     * usable area (the bar can appear, resize, or hide at any time).
     */
    public refreshBounds(): void {
        if (!this.positionManager) return;
        this.positionManager.setBottomInset(this.getBottomInset());
        this.positionManager.constrainPosition();
    }

    public async setInitialPosition(): Promise<void> {
        const savedPosition = this.pluginData.buttonPosition;
        const bounds = this.getBounds();

        if (savedPosition && bounds && this.positionManager) {
            // Keep the saved spot, but pull it back inside the usable area so
            // buttons saved before the mobile bar existed are lifted above it.
            const x = Math.min(Math.max(savedPosition.x, bounds.minX), bounds.maxX);
            const y = Math.min(Math.max(savedPosition.y, bounds.minY), bounds.maxY);

            window.requestAnimationFrame(() => {
                if (this.positionManager) {
                    this.positionManager.setPosition(x, y, true);
                }
            });
        } else {
            await this.setDefaultPosition();
        }
    }

    /**
     * Default spot. On mobile the button is horizontally centered and raised
     * above Obsidian's navigation bar; on desktop, where no bar is in the way,
     * it stays in the bottom right corner.
     */
    public async setDefaultPosition(): Promise<void> {
        const bounds = this.getBounds();
        if (!bounds || !this.activeLeafContainer || !this.positionManager) {
            return;
        }

        const containerRect = this.activeLeafContainer.getBoundingClientRect();
        const preferredX = Platform.isMobile
            ? (containerRect.width - this.getComputedSize()) / 2
            : bounds.maxX;

        const x = Math.min(Math.max(preferredX, bounds.minX), bounds.maxX);
        const y = bounds.maxY;

        window.requestAnimationFrame(() => {
            if (this.positionManager) {
                this.positionManager.setPosition(x, y, true);
                // Save default position to pluginData
                this.pluginData.buttonPosition = { x, y };
                void this.plugin.saveSettings();
            }
        });
    }

    public setupWorkspaceEvents(): void {
        this.registerActiveLeafChangeEvent();
        this.registerLayoutChangeEvent();
        this.registerResizeEvent();
    }

    public registerActiveLeafChangeEvent(): void {
        this.plugin.registerEvent(
            this.plugin.app.workspace.on('active-leaf-change', () => {
                window.requestAnimationFrame(() => this.attachToActiveLeaf());
            })
        );
    }

    public registerLayoutChangeEvent(): void {
        this.plugin.registerEvent(
            this.plugin.app.workspace.on('layout-change', () => {
                window.requestAnimationFrame(() => {
                    if (this.positionManager && this.activeLeafContainer) {
                        this.positionManager.setBottomInset(this.getBottomInset());
                        this.positionManager.updateContainer(this.activeLeafContainer);
                    }
                });
            })
        );
    }

    public registerResizeEvent(): void {
        this.plugin.registerEvent(
            this.plugin.app.workspace.on('resize', () => {
                if (this.resizeTimeout) {
                    window.clearTimeout(this.resizeTimeout);
                }
                this.resizeTimeout = window.setTimeout(() => {
                    if (this.activeLeafContainer && this.positionManager) {
                        window.requestAnimationFrame(() => {
                            if (this.positionManager && this.activeLeafContainer) {
                                this.positionManager.setBottomInset(this.getBottomInset());
                                this.positionManager.updateContainer(this.activeLeafContainer);
                            }
                        });
                    }
                }, this.getComputedResizeDelay());
            })
        );
    }

    public attachToActiveLeaf(): void {
        const activeLeaf = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
        if (!activeLeaf) {
            this.hide();
            return;
        }

        const viewContent = activeLeaf.containerEl.querySelector('.view-content');
        if (!(viewContent instanceof HTMLElement)) {
            this.hide();
            return;
        }

        // Remove all existing floating buttons from this view
        const existingButtons = viewContent.querySelectorAll('.neurovox-button-container');
        existingButtons.forEach(el => {
            if (el !== this.containerEl) {
                el.remove();
            }
        });

        // Create and attach our container if needed
        if (!this.containerEl) {
            this.createContainer();
            this.createButton();
        }

        // Always attach to the current view content
        if (this.containerEl && this.containerEl.parentNode !== viewContent) {
            // Remove from old parent if needed
            if (this.containerEl.parentNode) {
                this.containerEl.remove();
            }
            viewContent.appendChild(this.containerEl);
        }

        // Initialize position manager
        this.activeLeafContainer = viewContent;
        void this.initializePositionManager();

        // Only show the button if the setting is enabled
        if (this.plugin.settings.showFloatingButton) {
            this.show();
        } else {
            this.hide();
        }
    }

    /**
     * Handles updating the active container when switching notes
     */
    public updateActiveContainer(newContainer: HTMLElement): void {
        // Remove observer from old container
        if (this.activeLeafContainer) {
            this.resizeObserver?.unobserve(this.activeLeafContainer);
        }

        this.activeLeafContainer = newContainer;
        if (this.containerEl) {
            newContainer.appendChild(this.containerEl);
        }
        this.resizeObserver?.observe(newContainer);

        // Always initialize position manager
        void this.initializePositionManager();
        
        // Only show the button if the setting is enabled
        if (this.plugin.settings.showFloatingButton) {
            this.show();
        } else {
            this.hide();
        }
    }

    public updateButtonColor(): void {
        if (!this.buttonEl) return;
        const color = this.pluginData.micButtonColor;
        this.buttonEl.style.setProperty('--neurovox-button-color', color);
    }

    public getCurrentPosition(): Position {
        if (!this.positionManager) {
            return this.pluginData.buttonPosition || { x: 100, y: 100 };
        }
        return this.positionManager.getCurrentPosition();
    }

    public show(): void {
        if (!this.containerEl) return;
        
        this.containerEl.removeClass('neurovox-hidden');
        window.requestAnimationFrame(() => {
            if (this.containerEl) {
                this.containerEl.addClass('is-visible');
                this.refreshBounds();
            }
        });
    }

    public hide(): void {
        if (!this.containerEl) return;
        this.containerEl.addClass('neurovox-hidden');
        this.containerEl.removeClass('is-visible');
    }

    public remove(): void {
        // Clear any active timers
        if (this.resizeTimeout) {
            window.clearTimeout(this.resizeTimeout);
            this.resizeTimeout = null;
        }
        
        // Clean up position manager
        if (this.positionManager) {
            this.positionManager.cleanup();
            this.positionManager = null;
        }
        
        // Clean up resize observer
        if (this.resizeObserver) {
            this.resizeObserver.disconnect();
            this.resizeObserver = null;
        }
        
        // Clean up audio resources
        this.cleanup();
        
        // Remove event listeners and element
        if (this.buttonEl) {
            this.buttonEl.remove();
            this.buttonEl = null;
        }
        
        // Remove container element
        if (this.containerEl) {
            this.containerEl.remove();
            this.containerEl = null;
        }

        // Only clear the instance if this is the current instance
        if (FloatingButton.instance === this) {
            FloatingButton.instance = null;
        }
    }

    /**
     * Handles click based on current recording mode
     */
    public async handleClick(event?: MouseEvent) {
        if (this.isProcessing) return;

        if (this.pluginData.useRecordingModal) {
            // Stop event propagation
            event?.stopPropagation();
            this.onClickCallback();
            return;
        }
    
        // Direct recording mode
        if (!this.isRecording) {
            await this.startDirectRecording();
        } else {
            await this.stopDirectRecording();
        }
    }

    /**
     * Starts direct recording mode
     */
    public async startDirectRecording() {
        try {            if (!this.audioManager) {
                this.audioManager = new AudioRecordingManager(this.plugin);
                await this.audioManager.initialize();
            }
    
            this.audioManager.start();
            this.isRecording = true;
            this.updateRecordingState(true);
            new Notice('Recording started');
        } catch {
            new Notice('Failed to start recording');
            this.cleanup();
        }
    }
    
    private async stopDirectRecording() {
        try {
            if (!this.audioManager) {
                throw new Error('Audio manager not initialized');
            }
    
            // Immediately update recording state
            this.isRecording = false;
            this.updateRecordingState(false);
    
            // Get the audio blob
            const blob = await this.audioManager.stop();
            if (!blob) return;
    
            // Then start processing
            this.isProcessing = true;
            this.updateProcessingState(true);
            
            const activeView = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
            if (!activeView || !activeView.file) {
                new Notice('No active file to insert recording');
                return;
            }
    
            await this.plugin.recordingProcessor.processRecording(
                blob,
                activeView.file,
                activeView.editor.getCursor()
            );
        } catch {
            new Notice('Failed to stop recording');
        } finally {
            this.cleanup();
        }
    }

    /**
     * Updates the visual state for recording
     */
    private updateRecordingState(isRecording: boolean) {
        if (!this.buttonEl) return;
        
        if (isRecording) {
            this.buttonEl.addClass('recording');
        } else {
            this.buttonEl.removeClass('recording');
        }
        
        this.buttonEl.setAttribute('aria-label', 
            isRecording ? 'Stop recording' : 'Start recording'
        );
    }
    
    private updateProcessingState(isProcessing: boolean) {
        if (!this.buttonEl) return;
        this.buttonEl.toggleClass('processing', isProcessing);
    }
    
    private cleanup() {
        this.isRecording = false;
        this.isProcessing = false;
        this.updateRecordingState(false);
        this.updateProcessingState(false);
        
        if (this.audioManager) {
            this.audioManager.cleanup();
            this.audioManager = null;
        }
    }
}
