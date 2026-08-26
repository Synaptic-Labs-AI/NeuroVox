// src/settings/LegacySettingsRenderer.ts

import { Setting } from 'obsidian';
import type {
    SettingControl,
    SettingDefinition,
    SettingDefinitionAction,
    SettingDefinitionControl,
    SettingDefinitionRender,
} from 'obsidian';
import type { SettingsSection } from './SettingsSection';

/**
 * Renders {@link SettingsSection} definitions for Obsidian versions older than
 * 1.13.0, which have no declarative settings API.
 *
 * On 1.13+ this file is never reached: the setting tab returns a non-empty
 * array from `getSettingDefinitions()` and Obsidian renders (and indexes) the
 * settings itself. Everything here exists so the same definitions still
 * produce the plugin's original accordion UI for users below `minAppVersion`
 * 1.13.0.
 */

/**
 * Reads and writes a setting by its storage key. This is the pre-1.13
 * stand-in for `SettingTab.getControlValue` / `SettingTab.setControlValue`,
 * which don't exist on the base class in older versions.
 */
export interface ControlValueAccessor {
    getControlValue(key: string): unknown;
    setControlValue(key: string, value: unknown): void | Promise<void>;
}

/** Collapsible section chrome, styled by the `.neurovox-accordion-*` rules. */
class Accordion {
    public readonly contentEl: HTMLElement;
    private readonly accordionEl: HTMLElement;
    private readonly toggleEl: HTMLElement;
    private isOpen = false;

    constructor(containerEl: HTMLElement, title: string, description: string) {
        this.accordionEl = containerEl.createDiv({ cls: 'neurovox-accordion' });

        const headerEl = this.accordionEl.createDiv({ cls: 'neurovox-accordion-header' });
        const titleWrapper = headerEl.createDiv({ cls: 'neurovox-accordion-title-wrapper' });
        titleWrapper.createSpan({ text: title, cls: 'neurovox-accordion-title' });
        this.toggleEl = headerEl.createSpan({ cls: 'neurovox-accordion-toggle' });
        this.updateToggle();

        if (description) {
            this.accordionEl
                .createDiv({ cls: 'neurovox-accordion-description' })
                .createSpan({ text: description });
        }

        // Closed by default; `.neurovox-accordion-open` drives the reveal in CSS.
        this.contentEl = this.accordionEl.createDiv({ cls: 'neurovox-accordion-content' });

        headerEl.addEventListener('click', () => this.toggle());
    }

    private toggle(): void {
        this.isOpen = !this.isOpen;
        this.updateToggle();
        this.accordionEl.toggleClass('neurovox-accordion-open', this.isOpen);
    }

    private updateToggle(): void {
        this.toggleEl.setText(this.isOpen ? '➖' : '➕');
    }
}

/** Renders every section into `containerEl` as a collapsible accordion. */
export function renderSectionsLegacy(
    containerEl: HTMLElement,
    sections: readonly SettingsSection[],
    accessor: ControlValueAccessor
): void {
    for (const section of sections) {
        const accordion = new Accordion(containerEl, section.title, section.description);
        for (const definition of section.getDefinitions()) {
            renderDefinition(accordion.contentEl, definition, accessor);
        }
    }
}

function resolve(flag: boolean | (() => boolean) | undefined, fallback: boolean): boolean {
    if (flag === undefined) return fallback;
    return typeof flag === 'function' ? flag() : flag;
}

// `SettingDefinition` is a union whose non-applicable members declare their
// siblings as `?: never`, which `in` checks alone don't narrow away.
function isRender(def: SettingDefinition): def is SettingDefinitionRender {
    return typeof (def as SettingDefinitionRender).render === 'function';
}

function isAction(def: SettingDefinition): def is SettingDefinitionAction {
    return typeof (def as SettingDefinitionAction).action === 'function';
}

function isControl(def: SettingDefinition): def is SettingDefinitionControl {
    return (def as SettingDefinitionControl).control !== undefined;
}

