// A recording's timeline (`public/recordings/<scene>.json`, ADR 0133): the
// video's size and length, and the markers the scene script set, in seconds
// from the first frame, with boxes in video pixels for the compositions
// (a zoom into the map pane, a caption beside the Comm pane).
import type { Locator } from '@playwright/test';
import type { InputEvent } from './browser.ts';
import type { CaptureStats } from './screencast.ts';

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Marker {
  /** Seconds from the first frame. */
  t: number;
  kind: string;
  label: string;
  /** Video pixels. */
  box?: Box;
}

export interface TimelineInput {
  t: number;
  type: string;
  key?: string;
  x?: number;
  y?: number;
}

/** The JSON beside each recording; src/timeline.ts reads it in the compositions. */
export interface TimelineFile {
  scene: string;
  recordedAt: string;
  mode: string;
  width: number;
  height: number;
  /** CSS px → video px. */
  dpr: number;
  fps: number;
  frames: number;
  durationS: number;
  capture: CaptureStats & { active: CaptureStats; perSecond: number[] };
  markers: Marker[];
  input: TimelineInput[];
}

/** Markers set while recording, at wall-clock time (turned relative to the first frame when written). */
export class Marks {
  private readonly at: { at: number; kind: string; label: string; box?: Box }[] = [];

  private readonly dpr: number;

  constructor(dpr: number) {
    this.dpr = dpr;
  }

  /** A marker now; `box` in CSS px. */
  mark(kind: string, label: string, box?: Box | null): void {
    this.markAt(Date.now(), kind, label, box);
  }

  /** A marker at `ms` (epoch ms; a moment the scene knows ahead, such as a turn's second). */
  markAt(ms: number, kind: string, label: string, box?: Box | null): void {
    this.at.push({ at: ms / 1000, kind, label, ...(box ? { box: this.toVideo(box) } : {}) });
    this.at.sort((a, b) => a.at - b.at);
  }

  /** A marker now with the element's box. */
  async markBox(kind: string, label: string, el: Locator): Promise<void> {
    const b = await el.boundingBox();
    this.mark(kind, label, b ? { x: b.x, y: b.y, w: b.width, h: b.height } : null);
  }

  /** The first marker of `kind`, epoch s. */
  timeOf(kind: string): number | undefined {
    return this.at.find((m) => m.kind === kind)?.at;
  }

  private toVideo(b: Box): Box {
    const r = (v: number): number => Math.round(v * this.dpr);
    return { x: r(b.x), y: r(b.y), w: r(b.w), h: r(b.h) };
  }

  /** Relative to `t0` (epoch s), the ones in [0, end]. */
  relative(t0: number, end: number): Marker[] {
    return this.at
      .map(({ at, ...m }) => ({ t: Math.round((at - t0) * 1000) / 1000, ...m }))
      .filter((m) => m.t >= 0 && m.t <= end);
  }
}

/** Input events relative to `t0` (epoch s), positions in video px. */
export function relativeInput(events: readonly InputEvent[], t0: number, end: number, dpr: number): TimelineInput[] {
  return events
    .map((e) => ({
      t: Math.round((e.at / 1000 - t0) * 1000) / 1000,
      type: e.type,
      ...(e.key !== undefined ? { key: e.key } : {}),
      ...(e.x !== undefined ? { x: Math.round(e.x * dpr), y: Math.round(e.y! * dpr) } : {}),
    }))
    .filter((e) => e.t >= 0 && e.t <= end);
}
