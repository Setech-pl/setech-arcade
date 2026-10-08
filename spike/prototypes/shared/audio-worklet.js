// A FIFO of mono float samples fed from the main thread (no SharedArrayBuffer:
// GitHub Pages cannot send the COOP/COEP headers it would need).
class Fifo extends AudioWorkletProcessor {
  constructor() {
    super();
    this.chunks = [];
    this.offset = 0;
    this.buffered = 0;
    this.underruns = 0;
    this.dropped = 0;
    this.blocks = 0;
    this.port.onmessage = (event) => {
      this.chunks.push(event.data);
      this.buffered += event.data.length;
      // More than ~200 ms queued: drop the oldest audio to cap latency.
      while (this.buffered > sampleRate * 0.2 && this.chunks.length > 1) {
        this.buffered -= this.chunks[0].length - this.offset;
        this.dropped += 1;
        this.chunks.shift();
        this.offset = 0;
      }
    };
  }

  process(_inputs, outputs) {
    const out = outputs[0];
    const left = out[0];
    let i = 0;
    while (i < left.length && this.chunks.length) {
      const chunk = this.chunks[0];
      const n = Math.min(left.length - i, chunk.length - this.offset);
      left.set(chunk.subarray(this.offset, this.offset + n), i);
      i += n;
      this.offset += n;
      this.buffered -= n;
      if (this.offset === chunk.length) {
        this.chunks.shift();
        this.offset = 0;
      }
    }
    if (i < left.length) {
      left.fill(0, i);
      this.underruns += 1;
      if (this.underruns % 50 === 1) this.port.postMessage({ underruns: this.underruns });
    }
    for (let c = 1; c < out.length; c += 1) out[c].set(left);
    // About once a second: queue depth (latency), underruns, dropped chunks.
    if (++this.blocks % Math.round(sampleRate / 128) === 0) {
      this.port.postMessage({ underruns: this.underruns, dropped: this.dropped, bufferedMs: Math.round((this.buffered / sampleRate) * 1000) });
    }
    return true;
  }
}
registerProcessor("vs-fifo", Fifo);
