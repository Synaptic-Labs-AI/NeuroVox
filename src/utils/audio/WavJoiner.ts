// src/utils/audio/WavJoiner.ts

import { buildWav, parseWav, WavFormat } from './WavSplitter';

/**
 * Joins several standalone PCM WAV files into one, in the order given.
 *
 * The recorder rotates into bounded segments (see TimerModal), so a recording reaches the
 * end of capture as N separate WAV files. Persisting it as a single playable file means
 * stripping each segment's header and concatenating the PCM under one new header.
 *
 * Returns null when any input is not a parseable PCM WAV, or when the segments disagree on
 * format (channels, sample rate, bit depth): PCM from different formats cannot be spliced
 * without resampling, and the caller should keep the parts separate instead.
 */
export function joinWavBuffers(buffers: ArrayBuffer[]): Uint8Array | null {
    if (buffers.length === 0) return null;

    const parsed = buffers.map(parseWav);
    if (parsed.some(p => p === null)) return null;
    const parts = parsed as NonNullable<(typeof parsed)[number]>[];

    const fmt: WavFormat = parts[0].fmt;
    const compatible = parts.every(p =>
        p.fmt.numChannels === fmt.numChannels &&
        p.fmt.sampleRate === fmt.sampleRate &&
        p.fmt.bitsPerSample === fmt.bitsPerSample
    );
    if (!compatible) return null;

    const totalBytes = parts.reduce((sum, p) => sum + p.dataSize, 0);
    const pcm = new Uint8Array(totalBytes);
    let pos = 0;
    parts.forEach((p, i) => {
        pcm.set(new Uint8Array(buffers[i], p.dataOffset, p.dataSize), pos);
        pos += p.dataSize;
    });

    return buildWav(pcm, fmt);
}
