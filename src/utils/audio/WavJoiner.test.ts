// src/utils/audio/WavJoiner.test.ts
//
// Unit tests for joining recorder segments back into one WAV. Pure logic. Run with: npm test

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { joinWavBuffers } from './WavJoiner';
import { buildWav, parseWav, WavFormat } from './WavSplitter';

function fmt(overrides: Partial<WavFormat> = {}): WavFormat {
    const numChannels = overrides.numChannels ?? 1;
    const bitsPerSample = overrides.bitsPerSample ?? 16;
    const sampleRate = overrides.sampleRate ?? 16000;
    const blockAlign = numChannels * (bitsPerSample / 8);
    return { numChannels, sampleRate, bitsPerSample, blockAlign, byteRate: sampleRate * blockAlign, ...overrides };
}

function pcm(bytes: number[]): Uint8Array {
    return new Uint8Array(bytes);
}

function wav(bytes: number[], format = fmt()): ArrayBuffer {
    return buildWav(pcm(bytes), format).buffer as ArrayBuffer;
}

describe('joinWavBuffers', () => {
    it('concatenates PCM from several segments under one header, in order', () => {
        const joined = joinWavBuffers([wav([1, 2, 3, 4]), wav([5, 6]), wav([7, 8, 9, 10])]);
        assert.ok(joined, 'compatible PCM WAVs must join');

        const parsed = parseWav(joined.buffer as ArrayBuffer);
        assert.ok(parsed);
        assert.equal(parsed.dataSize, 10);
        assert.deepEqual([...new Uint8Array(joined.buffer, parsed.dataOffset, parsed.dataSize)], [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
        assert.equal(parsed.fmt.sampleRate, 16000);
        assert.equal(parsed.fmt.numChannels, 1);
    });

    it('returns a single segment unchanged in content', () => {
        const joined = joinWavBuffers([wav([9, 9, 8, 8])]);
        assert.ok(joined);
        const parsed = parseWav(joined.buffer as ArrayBuffer);
        assert.ok(parsed);
        assert.deepEqual([...new Uint8Array(joined.buffer, parsed.dataOffset, parsed.dataSize)], [9, 9, 8, 8]);
    });

    it('refuses to splice segments with different formats', () => {
        const joined = joinWavBuffers([wav([1, 2], fmt({ sampleRate: 16000 })), wav([3, 4], fmt({ sampleRate: 44100 }))]);
        assert.equal(joined, null, 'mismatched sample rates cannot be concatenated without resampling');
    });

    it('returns null when any input is not a PCM WAV', () => {
        const notWav = new TextEncoder().encode('definitely not audio, but long enough to pass the size check....').buffer as ArrayBuffer;
        assert.equal(joinWavBuffers([wav([1, 2]), notWav]), null);
        assert.equal(joinWavBuffers([]), null);
    });
});
