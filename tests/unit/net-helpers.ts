// Shared helpers for the src/net tests.
import type { Socketish } from '../../src/core/types';
import type { Timers } from '../../src/net/keepalive';
import type { TextSink } from '../../src/net/textsink';

export const IAC = 255;
export const SB = 250;
export const SE = 240;

/** The first frame MUME sent (notes/research/mume-websocket.md §3). */
export const BANNER_NEG = Uint8Array.from([
  0xff, 0xfd, 0x1f, 0xff, 0xfd, 0x18, 0xff, 0xfd, 0x2a, 0xff, 0xfb, 0x56, 0xff, 0xfb, 0x46, 0xff,
  0xfd, 0x27, 0xff, 0xfb, 0xc9,
]);

/** Start of the second frame (banner text) from the same research note. */
export const BANNER_TEXT = Uint8Array.from([
  0x0d, 0x0a, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20,
  0x2a, 0x2a, 0x2a, 0x20, 0x20, 0x4d, 0x55, 0x4d, 0x45, 0x20, 0x49, 0x58, 0x20, 0x20, 0x2a, 0x2a, 0x2a,
  0x0d, 0x0a, 0x0d, 0x0a,
]);

export function ascii(s: string): number[] {
  return Array.from(s, (c) => c.charCodeAt(0));
}

export function utf8(s: string): number[] {
  return Array.from(new TextEncoder().encode(s));
}

export function sb(opt: number, payload: number[]): number[] {
  return [IAC, SB, opt, ...payload, IAC, SE];
}

export function concat(...parts: (Uint8Array | number[])[]): Uint8Array {
  const len = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(len);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

/** Records the sink stream as one string; GA shows as `⟨GA⟩`. */
export class RecSink implements TextSink {
  out = '';
  gas = 0;
  texts = 0;
  text(s: string): void {
    this.out += s;
    this.texts++;
  }
  ga(): void {
    this.out += '⟨GA⟩';
    this.gas++;
  }
}

/** A controllable Socketish for session tests. */
export class FakeSocket implements Socketish {
  onOpen: (() => void) | null = null;
  onData: ((bytes: Uint8Array) => void) | null = null;
  onClose: ((reason: string) => void) | null = null;
  sent: Uint8Array[] = [];
  connected = 0;
  closed = 0;

  connect(): void {
    this.connected++;
  }
  send(bytes: Uint8Array): void {
    this.sent.push(bytes.slice());
  }
  close(): void {
    this.closed++;
    this.onClose?.('closed by client');
  }
  // Test drivers.
  open(): void {
    this.onOpen?.();
  }
  data(bytes: Uint8Array | number[]): void {
    this.onData?.(bytes instanceof Uint8Array ? bytes : Uint8Array.from(bytes));
  }
  drop(reason = 'closed by server'): void {
    this.onClose?.(reason);
  }
  sentBytes(): number[] {
    return this.sent.flatMap((b) => Array.from(b));
  }
}

/** Extracts GMCP payloads (decoded as UTF-8) from an outbound byte stream. */
export function gmcpOut(bytes: number[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < bytes.length - 2; i++) {
    if (bytes[i] === IAC && bytes[i + 1] === SB && bytes[i + 2] === 201) {
      const body: number[] = [];
      let j = i + 3;
      for (; j < bytes.length; j++) {
        if (bytes[j] === IAC && bytes[j + 1] === SE) break;
        if (bytes[j] === IAC && bytes[j + 1] === IAC) j++;
        body.push(bytes[j]!);
      }
      out.push(new TextDecoder().decode(Uint8Array.from(body)));
      i = j + 1;
    }
  }
  return out;
}

/** Deterministic fake clock with timers. */
export class FakeTimers implements Timers {
  t = 0;
  private seq = 0;
  private timers = new Map<number, { at: number; fn: () => void }>();
  setTimeout(fn: () => void, ms: number): unknown {
    const id = ++this.seq;
    this.timers.set(id, { at: this.t + ms, fn });
    return id;
  }
  clearTimeout(h: unknown): void {
    this.timers.delete(h as number);
  }
  now(): number {
    return this.t;
  }
  advance(ms: number): void {
    const end = this.t + ms;
    for (;;) {
      let next: [number, { at: number; fn: () => void }] | null = null;
      for (const e of this.timers) if (e[1].at <= end && (!next || e[1].at < next[1].at)) next = e;
      if (!next) break;
      this.timers.delete(next[0]);
      this.t = next[1].at;
      next[1].fn();
    }
    this.t = end;
  }
}
