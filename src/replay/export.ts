// The HTML replay file (ADR 0019 "Replay payload and the HTML replay"):
// `buildReplayHtml(payload)` fetches the replay bundle (`replay/replay.js`)
// and the fonts from the app's own origin and writes one self-contained
// HTML file:
//
//   <!doctype html>
//   <!-- GPL notice (ADR 0001) -->
//   <html><head> title, <style> base + @font-face with data: URIs </head>
//   <body> <div id="app"> <script type="application/json" id="wc-replay-payload">
//          <script> the bundle (an IIFE with its CSS) </script> </body></html>
//
// Map (ADR 0020): with `opts.map`, the payload gets the map subset around
// the visited rooms and its tiles (src/replay/map-embed.ts).
//
// Fonts: the exporter's family plus any family a recorded VIEW switches to
// (regular and bold woff2, and the family's glyph faces: ADR 0043, 0049).
// URLs are relative to the page, so a subpath deploy works. A local-only
// family (Lucida Console) is never embedded: the file uses DejaVu Sans Mono
// in its place (ADR 0049), as the replay page never looks for installed
// fonts. The notice names the fonts actually embedded. The bundle is only ever read here as text: the app never
// runs it, and this module does not import the replay runtime.

import { FONTS, bundledFont, familyFaces, fontFaceRule } from '../theme/fonts';
import type { FontId } from '../settings/types';
import { captureEntries } from '../share/capture';
import type { ReplayPayload } from '../share/payload';
import { PAYLOAD_ELEMENT_ID, encodePayload, toBase64 } from './codec';
import { replayTitle } from './title';
import type { MapSource, TilesetOverlay } from '../map/protocol';
import type { EmbedMapOptions } from './map-embed';

declare const __WC_VERSION__: string | undefined;

/** Path of the replay bundle, relative to the app page (vite.config.ts `replayBundle`). */
export const REPLAY_BUNDLE_PATH = 'replay/replay.js';

export interface FontFile {
  family: string;
  weight: 'normal' | 'bold';
  /** The woff2 bytes. */
  data: Uint8Array;
  /** `unicode-range` of a glyph face (ADR 0043, 0049). */
  unicodeRange?: string;
}

/**
 * The notice lines for the embedded families `ids` (their names and
 * licences, and those of their glyph faces), each once.
 */
export function fontNotices(ids: readonly FontId[]): string[] {
  const out: string[] = [];
  for (const id of ids) {
    const f = FONTS[id];
    for (const n of [f.notice, ...(f.overrides ?? []).map((o) => o.notice), ...(f.fallbacks ?? []).map((o) => o.notice)]) {
      if (n && !out.includes(n)) out.push(n);
    }
  }
  return out;
}

export interface ReplayHtmlParts {
  /** The page title (plain text). */
  title: string;
  /** `encodePayload` text. */
  payload: string;
  /** The bundle's JavaScript. */
  script: string;
  fonts: FontFile[];
  /** `fontNotices` of the embedded families (the file's notice comment). */
  fontNotices?: readonly string[];
  /** First-paint colours (the exporter's theme). */
  bg: string;
  fg: string;
  version?: string;
}

/** Escapes text for HTML content and attribute values. */
export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

/**
 * Makes JavaScript safe inside an inline `<script>`: every `</script` and
 * `<!--` gets its `<` as `\x3C`, which means the same inside strings,
 * template literals and regular expressions (minified code has neither
 * outside them).
 */
export function escapeScript(js: string): string {
  return js.replace(/<(\/script|!--)/gi, '\\x3C$1');
}

const HEX = /^#[0-9a-f]{6}$/i;

/** Wraps `text` into comment lines of at most `width` characters, indented by two. */
function wrap(text: string, width = 72): string[] {
  const out: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/)) {
    if (line && line.length + 1 + word.length > width) {
      out.push(`  ${line}`);
      line = word;
    } else line = line ? `${line} ${word}` : word;
  }
  if (line) out.push(`  ${line}`);
  return out;
}

/** The GPL notice at the top of the file (ADR 0001). No `--` inside. */
function notice(version: string, fonts: readonly string[]): string {
  const fontText = fonts.length ? `Embedded fonts: ${fonts.join('; ')}.` : 'No embedded fonts.';
  return [
    '<!--',
    `  WebCockpit log replay (WebCockpit ${version}).`,
    '',
    '  This file contains a copy of the WebCockpit log player. It is free',
    '  software: you can redistribute it and/or modify it under the terms of',
    '  the GNU General Public License as published by the Free Software',
    '  Foundation, either version 2 of the License, or (at your option) any',
    '  later version. It is distributed WITHOUT ANY WARRANTY; see',
    '  https://www.gnu.org/licenses/old-licenses/gpl-2.0.html for details.',
    '  Source code: https://github.com/Khazdul/webcockpit',
    '',
    '  Map code and tiles are derived from MMapper',
    '  (https://github.com/MUME/MMapper), Copyright (C) The MMapper Authors,',
    '  GPL-2.0-or-later.',
    '',
    ...wrap(fontText.replace(/-{2,}/g, '-')),
    '-->',
  ].join('\n');
}

