// src/utils/TransformersLoader.ts

/**
 * Iframe-based loader for transformers.js v3
 *
 * This module loads transformers.js in an isolated iframe to avoid Electron's
 * Node.js environment detection issues. The iframe creates a true browser
 * context where onnxruntime-web works correctly.
 *
 * We use v3 (@huggingface/transformers) loaded from CDN because:
 * 1. Moonshine models require v3 features
 * 2. The iframe sandbox provides a true browser context
 * 3. CDN loading avoids bundling issues with onnxruntime
 *
 * Approach inspired by Smart Connections plugin:
 * https://github.com/brianpetro/obsidian-smart-connections
 */

import type { TransformersProgressData } from '../types';

// Message types for iframe communication
interface IframeMessage {
    type: 'ready' | 'progress' | 'result' | 'error' | 'loaded';
    id?: string;
    data?: unknown;
}

interface TranscribeRequest {
    type: 'transcribe';
    id: string;
    audioData: number[];  // Float32Array as regular array for postMessage
    model: string;
    options?: Record<string, unknown>;
}

interface LoadModelRequest {
    type: 'loadModel';
    id: string;
    model: string;
}

// Pending requests waiting for responses
const pendingRequests = new Map<string, {
    resolve: (value: unknown) => void;
    reject: (error: Error) => void;
}>();

// Iframe state
let iframe: HTMLIFrameElement | null = null;
let iframeReady = false;
let iframeReadyPromise: Promise<void> | null = null;
let progressCallback: ((progress: TransformersProgressData) => void) | null = null;

// Generate unique request IDs
let requestIdCounter = 0;
function generateRequestId(): string {
    return `req_${++requestIdCounter}_${Date.now()}`;
}

/**
 * HTML content for the transformers.js iframe
 * Uses CDN-hosted transformers.js to avoid bundling issues
 */
