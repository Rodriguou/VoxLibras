/**
 * Pure PCM audio conversion utilities shared by the AudioWorklet and unit tests.
 *
 * No DOM, Web Audio API or browser globals are imported here so the AudioWorklet bundle stays
 * strictly compatible with `AudioWorkletGlobalScope`.
 *
 * @module lib/audio/pcm
 */

/**
 * Downmixes multi-channel planar float32 samples into a single mono buffer.
 *
 * @param channels - Non-empty list of equal-length planar channel buffers.
 * @returns Averaged mono float32 samples.
 */
export function mixToMono(channels: readonly Float32Array[]): Float32Array {
  const first = channels[0];
  if (first === undefined || first.length === 0) {
    return new Float32Array(0);
  }
  if (channels.length === 1) {
    return new Float32Array(first);
  }

  const length = first.length;
  const mono = new Float32Array(length);
  const channelCount = channels.length;

  for (let i = 0; i < length; i += 1) {
    let sum = 0;
    for (const channel of channels) {
      sum += channel[i] ?? 0;
    }
    mono[i] = sum / channelCount;
  }

  return mono;
}

/**
 * Downsamples mono float32 audio using linear interpolation.
 *
 * @param samples - Mono float32 samples at `inputRate`.
 * @param inputRate - Source AudioContext sample rate (Hz), e.g. 48000.
 * @param outputRate - Target sample rate (Hz), e.g. 16000.
 * @returns Resampled mono float32 array.
 */
export function downsampleLinear(
  samples: Float32Array,
  inputRate: number,
  outputRate: number,
): Float32Array {
  if (samples.length === 0 || outputRate <= 0 || inputRate <= 0) {
    return new Float32Array(0);
  }
  if (inputRate === outputRate) {
    return new Float32Array(samples);
  }

  const ratio = inputRate / outputRate;
  const outputLength = Math.floor(samples.length / ratio);
  const output = new Float32Array(outputLength);

  for (let i = 0; i < outputLength; i += 1) {
    const position = i * ratio;
    const index = Math.floor(position);
    const frac = position - index;
    const s0 = samples[index] ?? 0;
    const s1 = samples[index + 1] ?? s0;
    output[i] = s0 + (s1 - s0) * frac;
  }

  return output;
}

/**
 * Quantizes normalized `[-1, 1]` float32 samples into signed 16-bit little-endian PCM.
 *
 * @param samples - Mono float32 samples.
 * @returns Clamped `Int16Array` ready to send over WebSocket.
 */
export function float32ToInt16Pcm(samples: Float32Array): Int16Array {
  const output = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i += 1) {
    const sample = samples[i] ?? 0;
    const clamped = Math.max(-1, Math.min(1, sample));
    output[i] = clamped < 0 ? Math.round(clamped * 32_768) : Math.round(clamped * 32_767);
  }
  return output;
}

/**
 * Computes root-mean-square amplitude of a float32 buffer.
 *
 * @param samples - Audio samples in `[-1, 1]`.
 * @returns Non-negative RMS energy in `[0, 1]`.
 */
export function computeRms(samples: Float32Array): number {
  if (samples.length === 0) {
    return 0;
  }
  let sumSquares = 0;
  for (const sample of samples) {
    sumSquares += sample * sample;
  }
  return Math.sqrt(sumSquares / samples.length);
}

/**
 * Accumulates variable-sized resampled PCM chunks into fixed-duration frames (e.g. 100 ms).
 */
export class PcmFrameAccumulator {
  private readonly frameSize: number;
  private buffer: Int16Array;
  private offset = 0;

  /**
   * Creates an accumulator emitting frames of `frameSize` samples.
   *
   * @param frameSize - Exact sample count per emitted frame (e.g. 1600 for 100 ms @ 16 kHz).
   */
  public constructor(frameSize: number) {
    if (!Number.isInteger(frameSize) || frameSize <= 0) {
      throw new RangeError("frameSize must be a positive integer.");
    }
    this.frameSize = frameSize;
    this.buffer = new Int16Array(frameSize);
  }

  /**
   * Appends samples and emits every complete `frameSize` frame produced.
   *
   * @param chunk - Newly encoded PCM16 samples.
   * @returns Zero or more complete fixed-size PCM frames.
   */
  public push(chunk: Int16Array): Int16Array[] {
    const frames: Int16Array[] = [];
    let readOffset = 0;

    while (readOffset < chunk.length) {
      const remainingInFrame = this.frameSize - this.offset;
      const available = chunk.length - readOffset;
      const toCopy = Math.min(remainingInFrame, available);

      this.buffer.set(chunk.subarray(readOffset, readOffset + toCopy), this.offset);
      this.offset += toCopy;
      readOffset += toCopy;

      if (this.offset === this.frameSize) {
        frames.push(this.buffer);
        this.buffer = new Int16Array(this.frameSize);
        this.offset = 0;
      }
    }

    return frames;
  }

  /** Discards any partially filled trailing frame. */
  public reset(): void {
    this.offset = 0;
  }
}
