// src/utils/openai.ts

import { requestUrl, RequestUrlResponse } from 'obsidian';
import { NeuroVoxSettings } from '../settings/Settings';

const API_BASE_URL = 'https://api.openai.com/v1';
const WHISPER_MODEL = 'whisper-1';
const TTS_MODEL = 'tts-1';

/**
 * Converts a Blob to a base64 encoded string
 */
async function blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

/**
 * Sends a request to OpenAI API
 */
async function sendOpenAIRequest(endpoint: string, body: any, settings: NeuroVoxSettings): Promise<any> {
    const response: RequestUrlResponse = await requestUrl({
        url: endpoint,
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${settings.openaiApiKey}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
    });

    if (response.status !== 200) {
        throw new Error(`OpenAI API request failed: ${response.status} ${response.text}`);
    }

    return JSON.parse(response.text);
}

/**
 * Transcribes audio using OpenAI's Whisper model.
 * 
 * @param audioBlob - The audio data to transcribe
 * @param settings - The NeuroVox plugin settings
 * @returns The transcribed text
 */
export async function transcribeAudio(audioBlob: Blob, settings: NeuroVoxSettings): Promise<string> {
    const endpoint = `${API_BASE_URL}/audio/transcriptions`;
    
    // Convert audio blob to base64
    const base64Audio = await blobToBase64(audioBlob);
    // Remove the data URL prefix
    const base64Data = base64Audio.split(',')[1];

    const result = await sendOpenAIRequest(endpoint, {
        model: WHISPER_MODEL,
        file: base64Data,
        response_format: 'json'
    }, settings);

    return result.text;
}

/**
 * Generates a chat completion using OpenAI's chat model.
 * 
 * @param transcript - The transcribed text to summarize
 * @param settings - The NeuroVox plugin settings
 * @returns The generated response text
 */
export async function generateChatCompletion(transcript: string, settings: NeuroVoxSettings): Promise<string> {
    const endpoint = `${API_BASE_URL}/chat/completions`;

    const result = await sendOpenAIRequest(endpoint, {
        model: settings.openaiModel,
        messages: [
            { role: 'system', content: settings.prompt },
            { role: 'user', content: transcript }
        ],
        max_tokens: settings.maxTokens
    }, settings);

    return result.choices[0].message.content;
}

/**
 * Generates audio from input text using OpenAI's text-to-speech API.
 * 
 * @param text - The text to convert to speech
 * @param settings - The NeuroVox plugin settings
 * @returns A Blob containing the audio data
 */
export async function generateSpeech(text: string, settings: NeuroVoxSettings): Promise<Blob> {
    const endpoint = `${API_BASE_URL}/audio/speech`;

    const response: RequestUrlResponse = await requestUrl({
        url: endpoint,
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${settings.openaiApiKey}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            model: TTS_MODEL,
            input: text,
            voice: settings.voiceChoice,
            response_format: 'mp3',
            speed: settings.voiceSpeed
        }),
    });

    if (response.status !== 200) {
        throw new Error(`Failed to generate speech: ${response.status} ${response.text}`);
    }

    return new Blob([response.arrayBuffer], { type: 'audio/mp3' });
}