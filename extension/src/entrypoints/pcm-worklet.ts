/**
 * AudioWorklet processor running on Chrome's real-time audio rendering thread.
 *
 * Must NOT import DOM, `window` or `wxt/browser` globals because `AudioWorkletGlobalScope`
 * exposes none of them. Downmixes, downsamples to 16 kHz, quantizes to PCM16 and transfers
 * exact 100 ms frames to the offscreen document.
 *
 * @module entrypoints/pcm-worklet
 */
import { defineUnlistedScript } from "wxt/utils/define-unlisted-script";

import {
  computeRms,
  downsampleLinear,
  float32ToInt16Pcm,
  mixToMono,
  PcmFrameAccumulator,
} from "../lib/audio/pcm";
import { AUDIO_FRAME_MS, TARGET_SAMPLE_RATE } from "../shared/config";

declare const sampleRate: number;

declare abstract class AudioWorkletProcessor {
  readonly port: MessagePort;
  constructor();
  abstract process(
    inputs: Float32Array[][],
    outputs: Float32Array[][],
    parameters: Record<string, Float32Array>,
  ): boolean;
}

declare function registerProcessor(
  name: string,
  processorCtor: new () => AudioWorkletProcessor,
): void;

const SAMPLES_PER_FRAME = Math.round((TARGET_SAMPLE_RATE * AUDIO_FRAME_MS) / 1000);

export default defineUnlistedScript(() => {
  /** AudioWorkletProcessor converting tab audio frames to 16 kHz mono PCM16. */
  class PcmCaptureProcessor extends AudioWorkletProcessor {
    private readonly accumulator = new PcmFrameAccumulator(SAMPLES_PER_FRAME);

    public override process(inputs: Float32Array[][]): boolean {
      const channels = inputs[0];
      if (!channels || channels.length === 0) {
        return true;
      }

      const mono = mixToMono(channels);
      const resampled = downsampleLinear(mono, sampleRate, TARGET_SAMPLE_RATE);
      if (resampled.length === 0) {
        return true;
      }

      const rms = computeRms(resampled);
      const pcm = float32ToInt16Pcm(resampled);
      const frames = this.accumulator.push(pcm);

      for (const frame of frames) {
        this.port.postMessage({ buffer: frame.buffer, rms }, [frame.buffer]);
      }

      return true;
    }
  }

  registerProcessor("pcm-capture-processor", PcmCaptureProcessor);
});
