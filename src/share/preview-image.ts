// The link preview image of a shared log (ADR 0158): the start of the log
// in the sender's terminal font, colours and background, as the replay
// shows it, with a play button in the middle and the MUME Cockpit mark
// at the bottom right. Made on the sender's device after the link is
// created (the share dialog), drawn on a canvas and uploaded as a PNG of
// PREVIEW_WIDTH x PREVIEW_HEIGHT (src/cloud/pub/api.ts `preview`).
//
// The lines come from the payload as the replay reads it: the capture
// entries of its runs in play order (`playerEntries`), cut entries left
// out, inbound lines with their SGR styles (`parseSgr`, the export
// editor's), commands echoed after their prompt in the input colour, the
// player's system lines. The colours are the replay's: the payload's
// appearance (palette, font colour, background, bold brightens, input
// colour) through the same helpers the output pane uses.
//
// A lazy chunk of its own: the share dialog imports it after the link is
// made, so nothing of it is in the dialog's chunk or the entry.

import { type Color, type StyleRun, isAdaptive } from '../core/types';
import { PLAYING_COMMANDS } from '../net/session';
import { isPromptLike } from '../net/replay-socket';
import type { AppearanceSettings } from '../settings/types';
import { DEFAULT_SETTINGS } from '../settings/types';
import { boldFg, inputColor } from '../theme/apply';
import { bundledFont, fontInfo, loadFont } from '../theme/fonts';
import { colorToCss } from '../ui/palette';
import { parseSgr } from '../chrome/frames/export-model';
import { PREVIEW_HEIGHT, PREVIEW_TYPE, PREVIEW_WIDTH } from '../../shared/cloud/preview.ts';
import type { ReplayPayload } from './payload';
import { SYS_PREFIX, playerEntries } from './system-lines';

/** One line of the preview: text and style runs; `cmd` marks where a command echo starts. */
export interface PreviewLine {
  text: string;
  runs: StyleRun[];
  /** The command echo's start (to the end of the line), or -1. */
  cmd: number;
  /** A system line (drawn in the default colour, dimmed). */
  sys?: boolean;
}

/** The text's size on the image, px. */
export const FONT_PX = 28;
/** The line height, px. */
export const LINE_PX = 36;
/** The margin around the text, px. */
export const MARGIN_PX = 36;
/** The lines that fill the image. */
export const PREVIEW_ROWS = Math.floor((PREVIEW_HEIGHT - 2 * MARGIN_PX) / LINE_PX);

const within = (cuts: ReplayPayload['cuts'], us: number): boolean => cuts.some(([from, to]) => us >= from && (to === null || us < to));

/**
 * The first `rows` lines of the log as the replay prints them, from its
 * first non-blank line. Pure.
 */
export function previewLines(p: Pick<ReplayPayload, 'runs' | 'cuts' | 'hiddenSys'>, rows = PREVIEW_ROWS): PreviewLine[] {
  const out: PreviewLine[] = [];
  const hidden = new Set(p.hiddenSys ?? []);
  let openPrompt = false;
  for (const e of playerEntries(p.runs)) {
    if (out.length >= rows && !openPrompt) break;
    if (e.kind !== 'in' && e.kind !== 'out' && e.kind !== 'sys') continue;
    if (within(p.cuts, e.ts)) continue;
    if (e.kind === 'sys') {
      if (hidden.has(e.run)) continue;
      if (out.length >= rows) break;
      out.push({ text: SYS_PREFIX + e.body, runs: [], cmd: -1, sys: true });
      openPrompt = false;
    } else if (e.kind === 'in') {
      if (out.length >= rows) break;
      const { text, runs } = parseSgr(e.body.replace(/\r/g, ''));
      // Begin at the first line with something on it.
      if (out.length === 0 && text.trim() === '') continue;
      out.push({ text: text.replace(/\t/g, '        '), runs, cmd: -1 });
      openPrompt = isPromptLike(e.body);
    } else {
      if (e.body === '' || PLAYING_COMMANDS.includes(e.body)) continue;
      const last = out[out.length - 1];
      if (openPrompt && last) {
        const sep = /\s$/.test(last.text) ? '' : ' ';
        last.cmd = last.text.length + sep.length;
        last.text += sep + e.body;
      } else {
        if (out.length >= rows) break;
        out.push({ text: e.body, runs: [], cmd: 0 });
      }
      openPrompt = false;
    }
  }
  return out.slice(0, rows);
}