function renderDefinition(
    containerEl: HTMLElement,
    definition: SettingDefinition,
    accessor: ControlValueAccessor
): void {
    if (!resolve(definition.visible, true)) return;

    const setting = new Setting(containerEl).setName(definition.name);
    if (definition.desc) {
        setting.setDesc(definition.desc);
    }

    if (isRender(definition)) {
        // NeuroVox's render callbacks only ever use the Setting; the second
        // (SettingGroup) parameter has no pre-1.13 equivalent to pass.
        (definition.render as (setting: Setting) => void)(setting);
        return;
    }

    if (isAction(definition)) {
        const { action } = definition;
        const disabled = resolve(definition.disabled, false);
        setting.addButton(button => {
            button.setButtonText(definition.name).setDisabled(disabled);
            button.onClick(() => action(button.buttonEl, 0));
        });
        return;
    }

    if (isControl(definition)) {
        applyControl(setting, definition.control, accessor);
    }
}

function applyControl(
    setting: Setting,
    control: SettingControl,
    accessor: ControlValueAccessor
): void {
    const disabled = resolve(control.disabled, false);
    const stored = accessor.getControlValue(control.key);
    const commit = (value: unknown): void => {
        void accessor.setControlValue(control.key, value);
    };

    switch (control.type) {
        case 'toggle': {
            const value = (stored as boolean | undefined) ?? control.defaultValue ?? false;
            setting.addToggle(toggle =>
                toggle.setValue(value).setDisabled(disabled).onChange(commit)
            );
            break;
        }
        case 'dropdown': {
            const value = (stored as string | undefined) ?? control.defaultValue ?? '';
            setting.addDropdown(dropdown => {
                for (const [key, label] of Object.entries(control.options)) {
                    dropdown.addOption(key, label);
                }
                dropdown.setValue(value).setDisabled(disabled).onChange(commit);
            });
            break;
        }
        case 'text':
        case 'file':
        case 'folder': {
            const value = (stored as string | undefined) ?? control.defaultValue ?? '';
            setting.addText(text =>
                text
                    .setPlaceholder(control.placeholder ?? '')
                    .setValue(value)
                    .setDisabled(disabled)
                    .onChange(commit)
            );
            break;
        }
        case 'textarea': {
            const value = (stored as string | undefined) ?? control.defaultValue ?? '';
            setting.addTextArea(text => {
                text
                    .setPlaceholder(control.placeholder ?? '')
                    .setValue(value)
                    .setDisabled(disabled)
                    .onChange(commit);
                if (control.rows !== undefined) {
                    text.inputEl.rows = control.rows;
                }
                text.inputEl.addClass('neurovox-full-width');
            });
            break;
        }
        case 'number': {
            const value = (stored as number | undefined) ?? control.defaultValue;
            setting.addText(text => {
                text.inputEl.type = 'number';
                if (control.min !== undefined) text.inputEl.min = String(control.min);
                if (control.max !== undefined) text.inputEl.max = String(control.max);
                if (control.step !== undefined) text.inputEl.step = String(control.step);
                text
                    .setPlaceholder(control.placeholder ?? '')
                    .setValue(value === undefined ? '' : String(value))
                    .setDisabled(disabled)
                    .onChange(raw => {
                        const parsed = Number(raw);
                        if (raw.trim() !== '' && !Number.isNaN(parsed)) commit(parsed);
                    });
            });
            break;
        }
        case 'slider': {
            const value = (stored as number | undefined) ?? control.defaultValue ?? control.min;
            setting.addSlider(slider =>
                slider
                    .setLimits(control.min, control.max, control.step)
                    .setValue(value)
                    .setDisabled(disabled)
                    .onChange(commit)
            );
            break;
        }
        case 'color': {
            const value = (stored as string | undefined) ?? control.defaultValue;
            setting.addColorPicker(picker => {
                if (value) picker.setValue(value);
                picker.setDisabled(disabled).onChange(commit);
            });
            break;
        }
    }
}
