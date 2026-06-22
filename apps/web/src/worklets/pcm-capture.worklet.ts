class PcmCaptureProcessor extends AudioWorkletProcessor {
  override process(inputs: Float32Array[][]): boolean {
    const input = inputs[0]?.[0];

    if (input && input.length > 0) {
      this.port.postMessage({ type: 'LEVEL', samples: input.length });
    }

    return true;
  }
}

registerProcessor('pcm-capture', PcmCaptureProcessor);

export {};
