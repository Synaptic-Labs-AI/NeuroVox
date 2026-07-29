// Minimal runtime stand-in for the 'obsidian' package, used only by tests
// (see obsidian-stub-loader.mjs). Provides just enough shape for modules in
// the import chain to load and be constructed; behavior under test must not
// depend on Obsidian APIs.

export const Platform = {
    isMobile: false,
    isMobileApp: false,
    isIosApp: false,
    isAndroidApp: false,
    isDesktop: true,
    isDesktopApp: true
};

export class Events {
    on() { return { unload: () => {} }; }
    off() {}
    trigger() {}
}

export class Plugin extends Events {}
export class Modal {}
export class Notice {}
export class PluginSettingTab {}
export class Setting {}
export class ButtonComponent {}
export class MarkdownView {}
export class TFile {}
export class TFolder {}
export class WorkspaceLeaf {}

export function setIcon() {}
export function normalizePath(path) { return path; }
export async function requestUrl() { return { status: 200, json: {}, text: '' }; }
