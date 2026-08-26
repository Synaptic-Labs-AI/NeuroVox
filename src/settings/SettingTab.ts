// src/settings/SettingTab.ts

import { App, PluginSettingTab } from 'obsidian';
import type { SettingDefinitionItem } from 'obsidian';
import { DEFAULT_SETTINGS, NeuroVoxSettings } from './Settings';
import type { SettingsSection } from './SettingsSection';
import { renderSectionsLegacy } from './LegacySettingsRenderer';
import { ApiKeysSection } from './sections/ApiKeysSection';
import { RecordingSection } from './sections/RecordingSection';
import { PostProcessingSection } from './sections/PostProcessingSection';
import { AIAdapter, AIProvider } from '../adapters/AIAdapter';
import NeuroVoxPlugin from '../main';

/**
 * The NeuroVox settings tab.
 *
 * Settings are described once, by the sections in `src/settings/sections/`,
 * and rendered two ways:
 *
 * - On Obsidian 1.13.0+, {@link getSettingDefinitions} hands the definitions
 *   to Obsidian, which renders them and indexes them for settings search.
 * - On older versions — the plugin's `minAppVersion` is 1.4.0 — Obsidian falls
 *   back to {@link display}, which renders the same definitions into the
 *   plugin's collapsible accordions.
 */
export class NeuroVoxSettingTab extends PluginSettingTab {
    plugin: NeuroVoxPlugin;

    private readonly recordingSection: RecordingSection;
    private readonly postProcessingSection: PostProcessingSection;
    private readonly sections: readonly SettingsSection[];

    constructor(app: App, plugin: NeuroVoxPlugin) {
        super(app, plugin);
        this.plugin = plugin;

        const getAdapter = (provider: AIProvider): AIAdapter | undefined =>
            this.plugin.aiAdapters.get(provider);

        this.recordingSection = new RecordingSection(plugin, getAdapter);
        this.postProcessingSection = new PostProcessingSection(plugin, getAdapter);

        this.sections = [
            new ApiKeysSection(plugin, getAdapter, () => this.refreshModelSections()),
            this.recordingSection,
            this.postProcessingSection,
        ];
    }

    /**
     * Declarative settings (Obsidian 1.13.0+). Returning a non-empty array
     * makes Obsidian render the tab from these definitions instead of calling
     * {@link display}, and includes every setting in settings search.
     */
    getSettingDefinitions(): SettingDefinitionItem[] {
        return this.sections.map(section => ({
            type: 'group' as const,
            heading: section.title,
            items: section.getDefinitions(),
        }));
    }

    /** Resolves a `control` definition's value from the plugin's settings. */
    getControlValue(key: string): unknown {
        return this.plugin.settings[key as keyof NeuroVoxSettings];
    }

    /**
     * Persists a `control` definition's value.
     *
     * Overridden rather than inherited so writes go through the plugin's own
     * `saveSettings()`, which re-syncs the floating and toolbar buttons after
     * every change.
     */
    async setControlValue(key: string, value: unknown): Promise<void> {
        const settings = this.plugin.settings;

        switch (key) {
            // Blank folder paths would write recordings to the vault root.
            case 'recordingFolderPath':
                settings.recordingFolderPath = normalizeFolder(
                    value,
                    DEFAULT_SETTINGS.recordingFolderPath
                );
                break;
            case 'transcriptFolderPath':
                settings.transcriptFolderPath = normalizeFolder(
                    value,
                    DEFAULT_SETTINGS.transcriptFolderPath
                );
                break;
            default:
                (settings as Record<string, unknown>)[key] = value;
                break;
        }

        await this.plugin.saveSettings();

        if (key === 'micButtonColor') {
            this.plugin.updateAllButtonColors();
        }
    }

    /**
     * Imperative fallback for Obsidian versions below 1.13.0.
     *
     * @deprecated Superseded by {@link getSettingDefinitions}; remove once
     * `minAppVersion` reaches 1.13.0.
     */
    display(): void {
        const { containerEl } = this;
        containerEl.empty();
        renderSectionsLegacy(containerEl, this.sections, this);
    }

    /** Rebuilds the model pickers after the configured API keys change. */
    private async refreshModelSections(): Promise<void> {
        await Promise.all([this.recordingSection.refresh(), this.postProcessingSection.refresh()]);
    }
}

function normalizeFolder(value: unknown, fallback: string): string {
    return (typeof value === 'string' ? value.trim() : '') || fallback;
}
