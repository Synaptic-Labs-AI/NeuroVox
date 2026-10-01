# NeuroVox

NeuroVox is an **Obsidian plugin for voice notes**. Record a thought, turn it into text in your note, and optionally use AI prompts to summarize it or extract tasks.

## Features

- **Voice recording:** Start a recording from the ribbon, command palette, or optional floating microphone button.
- **Transcription:** Turn speech into text with OpenAI, Groq, Deepgram, or AssemblyAI.
- **AI post-processing:** Apply prompts to text with OpenAI, Groq, or OpenRouter. OpenRouter is our recommended starting point for choosing among language models, including available Claude and Gemini models.
- **Custom prompts:** Summarize a transcript, extract tasks, or apply your own instructions.
- **Audio playback:** Saved recordings can be embedded in your note for playback.
- **Recording recovery:** On current `main`, the modal attempts to save the complete recording to the vault when you stop, before finishing transcription. If the recording saves successfully, use that audio with the **Transcribe audio file** command to retry a failed transcription. Audio retention in older releases depends on the recording path; check your note and recording folder.
- **Embedded output:** Transcripts and AI-processed text appear in your notes as callouts.

## Install and make your first voice note

1. Open **Obsidian → Settings → Community plugins → Browse**. Search for **NeuroVox**, select **Install**, then **Enable**.
2. Open **Settings → NeuroVox**. Decide which supported provider you want to use for transcription. OpenAI and Groq can also handle text processing; Deepgram and AssemblyAI are transcription options.
3. Create an API key in that provider's account using the links below. An API key is a private credential that lets NeuroVox use the provider on your behalf. Check that account's available credits, billing, and usage limits before recording.
4. Expand **API Keys** in NeuroVox settings and paste the key into the matching provider field. Under **Recording**, choose a **Transcription model** from that provider group. Configure your recording folder.
5. For a plain transcript, turn off **AI post-processing**. To process the transcript with AI, add the chosen provider key and select its **Post-processing model**. If you choose OpenRouter, use your **OpenRouter key** for post-processing while keeping a separate supported transcription provider.
6. Open a Markdown note, place the cursor where you want the text, and start a short recording. Allow microphone access if prompted. Stop, read the transcript, and correct anything it misheard.

If a provider listed here is missing from your installed version, check for a plugin update in Obsidian and use the options that version shows.

## Choose the right provider and key

NeuroVox has two separate jobs: **transcription turns audio into text**; **post-processing applies an AI prompt to that text**. You can use one provider for both where supported, or different providers for each job.

| Provider | Audio transcription | Text post-processing | Get your key |
| --- | --- | --- | --- |
| OpenAI | Yes | Yes | [OpenAI API quickstart](https://developers.openai.com/api/docs/quickstart) |
| Groq | Yes | Yes | [Groq API keys](https://console.groq.com/keys) |
| Deepgram | Yes | No | [Create a Deepgram API key](https://developers.deepgram.com/docs/create-additional-api-keys) |
| AssemblyAI | Yes | No | [AssemblyAI account and API keys](https://www.assemblyai.com/docs/faq/how-to-get-your-api-key) |
| OpenRouter | No | Yes — preferred for language-model choice | [OpenRouter API keys](https://openrouter.ai/settings/keys) |

**Anthropic and Google/Gemini:** NeuroVox does not have direct Anthropic or Google API-key fields. To use an available Claude or Gemini language model for post-processing, enter your OpenRouter key and choose an available OpenRouter model in **Post-processing model**. A direct Anthropic or Gemini key will not work in the OpenRouter key field.

## API billing and key safety

- **API billing is separate from a chat subscription.** A ChatGPT or Claude app subscription does not supply NeuroVox with API credits or a provider key.
- **Billing varies by provider and tier.** Some accounts have trial credit or limited free access; paid usage may need credits or a payment method. Check the provider's current dashboard rather than assuming every key needs payment or is free.
- **For OpenRouter**, check [Credits](https://openrouter.ai/settings/credits), choose an available model, and review its price before use. A key can have a spending limit; review that setting when you create it.
- **Keep keys private.** Enter them in the matching NeuroVox settings field. Do not paste them into a note, prompt, screenshot, issue, or public repository. If a key is exposed, revoke it in the provider account and replace it.
- **Review what you send.** Cloud transcription sends recorded audio to the chosen transcription provider. Post-processing sends the text and prompt to its configured provider.

## If something does not work

- **No transcript:** Check the active Markdown note, microphone permission, chosen transcription provider, its matching key, connection, and available account usage.
- **Transcript works but AI processing fails:** Check the separate post-processing provider, model, key, and billing. Turn post-processing off to test transcription on its own.
- **OpenRouter key does not transcribe:** OpenRouter is a text post-processing option in NeuroVox. Select OpenAI, Groq, Deepgram, or AssemblyAI for transcription.
- **Key rejected:** Confirm that the key belongs to the provider selected in settings. Create a replacement through that provider's dashboard if needed.

## Contribution

Contributions are welcome. Fork the repository, make your changes, and open a pull request.

## Support

For support or to report issues, use the GitHub Issues page for this repository. Do not include API keys in an issue or screenshot.
