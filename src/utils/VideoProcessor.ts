import { Notice, TFile } from 'obsidian';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';
import { PluginData } from '../types';
import NeuroVoxPlugin from '../main';
import { RecordingProcessor } from './RecordingProcessor';

export class VideoProcessor {
    private static instance: VideoProcessor | null = null;
    private ffmpeg: any;
    private isProcessing = false;

    private constructor(
        private plugin: NeuroVoxPlugin,
        private pluginData: PluginData
    ) {}

    public static async getInstance(plugin: NeuroVoxPlugin, pluginData: PluginData): Promise<VideoProcessor> {
        if (!this.instance) {
            this.instance = new VideoProcessor(plugin, pluginData);
            await this.instance.initializeFFmpeg();
        }
        return this.instance;
    }

    private async initializeFFmpeg(): Promise<void> {
        this.ffmpeg = new FFmpeg();
        
        // Load FFmpeg with proper CORS settings
        const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd';
        await this.ffmpeg.load({
            coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
            wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm')
        });
    }

    public async processVideo(file: TFile): Promise<void> {
        if (this.isProcessing) {
            throw new Error('Video processing is already in progress.');
        }

        try {
            this.isProcessing = true;
            new Notice('Starting video processing...');

            // Create output markdown file
            const transcriptFile = await this.createTranscriptFile(file);

            // Extract audio from video
            const audioBuffer = await this.extractAudioFromVideo(file);

            // Process the audio using RecordingProcessor
            const recordingProcessor = RecordingProcessor.getInstance(this.plugin, this.pluginData);
            const audioBlob = new Blob([audioBuffer], { type: 'audio/wav' });

            await recordingProcessor.processRecording(
                audioBlob,
                transcriptFile,
                { line: 0, ch: 0 },
                file.path
            );

            new Notice('Video transcription completed successfully.');
            await this.plugin.app.workspace.getLeaf().openFile(transcriptFile);

        } catch (error) {
            console.error('Video processing failed:', error);
            new Notice('Video processing failed. Check console for details.');
            throw error;
        } finally {
            this.isProcessing = false;
        }
    }

    private async createTranscriptFile(videoFile: TFile): Promise<TFile> {
        const baseName = videoFile.basename.replace(/[\\/:*?"<>|]/g, '');
        const fileName = `${baseName} - Video Transcript.md`;
        return this.plugin.app.vault.create(fileName, '');
    }

    private async extractAudioFromVideo(file: TFile): Promise<ArrayBuffer> {
        new Notice('Extracting audio from video...');
        
        try {
            const videoData = await this.plugin.app.vault.readBinary(file);
            const videoBlob = new Blob([videoData], { type: this.getVideoMimeType(file.extension) });
            const videoURL = URL.createObjectURL(videoBlob);
            
            // Write input file
            await this.ffmpeg.writeFile('input.' + file.extension, await fetchFile(videoURL));
            
            // Extract audio with better quality settings
            await this.ffmpeg.exec([
                '-i', 'input.' + file.extension,
                '-vn',                    // No video
                '-acodec', 'libmp3lame', // MP3 codec
                '-ab', '320k',           // Bitrate
                '-ar', '44100',          // Sample rate
                '-ac', '2',              // Stereo
                'output.mp3'             // Output file
            ]);
            
            // Read the output file
            const data = await this.ffmpeg.readFile('output.mp3');
            
            // Clean up
            URL.revokeObjectURL(videoURL);
            await this.ffmpeg.deleteFile('input.' + file.extension);
            await this.ffmpeg.deleteFile('output.mp3');
            
            return (data as Uint8Array).buffer;
            
        } catch (error) {
            console.error('Audio extraction failed:', error);
            throw new Error('Failed to extract audio from video');
        }
    }

    private getVideoMimeType(extension: string): string {
        const mimeTypes: Record<string, string> = {
            'mp4': 'video/mp4',
            'webm': 'video/webm',
            'mov': 'video/quicktime'
        };
        return mimeTypes[extension.toLowerCase()] || 'video/mp4';
    }
}