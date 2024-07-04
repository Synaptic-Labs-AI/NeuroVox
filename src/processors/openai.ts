import { NeuroVoxSettings } from '../settings/Settings';
import { Notice } from 'obsidian';

// Helper function for debug notices
function debugNotice(message: string) {
    new Notice(`[DEBUG] ${message}`, 5000);  // Display for 5 seconds
}

const API_BASE_URL = 'https://api.openai.com/v1';
const WHISPER_MODEL = 'whisper-1';
const TTS_MODEL = 'tts-1';

/**
 * Sends a request to the OpenAI API.
 * 
 * @param endpoint - The API endpoint to send the request to.
 * @param body - The request payload.
 * @param settings - The NeuroVox plugin settings.
 * @param isFormData - Indicates if the request body is form data.
 * @param isBinaryResponse - Indicates if the response is expected to be binary.
 * @returns The response from the API.
 * @throws Error if the API request fails.
 */
async function sendOpenAIRequest(
    endpoint: string, 
    body: any, 
    settings: NeuroVoxSettings, 
    isFormData: boolean = false, 
    isBinaryResponse: boolean = false
): Promise<any> {
    const url = `${API_BASE_URL}${endpoint}`;
    const headers: Record<string, string> = {
        'Authorization': `Bearer ${settings.openaiApiKey}`,
    };

    let requestBody: any;
    if (isFormData) {
        requestBody = new FormData();
        // Change the file extension to ..wav
        requestBody.append('file', body, 'audio.wav');
        requestBody.append('model', WHISPER_MODEL);
        
        // Log FormData entries
        for (let [key, value] of requestBody.entries()) {
            debugNotice(`FormData entry - ${key}: ${value}`);
        }
    } else {
        requestBody = JSON.stringify(body);
        headers['Content-Type'] = 'application/json';
    }

<<<<<<< HEAD
=======
    const url = `${API_BASE_URL}${endpoint}`;
    debugNotice(`Sending request to ${url}`);

>>>>>>> 5d40b8d (replaced mediarecorder with recordrtc so it would work for apple. works but only records in wav, so cant replay on apple.)
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: headers,
            body: requestBody,
        });

        if (!response.ok) {
            const errorText = await response.text();
            debugNotice(`API Error Response: ${errorText}`);
            throw new Error(`OpenAI API request failed: ${response.status} - ${errorText}`);
        }

        return isBinaryResponse ? await response.arrayBuffer() : await response.json();
    } catch (error) {
        debugNotice(`[sendOpenAIRequest] Error: ${error.message}`);
        throw error;
    }
}

/**
 * Transcribes audio using the OpenAI API.
 * 
 * @param audioBlob - The audio data as a Blob object.
 * @param settings - The NeuroVox plugin settings.
 * @returns The transcribed text.
 * @throws Error if the transcription fails.
 */
export async function transcribeAudio(audioBlob: Blob, settings: NeuroVoxSettings): Promise<string> {
    if (!(audioBlob instanceof Blob)) {
        debugNotice('Invalid input: audioBlob must be a Blob object');
        throw new Error('Invalid input: audioBlob must be a Blob object');
    }

    if (audioBlob.size === 0) {
        debugNotice('Invalid input: audioBlob is empty');
        throw new Error('Invalid input: audioBlob is empty');
    }

    debugNotice(`Transcribing audio - Blob size: ${audioBlob.size}, type: ${audioBlob.type}`);

    const endpoint = '/audio/transcriptions';

    try {
        const result = await sendOpenAIRequest(endpoint, audioBlob, settings, true);
        debugNotice(`Transcription successful - length: ${result.text.length}`);
        return result.text;
    } catch (error) {
        debugNotice(`[transcribeAudio] Transcription error: ${error.message}`);
        throw new Error(`Failed to transcribe audio: ${error.message}`);
    }
}

/**
 * Generates a chat completion using the OpenAI API.
 * 
 * @param transcript - The transcript text to generate a completion for.
 * @param settings - The NeuroVox plugin settings.
 * @returns The generated chat completion text.
 * @throws Error if the chat completion fails.
 */
export async function generateChatCompletion(transcript: string, settings: NeuroVoxSettings): Promise<string> {
    const endpoint = '/chat/completions';
    const maxTokens = Math.min(settings.maxTokens, 4096);

    const requestBody = {
        model: settings.openaiModel,
        messages: [
            { role: 'system', content: settings.prompt },
            { role: 'user', content: transcript }
        ],
        max_tokens: maxTokens
    };

    try {
        const result = await sendOpenAIRequest(endpoint, requestBody, settings);
        return result.choices[0].message.content;
    } catch (error) {
        console.error('[generateChatCompletion] Chat completion error:', error);
        throw new Error(`Failed to generate chat completion: ${error.message}`);
    }
}

/**
 * Generates speech from text using the OpenAI API.
 * 
 * @param text - The text to generate speech for.
 * @param settings - The NeuroVox plugin settings.
 * @returns The generated speech audio as an ArrayBuffer.
 * @throws Error if the speech generation fails.
 */
export async function generateSpeech(text: string, settings: NeuroVoxSettings): Promise<ArrayBuffer> {
    const endpoint = '/audio/speech';

    const requestBody = {
        model: TTS_MODEL,
        input: text,
        voice: settings.voiceChoice,
        response_format: 'mp3',
        speed: settings.voiceSpeed
    };

    try {
        return await sendOpenAIRequest(endpoint, requestBody, settings, false, true);
    } catch (error) {
        console.error('[generateSpeech] Speech generation error:', error);
        throw new Error(`Failed to generate speech: ${error.message}`);
    }
}
