// src/settings/SettingsSection.ts

import type { SettingDefinition } from 'obsidian';

/**
 * One titled section of the NeuroVox settings tab.
 *
 * Sections describe their settings *declaratively* so a single set of
 * definitions can drive both rendering paths:
 *
 * - Obsidian 1.13+ renders and search-indexes them itself, via
 *   `NeuroVoxSettingTab.getSettingDefinitions()`.
 * - Older versions get the same definitions rendered imperatively into a
 *   collapsible accordion by {@link renderSectionsLegacy}.
 *
 * Settings that need bespoke DOM (a password field, a dynamically populated
 * model list) use `render` definitions, which still contribute their name and
 * description to settings search.
 */
export interface SettingsSection {
    /** Heading shown above the section. */
    readonly title: string;
    /** Sub-heading shown by the legacy accordion renderer. */
    readonly description: string;
    /** The section's settings, rebuilt on each render. */
    getDefinitions(): SettingDefinition[];
    /** Repopulate any dynamic controls in place (e.g. after an API key changes). */
    refresh(): Promise<void>;
}
