/**
 * Debug-gated logger.
 *
 * Obsidian's plugin guidelines discourage console output in production
 * (https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines#Avoid+unnecessary+logging+to+console),
 * so these helpers no-op unless debug logging is explicitly enabled, and the
 * output they do emit goes to `console.debug` — the level the guidelines
 * reserve for developer diagnostics, which browsers hide by default.
 *
 * Genuine error/warning reporting should continue to use console.error /
 * console.warn directly, which the guidelines also permit.
 */

let debugEnabled = false;

/** Toggle verbose debug logging (off by default in production). */
export function setDebugLogging(enabled: boolean): void {
	debugEnabled = enabled;
}

function emit(args: unknown[]): void {
	if (debugEnabled) console.debug(...args);
}

export const Logger = {
	log(...args: unknown[]): void {
		emit(args);
	},
	info(...args: unknown[]): void {
		emit(args);
	},
	debug(...args: unknown[]): void {
		emit(args);
	},
};
