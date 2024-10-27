// src/ui/FloatingButton.ts

import { MarkdownView } from 'obsidian';
import NeuroVoxPlugin from '../main';
import { icons } from '../assets/icons';
import { ButtonPositionManager } from '../utils/ButtonPositionManager';
import { PluginData, Position } from '../types'; // Import PluginData and Position

export class FloatingButton {
    private static instance: FloatingButton | null = null;
    private buttonEl: HTMLButtonElement;
    private containerEl: HTMLDivElement;
    private activeLeafContainer: HTMLElement | null = null;
    private resizeObserver: ResizeObserver;
    private positionManager: ButtonPositionManager;
    private resizeTimeout: NodeJS.Timeout | null = null;

    private constructor(
        private plugin: NeuroVoxPlugin,
        private pluginData: PluginData,
        private onClickCallback: () => void
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

    private getComputedSize(): number {
        const computedStyle = getComputedStyle(document.documentElement);
        return parseInt(computedStyle.getPropertyValue('--neurovox-button-size')) || 48;
    }

    private getComputedMargin(): number {
        const computedStyle = getComputedStyle(document.documentElement);
        return parseInt(computedStyle.getPropertyValue('--neurovox-button-margin')) || 20;
    }

    private getComputedResizeDelay(): number {
        const computedStyle = getComputedStyle(document.documentElement);
        return parseInt(computedStyle.getPropertyValue('--neurovox-resize-delay')) || 100;
    }

    private initializeComponents(): void {
        this.setupResizeObserver();
        this.createElements();
        this.setupWorkspaceEvents();
    }

    private setupResizeObserver(): void {
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

    private createElements(): void {
        this.createContainer();
        this.createButton();
        this.attachToActiveLeaf();
        // Initialize Position Manager AFTER attaching to active leaf
        // to ensure activeLeafContainer is available
    }

    private createContainer(): void {
        this.containerEl = document.createElement('div');
        this.containerEl.classList.add('neurovox-button-container');
    }

    private createButton(): void {
        this.buttonEl = document.createElement('button');
        this.buttonEl.classList.add('neurovox-button', 'floating');
        this.buttonEl.setAttribute('aria-label', 'Start Recording (drag to move)');
        this.buttonEl.innerHTML = icons.microphone;
        
        this.updateButtonColor();
        this.containerEl.appendChild(this.buttonEl);
    }

    private async initializePositionManager(): Promise<void> {
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

    private handlePositionChange(x: number, y: number): void {
        requestAnimationFrame(() => {
            this.containerEl.style.transform = `translate3d(${x}px, ${y}px, 0)`;
        });
    }

    private async handleDragEnd(position: Position): Promise<void> {
        console.log('Drag ended. Position saved:', position);
        this.pluginData.buttonPosition = position; // Directly update pluginData
        await this.plugin.savePluginData(); // Save all data
        console.log('Position saved.');
    }

    private async setInitialPosition(): Promise<void> {
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

    private async setDefaultPosition(): Promise<void> {
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

    private setupWorkspaceEvents(): void {
        this.registerActiveLeafChangeEvent();
        this.registerLayoutChangeEvent();
        this.registerResizeEvent();
    }

    private registerActiveLeafChangeEvent(): void {
        this.plugin.registerEvent(
            this.plugin.app.workspace.on('active-leaf-change', () => {
                requestAnimationFrame(() => this.attachToActiveLeaf());
            })
        );
    }

    private registerLayoutChangeEvent(): void {
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

    private registerResizeEvent(): void {
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

    private attachToActiveLeaf(): void {
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

    private updateActiveContainer(newContainer: HTMLElement): void {
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

        if (this.containerEl && this.containerEl.parentNode) {
            this.containerEl.remove();
        }

        FloatingButton.instance = null;
    }
}
