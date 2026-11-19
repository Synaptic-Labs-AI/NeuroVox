# NeuroVox changelog

## 1.1.8 — 2026-11-19

- Save recordings to the vault before transcription starts, and recover interrupted recording segments so failed transcription can be retried from the original audio ([#36](https://github.com/Synaptic-Labs-AI/NeuroVox/pull/36)).
- Prefer AssemblyAI STT 3.7 for recorded transcription while retaining older Universal model selections. Keep transcripts free of fillers ([#40](https://github.com/Synaptic-Labs-AI/NeuroVox/pull/40)).
- Add GPT-6.2 Sol/Astra and Gemini 4 Hydrogen/Neon to language-model fallbacks, so they stay selectable when live discovery is unavailable ([#41](https://github.com/Synaptic-Labs-AI/NeuroVox/pull/41), [#42](https://github.com/Synaptic-Labs-AI/NeuroVox/pull/42)).
- Address Obsidian plugin lint findings ([#35](https://github.com/Synaptic-Labs-AI/NeuroVox/pull/35)).
