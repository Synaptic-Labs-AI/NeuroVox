// src/ui/FloatingButton.ts

import { MarkdownView, Notice, setIcon } from 'obsidian';
import NeuroVoxPlugin from '../main';
import { ButtonPositionManager } from '../utils/ButtonPositionManager';
import { PluginData, Position } from '../types'; // Import PluginData and Position
import { AudioRecordingManager } from '../utils/RecordingManager';
import { RecordingProcessor } from '../utils/RecordingProcessor';

export class FloatingButton {
    // Update property types to allow null
    public buttonEl: HTMLButtonElement | null = null;
    public containerEl: HTMLDivElement | null = null;
    public activeLeafContainer: HTMLElement | null = null;
    public resizeObserver: ResizeObserver | null = null;
    public positionManager: ButtonPositionManager | null = null;
    public resizeTimeout: NodeJS.Timeout | null = null;
    public audioManager: AudioRecordingManager | null = null;
    public isRecording: boolean = false;
    public isProcessing: boolean = false;

    public constructor(
        public plugin: NeuroVoxPlugin,
        public pluginData: PluginData,
        public onClickCallback: () => void
    ) {
        this.initializeComponents();
    }

    // Remove getInstance method

    public getComputedSize(): number {
        const computedStyle = getComputedStyle(document.documentElement);
        return parseInt(computedStyle.getPropertyValue('--neurovox-button-size')) || 48;
    }

    public getComputedMargin(): number {
        const computedStyle = getComputedStyle(document.documentElement);
        return parseInt(computedStyle.getPropertyValue('--neurovox-button-margin')) || 20;
    }

    public getComputedResizeDelay(): number {
        const computedStyle = getComputedStyle(document.documentElement);
        return parseInt(computedStyle.getPropertyValue('--neurovox-resize-delay')) || 100;
    }

    public initializeComponents(): void {
        this.setupResizeObserver();
        this.createElements();
        this.setupWorkspaceEvents();
    }

