import { MarkdownView, Notice } from 'obsidian';
import NeuroVoxPlugin from '../main';
import { TimerModal } from '../modals/TimerModal';
import { NeuroVoxSettings } from '../settings/Settings';
import { createButtonWithSvgIcon } from '../utils/SvgUtils';
import { icons } from '../assets/icons';

/**
 * FloatingButton manages a draggable, floating microphone button in the UI.
 * Features include:
 * - Draggable positioning within the note content area
 * - Automatic repositioning when sidebars open/close
 * - Dynamic color updating from settings
 * - Click vs drag detection
 * - Position persistence
 * - Automatic visibility management
 */
export class FloatingButton {
    private buttonEl: HTMLButtonElement;
    private plugin: NeuroVoxPlugin;
    private settings: NeuroVoxSettings;
    
    // Drag state management
    private isDragging: boolean = false;
    private dragStartTime: number = 0;
    private dragStartX: number = 0;
    private dragStartY: number = 0;
    private startX: number = 0;
    private startY: number = 0;
    private buttonX: number = 0;
    private buttonY: number = 0;
    
    // Constants
    private readonly BUTTON_SIZE = 60;
    private readonly Z_INDEX = '49';
    private readonly DRAG_THRESHOLD = 5;
    private readonly CLICK_TIMEOUT = 200;
    private readonly PADDING = 5;
    private readonly LAYOUT_UPDATE_DELAY = 50;

    constructor(plugin: NeuroVoxPlugin, settings: NeuroVoxSettings) {
        this.plugin = plugin;
        this.settings = settings;
        this.createButton();
        this.setupWorkspaceEvents();
        this.setInitialPosition();
    }

    /**
     * Creates and configures the floating button element
     */
    private createButton(): void {
        this.buttonEl = createButtonWithSvgIcon(icons.microphone);
        this.buttonEl.addClass('neurovox-button', 'floating');
        this.buttonEl.title = 'Start NeuroVox Recording (drag to move)';
        this.buttonEl.style.zIndex = this.Z_INDEX;
        this.buttonEl.style.position = 'fixed';
        
        this.updateButtonColor();
        this.setupDragListeners();
        document.body.appendChild(this.buttonEl);
    }

    /**
     * Updates the button's color based on current settings
     */
    public updateButtonColor(): void {
        if (this.buttonEl) {
            this.buttonEl.style.backgroundColor = this.settings.micButtonColor;
            const brightness = this.getColorBrightness(this.settings.micButtonColor);
            const iconColor = brightness > 128 ? '#000000' : '#ffffff';
            this.buttonEl.style.color = iconColor;
        }
    }

    /**
     * Calculates the brightness of a color (0-255)
     */
    private getColorBrightness(color: string): number {
        if (color.startsWith('#')) {
            const hex = color.replace('#', '');
            const r = parseInt(hex.substr(0, 2), 16);
            const g = parseInt(hex.substr(2, 2), 16);
            const b = parseInt(hex.substr(4, 2), 16);
            return (r * 299 + g * 587 + b * 114) / 1000;
        }
        
        if (color.startsWith('rgb')) {
            const values = color.match(/\d+/g);
            if (values && values.length >= 3) {
                const [r, g, b] = values.map(Number);
                return (r * 299 + g * 587 + b * 114) / 1000;
            }
        }
        
        return 128;
    }

    /**
 * Gets the active markdown content bounds accounting for sidebars
 */
private getContentBounds(): { left: number; right: number; top: number; bottom: number } | null {
    const contentEl = this.getActiveMarkdownContentEl();
    if (!contentEl) return null;

    // Get the main workspace element (the actual DOM element containing the workspace)
    const workspaceEl = document.getElementsByClassName('workspace-split mod-vertical mod-root')[0];
    if (!workspaceEl) return null;

    const contentRect = contentEl.getBoundingClientRect();
    const workspaceRect = workspaceEl.getBoundingClientRect();

    return {
        left: Math.max(contentRect.left, workspaceRect.left),
        right: Math.min(contentRect.right, workspaceRect.right),
        top: contentRect.top,
        bottom: contentRect.bottom
    };
}

    /**
     * Sets up workspace-related event listeners
     */
    private setupWorkspaceEvents(): void {
        this.plugin.registerEvent(
            this.plugin.app.workspace.on('active-leaf-change', () => {
                this.updateVisibilityAndPosition();
            })
        );

        this.plugin.registerEvent(
            this.plugin.app.workspace.on('layout-change', () => {
                setTimeout(() => {
                    this.constrainPositionToContent();
                }, this.LAYOUT_UPDATE_DELAY);
            })
        );

        this.plugin.registerEvent(
            this.plugin.app.workspace.on('resize', () => {
                setTimeout(() => {
                    this.constrainPositionToContent();
                }, this.LAYOUT_UPDATE_DELAY);
            })
        );

        this.updateVisibilityAndPosition();
    }

    /**
     * Sets up all drag-related event listeners
     */
    private setupDragListeners(): void {
        // Mouse events
        this.buttonEl.addEventListener('mousedown', (e: MouseEvent) => {
            if (e.button === 0) {
                this.handleDragStart(e.clientX, e.clientY);
                e.preventDefault();
                e.stopPropagation();
            }
        });

        document.addEventListener('mousemove', (e: MouseEvent) => {
            if (this.isDragging) {
                this.handleDrag(e.clientX, e.clientY);
                e.preventDefault();
            }
        });

        document.addEventListener('mouseup', (e: MouseEvent) => {
            this.handleDragEnd(e.clientX, e.clientY);
        });

        // Touch events
        this.buttonEl.addEventListener('touchstart', (e: TouchEvent) => {
            const touch = e.touches[0];
            this.handleDragStart(touch.clientX, touch.clientY);
            e.preventDefault();
            e.stopPropagation();
        });

        document.addEventListener('touchmove', (e: TouchEvent) => {
            if (this.isDragging) {
                const touch = e.touches[0];
                this.handleDrag(touch.clientX, touch.clientY);
                e.preventDefault();
            }
        });

        document.addEventListener('touchend', (e: TouchEvent) => {
            if (e.changedTouches.length > 0) {
                const touch = e.changedTouches[0];
                this.handleDragEnd(touch.clientX, touch.clientY);
            }
        });
    }

