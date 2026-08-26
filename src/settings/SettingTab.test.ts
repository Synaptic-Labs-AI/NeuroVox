// src/settings/SettingTab.test.ts
//
// Guards the declarative settings definitions that Obsidian 1.13+ renders and
// search-indexes (see NeuroVoxSettingTab.getSettingDefinitions). The risk this
// covers is silent: a `control.key` that doesn't name a real NeuroVoxSettings
// property, or one whose declared control type doesn't match the stored value,
// binds a visible control to nothing — it renders fine and simply never
// persists. Also covers the read/write accessors the controls bind through.
//
// The import chain reaches the 'obsidian' package, which ships type
// declarations only (no runtime JS); test/obsidian-stub-loader.mjs (registered
// in the npm test script) redirects it to a runtime stub. Run with: npm test

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { SettingDefinition, SettingDefinitionGroup, SettingDefinitionItem } from 'obsidian';
import { DEFAULT_SETTINGS, NeuroVoxSettings } from './Settings';
import { NeuroVoxSettingTab } from './SettingTab';
import type NeuroVoxPlugin from '../main';

/** Control types and the typeof their stored value must agree. */
const EXPECTED_VALUE_TYPE: Record<string, string> = {
    toggle: 'boolean',
    slider: 'number',
    number: 'number',
    text: 'string',
    textarea: 'string',
    dropdown: 'string',
    color: 'string',
    file: 'string',
    folder: 'string',
};

interface Harness {
    tab: NeuroVoxSettingTab;
    settings: NeuroVoxSettings;
    saveCount: () => number;
    colorUpdateCount: () => number;
}

function makeTab(): Harness {
    const settings: NeuroVoxSettings = { ...DEFAULT_SETTINGS };
    let saveCount = 0;
    let colorUpdateCount = 0;

    const plugin = {
        settings,
        aiAdapters: new Map(),
        saveSettings: async () => {
            saveCount++;
        },
        updateAllButtonColors: () => {
            colorUpdateCount++;
        },
    } as unknown as NeuroVoxPlugin;

    return {
        tab: new NeuroVoxSettingTab({} as never, plugin),
        settings,
        saveCount: () => saveCount,
        colorUpdateCount: () => colorUpdateCount,
    };
}

function isGroup(item: SettingDefinitionItem): item is SettingDefinitionGroup {
    return (item as SettingDefinitionGroup).type === 'group';
}

function allDefinitions(items: SettingDefinitionItem[]): SettingDefinition[] {
    const flat: SettingDefinition[] = [];
    for (const item of items) {
        assert.ok(isGroup(item), 'top-level items are groups');
        for (const child of item.items ?? []) {
            flat.push(child as SettingDefinition);
        }
    }
    return flat;
}

describe('NeuroVoxSettingTab setting definitions', () => {
    it('exposes one group per section, each with settings', () => {
        const { tab } = makeTab();
        const items = tab.getSettingDefinitions();

        assert.equal(items.length, 3);
        assert.deepEqual(
            items.map(item => (isGroup(item) ? item.heading : null)),
            ['🔑 API Keys', '🎙 Recording', '📝 Post-Processing']
        );
        for (const item of items) {
            assert.ok(isGroup(item) && (item.items?.length ?? 0) > 0, 'group is non-empty');
        }
    });

    it('gives every setting a name so it can be found in settings search', () => {
        const { tab } = makeTab();
        for (const definition of allDefinitions(tab.getSettingDefinitions())) {
            assert.ok(definition.name.length > 0, 'definition has a name');
        }
    });

    it('binds every control to a real settings key of a matching type', () => {
        const { tab } = makeTab();

        for (const definition of allDefinitions(tab.getSettingDefinitions())) {
            const control = (definition as { control?: { type: string; key: string } }).control;
            if (!control) continue;

            assert.ok(
                control.key in DEFAULT_SETTINGS,
                `"${definition.name}" binds to unknown settings key "${control.key}"`
            );
            assert.equal(
                typeof DEFAULT_SETTINGS[control.key as keyof NeuroVoxSettings],
                EXPECTED_VALUE_TYPE[control.type],
                `"${definition.name}" declares a ${control.type} control for ${control.key}`
            );
        }
    });

    it('covers every bindable setting with either a control or a render callback', () => {
        const { tab } = makeTab();
        const definitions = allDefinitions(tab.getSettingDefinitions());

        // Every definition must actually do something.
        for (const definition of definitions) {
            const hasControl = 'control' in definition && definition.control !== undefined;
            const hasRender = 'render' in definition && definition.render !== undefined;
            assert.ok(hasControl || hasRender, `"${definition.name}" renders nothing`);
        }
    });
});

describe('NeuroVoxSettingTab control accessors', () => {
    it('reads values straight from plugin settings', () => {
        const { tab, settings } = makeTab();
        settings.postProcessingTemperature = 0.42;

        assert.equal(tab.getControlValue('postProcessingTemperature'), 0.42);
        assert.equal(tab.getControlValue('showFloatingButton'), DEFAULT_SETTINGS.showFloatingButton);
    });

    it('persists a written value through the plugin save path', async () => {
        const { tab, settings, saveCount } = makeTab();

        await tab.setControlValue('generatePostProcessing', false);

        assert.equal(settings.generatePostProcessing, false);
        assert.equal(saveCount(), 1, 'saveSettings() ran so the UI re-syncs');
    });

    it('falls back to the default folder when a path is blanked', async () => {
        const { tab, settings } = makeTab();

        await tab.setControlValue('recordingFolderPath', '   ');
        assert.equal(settings.recordingFolderPath, DEFAULT_SETTINGS.recordingFolderPath);

        await tab.setControlValue('transcriptFolderPath', '');
        assert.equal(settings.transcriptFolderPath, DEFAULT_SETTINGS.transcriptFolderPath);
    });

    it('trims surrounding whitespace from folder paths', async () => {
        const { tab, settings } = makeTab();

        await tab.setControlValue('recordingFolderPath', '  Voice Memos  ');

        assert.equal(settings.recordingFolderPath, 'Voice Memos');
    });

    it('repaints the microphone buttons when their color changes', async () => {
        const { tab, settings, colorUpdateCount } = makeTab();

        await tab.setControlValue('micButtonColor', '#ff0000');

        assert.equal(settings.micButtonColor, '#ff0000');
        assert.equal(colorUpdateCount(), 1);
    });

    it('leaves the buttons alone for unrelated settings', async () => {
        const { tab, colorUpdateCount } = makeTab();

        await tab.setControlValue('showTimer', false);

        assert.equal(colorUpdateCount(), 0);
    });
});
