// src/ui/FloatingButton.ts

import { MarkdownView, Notice } from 'obsidian';
import NeuroVoxPlugin from '../main';
import { icons } from '../assets/icons';
import { ButtonPositionManager } from '../utils/ButtonPositionManager';
import { PluginData, Position } from '../types'; // Import PluginData and Position
import { AudioRecordingManager } from '../utils/RecordingManager';
import { RecordingProcessor } from '../utils/RecordingProcessor';

export class FloatingButton {
    public static instance: FloatingButton | null = null;
    public buttonEl: HTMLButtonElement;
    public containerEl: HTMLDivElement;
    public activeLeafContainer: HTMLElement | null = null;
    public resizeObserver: ResizeObserver;
    public positionManager: ButtonPositionManager;
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

    public static getInstance(
        plugin: NeuroVoxPlugin,
        pluginData: PluginData,
        onClickCallback: () => void
    ): FloatingButton {
        if (!FloatingButton.instance) {
            FloatingButton.instance = new FloatingButton(plugin, pluginData, onClickCallback);
        }
        return FloatingButton.instance;
    }

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

    public createButton(): void {
        this.buttonEl = document.createElement('button');
        this.buttonEl.classList.add('neurovox-button', 'floating');
        this.buttonEl.setAttribute('aria-label', 'Start Recording (drag to move)');
        this.buttonEl.innerHTML = icons.microphone;
        
        // Add click handler
        this.buttonEl.addEventListener('click', () => this.handleClick());
        
        this.updateButtonColor();
        this.containerEl.appendChild(this.buttonEl);
    }

    public async initializePositionManager(): Promise<void> {
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
        requestAnimationFrame(() => {
            this.containerEl.style.transform = `translate3d(${x}px, ${y}px, 0)`;
        });
    }

    public async handleDragEnd(position: Position): Promise<void> {
        console.log('Drag ended. Position saved:', position);
        this.pluginData.buttonPosition = position; // Directly update pluginData
        await this.plugin.savePluginData(); // Save all data
        console.log('Position saved.');
    }

    public async setInitialPosition(): Promise<void> {
        const savedPosition = this.pluginData.buttonPosition;
        console.log('Loaded saved position:', savedPosition);

        if (savedPosition && this.activeLeafContainer) {
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

            console.log('Setting initial position to:', { x, y });

            requestAnimationFrame(() => {
                this.positionManager.setPosition(x, y, true);
                console.log('Initial position set.');
            });
        } else {
            console.log('No saved position found. Setting to default.');
            await this.setDefaultPosition();
        }
    }

    public async setDefaultPosition(): Promise<void> {
        if (!this.activeLeafContainer) {
            console.log('No activeLeafContainer. Cannot set default position.');
            return;
        }

        const containerRect = this.activeLeafContainer.getBoundingClientRect();
        const x = containerRect.width - this.getComputedSize() - this.getComputedMargin();
        const y = containerRect.height - this.getComputedSize() - this.getComputedMargin();

        console.log('Setting default position to:', { x, y });

        requestAnimationFrame(() => {
            this.positionManager.setPosition(x, y, true);
            // Save default position to pluginData
            this.pluginData.buttonPosition = { x, y };
            this.plugin.savePluginData();
            console.log('Default position saved.');
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
                    if (this.activeLeafContainer) {
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
                    clearTimeout(this.resizeTimeout);
                }
                this.resizeTimeout = setTimeout(() => {
                    if (this.activeLeafContainer) {
                        requestAnimationFrame(() => {
                            this.positionManager.updateContainer(this.activeLeafContainer);
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

        if (this.containerEl.parentNode) {
            this.containerEl.remove();
        }

        this.updateActiveContainer(viewContent);
    }

    public updateActiveContainer(newContainer: HTMLElement): void {
        if (this.activeLeafContainer) {
            this.resizeObserver.unobserve(this.activeLeafContainer);
        }

        this.activeLeafContainer = newContainer;
        newContainer.appendChild(this.containerEl);
        this.resizeObserver.observe(newContainer);

        if (this.pluginData.showFloatingButton) {
            this.show();
            // Initialize Position Manager now that the container is attached
            this.initializePositionManager();
            requestAnimationFrame(() => {
                if (this.positionManager) {
                    this.positionManager.updateContainer(this.activeLeafContainer);
                }
            });
        } else {
            this.hide();
        }
    }

    public updateButtonColor(): void {
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
        if (this.pluginData.showFloatingButton) {
            this.containerEl.style.display = 'block';
            requestAnimationFrame(() => {
                this.containerEl.style.opacity = '1';
                if (this.positionManager) {
                    this.positionManager.constrainPosition();
                }
            });
        }
    }

    public hide(): void {
        this.containerEl.style.display = 'none';
        this.containerEl.style.opacity = '0';
    }

    public remove(): void {
        if (this.resizeTimeout) {
            clearTimeout(this.resizeTimeout);
        }
        
        if (this.resizeObserver) {
            this.resizeObserver.disconnect();
        }
    
        if (this.positionManager) {
            this.positionManager.cleanup();
        }
    
        // Clean up recording resources
        this.cleanup();
    
        // Remove event listeners
        this.buttonEl.removeEventListener('click', () => this.handleClick());
    
        if (this.containerEl && this.containerEl.parentNode) {
            this.containerEl.remove();
        }
    
        FloatingButton.instance = null;
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
        if (isRecording) {
            this.buttonEl.addClass('recording');
        } else {
            this.buttonEl.removeClass('recording');
        }
        
        this.buttonEl.setAttribute('aria-label', 
            isRecording ? 'Stop Recording' : 'Start Recording'
        );
    }
    
    private updateProcessingState(isProcessing: boolean) {
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