    /**
     * Gets the content element of the active markdown view
     */
    private getActiveMarkdownContentEl(): HTMLElement | null {
        const activeView = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
        return activeView?.contentEl || null;
    }

    /**
     * Ensures the button position is within the content bounds
     */
    private constrainPositionToContent(): void {
        const bounds = this.getContentBounds();
        if (!bounds) return;

        this.buttonX = Math.max(
            bounds.left + this.PADDING,
            Math.min(bounds.right - this.BUTTON_SIZE - this.PADDING, this.buttonX)
        );
        this.buttonY = Math.max(
            bounds.top + this.PADDING,
            Math.min(bounds.bottom - this.BUTTON_SIZE - this.PADDING, this.buttonY)
        );

        this.updateButtonPosition();
    }

    /**
     * Handles the start of a drag operation
     */
    private handleDragStart(x: number, y: number): void {
        this.dragStartTime = Date.now();
        this.dragStartX = x;
        this.dragStartY = y;
        this.isDragging = true;
        this.buttonEl.addClass('dragging');
        
        const rect = this.buttonEl.getBoundingClientRect();
        this.startX = x - rect.left;
        this.startY = y - rect.top;
    }

    /**
     * Handles the drag operation
     */
    private handleDrag(x: number, y: number): void {
        if (!this.isDragging) return;

        const newX = x - this.startX;
        const newY = y - this.startY;

        const bounds = this.getContentBounds();
        if (bounds) {
            this.buttonX = Math.max(
                bounds.left + this.PADDING,
                Math.min(bounds.right - this.BUTTON_SIZE - this.PADDING, newX)
            );
            this.buttonY = Math.max(
                bounds.top + this.PADDING,
                Math.min(bounds.bottom - this.BUTTON_SIZE - this.PADDING, newY)
            );

            this.updateButtonPosition();
        }
    }

    /**
     * Handles the end of a drag operation
     */
    private handleDragEnd(x: number, y: number): void {
        if (!this.isDragging) return;
        
        const dragDistance = Math.sqrt(
            Math.pow(x - this.dragStartX, 2) + 
            Math.pow(y - this.dragStartY, 2)
        );
        
        const dragDuration = Date.now() - this.dragStartTime;

        if (dragDistance < this.DRAG_THRESHOLD && dragDuration < this.CLICK_TIMEOUT) {
            this.openRecordingModal();
        } else {
            const bounds = this.getContentBounds();
            if (bounds) {
                this.settings.buttonPosition = {
                    x: this.buttonX - bounds.left,
                    y: this.buttonY - bounds.top
                };
                this.plugin.saveSettings();
            }
        }
        
        this.isDragging = false;
        this.buttonEl.removeClass('dragging');
    }

    /**
     * Sets the initial position of the button
     */
    private setInitialPosition(): void {
        const bounds = this.getContentBounds();
        if (bounds) {
            if (this.settings.buttonPosition) {
                this.buttonX = bounds.left + this.settings.buttonPosition.x;
                this.buttonY = bounds.top + this.settings.buttonPosition.y;
            } else {
                this.buttonX = bounds.right - this.BUTTON_SIZE - 20;
                this.buttonY = bounds.top + 20;
            }
            
            this.constrainPositionToContent();
        }
    }

    /**
     * Updates visibility and position based on active view
     */
    private updateVisibilityAndPosition(): void {
        const contentEl = this.getActiveMarkdownContentEl();
        const bounds = this.getContentBounds();
        
        if (contentEl && bounds) {
            this.buttonEl.style.display = 'flex';
            
            if (this.settings.buttonPosition) {
                this.buttonX = bounds.left + this.settings.buttonPosition.x;
                this.buttonY = bounds.top + this.settings.buttonPosition.y;
            } else {
                this.buttonX = bounds.right - this.BUTTON_SIZE - 20;
                this.buttonY = bounds.top + 20;
            }
            
            this.constrainPositionToContent();
        } else {
            this.buttonEl.style.display = 'none';
        }
    }

    /**
     * Updates the button's visual position
     */
    private updateButtonPosition(): void {
        this.buttonEl.style.left = `${this.buttonX}px`;
        this.buttonEl.style.top = `${this.buttonY}px`;
    }

    /**
     * Opens the recording modal
     */
    private openRecordingModal(): void {
        const activeView = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
        if (activeView) {
            const activeFile = activeView.file;
            if (!activeFile) {
                new Notice('No active file to insert transcription.');
                return;
            }
            const editor = activeView.editor;
            const cursorPosition = editor.getCursor();

            const modal = new TimerModal(this.plugin.app);
            modal.onStop = (audioBlob: Blob) => {
                this.plugin.processRecording(audioBlob, activeFile, cursorPosition);
            };
            modal.open();
        } else {
            new Notice('No active note found to insert transcription.');
        }
    }

    /**
     * Updates both position and color when settings change
     */
    public updateFromSettings(): void {
        this.updateButtonColor();
        this.updateVisibilityAndPosition();
    }

    /**
     * Removes the button and cleans up
     */
    public remove(): void {
        this.buttonEl.remove();
    }
}