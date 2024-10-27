// src/utils/ButtonPositionManager.ts

import { PluginData, Position } from '../types';

interface BoundHandlers {
    move: (e: MouseEvent) => void;
    end: (e: MouseEvent) => void;
}

export class ButtonPositionManager {
    private isDragging: boolean = false;
    private hasMoved: boolean = false;
    private dragStartX: number = 0;
    private dragStartY: number = 0;
    private currentX: number = 0;
    private currentY: number = 0;
    private _boundHandlers: BoundHandlers | null = null;
    private lastContainerWidth: number | null = null;
    private relativeX: number = 0;
    private relativeY: number = 0;

    private readonly DRAG_THRESHOLD: number = 5;

    constructor(
        private containerEl: HTMLElement,
        private buttonEl: HTMLElement,
        private activeContainer: HTMLElement | null,
        private buttonSize: number,
        private margin: number,
        private onPositionChange: (x: number, y: number) => void,
        private onDragEnd: (position: Position) => void,
        private onClick: () => void
    ) {
        this.setupEventListeners();
    }

    public setPosition(x: number, y: number, updateRelative: boolean = true): void {
        this.currentX = x;
        this.currentY = y;
        
        if (updateRelative && this.activeContainer) {
            const containerRect = this.activeContainer.getBoundingClientRect();
            this.relativeX = x / containerRect.width;
            this.relativeY = y / containerRect.height;
        }
        
        this.onPositionChange(x, y);
    }

    public constrainPosition(): void {
        if (!this.activeContainer) return;

        const containerRect = this.activeContainer.getBoundingClientRect();
        
        // Store the last known container width
        this.lastContainerWidth = containerRect.width;
        
        if (containerRect.width < (this.buttonSize + this.margin * 2) || 
            containerRect.height < (this.buttonSize + this.margin * 2)) {
            return;
        }

        const maxX = containerRect.width - this.buttonSize - this.margin;
        const maxY = containerRect.height - this.buttonSize - this.margin;

        // Calculate new position based on relative coordinates
        const targetX = this.relativeX * containerRect.width;
        const targetY = this.relativeY * containerRect.height;

        // Constrain the position
        const x = Math.max(this.margin, Math.min(targetX, maxX));
        const y = Math.max(this.margin, Math.min(targetY, maxY));

        console.log('Constraining position to:', { x, y });

        this.setPosition(x, y, false);
    }

    public updateContainer(newContainer: HTMLElement | null): void {
        if (!newContainer) {
            this.activeContainer = null;
            return;
        }

        const oldContainer = this.activeContainer;
        this.activeContainer = newContainer;

        if (oldContainer) {
            const newRect = newContainer.getBoundingClientRect();
            
            // Use relative position to calculate new absolute position
            const newX = this.relativeX * newRect.width;
            const newY = this.relativeY * newRect.height;
            
            this.setPosition(newX, newY, false);
        }

        this.constrainPosition();
    }

    private setupEventListeners(): void {
        const boundDragMove = this.handleDragMove.bind(this);
        const boundDragEnd = this.handleDragEnd.bind(this);

        this.buttonEl.addEventListener('mousedown', this.handleDragStart.bind(this));
        document.addEventListener('mousemove', boundDragMove);
        document.addEventListener('mouseup', boundDragEnd);

        this.buttonEl.addEventListener('touchstart', this.handleTouchStart.bind(this));
        document.addEventListener('touchmove', this.handleTouchMove.bind(this));
        document.addEventListener('touchend', this.handleTouchEnd.bind(this));

        this._boundHandlers = {
            move: boundDragMove,
            end: boundDragEnd
        };
    }

    private handleDragStart = (e: MouseEvent): void => {
        if (e.button !== 0) return;
        e.preventDefault();
        
        this.isDragging = true;
        this.hasMoved = false;
        this.dragStartX = e.clientX - this.currentX;
        this.dragStartY = e.clientY - this.currentY;
        
        this.buttonEl.classList.add('is-dragging');
    };

    private handleDragMove = (e: MouseEvent): void => {
        if (!this.isDragging) return;
        e.preventDefault();

        const newX = e.clientX - this.dragStartX;
        const newY = e.clientY - this.dragStartY;

        if (!this.hasMoved && 
            (Math.abs(newX - this.currentX) > this.DRAG_THRESHOLD || 
             Math.abs(newY - this.currentY) > this.DRAG_THRESHOLD)) {
            this.hasMoved = true;
        }

        this.setPosition(newX, newY);
        this.constrainPosition();
    };

    private handleDragEnd = (): void => {
        if (!this.isDragging) return;
        
        this.isDragging = false;
        this.buttonEl.classList.remove('is-dragging');
        
        if (!this.hasMoved) {
            this.onClick();
        } else {
            this.onDragEnd({
                x: this.currentX,
                y: this.currentY
            });
        }
    };

    private handleTouchStart = (e: TouchEvent): void => {
        if (e.touches.length !== 1) return;
        e.preventDefault();
        
        const touch = e.touches[0];
        this.isDragging = true;
        this.hasMoved = false;
        this.dragStartX = touch.clientX - this.currentX;
        this.dragStartY = touch.clientY - this.currentY;
        
        this.buttonEl.classList.add('is-dragging');
    };

    private handleTouchMove = (e: TouchEvent): void => {
        if (!this.isDragging || e.touches.length !== 1) return;
        e.preventDefault();
        
        const touch = e.touches[0];
        const newX = touch.clientX - this.dragStartX;
        const newY = touch.clientY - this.dragStartY;
        
        if (!this.hasMoved && 
            (Math.abs(newX - this.currentX) > this.DRAG_THRESHOLD || 
             Math.abs(newY - this.currentY) > this.DRAG_THRESHOLD)) {
            this.hasMoved = true;
        }
        
        this.setPosition(newX, newY);
        this.constrainPosition();
    };

    private handleTouchEnd = (): void => {
        if (!this.isDragging) return;
        
        this.isDragging = false;
        this.buttonEl.classList.remove('is-dragging');
        
        if (!this.hasMoved) {
            this.onClick();
        } else {
            this.onDragEnd({
                x: this.currentX,
                y: this.currentY
            });
        }
    };

    public getCurrentPosition(): Position {
        return {
            x: this.currentX,
            y: this.currentY
        };
    }

    public cleanup(): void {
        if (this._boundHandlers) {
            document.removeEventListener('mousemove', this._boundHandlers.move);
            document.removeEventListener('mouseup', this._boundHandlers.end);
        }

        document.removeEventListener('touchmove', this.handleTouchMove.bind(this));
        document.removeEventListener('touchend', this.handleTouchEnd.bind(this));

        this._boundHandlers = null;
    }
}
