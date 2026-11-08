// Real-time capture of a page through the DevTools screencast
// (Page.startScreencast, ADR 0133): every composited frame at full device
// pixel size, written to disk as it comes with the compositor's timestamp.
// The frames are assembled to constant 60 fps afterwards (encode.ts).
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import type { CDPSession, Page } from '@playwright/test';

const FRAMES_ROOT = (() => {
  const d = fileURLToPath(new URL('../../out/frames/', import.meta.url));
  mkdirSync(d, { recursive: true });
  return d;
})();

export interface Frame {
  file: string;
  /** Seconds since the epoch (the frame's swap time, or its arrival). */
  ts: number;
}

export interface CaptureStats {
  frames: number;
  seconds: number;
  meanFps: number;
  /** The fewest frames in any 1 s window. */
  minFps1s: number;
  /** Intervals between frames over 50 ms. */
  gapsOver50ms: number;
  /** The longest interval, ms. */
  maxGapMs: number;
}

interface ScreencastFrame {
  data: string;
  sessionId: number;
  metadata: { timestamp?: number };
}

export class Screencast {
  /**
   * The frames, on disk under video/out/ (a long take's PNG frames run to 10 GB: more than /tmp holds
   * when it is a tmpfs).
   */
  readonly dir = mkdtempSync(join(FRAMES_ROOT, 'wc-rec-'));
  readonly frames: Frame[] = [];
  private cdp: CDPSession | null = null;
  private writes: Promise<void>[] = [];
  private first: (() => void) | null = null;

  private readonly page: Page;
  private readonly o: { width: number; height: number; format: 'jpeg' | 'png'; quality?: number };

  constructor(page: Page, o: { width: number; height: number; format: 'jpeg' | 'png'; quality?: number }) {
    this.page = page;
    this.o = o;
  }

  /** Starts the screencast; resolves with the first frame. */
  async start(): Promise<void> {
    const cdp = (this.cdp = await this.page.context().newCDPSession(this.page));
    const ext = this.o.format === 'png' ? 'png' : 'jpg';
    const firstFrame = new Promise<void>((r) => (this.first = r));
    cdp.on('Page.screencastFrame', (f: ScreencastFrame) => {
      // Acked at once: the next frame comes while this one is written.
      void cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {});
      const file = join(this.dir, `${String(this.frames.length).padStart(6, '0')}.${ext}`);
      this.frames.push({ file, ts: f.metadata.timestamp ?? Date.now() / 1000 });
      this.writes.push(writeFile(file, Buffer.from(f.data, 'base64')));
      this.first?.();
      this.first = null;
    });
    await cdp.send('Page.startScreencast', {
      format: this.o.format,
      ...(this.o.format === 'jpeg' ? { quality: this.o.quality ?? 95 } : {}),
      maxWidth: this.o.width,
      maxHeight: this.o.height,
      everyNthFrame: 1,
    });
    await firstFrame;
  }

  async stop(): Promise<void> {
    await this.cdp?.send('Page.stopScreencast').catch(() => {});
    await this.cdp?.detach().catch(() => {});
    this.cdp = null;
    await Promise.all(this.writes);
  }

  /** The first frame's time, epoch s: the recording's 0. */
  get t0(): number {
    return this.frames[0]?.ts ?? Date.now() / 1000;
  }

  /** Frame-rate stats over the frames between `from` and `to` (s from the first frame; default all). */
  stats(from = 0, to = Infinity): CaptureStats {
    const ts = this.frames.map((f) => f.ts - this.t0).filter((t) => t >= from && t <= to);
    if (ts.length < 2) return { frames: ts.length, seconds: 0, meanFps: 0, minFps1s: 0, gapsOver50ms: 0, maxGapMs: 0 };
    const seconds = ts.at(-1)! - ts[0]!;
    let gaps = 0;
    let maxGap = 0;
    for (let i = 1; i < ts.length; i++) {
      const d = ts[i]! - ts[i - 1]!;
      if (d > 0.05) gaps++;
      maxGap = Math.max(maxGap, d);
    }
    // The fewest frames in a 1 s window starting at each frame (windows that fit).
    let minIn = Infinity;
    let j = 0;
    for (let i = 0; i < ts.length && ts[i]! + 1 <= ts.at(-1)!; i++) {
      while (j < ts.length && ts[j]! < ts[i]! + 1) j++;
      minIn = Math.min(minIn, j - i);
    }
    return {
      frames: ts.length,
      seconds,
      meanFps: (ts.length - 1) / seconds,
      minFps1s: Number.isFinite(minIn) ? minIn : ts.length,
      gapsOver50ms: gaps,
      maxGapMs: maxGap * 1000,
    };
  }

  /** Frames in each whole second from the first frame. */
  perSecond(): number[] {
    const out: number[] = [];
    for (const f of this.frames) {
      const s = Math.floor(f.ts - this.t0);
      while (out.length <= s) out.push(0);
      out[s]!++;
    }
    return out;
  }

  dispose(): void {
    rmSync(this.dir, { recursive: true, force: true });
  }
}
