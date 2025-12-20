import { requestUrl } from 'obsidian';
import { AIAdapter, AIProvider } from './AIAdapter';
import { NeuroVoxSettings } from '../settings/Settings';

export class SaladAdapter extends AIAdapter {
    private apiKey: string = '';
    private organization: string = '';

    constructor(settings: NeuroVoxSettings) {
        super(settings, AIProvider.Salad);
    }

    getApiKey(): string {
        return this.apiKey;
    }

    getOrganization(): string {
        return this.organization;
    }

    setOrganization(org: string): void {
        this.organization = org;
    }

    protected setApiKeyInternal(key: string): void {
        this.apiKey = key;
    }

    protected getApiBaseUrl(): string {
        return 'https://api.salad.com/api/public';
    }

    protected getStorageBaseUrl(): string {
        return 'https://storage-api.salad.com';
    }

    protected getTextGenerationEndpoint(): string {
        return '';
    }

    protected getTranscriptionEndpoint(): string {
        return `/organizations/${this.organization}/inference-endpoints`;
    }

    protected async validateApiKeyImpl(): Promise<boolean> {
        if (!this.apiKey || !this.organization) {
            return false;
        }

        try {
            const response = await this.makeAPIRequest(
                `${this.getStorageBaseUrl()}/organizations/${this.organization}/files`,
                'GET',
                {},
                null
            );
            return response && Array.isArray(response.files);
        } catch (error) {
            return false;
        }
    }

    protected parseTextGenerationResponse(response: any): string {
        throw new Error('Text generation not supported by Salad');
    }

    protected parseTranscriptionResponse(response: any): string {
        if (response?.output?.text) {
            return response.output.text;
        }
        throw new Error('Invalid transcription response format from Salad');
    }

    public async transcribeAudio(audioArrayBuffer: ArrayBuffer, model: string): Promise<string> {
        try {
            if (!this.organization) {
                throw new Error('Salad organization name is not configured');
            }

            const audioUrl = await this.uploadToS4Storage(audioArrayBuffer);
            
            const jobId = await this.submitTranscriptionJob(audioUrl, model);
            
            const result = await this.pollForResult(jobId, model);
            
            await this.deleteFromS4Storage(audioUrl);
            
            return this.parseTranscriptionResponse(result);
        } catch (error) {
            const message = this.getErrorMessage(error);
            throw new Error(`Failed to transcribe audio with Salad: ${message}`);
        }
    }

    private async uploadToS4Storage(audioArrayBuffer: ArrayBuffer): Promise<string> {
        const fileName = `audio/neurovox_${Date.now()}.wav`;
        const uploadUrl = `${this.getStorageBaseUrl()}/organizations/${this.organization}/files/${fileName}`;

        const boundary = 'saladuploadboundary';
        const encoder = new TextEncoder();
        
        const parts: Uint8Array[] = [];
        
        parts.push(encoder.encode(`--${boundary}\r\n`));
        parts.push(encoder.encode('Content-Disposition: form-data; name="mimeType"\r\n\r\n'));
        parts.push(encoder.encode('audio/wav'));
        parts.push(encoder.encode('\r\n'));
        
        parts.push(encoder.encode(`--${boundary}\r\n`));
        parts.push(encoder.encode('Content-Disposition: form-data; name="sign"\r\n\r\n'));
        parts.push(encoder.encode('true'));
        parts.push(encoder.encode('\r\n'));
        
        parts.push(encoder.encode(`--${boundary}\r\n`));
        parts.push(encoder.encode('Content-Disposition: form-data; name="signatureExp"\r\n\r\n'));
        parts.push(encoder.encode('86400'));
        parts.push(encoder.encode('\r\n'));
        
        parts.push(encoder.encode(`--${boundary}\r\n`));
        parts.push(encoder.encode(`Content-Disposition: form-data; name="file"; filename="audio.wav"\r\n`));
        parts.push(encoder.encode('Content-Type: audio/wav\r\n\r\n'));
        parts.push(new Uint8Array(audioArrayBuffer));
        parts.push(encoder.encode('\r\n'));
        
        parts.push(encoder.encode(`--${boundary}--\r\n`));
        
        const totalLength = parts.reduce((acc, part) => acc + part.length, 0);
        const finalBuffer = new Uint8Array(totalLength);
        let offset = 0;
        
        for (const part of parts) {
            finalBuffer.set(part, offset);
            offset += part.length;
        }

        const response = await requestUrl({
            url: uploadUrl,
            method: 'PUT',
            headers: {
                'Salad-Api-Key': this.apiKey,
                'Content-Type': `multipart/form-data; boundary=${boundary}`
            },
            body: finalBuffer.buffer,
            throw: true
        });

        if (!response.json?.url) {
            throw new Error('Failed to get signed URL from S4 storage');
        }

        return response.json.url;
    }

    private async submitTranscriptionJob(audioUrl: string, model: string): Promise<string> {
        const endpoint = `${this.getApiBaseUrl()}/organizations/${this.organization}/inference-endpoints/${model}/jobs`;
        
        const body = {
            input: {
                url: audioUrl,
                language_code: 'auto',
                return_as_file: false,
                sentence_level_timestamps: false,
                word_level_timestamps: false,
                diarization: false,
                srt: false
            }
        };

        const response = await this.makeAPIRequest(
            endpoint,
            'POST',
            { 'Content-Type': 'application/json' },
            JSON.stringify(body)
        );

        if (!response?.id) {
            throw new Error('Failed to submit transcription job');
        }

        return response.id;
    }

    private async pollForResult(jobId: string, model: string, maxAttempts: number = 120, intervalMs: number = 2000): Promise<any> {
        const endpoint = `${this.getApiBaseUrl()}/organizations/${this.organization}/inference-endpoints/${model}/jobs/${jobId}`;
        
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            const response = await this.makeAPIRequest(endpoint, 'GET', {}, null);
            
            if (response?.status === 'succeeded') {
                return response;
            } else if (response?.status === 'failed') {
                throw new Error(`Transcription job failed: ${response?.error || 'Unknown error'}`);
            }
            
            await new Promise(resolve => setTimeout(resolve, intervalMs));
        }
        
        throw new Error('Transcription job timed out');
    }

    private async deleteFromS4Storage(signedUrl: string): Promise<void> {
        try {
            const urlWithoutToken = signedUrl.split('?')[0];
            
            await requestUrl({
                url: urlWithoutToken,
                method: 'DELETE',
                headers: {
                    'Salad-Api-Key': this.apiKey
                },
                throw: false
            });
        } catch (error) {
        }
    }

    protected async makeAPIRequest(
        endpoint: string, 
        method: string, 
        headers: Record<string, string>,
        body: string | ArrayBuffer | null
    ): Promise<any> {
        try {
            const requestHeaders: Record<string, string> = {
                'Salad-Api-Key': this.apiKey,
                ...headers
            };

            const response = await requestUrl({
                url: endpoint,
                method,
                headers: requestHeaders,
                body: body || undefined,
                throw: true
            });

            if (!response.json) {
                throw new Error('Invalid response format');
            }

            return response.json;
        } catch (error: any) {
            throw error;
        }
    }
}
