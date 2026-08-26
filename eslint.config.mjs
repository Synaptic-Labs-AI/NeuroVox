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
		// This file renders the 1.13 setting *definitions* on older Obsidian
		// versions, so it necessarily reads properties off the 1.13-only
		// SettingControl types. Those types describe plain object literals this
		// plugin builds itself — no Obsidian 1.13 runtime API is touched — so
		// the version check is a false positive here. Drop this override once
		// minAppVersion reaches 1.13.0 and the file is deleted.
		files: ["src/settings/LegacySettingsRenderer.ts"],
		rules: {
			"obsidianmd/no-unsupported-api": "off",
		},
	},
]);
