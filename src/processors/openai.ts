import { NeuroVoxSettings } from '../settings/Settings';

const API_BASE_URL = 'https://api.openai.com/v1';
const WHISPER_MODEL = 'whisper-1';
const TTS_MODEL = 'tts-1';

async function sendOpenAIRequest(endpoint: string, body: any, settings: NeuroVoxSettings, isFormData: boolean = false, isBinaryResponse: boolean = false): Promise<any> {
    console.log(`[sendOpenAIRequest] Starting request to ${endpoint}`);

    let requestBody: any;
    let headers: Record<string, string> = {
        'Authorization': `Bearer ${settings.openaiApiKey}`,
    };

    if (isFormData) {
        requestBody = new FormData();
        requestBody.append('file', body, 'audio.wav');
        requestBody.append('model', WHISPER_MODEL);
    } else {
        requestBody = JSON.stringify(body);
        headers['Content-Type'] = 'application/json';
    }

    const url = `${API_BASE_URL}${endpoint}`;

    try {
        let response;
        if (isFormData) {
            response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${settings.openaiApiKey}`,
                },
                body: requestBody,
            });
        } else {
            response = await fetch(url, {
                method: 'POST',
                headers: headers,
                body: requestBody,
            });
        }

        console.log(`[sendOpenAIRequest] Response status: ${response.status}`);
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error('[sendOpenAIRequest] Error response:', errorText);
            throw new Error(`OpenAI API request failed: ${response.status} - ${errorText}`);
        }

        if (isBinaryResponse) {
            return await response.arrayBuffer();
        } else {
            return await response.json();
        }
    } catch (error) {
        console.error('[sendOpenAIRequest] Error:', error);
        throw error;
    }
}

export async function transcribeAudio(audioBlob: Blob, settings: NeuroVoxSettings): Promise<string> {
    console.log('[transcribeAudio] Starting transcription');
    
    if (!(audioBlob instanceof Blob)) {
        throw new Error('Invalid input: audioBlob must be a Blob object');
    }

    if (audioBlob.size === 0) {
        throw new Error('Invalid input: audioBlob is empty');
    }

    console.log(`[transcribeAudio] Audio blob size: ${audioBlob.size} bytes`);
    console.log(`[transcribeAudio] Audio blob type: ${audioBlob.type}`);

    const endpoint = '/audio/transcriptions';

    try {
        const result = await sendOpenAIRequest(endpoint, audioBlob, settings, true);
        console.log('[transcribeAudio] Transcription result:', result);
        return result.text;
    } catch (error) {
        console.error('[transcribeAudio] Transcription error:', error);
        throw new Error(`Failed to transcribe audio: ${error.message}`);
    }
}

export async function generateChatCompletion(transcript: string, settings: NeuroVoxSettings): Promise<string> {
    console.log('[generateChatCompletion] Starting chat completion');
    
    const endpoint = '/chat/completions';

    // Ensure max_tokens does not exceed the model's limit
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
        console.log('[generateChatCompletion] Chat completion result:', result);
        return result.choices[0].message.content;
    } catch (error) {
        console.error('[generateChatCompletion] Chat completion error:', error);
        throw new Error(`Failed to generate chat completion: ${error.message}`);
    }
}

export async function generateSpeech(text: string, settings: NeuroVoxSettings): Promise<ArrayBuffer> {
    console.log('[generateSpeech] Starting speech generation');
    
    const endpoint = '/audio/speech';

    const requestBody = {
        model: TTS_MODEL,
        input: text,
        voice: settings.voiceChoice,
        response_format: 'wav',
        speed: settings.voiceSpeed
    };

    try {
        const result = await sendOpenAIRequest(endpoint, requestBody, settings, false, true);
        console.log('[generateSpeech] Speech generation result:', result);
        return result;
    } catch (error) {
        console.error('[generateSpeech] Speech generation error:', error);
        throw new Error(`Failed to generate speech: ${error.message}`);
    }
}