    public setupResizeObserver(): void {
        this.resizeObserver = new ResizeObserver(() => {
            if (this.activeLeafContainer && this.pluginData.showFloatingButton) {
                requestAnimationFrame(() => {
                    if (this.positionManager) {
                        this.positionManager.constrainPosition();
                    }
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
        this.containerEl = document.createElement('div');
        this.containerEl.classList.add('neurovox-button-container');
    }

    /* Handles button click events independently of drag behavior.
    * This ensures recording only starts on direct clicks, not after drags.
    */
    public createButton(): void {
        if (!this.containerEl) return;
        
        this.buttonEl = document.createElement('button');
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
            this.handleClick();
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
            this.handlePositionChange.bind(this),
            this.handleDragEnd.bind(this),
            this.onClickCallback
        );

        // Use a short timeout to ensure the container is rendered
        setTimeout(async () => {
            await this.setInitialPosition();
        }, 0);
    }

    public handlePositionChange(x: number, y: number): void {
        if (!this.containerEl) return;
        
        requestAnimationFrame(() => {
            if (this.containerEl) {
                this.containerEl.style.transform = `translate3d(${x}px, ${y}px, 0)`;
            }
        });
    }

    public async handleDragEnd(position: Position): Promise<void> {
        this.pluginData.buttonPosition = position; // Directly update pluginData
        await this.plugin.savePluginData(); // Save all data
    }

    public async setInitialPosition(): Promise<void> {
        const savedPosition = this.pluginData.buttonPosition;

        if (savedPosition && this.activeLeafContainer && this.positionManager) {
            const containerRect = this.activeLeafContainer.getBoundingClientRect();
            
            // Validate saved position is within bounds
            const x = Math.min(
                Math.max(savedPosition.x, this.getComputedMargin()),
                containerRect.width - this.getComputedSize() - this.getComputedMargin()
            );
            const y = Math.min(
                Math.max(savedPosition.y, this.getComputedMargin()),
                containerRect.height - this.getComputedSize() - this.getComputedMargin()
            );

            requestAnimationFrame(() => {
                if (this.positionManager) {
                    this.positionManager.setPosition(x, y, true);
                }
            });
        } else {
            await this.setDefaultPosition();
        }
    }

    public async setDefaultPosition(): Promise<void> {
        if (!this.activeLeafContainer || !this.positionManager) {
            return;
        }

        const containerRect = this.activeLeafContainer.getBoundingClientRect();
        const x = containerRect.width - this.getComputedSize() - this.getComputedMargin();
        const y = containerRect.height - this.getComputedSize() - this.getComputedMargin();

        requestAnimationFrame(() => {
            if (this.positionManager) {
                this.positionManager.setPosition(x, y, true);
                // Save default position to pluginData
                this.pluginData.buttonPosition = { x, y };
                this.plugin.savePluginData();
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
                requestAnimationFrame(() => this.attachToActiveLeaf());
            })
        );
    }

    public registerLayoutChangeEvent(): void {
        this.plugin.registerEvent(
            this.plugin.app.workspace.on('layout-change', () => {
                requestAnimationFrame(() => {
                    if (this.activeLeafContainer && this.positionManager) {
                        if (this.positionManager && this.activeLeafContainer) {
                            if (this.positionManager && this.activeLeafContainer) {
                                if (this.positionManager && this.activeLeafContainer) {
                                    this.positionManager.updateContainer(this.activeLeafContainer);
                                }
                            }
                        }
                    }
                });
            })
        );
    }

    public registerResizeEvent(): void {
        this.plugin.registerEvent(
            this.plugin.app.workspace.on('resize', () => {
                if (this.resizeTimeout) {
                    clearTimeout(this.resizeTimeout);
                }
                this.resizeTimeout = setTimeout(() => {
                    if (this.activeLeafContainer && this.positionManager) {
                        requestAnimationFrame(() => {
                            if (this.positionManager && this.activeLeafContainer) {
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

        // Remove from old container first
        if (this.containerEl?.parentNode) {
            this.containerEl.remove();
        }

        // Update container and reattach
        this.updateActiveContainer(viewContent);
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

        if (this.pluginData.showFloatingButton) {
            this.show();
            this.initializePositionManager();
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
        if (!this.containerEl || !this.pluginData.showFloatingButton) return;
        
        this.containerEl.style.display = 'block';
        requestAnimationFrame(() => {
            if (this.containerEl) {
                this.containerEl.style.opacity = '1';
                if (this.positionManager) {
                    this.positionManager.constrainPosition();
                }
            }
        });
    }

    public hide(): void {
        if (!this.containerEl) return;
        this.containerEl.style.display = 'none';
        this.containerEl.style.opacity = '0';
    }

    public remove(): void {
        // Clear any active timers
        if (this.resizeTimeout) {
            clearTimeout(this.resizeTimeout);
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
            const newButton = this.buttonEl.cloneNode(true);
            this.buttonEl.replaceWith(newButton);
            this.buttonEl = null;
        }
        
        // Remove container element
        if (this.containerEl) {
            this.containerEl.remove();
            this.containerEl = null;
        }
        
        this.activeLeafContainer = null;
    }

     /**
     * Handles click based on current recording mode
     */
     public async handleClick() {
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
        try {
            if (!this.audioManager) {
                this.audioManager = new AudioRecordingManager();
                await this.audioManager.initialize();
            }
    
            this.audioManager.start();
            this.isRecording = true;
            this.updateRecordingState(true);
            new Notice('Recording started');
        } catch (error) {
            console.error('Failed to start recording:', error);
            new Notice('Failed to start recording');
            this.cleanup();
        }
    }
    
    private async stopDirectRecording() {
        try {
            if (!this.audioManager) {
                throw new Error('Audio manager not initialized');
            }
    
            this.isProcessing = true;
            this.updateProcessingState(true);
            
            const blob = await this.audioManager.stop();
            if (blob) {
                const activeView = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
                if (!activeView || !activeView.file) {
                    new Notice('No active file to insert recording');
                    return;
                }
    
                await this.plugin.recordingProcessor.processRecording(
                    blob,
                    activeView.file,  // Now TypeScript knows this is not null
                    activeView.editor.getCursor()
                );
            }
        } catch (error) {
            console.error('Failed to stop recording:', error);
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
