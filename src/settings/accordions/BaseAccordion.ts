// src/settings/accordions/BaseAccordion.ts

import { Setting } from 'obsidian';

export abstract class BaseAccordion {
    protected containerEl: HTMLElement;
    protected accordionEl: HTMLElement;
    protected headerEl: HTMLElement;
    protected contentEl: HTMLElement;
    protected isOpen: boolean = false;
    protected toggleIcon: HTMLSpanElement;

    constructor(containerEl: HTMLElement, title: string, description: string = '') {
        this.containerEl = containerEl;
        this.accordionEl = this.containerEl.createDiv({ cls: "neurovox-accordion" });

        this.headerEl = this.accordionEl.createDiv({ cls: "neurovox-accordion-header" });
        const titleWrapper = this.headerEl.createDiv({ cls: "neurovox-accordion-title-wrapper" });

        titleWrapper.createSpan({ text: title, cls: "neurovox-accordion-title" });

        this.toggleIcon = this.headerEl.createSpan({ cls: "neurovox-accordion-toggle" });
        this.updateToggleIcon();

        if (description) {
            const descriptionEl = this.accordionEl.createDiv({ cls: "neurovox-accordion-description" });
            descriptionEl.createSpan({ text: description });
        }

        this.contentEl = this.accordionEl.createDiv({ cls: "neurovox-accordion-content" });
        this.contentEl.style.display = "none"; // Start closed

        this.headerEl.addEventListener("click", () => this.toggleAccordion());
    }

    abstract render(): void;

    public toggleAccordion(): void {
        this.isOpen = !this.isOpen;
        this.contentEl.style.display = this.isOpen ? "block" : "none";
        this.updateToggleIcon();
        this.accordionEl.classList.toggle("neurovox-accordion-open", this.isOpen);
    }

    protected updateToggleIcon(): void {
        // Clear existing content
        this.toggleIcon.empty();

        // Create a new text node with the appropriate character
        const iconText = document.createTextNode(this.isOpen ? "➖" : "➕");
        this.toggleIcon.appendChild(iconText);
    }

    protected createSettingItem(name: string, desc: string): Setting {
        const setting = new Setting(this.contentEl);
        setting.setName(name).setDesc(desc);
        return setting;
    }
}
