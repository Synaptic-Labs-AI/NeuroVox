import { Notice } from 'obsidian';
import { AIProvider } from '../adapters/AIAdapter';
import type NeuroVoxPlugin from '../main';

/**
 * Pre-flight checks run BEFORE a recording starts.
 *
 * The failure this exists to prevent: the user records for ten minutes, and only then does
 * the plugin discover that the transcription key was expired all along. A key check costs one
 * cheap request, so it belongs in front of the microphone, not behind it.
 */

const PROVIDER_LABELS: Record<AIProvider, string> = {
    [AIProvider.OpenAI]: 'OpenAI',
    [AIProvider.Groq]: 'Groq',
    [AIProvider.Deepgram]: 'Deepgram',
    [AIProvider.Moonshine]: 'Moonshine',
    [AIProvider.OpenRouter]: 'OpenRouter',
    [AIProvider.AssemblyAI]: 'AssemblyAI',
};

export interface ReadinessResult {
    /** False only when we are certain the run cannot succeed. */
    ok: boolean;
    /** Why the run was blocked. Set whenever ok is false. */
    reason?: string;
    /**
     * Set when the check itself could not be completed (offline, provider outage). The run is
     * allowed — an unreachable provider says nothing about the key, and refusing to record
     * over a flaky network would destroy audio we could have captured.
     */
    warning?: string;
}

export function providerLabel(provider: AIProvider): string {
    return PROVIDER_LABELS[provider] ?? provider;
}

const SETTINGS_HINT = 'Open Settings → NeuroVox → API keys to fix this.';

/** Trims a provider's error down to something that fits in a notice. */
function brief(message: string | undefined): string {
    if (!message) return '';
    const oneLine = message.replace(/\s+/g, ' ').trim();
    return oneLine.length > 160 ? `${oneLine.slice(0, 157)}…` : oneLine;
}

async function checkProvider(
    plugin: NeuroVoxPlugin,
    provider: AIProvider,
    purpose: string
): Promise<ReadinessResult> {
    const adapter = plugin.aiAdapters.get(provider);
    const label = providerLabel(provider);

    if (!adapter) {
        return { ok: false, reason: `No ${label} adapter is available for ${purpose}.` };
    }

    if (!adapter.requiresApiKey()) {
        return { ok: true };
    }

    const check = await adapter.verifyApiKey();

    switch (check.status) {
        case 'valid':
            return { ok: true };
        case 'missing':
            return {
                ok: false,
                reason: `No ${label} API key is set, and ${label} is your ${purpose} provider. ${SETTINGS_HINT}`
            };
        case 'rejected':
            return {
                ok: false,
                reason: `${label} rejected your API key — it has probably expired or been revoked. ${SETTINGS_HINT}`
            };
        case 'unreachable':
        default:
            return {
                ok: true,
                warning: `Could not reach ${label} to check your API key${check.message ? ` (${brief(check.message)})` : ''}.`
            };
    }
}

/**
 * Blocking check for the transcription provider. A failure here means the recording would be
 * unrecoverable, so the caller must not start capturing audio.
 */
export async function checkTranscriptionReadiness(plugin: NeuroVoxPlugin): Promise<ReadinessResult> {
    const provider = plugin.settings.transcriptionProvider;
    const result = await checkProvider(plugin, provider, 'transcription');

    if (!result.ok) return result;

    if (!plugin.settings.transcriptionModel) {
        return {
            ok: false,
            reason: 'No transcription model is selected. Choose one in Settings → NeuroVox → Recording.'
        };
    }

    return result;
}

/**
 * Advisory check for the post-processing provider. Deliberately NON-blocking: post-processing
 * is a bonus on top of the transcript, and since a failed summary no longer discards the
 * transcription, a bad summarizer key is not a reason to refuse to record. The warning just
 * lets the user fix it before they talk rather than after.
 */
export async function checkPostProcessingReadiness(plugin: NeuroVoxPlugin): Promise<ReadinessResult> {
    if (!plugin.settings.generatePostProcessing) {
        return { ok: true };
    }

    const provider = plugin.settings.postProcessingProvider;
    const result = await checkProvider(plugin, provider, 'post-processing');

    if (result.ok) return result;

    return { ok: true, warning: `${result.reason} Your transcription will still be saved.` };
}

/**
 * Runs every pre-flight check and reports the outcome to the user.
 *
 * Returns false when recording must not start. Warnings are surfaced but do not block:
 * only a definitely-doomed run is worth refusing.
 */
export async function ensureReadyToRecord(plugin: NeuroVoxPlugin): Promise<boolean> {
    const [transcription, postProcessing] = await Promise.all([
        checkTranscriptionReadiness(plugin),
        checkPostProcessingReadiness(plugin)
    ]);

    if (!transcription.ok) {
        new Notice(`❌ ${transcription.reason}`, 15000);
        return false;
    }

    for (const warning of [transcription.warning, postProcessing.warning]) {
        if (warning) {
            new Notice(`⚠️ ${warning}`, 10000);
        }
    }

    return true;
}
