// src/utils/audio/WavSplitter.test.ts
//
// Unit tests for the WAV segmenter. Pure logic — no network or Obsidian APIs.
// Run with: npm test

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { splitWavBlob } from './WavSplitter';

interface WavParams {
    sampleRate?: number;
    numChannels?: number;
    bitsPerSample?: number;
    /** Extra bytes inserted as a bogus chunk between fmt and data (tests chunk-walking). */
    extraChunk?: boolean;
    /** Overrides the declared data-chunk size (tests clamping). */
    declaredDataSize?: number;
    /** Overrides the fmt audioFormat field (1 = PCM). */
    audioFormat?: number;
}

function writeFourCC(view: DataView, offset: number, text: string): void {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
}

/** Builds a WAV file from raw PCM bytes, optionally malformed for negative tests. */
function makeWav(pcm: Uint8Array, params: WavParams = {}): Uint8Array {
    const sampleRate = params.sampleRate ?? 16000;
    const numChannels = params.numChannels ?? 1;
    const bitsPerSample = params.bitsPerSample ?? 16;
    const audioFormat = params.audioFormat ?? 1;
    const blockAlign = numChannels * (bitsPerSample / 8);

    const extra = params.extraChunk ? 8 + 4 : 0; // "LIST" + size(4) + 4 bytes body
    const total = 44 + extra + pcm.length;
    const out = new Uint8Array(total);
    const view = new DataView(out.buffer);

    writeFourCC(view, 0, 'RIFF');
    view.setUint32(4, total - 8, true);
    writeFourCC(view, 8, 'WAVE');

    writeFourCC(view, 12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, audioFormat, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * blockAlign, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitsPerSample, true);

    let offset = 36;
    if (params.extraChunk) {
        writeFourCC(view, offset, 'LIST');
        view.setUint32(offset + 4, 4, true);
        offset += 12;
    }

    writeFourCC(view, offset, 'data');
    view.setUint32(offset + 4, params.declaredDataSize ?? pcm.length, true);
    out.set(pcm, offset + 8);
    return out;
}

/** Sequential PCM bytes so we can verify slices reassemble to the original data. */
function makePcm(bytes: number): Uint8Array {
    const pcm = new Uint8Array(bytes);
    for (let i = 0; i < bytes; i++) pcm[i] = i % 256;
    return pcm;
}

/** Extracts the PCM payload from a canonical 44-byte-header WAV produced by the splitter. */
async function pcmOf(blob: Blob): Promise<Uint8Array> {
    return new Uint8Array(await blob.arrayBuffer()).subarray(44);
}

const BPS = 16000 * 2; // bytes/sec for 16 kHz mono 16-bit

describe('splitWavBlob', () => {
    it('splits into frame-aligned segments with correct offsets/durations', async () => {
        // 20s of audio, 8s segments -> 8s + 8s + 4s
        const pcm = makePcm(BPS * 20);
        const blob = new Blob([makeWav(pcm)]);

        const segments = await splitWavBlob(blob, 8);
        assert.ok(segments, 'expected segments');
        assert.equal(segments!.length, 3);

        assert.deepEqual(segments!.map(s => s.offsetMs), [0, 8000, 16000]);
        assert.deepEqual(segments!.map(s => s.durationMs), [8000, 8000, 4000]);

        // Every segment length is a whole number of frames (blockAlign = 2).
        for (const s of segments!) {
            const len = s.blob.size - 44;
            assert.equal(len % 2, 0, `segment ${s.index} not frame-aligned`);
        }
    });

    it('reassembled segment PCM equals the original PCM (no bytes lost or duplicated)', async () => {
        const pcm = makePcm(BPS * 20);
        const segments = await splitWavBlob(new Blob([makeWav(pcm)]), 8);

        const parts = await Promise.all(segments!.map(s => pcmOf(s.blob)));
        const joined = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
        let at = 0;
        for (const p of parts) { joined.set(p, at); at += p.length; }

        assert.equal(joined.length, pcm.length);
        assert.deepEqual(joined, pcm);
    });

    it('returns a single segment when the recording is shorter than one segment', async () => {
        const pcm = makePcm(BPS * 3); // 3s
        const segments = await splitWavBlob(new Blob([makeWav(pcm)]), 60);
        assert.equal(segments!.length, 1);
        assert.equal(segments![0].offsetMs, 0);
        assert.deepEqual(await pcmOf(segments![0].blob), pcm);
    });

    it('walks past unknown chunks (e.g. LIST) to find the data chunk', async () => {
        const pcm = makePcm(BPS * 10);
        const segments = await splitWavBlob(new Blob([makeWav(pcm, { extraChunk: true })]), 4);
        assert.equal(segments!.length, 3); // 4s + 4s + 2s
        const parts = await Promise.all(segments!.map(s => pcmOf(s.blob)));
        assert.equal(parts.reduce((n, p) => n + p.length, 0), pcm.length);
    });

    it('clamps a declared data size that exceeds the actual bytes present', async () => {
        const pcm = makePcm(BPS * 5);
        // Claim far more data than exists; splitter must not read past the buffer.
        const blob = new Blob([makeWav(pcm, { declaredDataSize: BPS * 999 })]);
        const segments = await splitWavBlob(blob, 60);
        assert.equal(segments!.length, 1);
        assert.equal((await pcmOf(segments![0].blob)).length, pcm.length);
    });

    it('preserves non-default format params (sample rate) in segment headers', async () => {
        const pcm = makePcm(48000 * 2 * 4); // 4s @ 48 kHz mono 16-bit
        const segments = await splitWavBlob(new Blob([makeWav(pcm, { sampleRate: 48000 })]), 2);
        assert.equal(segments!.length, 2);
        const view = new DataView(await segments![0].blob.arrayBuffer());
        assert.equal(view.getUint32(24, true), 48000, 'sample rate not preserved');
        assert.equal(segments![0].durationMs, 2000);
    });

    it('returns null for non-WAV input', async () => {
        assert.equal(await splitWavBlob(new Blob([new Uint8Array([1, 2, 3, 4])]), 60), null);
        assert.equal(await splitWavBlob(new Blob([new Uint8Array(100)]), 60), null);
    });

    it('returns null for non-PCM (compressed) WAV', async () => {
        const pcm = makePcm(BPS * 5);
        const blob = new Blob([makeWav(pcm, { audioFormat: 3 })]); // 3 = IEEE float
        assert.equal(await splitWavBlob(blob, 60), null);
    });
});