function getIframeHtml(): string {
    return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <script type="module">
        // Import transformers.js v3.2+ from CDN
        // v3.2.0 added Moonshine support
        import { pipeline, env } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.2.4';

        // Configure for browser usage
        env.allowLocalModels = false;
        env.useBrowserCache = true;

        // Store loaded pipelines
        const pipelines = new Map();

        // Send ready signal
        window.parent.postMessage({ type: 'ready' }, '*');

        // Handle messages from parent
        window.addEventListener('message', async (event) => {
            const { type, id, model, audioData, options } = event.data;

            try {
                if (type === 'loadModel') {
                    console.log('[Iframe] Loading model:', model);
                    window.parent.postMessage({ type: 'progress', data: { status: 'initiate', name: model } }, '*');

                    const pipe = await pipeline('automatic-speech-recognition', model, {
                        progress_callback: (progress) => {
                            window.parent.postMessage({ type: 'progress', data: progress }, '*');
                        }
                    });

                    pipelines.set(model, pipe);
                    console.log('[Iframe] Model loaded successfully');
                    window.parent.postMessage({ type: 'loaded', id, data: { success: true } }, '*');

                } else if (type === 'transcribe') {
                    console.log('[Iframe] Transcribe request, samples:', audioData?.length, 'model:', model);

                    // Get or create pipeline
                    let pipe = pipelines.get(model);
                    if (!pipe) {
                        console.log('[Iframe] Pipeline not cached, loading...');
                        pipe = await pipeline('automatic-speech-recognition', model, {
                            progress_callback: (progress) => {
                                window.parent.postMessage({ type: 'progress', data: progress }, '*');
                            }
                        });
                        pipelines.set(model, pipe);
                    }

                    // Convert array back to Float32Array
                    const audio = new Float32Array(audioData);
                    console.log('[Iframe] Running transcription, audio length:', audio.length);

                    // Run transcription
                    const result = await pipe(audio, options || {});
                    console.log('[Iframe] Transcription complete:', result);

                    window.parent.postMessage({ type: 'result', id, data: result }, '*');
                }
            } catch (error) {
                console.error('[Iframe] Error:', error);
                window.parent.postMessage({
                    type: 'error',
                    id,
                    data: { message: error.message, stack: error.stack }
                }, '*');
            }
        });
    </script>
</head>
<body></body>
</html>`;
}

/**
 * Create and initialize the iframe
 */
function createIframe(): Promise<void> {
    if (iframeReadyPromise) {
        return iframeReadyPromise;
    }

    iframeReadyPromise = new Promise((resolve, reject) => {
        // Create hidden iframe
        iframe = document.createElement('iframe');
        iframe.style.display = 'none';
        // allow-scripts: needed to run JavaScript
        // allow-same-origin: needed for Cache API (model caching)
        // Note: This combination can escape sandbox, but we control the content
        iframe.sandbox.add('allow-scripts', 'allow-same-origin');

        // Set up message handler
        const messageHandler = (event: MessageEvent<IframeMessage>) => {
            // Verify message is from our iframe
            if (event.source !== iframe?.contentWindow) {
                return;
            }

            const { type, id, data } = event.data;

            switch (type) {
                case 'ready':
                    iframeReady = true;
                    resolve();
                    break;

                case 'progress':
                    if (progressCallback && data) {
                        progressCallback(data as TransformersProgressData);
                    }
                    break;

                case 'result':
                case 'loaded':
                    if (id && pendingRequests.has(id)) {
                        const { resolve } = pendingRequests.get(id)!;
                        pendingRequests.delete(id);
                        resolve(data);
                    }
                    break;

                case 'error':
                    if (id && pendingRequests.has(id)) {
                        const { reject } = pendingRequests.get(id)!;
                        pendingRequests.delete(id);
                        const errorData = data as { message: string; stack?: string };
                        reject(new Error(errorData.message));
                    }
                    break;
            }
        };

        window.addEventListener('message', messageHandler);

        // Set iframe content via srcdoc
        iframe.srcdoc = getIframeHtml();

        // Timeout for iframe initialization
        const timeout = setTimeout(() => {
            if (!iframeReady) {
                reject(new Error('Iframe initialization timed out'));
            }
        }, 30000);

        iframe.onload = () => {
            // Wait a bit for the script to initialize
            setTimeout(() => {
                if (!iframeReady) {
                    // If still not ready, try to resolve anyway
                    console.log('Iframe loaded but not yet signaled ready');
                }
            }, 1000);
        };

        iframe.onerror = () => {
            clearTimeout(timeout);
            reject(new Error('Failed to load iframe'));
        };

        // Append to document
        document.body.appendChild(iframe);
    });

    return iframeReadyPromise;
}

/**
 * Send a message to the iframe and wait for response
 */
async function sendMessage<T>(message: TranscribeRequest | LoadModelRequest): Promise<T> {
    await createIframe();

    if (!iframe?.contentWindow) {
        throw new Error('Iframe not available');
    }

    return new Promise((resolve, reject) => {
        pendingRequests.set(message.id, {
            resolve: resolve as (value: unknown) => void,
            reject
        });

        // Set timeout for request
        const timeout = setTimeout(() => {
            if (pendingRequests.has(message.id)) {
                pendingRequests.delete(message.id);
                reject(new Error('Request timed out'));
            }
        }, 300000); // 5 minute timeout for model loading

        // Store timeout reference for cleanup
        const originalResolve = pendingRequests.get(message.id)!.resolve;
        pendingRequests.get(message.id)!.resolve = (value) => {
            clearTimeout(timeout);
            originalResolve(value);
        };

        iframe!.contentWindow!.postMessage(message, '*');
    });
}

/**
 * Export types for external use
 */
export interface ASRPipeline {
    (audio: Float32Array, options?: Record<string, unknown>): Promise<{ text: string }>;
}

/**
 * Load the model in the iframe
 */
export async function loadModel(
    modelPath: string,
    onProgress?: (progress: TransformersProgressData) => void
): Promise<void> {
    progressCallback = onProgress || null;

    const id = generateRequestId();
    await sendMessage<{ success: boolean }>({
        type: 'loadModel',
        id,
        model: modelPath
    });

    progressCallback = null;
}

/**
 * Transcribe audio using the model loaded in the iframe
 */
export async function transcribeAudio(
    audioData: Float32Array,
    modelPath: string,
    options?: Record<string, unknown>
): Promise<string> {
    const id = generateRequestId();
    console.log('[TransformersLoader] Transcribing audio, samples:', audioData.length, 'model:', modelPath);

    // Convert Float32Array to regular array for postMessage
    const audioArray = Array.from(audioData);
    console.log('[TransformersLoader] Converted to array, sending to iframe...');

    const result = await sendMessage<{ text: string }>({
        type: 'transcribe',
        id,
        audioData: audioArray,
        model: modelPath,
        options
    });

    console.log('[TransformersLoader] Received result from iframe:', result);
    return result.text || '';
}

/**
 * Check if the iframe is ready
 */
export function isTransformersLoaded(): boolean {
    return iframeReady;
}

/**
 * Preload the iframe in the background
 */
export function preloadTransformers(): void {
    createIframe().catch(() => {
        // Silent fail for preload
    });
}

/**
 * Clean up the iframe
 */
export function destroyTransformers(): void {
    if (iframe && iframe.parentNode) {
        iframe.parentNode.removeChild(iframe);
    }
    iframe = null;
    iframeReady = false;
    iframeReadyPromise = null;
    pendingRequests.clear();
}

// Legacy exports for compatibility with existing code
export async function createASRPipeline(
    modelPath: string,
    options?: {
        dtype?: string;
        device?: string;
        progress_callback?: (progress: TransformersProgressData) => void;
    }
): Promise<ASRPipeline> {
    // Load the model
    await loadModel(modelPath, options?.progress_callback);

    // Return a function that transcribes audio
    return async (audio: Float32Array, transcribeOptions?: Record<string, unknown>) => {
        const text = await transcribeAudio(audio, modelPath, transcribeOptions);
        return { text };
    };
}

export async function loadTransformers(): Promise<unknown> {
    await createIframe();
    return {}; // Return empty object for compatibility
}

export async function getPipeline(): Promise<unknown> {
    await createIframe();
    return {}; // Not used with iframe approach
}