/** The whole HTML file (pure). */
export function assembleReplayHtml(p: ReplayHtmlParts): string {
  const faces = p.fonts
    .map((f) => fontFaceRule(f, `url(data:font/woff2;base64,${toBase64(f.data)}) format("woff2")`))
    .join('\n');
  const bg = HEX.test(p.bg) ? p.bg : '#000000';
  const fg = HEX.test(p.fg) ? p.fg : '#c0c0c0';
  return [
    '<!doctype html>',
    notice(p.version ?? '0.0.0', p.fontNotices ?? []),
    '<html lang="en">',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    '<meta name="generator" content="WebCockpit">',
    `<title>${escapeHtml(p.title)}</title>`,
    '<style>',
    `html,body{margin:0;height:100%;background:var(--term-bg,${bg});color:var(--term-fg,${fg})}`,
    '#app{height:100%}',
    faces,
    '</style>',
    '</head>',
    '<body>',
    '<div id="app"></div>',
    `<script type="application/json" id="${PAYLOAD_ELEMENT_ID}">${p.payload}</script>`,
    `<script>${escapeScript(p.script)}</script>`,
    '</body>',
    '</html>',
    '',
  ].join('\n');
}

/**
 * The font families the replay needs: the exporter's, then every other
 * family a recorded VIEW sets (the player overlays VIEW appearance). A
 * local-only family counts as DejaVu Sans Mono (`bundledFont`).
 */
export function replayFonts(p: ReplayPayload): FontId[] {
  const out = new Set<FontId>([bundledFont(p.settings.appearance.font)]);
  for (const r of p.runs) {
    for (const e of captureEntries(r.text)) {
      if (e.kind !== 'view') continue;
      try {
        const f = (JSON.parse(e.body) as { appearance?: { font?: unknown } } | null)?.appearance?.font;
        if (typeof f === 'string' && Object.hasOwn(FONTS, f)) out.add(bundledFont(f as FontId));
      } catch {
        /* a damaged VIEW is skipped by the player too */
      }
    }
  }
  return [...out];
}

export interface BuildReplayOptions {
  /** Fetch (tests); default the global one. */
  fetch?: (url: string) => Promise<Response>;
  /** Base URL the bundle and font paths resolve against; default the document's. */
  base?: string;
  /**
   * The current map (ADR 0020 "Replays"): when set, the subset around the
   * rooms the chain visited is embedded (src/replay/map-embed.ts), with its
   * tiles from `map/` under `base`. Absent or null: no map.
   */
  map?: MapSource | null;
  /** Runs the map tool (tests; default the map tools worker). */
  runMapTool?: EmbedMapOptions['runTool'];
  /** The map tileset to embed the tiles from (ADR 0082); absent: the default pixmaps. */
  tileset?: TilesetOverlay;
}

async function get(f: (url: string) => Promise<Response>, url: string): Promise<Response> {
  const res = await f(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res;
}

/** Builds the self-contained HTML replay of `payload` as a Blob (`text/html`). */
export async function buildReplayHtml(payload: ReplayPayload, opts: BuildReplayOptions = {}): Promise<Blob> {
  const f = opts.fetch ?? ((url: string) => fetch(url));
  const base = opts.base ?? globalThis.document?.baseURI ?? '';
  const url = (rel: string): string => (base ? new URL(rel, base).href : rel);
  if (opts.map) {
    const { embedReplayMap } = await import('./map-embed');
    payload = await embedReplayMap(payload, opts.map, {
      assetBase: url('map/'),
      fetch: f,
      ...(opts.runMapTool ? { runTool: opts.runMapTool } : {}),
      ...(opts.tileset ? { tileset: opts.tileset } : {}),
    });
  }
  const ids = replayFonts(payload);
  const seen = new Set<string>();
  const files = ids
    .flatMap((id) => familyFaces(id))
    .filter((x) => {
      const key = `${x.family}|${x.weight}`;
      if (!x.file || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  // One fetch per file: some faces share one (a fill face's weights, a
  // family without a bold).
  const bytes = new Map<string, Promise<Uint8Array>>();
  const fetchFont = (file: string): Promise<Uint8Array> => {
    let p = bytes.get(file);
    if (!p) {
      p = get(f, url(`fonts/${file}`)).then(async (r) => new Uint8Array(await r.arrayBuffer()));
      bytes.set(file, p);
    }
    return p;
  };
  const [script, fonts, encoded] = await Promise.all([
    get(f, url(REPLAY_BUNDLE_PATH)).then((r) => r.text()),
    Promise.all(
      files.map(async (x) => ({
        family: x.family,
        weight: x.weight,
        ...(x.unicodeRange ? { unicodeRange: x.unicodeRange } : {}),
        data: await fetchFont(x.file!),
      })),
    ),
    encodePayload(payload),
  ]);
  const a = payload.settings.appearance;
  const html = assembleReplayHtml({
    title: replayTitle(payload),
    payload: encoded,
    script,
    fonts,
    fontNotices: fontNotices(ids),
    bg: a.bg,
    fg: a.fg,
    version: typeof __WC_VERSION__ === 'string' ? __WC_VERSION__ : '0.0.0-dev',
  });
  return new Blob([html], { type: 'text/html;charset=utf-8' });
}
