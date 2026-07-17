// src/utils/TransformersLoader.ts

/**
 * Local-model (transformers.js) loader — TEMPORARILY DISABLED for release.
 *
 * The previous implementation loaded transformers.js v3 from a CDN inside a
 * sandboxed iframe, injected via a dynamically-created `<script type="module">`
 * element. The Obsidian plugin review guidelines disallow that pattern
 * ("dynamic <script> element creation" / loading and executing arbitrary
 * external code), so the implementation has been removed while the on-device
 * (Moonshine) transcription feature is still in development.
 *
 * This stub preserves the module's exported surface so the rest of the code
 * (MoonshineAdapter) keeps compiling; every entry point cleanly reports that
 * local models are unavailable. The original iframe-based implementation is
 * preserved in git history — restore it together with a review-compliant
 * on-device runtime (no external <script>/CDN loading) and re-expose the UI in
 * ModelHookupAccordion / RecordingAccordion when the feature is ready.
 */

import type { TransformersProgressData } from '../types';

const LOCAL_MODEL_DISABLED_MSG =
    'On-device (local) transcription is not available in this build.';

/**
 * Export types for external use
 */
export interface ASRPipeline {
    (audio: Float32Array, options?: Record<string, unknown>): Promise<{ text: string }>;
}

/**
 * Load the model — disabled.
 */
export async function loadModel(
    modelPath: string,
    onProgress?: (progress: TransformersProgressData) => void
): Promise<void> {
    void modelPath;
    void onProgress;
    throw new Error(LOCAL_MODEL_DISABLED_MSG);
}

/**
 * Transcribe audio using a local model — disabled.
 */
export async function transcribeAudio(
    audioData: Float32Array,
    modelPath: string,
    options?: Record<string, unknown>
): Promise<string> {
    void audioData;
    void modelPath;
    void options;
    throw new Error(LOCAL_MODEL_DISABLED_MSG);
}

/**
 * Whether a local model runtime is loaded — always false while disabled.
 */
export function isTransformersLoaded(): boolean {
    return false;
}

/**
 * Preload the local model runtime — no-op while disabled.
 */
export function preloadTransformers(): void {
    // no-op: local model support is disabled for release
}

/**
 * Clean up the local model runtime — no-op while disabled.
 */
export function destroyTransformers(): void {
    // no-op: local model support is disabled for release
}

/**
 * Legacy export used by MoonshineAdapter — disabled.
 */
export async function createASRPipeline(
    modelPath: string,
    options?: {
        dtype?: string;
        device?: string;
        progress_callback?: (progress: TransformersProgressData) => void;
    }
): Promise<ASRPipeline> {
    void modelPath;
    void options;
    throw new Error(LOCAL_MODEL_DISABLED_MSG);
}

/**
 * Legacy export — disabled.
 */
export async function loadTransformers(): Promise<unknown> {
    throw new Error(LOCAL_MODEL_DISABLED_MSG);
}

/**
 * Legacy export — disabled.
 */
export async function getPipeline(): Promise<unknown> {
    throw new Error(LOCAL_MODEL_DISABLED_MSG);
}
