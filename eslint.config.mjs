import tsparser from "@typescript-eslint/parser";
import { defineConfig } from "eslint/config";
import obsidianmd from "eslint-plugin-obsidianmd";

export default defineConfig([
	{
		ignores: ["main.js", "node_modules/**", ".worktrees/**", "**/*.test.ts"],
	},
	...obsidianmd.configs.recommended,
	{
		files: ["src/**/*.ts"],
		languageOptions: {
			parser: tsparser,
			parserOptions: {
				project: "./tsconfig.json",
			},
		},
		rules: {
			"obsidianmd/sample-names": "off",
			// The declarative settings API (getSettingDefinitions) is an Obsidian
			// 1.13.0+ feature; this plugin's minAppVersion is 1.4.0, so adopting it
			// as the settings mechanism isn't viable yet. Revisit if minAppVersion
			// is raised to >= 1.13.0.
			"obsidianmd/settings-tab/prefer-setting-definitions": "off",
			// Teach the sentence-case rule our product/provider names and acronyms
			// so it stops flagging correctly-cased brand names as violations.
			"obsidianmd/ui/sentence-case": ["warn", {
				mode: "loose",
				brands: [
					"NeuroVox",
					"OpenAI",
					"OpenRouter",
					"AssemblyAI",
					"Groq",
					"Deepgram",
					"Moonshine",
					"Whisper",
				],
				acronyms: ["API", "AI", "CD", "MB"],
				ignoreRegex: [
					// API-key format placeholders (e.g. "sk-...", "gsk_...", "sk-or-...").
					"^(sk|gsk)[-_]",
					// Strings led by a decorative emoji, which the rule mis-tokenizes
					// as making the following (correctly capitalized) word non-initial.
					"^[\\uD800-\\uDBFF]",
				],
			}],
		},
	},
	{
		// Logger is the single sanctioned wrapper around console for gated
		// debug output, so the no-console guideline rule is off here only.
		files: ["src/utils/Logger.ts"],
		rules: {
			"obsidianmd/rule-custom-message": "off",
		},
	},
]);
