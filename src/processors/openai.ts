// src/utils/openai.ts

import { requestUrl, RequestUrlResponse } from 'obsidian';
import { NeuroVoxSettings } from '../settings/Settings';

const API_BASE_URL = 'https://api.openai.com/v1';
const WHISPER_MODEL = 'whisper-1';
const TTS_MODEL = 'tts-1';

/**
 * Sends a request to OpenAI API
 */
async function sendOpenAIRequest(endpoint: string, body: any, settings: NeuroVoxSettings, isJson: boolean = true): Promise<any> {
    console.log(`Sending request to ${endpoint}`);
    console.log(`API Key: ${settings.openaiApiKey.substring(0, 5)}...`); // Log first 5 chars of API key

    const headers: Record<string, string> = {
        'Authorization': `Bearer ${settings.openaiApiKey}`,
    };

    if (isJson) {
        headers['Content-Type'] = 'application/json';
        body = JSON.stringify(body);
    }

    try {
        const response: RequestUrlResponse = await requestUrl({
            url: endpoint,
            method: 'POST',
            headers: headers,
            body: body,
        });

        console.log(`Response status: ${response.status}`);

        if (response.status !== 200) {
            console.error('Response text:', response.text);
            throw new Error(`OpenAI API request failed: ${response.status}`);
        }

        return JSON.parse(response.text);
    } catch (error) {
        console.error('Error in sendOpenAIRequest:', error);
        throw error;
    }
}

/**
 * Transcribes audio using OpenAI's Whisper model.
 */
export async function transcribeAudio(audioBlob: Blob, settings: NeuroVoxSettings): Promise<string> {
    const endpoint = `${API_BASE_URL}/audio/transcriptions`;
    
    const formData = new FormData();
    formData.append('file', audioBlob, 'audio.mp3');
    formData.append('model', WHISPER_MODEL);

    try {
        const result = await sendOpenAIRequest(endpoint, formData, settings, false);
        return result.text;
    } catch (error) {
        console.error('Transcription error:', error);
        throw new Error(`Failed to transcribe audio: ${error.message}`);
    }
}

/**
 * Generates a chat completion using OpenAI's chat model.
 */
export async function generateChatCompletion(transcript: string, settings: NeuroVoxSettings): Promise<string> {
    const endpoint = `${API_BASE_URL}/chat/completions`;

    try {
        const result = await sendOpenAIRequest(endpoint, {
            model: settings.openaiModel,
            messages: [
                { role: 'system', content: settings.prompt },
                { role: 'user', content: transcript }
            ],
            max_tokens: settings.maxTokens
        }, settings);

        return result.choices[0].message.content;
    } catch (error) {
        console.error('Chat completion error:', error);
        throw new Error(`Failed to generate chat completion: ${error.message}`);
    }
}

/**
 * Generates audio from input text using OpenAI's text-to-speech API.
 */
export async function generateSpeech(text: string, settings: NeuroVoxSettings): Promise<Blob> {
    const endpoint = `${API_BASE_URL}/audio/speech`;

    try {
        const result = await sendOpenAIRequest(endpoint, {
            model: TTS_MODEL,
            input: text,
            voice: settings.voiceChoice,
            response_format: 'mp3',
            speed: settings.voiceSpeed
        }, settings);

        return new Blob([result], { type: 'audio/mp3' });
    } catch (error) {
        console.error('Speech generation error:', error);
        throw new Error(`Failed to generate speech: ${error.message}`);
    }
}