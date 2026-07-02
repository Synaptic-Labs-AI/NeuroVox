/**
 * Debug-gated logger.
 *
 * Obsidian's plugin guidelines discourage console output in production
 * (https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines#Avoid+unnecessary+logging+to+console),
 * so these helpers no-op unless debug logging is explicitly enabled. Genuine
 * error/warning reporting should continue to use console.error / console.warn
 * directly, which the guidelines permit.
 *
 * This is the single sanctioned place that touches console.log; the no-console
 * guideline rule is turned off for this file in eslint.config.mjs.
 */

let debugEnabled = false;

/** Toggle verbose debug logging (off by default in production). */
export function setDebugLogging(enabled: boolean): void {
	debugEnabled = enabled;
}

export const Logger = {
	log(...args: unknown[]): void {
		if (debugEnabled) console.log(...args);
	},
	info(...args: unknown[]): void {
		if (debugEnabled) console.info(...args);
	},
	debug(...args: unknown[]): void {
		if (debugEnabled) console.debug(...args);
	},
};
