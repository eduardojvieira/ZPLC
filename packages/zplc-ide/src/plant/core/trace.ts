// Streaming SHA-256 and the plant trace (PLT-006). A pure-JS digest keeps the trace in constant memory (no buffer of
// every scan) and keeps `advance` synchronous; the test compares it with node:crypto.

const PRIMES = (() => {
  const out: number[] = [];
  for (let n = 2; out.length < 64; n += 1) if (out.every((p) => n % p !== 0)) out.push(n);
  return out;
})();
const frac32 = (x: number) => Math.floor((x - Math.floor(x)) * 4294967296) >>> 0;
const K = Uint32Array.from(PRIMES, (p) => frac32(Math.cbrt(p)));
const H0 = Uint32Array.from(PRIMES.slice(0, 8), (p) => frac32(Math.sqrt(p)));
const rotr = (x: number, n: number) => (x >>> n) | (x << (32 - n));

export class Sha256 {
  private h = Uint32Array.from(H0);
  private buf = new Uint8Array(64);
  private fill = 0;
  private length = 0;
  private readonly w = new Uint32Array(64);

  update(data: Uint8Array): void {
    this.length += data.length;
    for (const byte of data) {
      this.buf[this.fill++] = byte;
      if (this.fill === 64) {
        this.block(this.h, this.buf);
        this.fill = 0;
      }
    }
  }

  /** The digest of everything so far; the stream stays usable. */
  hex(): string {
    const h = Uint32Array.from(this.h);
    const tail = new Uint8Array(this.fill < 56 ? 64 : 128);
    tail.set(this.buf.subarray(0, this.fill));
    tail[this.fill] = 0x80;
    const view = new DataView(tail.buffer);
    view.setUint32(tail.length - 8, Math.floor((this.length * 8) / 4294967296));
    view.setUint32(tail.length - 4, (this.length * 8) >>> 0);
    for (let at = 0; at < tail.length; at += 64) this.block(h, tail.subarray(at, at + 64));
    return [...h].map((x) => x.toString(16).padStart(8, '0')).join('');
  }

  private block(h: Uint32Array, chunk: Uint8Array): void {
    const w = this.w;
    const view = new DataView(chunk.buffer, chunk.byteOffset, 64);
    for (let i = 0; i < 16; i += 1) w[i] = view.getUint32(i * 4);
    for (let i = 16; i < 64; i += 1) {
      const a = w[i - 15]!;
      const b = w[i - 2]!;
      w[i] = (w[i - 16]! + (rotr(a, 7) ^ rotr(a, 18) ^ (a >>> 3)) + w[i - 7]! + (rotr(b, 17) ^ rotr(b, 19) ^ (b >>> 10))) >>> 0;
    }
    let [a, b, c, d, e, f, g, hh] = h as unknown as [number, number, number, number, number, number, number, number];
    for (let i = 0; i < 64; i += 1) {
      const t1 = (hh + (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) + ((e & f) ^ (~e & g)) + K[i]! + w[i]!) >>> 0;
      const t2 = ((rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) >>> 0;
      hh = g;
      g = f;
      f = e;
      e = (d + t1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (t1 + t2) >>> 0;
    }
    [a, b, c, d, e, f, g, hh].forEach((x, i) => (h[i] = (h[i]! + x) >>> 0));
  }
}

export interface PoseSample {
  p: readonly number[];
  q: readonly number[];
}

/** The per-advance trace: poses (creation order), command values and sensor values, all float32 little-endian. */
export interface Trace {
  record(poses: readonly PoseSample[], commands: readonly number[], sensors: readonly number[]): void;
  hash(): string;
}

export function createTrace(): Trace {
  const sha = new Sha256();
  return {
    record(poses, commands, sensors) {
      const out = new DataView(new ArrayBuffer(4 + 4 * (poses.length * 7 + commands.length + sensors.length)));
      let at = 0;
      const u32 = (n: number) => {
        out.setUint32(at, n, true);
        at += 4;
      };
      const f32 = (n: number) => {
        out.setFloat32(at, n, true);
        at += 4;
      };
      u32(poses.length);
      for (const pose of poses) {
        pose.p.forEach(f32);
        pose.q.forEach(f32);
      }
      commands.forEach(f32);
      sensors.forEach(f32);
      sha.update(new Uint8Array(out.buffer));
    },
    hash: () => sha.hex(),
  };
}
