// src/utils/audio/WavSplitter.ts

/**
 * A single independently-decodable WAV segment sliced from a larger recording.
 */
export interface WavSegment {
    blob: Blob;
    index: number;
    offsetMs: number;   // start offset from the beginning of the recording
    durationMs: number; // duration of this segment
}

interface WavFormat {
    numChannels: number;
    sampleRate: number;
    byteRate: number;
    blockAlign: number;
    bitsPerSample: number;
}

function readFourCC(view: DataView, offset: number): string {
    return String.fromCharCode(
        view.getUint8(offset),
        view.getUint8(offset + 1),
        view.getUint8(offset + 2),
        view.getUint8(offset + 3)
    );
}

function writeFourCC(view: DataView, offset: number, text: string): void {
    for (let i = 0; i < text.length; i++) {
        view.setUint8(offset + i, text.charCodeAt(i));
    }
}

/**
 * Builds a standalone 16-bit PCM WAV file (44-byte header + data) around a slice of PCM.
 */
function buildWav(pcm: Uint8Array, fmt: WavFormat): Uint8Array {
    const out = new Uint8Array(44 + pcm.length);
    const view = new DataView(out.buffer);

    writeFourCC(view, 0, 'RIFF');
    view.setUint32(4, 36 + pcm.length, true);
    writeFourCC(view, 8, 'WAVE');

    writeFourCC(view, 12, 'fmt ');
    view.setUint32(16, 16, true);              // PCM fmt chunk size
    view.setUint16(20, 1, true);               // audio format = PCM
    view.setUint16(22, fmt.numChannels, true);
    view.setUint32(24, fmt.sampleRate, true);
    view.setUint32(28, fmt.sampleRate * fmt.numChannels * (fmt.bitsPerSample / 8), true);
    view.setUint16(32, fmt.numChannels * (fmt.bitsPerSample / 8), true);
    view.setUint16(34, fmt.bitsPerSample, true);

    writeFourCC(view, 36, 'data');
    view.setUint32(40, pcm.length, true);

    out.set(pcm, 44);
    return out;
}

/**
 * Splits a PCM WAV blob into ~segmentSeconds-long segments, each a valid standalone WAV.
 *
 * This bounds per-request memory when transcribing long recordings: instead of holding the
 * entire recording as one arrayBuffer/upload, each segment is transcribed and freed in turn.
 *
 * Returns null when the blob isn't a parseable PCM WAV (the caller should then fall back to
 * transcribing the whole blob), and a single-element array when the recording is already
 * shorter than one segment.
 */
export async function splitWavBlob(blob: Blob, segmentSeconds: number): Promise<WavSegment[] | null> {
    const buffer = await blob.arrayBuffer();
    if (buffer.byteLength < 44) return null;

    const view = new DataView(buffer);
    if (readFourCC(view, 0) !== 'RIFF' || readFourCC(view, 8) !== 'WAVE') {
        return null;
    }

    let fmt: WavFormat | null = null;
    let dataOffset = -1;
    let dataSize = 0;

    // Walk the RIFF chunks (fmt/data may not be at fixed offsets if extra chunks exist).
    let offset = 12;
    while (offset + 8 <= buffer.byteLength) {
        const id = readFourCC(view, offset);
        const size = view.getUint32(offset + 4, true);
        const body = offset + 8;

        if (id === 'fmt ') {
            const audioFormat = view.getUint16(body, true);
            if (audioFormat !== 1) return null; // only uncompressed PCM is sliceable this way
            fmt = {
                numChannels: view.getUint16(body + 2, true),
                sampleRate: view.getUint32(body + 4, true),
                byteRate: view.getUint32(body + 8, true),
                blockAlign: view.getUint16(body + 12, true),
                bitsPerSample: view.getUint16(body + 14, true)
            };
        } else if (id === 'data') {
            dataOffset = body;
            dataSize = size;
            break; // data is the payload; stop once found
        }

        offset = body + size + (size % 2); // chunks are word-aligned
    }

    if (!fmt || dataOffset < 0 || fmt.blockAlign <= 0) return null;

    // Guard against a declared data size larger than the actual bytes present.
    dataSize = Math.min(dataSize, buffer.byteLength - dataOffset);
    if (dataSize <= 0) return null;

    const bytesPerSecond = fmt.byteRate || fmt.sampleRate * fmt.blockAlign;
    if (bytesPerSecond <= 0) return null;

    // Segment length in bytes, aligned to a whole audio frame.
    let segBytes = Math.floor(bytesPerSecond * segmentSeconds);
    segBytes -= segBytes % fmt.blockAlign;
    if (segBytes < fmt.blockAlign) segBytes = fmt.blockAlign;

    const bytes = new Uint8Array(buffer);
    const segments: WavSegment[] = [];
    let pos = 0;
    let index = 0;

    while (pos < dataSize) {
        const len = Math.min(segBytes, dataSize - pos);
        const pcm = bytes.subarray(dataOffset + pos, dataOffset + pos + len);
        segments.push({
            blob: new Blob([buildWav(pcm, fmt)], { type: 'audio/wav' }),
            index,
            offsetMs: Math.round((pos / bytesPerSecond) * 1000),
            durationMs: Math.round((len / bytesPerSecond) * 1000)
        });
        pos += len;
        index++;
    }

    return segments;
}
