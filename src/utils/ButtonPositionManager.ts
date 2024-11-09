// src/utils/ButtonPositionManager.ts

import { PluginData, Position } from '../types';

interface BoundHandlers {
    move: (e: MouseEvent) => void;
    end: (e: MouseEvent) => void;
    touchMove: (e: TouchEvent) => void;
    touchEnd: (e: TouchEvent) => void;
}

export class ButtonPositionManager {
    public isDragging: boolean = false;
    public hasMoved: boolean = false;
    public dragStartX: number = 0;
    public dragStartY: number = 0;
    public currentX: number = 0;
    public currentY: number = 0;
    public _boundHandlers: BoundHandlers;
    public lastContainerWidth: number | null = null;
    public relativeX: number = 0;
    public relativeY: number = 0;

    public readonly DRAG_THRESHOLD: number = 5;

    constructor(
        public containerEl: HTMLElement,
        public buttonEl: HTMLElement,
        public activeContainer: HTMLElement | null,
        public buttonSize: number,
        public margin: number,
        public onPositionChange: (x: number, y: number) => void,
        public onDragEnd: (position: Position) => void,
        public onClick: () => void
    ) {
        // Bind event handlers once and store their references
        this._boundHandlers = {
            move: this.handleDragMove.bind(this),
            end: this.handleDragEnd.bind(this),
            touchMove: this.handleTouchMove.bind(this),
            touchEnd: this.handleTouchEnd.bind(this)
        };
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

    public setupEventListeners(): void {
        this.buttonEl.addEventListener('mousedown', this.handleDragStart.bind(this));
        document.addEventListener('mousemove', this._boundHandlers.move);
        document.addEventListener('mouseup', this._boundHandlers.end);

        this.buttonEl.addEventListener('touchstart', this.handleTouchStart.bind(this));
        document.addEventListener('touchmove', this._boundHandlers.touchMove);
        document.addEventListener('touchend', this._boundHandlers.touchEnd);
    }

    public handleDragStart = (e: MouseEvent): void => {
        if (e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation(); // Stop event propagation
        
        this.isDragging = true;
        this.hasMoved = false;
        this.dragStartX = e.clientX - this.currentX;
        this.dragStartY = e.clientY - this.currentY;
        
        this.buttonEl.classList.add('is-dragging');
    };
    
    public handleDragEnd = (e?: MouseEvent): void => {
        if (!this.isDragging) return;
        
        if (e) {
            e.preventDefault();
            e.stopPropagation();
        }
        
        this.isDragging = false;
        this.buttonEl.classList.remove('is-dragging');
        
        if (this.hasMoved) {
            this.onDragEnd({
                x: this.currentX,
                y: this.currentY
            });
        }
    
        // Reset hasMoved after a short delay
        setTimeout(() => {
            this.hasMoved = false;
        }, 100);
    };
    
    public handleDragMove = (e: MouseEvent): void => {
        if (!this.isDragging) return;
        e.preventDefault();
        e.stopPropagation();
    
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

    public handleTouchStart = (e: TouchEvent): void => {
        if (e.touches.length !== 1) return;
        e.preventDefault();
        
        const touch = e.touches[0];
        this.isDragging = true;
        this.hasMoved = false;
        this.dragStartX = touch.clientX - this.currentX;
        this.dragStartY = touch.clientY - this.currentY;
        
        this.buttonEl.classList.add('is-dragging');
    };

    public handleTouchMove = (e: TouchEvent): void => {
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

    public handleTouchEnd = (): void => {
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
        // Remove mouse event listeners
        document.removeEventListener('mousemove', this._boundHandlers.move);
        document.removeEventListener('mouseup', this._boundHandlers.end);

        // Remove touch event listeners
        document.removeEventListener('touchmove', this._boundHandlers.touchMove);
        document.removeEventListener('touchend', this._boundHandlers.touchEnd);
    }
}
