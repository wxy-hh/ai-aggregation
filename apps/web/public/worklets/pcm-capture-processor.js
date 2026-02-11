class PcmCaptureProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const input = inputs[0];
    if (!input || input.length === 0) return true;

    const channel = input[0];
    if (!channel || channel.length === 0) return true;

    // Copy to avoid transferring a view of the render buffer.
    const copy = new Float32Array(channel.length);
    copy.set(channel);

    // Transfer the underlying buffer to reduce GC.
    this.port.postMessage(
      {
        type: 'pcm',
        sampleRate: sampleRate,
        buffer: copy.buffer,
      },
      [copy.buffer]
    );

    return true;
  }
}

registerProcessor('pcm-capture-processor', PcmCaptureProcessor);