/** The colours the image draws with, from the payload's appearance. */
interface Look {
  bg: string;
  fg: string;
  boldFg: string;
  input: string;
  sys: string;
  ansi: string[];
  boldBright: boolean;
  family: string;
}

function lookOf(a: AppearanceSettings | undefined): Look {
  const d = DEFAULT_SETTINGS.appearance;
  const ap: AppearanceSettings = a && Array.isArray(a.ansi) && a.ansi.length >= 16 ? a : d;
  return {
    bg: ap.bg,
    fg: ap.fg,
    boldFg: boldFg(ap),
    input: resolveCss(inputColor(ap.inputColor, ap.bg), ap.fg),
    sys: resolveCss(`color-mix(in srgb, ${ap.fg} 60%, ${ap.bg})`, ap.fg),
    ansi: ap.ansi.slice(0, 16),
    boldBright: ap.boldBright,
    family: fontInfo(bundledFont(ap.font)).family,
  };
}

/** A CSS colour (it may use `var(--term-fg)` and `color-mix`) as the browser resolves it; `fallback` without a document. */
function resolveCss(css: string, fg: string): string {
  if (typeof document === 'undefined' || !document.body) return fg;
  const el = document.createElement('span');
  el.style.setProperty('--term-fg', fg);
  el.style.color = fg;
  el.style.color = css;
  el.hidden = true;
  document.body.appendChild(el);
  const c = getComputedStyle(el).color;
  el.remove();
  return c || fg;
}

function colourOf(c: Color | undefined, bold: boolean, look: Look, dflt: string): string {
  if (c === undefined || isAdaptive(c)) return bold && dflt === look.fg ? look.boldFg : dflt;
  if (c < 16) return look.ansi[bold && look.boldBright && c < 8 ? c + 8 : c] ?? dflt;
  return colorToCss(c);
}

/** Draws the lines in the terminal's look. */
function drawText(ctx: CanvasRenderingContext2D, lines: readonly PreviewLine[], look: Look): void {
  const font = (bold: boolean): string => `${bold ? 'bold ' : ''}${FONT_PX}px "${look.family}", monospace`;
  ctx.font = font(false);
  const cell = ctx.measureText('M').width || FONT_PX * 0.6;
  ctx.textBaseline = 'alphabetic';
  const base = Math.round(LINE_PX * 0.75);
  lines.forEach((line, row) => {
    const y = MARGIN_PX + row * LINE_PX;
    // The segments: the style runs, the plain gaps between them, the command echo.
    const cuts = new Set<number>([0, line.text.length]);
    for (const r of line.runs) {
      cuts.add(Math.min(r.start, line.text.length));
      cuts.add(Math.min(r.end, line.text.length));
    }
    if (line.cmd >= 0) cuts.add(line.cmd);
    const at = [...cuts].sort((a, b) => a - b);
    for (let i = 0; i + 1 < at.length; i++) {
      const from = at[i]!;
      const to = at[i + 1]!;
      const s = line.text.slice(from, to);
      if (s === '') continue;
      const r = line.runs.find((x) => x.start <= from && x.end >= to);
      const bold = r?.bold === true;
      const dflt = line.sys ? look.sys : line.cmd >= 0 && from >= line.cmd ? look.input : look.fg;
      let fg = colourOf(r?.fg, bold, look, dflt);
      let bg = r?.bg === undefined ? null : colourOf(r.bg, false, look, look.bg);
      if (r?.inverse) [fg, bg] = [bg ?? look.bg, fg];
      const x = MARGIN_PX + from * cell;
      if (bg) {
        ctx.fillStyle = bg;
        ctx.fillRect(x, y, (to - from) * cell, LINE_PX);
      }
      ctx.font = font(bold);
      ctx.fillStyle = fg;
      ctx.fillText(s, x, y + base);
      if (r?.underline) ctx.fillRect(x, y + base + 3, (to - from) * cell, 2);
    }
  });
}

