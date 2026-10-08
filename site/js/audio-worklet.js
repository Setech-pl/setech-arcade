// A FIFO of mono samples fed from the page (no SharedArrayBuffer: GitHub
// Pages cannot send the COOP/COEP headers it would need). Playback waits for
// TARGET of queued audio before it starts, and again after running dry, so a
// late frame causes one short gap instead of a run of clicks.
const TARGET_S = 0.06;
const CAP_S = 0.2;

class Fifo extends AudioWorkletProcessor {
  constructor() {
    super();
    this.chunks = [];
    this.offset = 0;
    this.buffered = 0;
    this.priming = true;
    this.stats = { underruns: 0, dropped: 0 };
    this.blocks = 0;
    this.port.onmessage = (event) => {
      if (event.data === "flush") {
        this.chunks = [];
        this.offset = 0;
        this.buffered = 0;
        this.priming = true;
        return;
      }
      this.chunks.push(event.data);
      this.buffered += event.data.length;
      while (this.buffered > sampleRate * CAP_S && this.chunks.length > 1) {
        this.buffered -= this.chunks[0].length - this.offset;
        this.chunks.shift();
        this.offset = 0;
        this.stats.dropped += 1;
      }
    };
  }

  process(_inputs, outputs) {
    const out = outputs[0];
    const left = out[0];
    if (this.priming && this.buffered >= sampleRate * TARGET_S) this.priming = false;
    let i = 0;
    while (!this.priming && i < left.length && this.chunks.length) {
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
      if (!this.priming) {
        this.stats.underruns += 1;
        this.priming = true;
      }
    }
    for (let c = 1; c < out.length; c += 1) out[c].set(left);
    if (++this.blocks % Math.round(sampleRate / 128) === 0) {
      this.port.postMessage({ ...this.stats, bufferedMs: Math.round((this.buffered / sampleRate) * 1000) });
    }
    return true;
  }
}
registerProcessor("arcade-fifo", Fifo);