/** The play button: a translucent dark circle with a light ring and a white triangle. */
function drawPlay(ctx: CanvasRenderingContext2D): void {
  const cx = PREVIEW_WIDTH / 2;
  const cy = PREVIEW_HEIGHT / 2;
  const r = 118;
  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
  ctx.shadowBlur = 36;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(8, 10, 14, 0.58)';
  ctx.fill();
  ctx.restore();
  ctx.lineWidth = 6;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.88)';
  ctx.stroke();
  const t = r * 0.48;
  ctx.beginPath();
  ctx.moveTo(cx - t * 0.62, cy - t);
  ctx.lineTo(cx + t * 1.05, cy);
  ctx.lineTo(cx - t * 0.62, cy + t);
  ctx.closePath();
  ctx.lineJoin = 'round';
  ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
  ctx.fill();
}

/** The site's mark (the favicon's M), or null when it cannot be loaded. */
async function markImage(): Promise<HTMLImageElement | null> {
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = new URL('/favicon.svg', location.href).href;
    await img.decode();
    return img;
  } catch {
    return null;
  }
}

/** The MUME Cockpit mark alone (no wordmark), large, in the bottom right corner. */
function drawMark(ctx: CanvasRenderingContext2D, img: HTMLImageElement | null): void {
  if (!img) return;
  const size = 192;
  const margin = 20;
  ctx.save();
  ctx.globalAlpha = 0.9;
  ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
  ctx.shadowBlur = 12;
  ctx.drawImage(img, PREVIEW_WIDTH - margin - size, PREVIEW_HEIGHT - margin - size, size, size);
  ctx.restore();
}

/** Draws the whole image on `ctx` (PREVIEW_WIDTH x PREVIEW_HEIGHT). */
export async function drawPreview(ctx: CanvasRenderingContext2D, lines: readonly PreviewLine[], appearance?: AppearanceSettings): Promise<void> {
  const look = lookOf(appearance);
  await loadFont(bundledFont((appearance ?? DEFAULT_SETTINGS.appearance).font), FONT_PX);
  const img = await markImage();
  ctx.fillStyle = look.bg;
  ctx.fillRect(0, 0, PREVIEW_WIDTH, PREVIEW_HEIGHT);
  drawText(ctx, lines, look);
  // A soft shade toward the middle, so the button stands out from busy text.
  const g = ctx.createRadialGradient(PREVIEW_WIDTH / 2, PREVIEW_HEIGHT / 2, 60, PREVIEW_WIDTH / 2, PREVIEW_HEIGHT / 2, 420);
  g.addColorStop(0, 'rgba(0, 0, 0, 0.35)');
  g.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, PREVIEW_WIDTH, PREVIEW_HEIGHT);
  drawPlay(ctx);
  drawMark(ctx, img);
}

/** The preview of `payload` as PNG bytes. Rejects when the browser cannot draw or encode it. */
export async function renderPreview(payload: Pick<ReplayPayload, 'runs' | 'cuts' | 'hiddenSys' | 'settings'>): Promise<Uint8Array> {
  const canvas = document.createElement('canvas');
  canvas.width = PREVIEW_WIDTH;
  canvas.height = PREVIEW_HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('no canvas');
  await drawPreview(ctx, previewLines(payload), payload.settings?.appearance);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, PREVIEW_TYPE));
  if (!blob) throw new Error('no image');
  return new Uint8Array(await blob.arrayBuffer());
}
