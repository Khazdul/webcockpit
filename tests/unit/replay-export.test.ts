// HTML replay: payload codec, file assembly and escaping (ADR 0019, P2).
import { describe, expect, it } from 'vitest';
import { defaultSettings } from '../../src/settings';
import { defaultExportDoc } from '../../src/share/edits';
import { type ReplayPayload, buildReplayPayload } from '../../src/share/payload';
import { decodePayload, encodePayload, fromBase64, toBase64 } from '../../src/replay/codec';
import {
  REPLAY_BUNDLE_PATH,
  assembleReplayHtml,
  buildReplayHtml,
  escapeHtml,
  escapeScript,
  replayFonts,
} from '../../src/replay/export';
import { fmtDate, replayTitle } from '../../src/replay/title';
import { REPLAY_HINTS, replayHeader } from '../../src/replay/page';
import { fitHints } from '../../src/player/strip';
import { BASE_US, makeLog, meta } from './player-helpers';

function payload(over: Partial<ReplayPayload> = {}, font?: 'jetbrains'): ReplayPayload {
  const text = makeLog(BASE_US, [
    { at: 0, view: { appearance: { ...defaultSettings().appearance, ...(font ? { font } : {}) } } },
    { at: 1, in: 'A room with </script> and <!-- in it.' },
    { at: 2, out: 'look' },
  ]);
  const p = buildReplayPayload(
    [{ meta: meta('Rasta/a', BASE_US, { summary: { startUs: BASE_US, lastEventUs: BASE_US, level: 42, kills: 0, pkills: 0, deaths: 0 } }), text }],
    [],
    { ...defaultExportDoc('Rasta/a'), title: 'A fight' },
    defaultSettings(),
  );
  return { ...p, ...over };
}

/** The `<script>` elements of an HTML text, as the HTML tokenizer ends them. */
function scripts(html: string): Array<{ attrs: string; body: string }> {
  return [...html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script/gi)].map((m) => ({ attrs: m[1]!, body: m[2]! }));
}

describe('payload codec', () => {
  it('round-trips a payload through gzip and base64', async () => {
    const p = payload();
    const b64 = await encodePayload(p);
    expect(b64).toMatch(/^[A-Za-z0-9+/]+=*$/);
    expect(await decodePayload(b64)).toEqual(p);
  });

  it('round-trips a multi-megabyte payload (chunked base64)', async () => {
    const big = 'x'.repeat(3_000_000) + '♦';
    const p = payload({ title: big });
    expect((await decodePayload(await encodePayload(p))).title).toBe(big);
    const bytes = new Uint8Array(200_000).map((_, i) => (i * 7) & 255);
    expect(fromBase64(toBase64(bytes))).toEqual(bytes);
  });

  it('rejects a damaged or foreign payload', async () => {
    await expect(decodePayload('bm90IGd6aXA=')).rejects.toThrow();
    const foreign = toBase64(
      new Uint8Array(await new Response(new Blob(['{"schema":2}']).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer()),
    );
    await expect(decodePayload(foreign)).rejects.toThrow('not a WebCockpit replay payload');
  });
});

describe('escaping', () => {
  it('escapes HTML text', () => {
    expect(escapeHtml(`<b>"Tom" & 'Jerry'</b>`)).toBe('&#60;b&#62;&#34;Tom&#34; &#38; &#39;Jerry&#39;&#60;/b&#62;');
  });

  it('keeps </script and <!-- from ending or bending an inline script, meaning the same', () => {
    const js = 'var a="</script>",b=/<!--x|<\\/script/iu,c=`<!--`;globalThis.out=[a,b.test("<!--x"),c];';
    const safe = escapeScript(js);
    expect(safe).not.toMatch(/<\/script|<!--/i);
    const g = globalThis as unknown as { out?: unknown[] };
    new Function(safe)();
    expect(g.out).toEqual(['</script>', true, '<!--']);
  });
});

describe('assembleReplayHtml', () => {
  const parts = {
    title: 'A <fight> & more',
    payload: 'QUJD',
    script: 'document.title="</script><!--";',
    fonts: [
      { family: 'DejaVu Sans Mono', weight: 'bold' as const, data: new Uint8Array([1, 2, 3]) },
      { family: 'WebCockpit Underscore', weight: 'normal' as const, data: new Uint8Array([4]), unicodeRange: 'U+5F' },
    ],
    bg: '#101010',
    fg: 'not a colour',
    version: '1.2.3',
  };

  it('writes one self-contained file: doctype, GPL notice, title, fonts, payload, script', () => {
    const html = assembleReplayHtml(parts);
    expect(html.startsWith('<!doctype html>\n<!--\n  WebCockpit log replay (WebCockpit 1.2.3).')).toBe(true);
    expect(html).toContain('GNU General Public License');
    expect(html).toContain('Source code: https://github.com/Khazdul/webcockpit');
    const notice = html.slice(html.indexOf('<!--') + 4, html.indexOf('-->'));
    expect(notice).not.toContain('--');
    expect(html).toContain('<title>A &#60;fight&#62; &#38; more</title>');
    expect(html).toContain(
      '@font-face{font-family:"DejaVu Sans Mono";src:url(data:font/woff2;base64,AQID) format("woff2");font-weight:bold;font-style:normal;font-display:block}',
    );
    // The underscore face (ADR 0043) keeps its unicode-range.
    expect(html).toContain(
      '@font-face{font-family:"WebCockpit Underscore";src:url(data:font/woff2;base64,BA==) format("woff2");font-weight:normal;font-style:normal;font-display:block;unicode-range:U+5F}',
    );
    expect(html).toContain('background:var(--term-bg,#101010);color:var(--term-fg,#c0c0c0)');
    const s = scripts(html);
    expect(s).toHaveLength(2);
    expect(s[0]!.attrs).toBe(' type="application/json" id="wc-replay-payload"');
    expect(s[0]!.body).toBe('QUJD');
    expect(s[1]!.body).toBe(escapeScript(parts.script));
    expect(html).not.toMatch(/\bsrc=|<link/);
    expect(html.trimEnd().endsWith('</html>')).toBe(true);
  });
});

describe('replayFonts', () => {
  it("is the exporter's family plus any family a recorded VIEW uses", () => {
    expect(replayFonts(payload())).toEqual(['dejavu']);
    expect(replayFonts(payload({}, 'jetbrains'))).toEqual(['dejavu', 'jetbrains']);
  });
});

describe('buildReplayHtml', () => {
  it('fetches the bundle and the fonts relative to the base and embeds them', async () => {
    const urls: string[] = [];
    const fetch = async (url: string): Promise<Response> => {
      urls.push(url);
      return new Response(url.endsWith('.js') ? 'console.log("</script>")' : new Uint8Array([9, 9]));
    };
    const p = payload();
    const blob = await buildReplayHtml(p, { fetch, base: 'https://example.org/sub/index.html?x=1' });
    expect(blob.type).toBe('text/html;charset=utf-8');
    expect(urls.sort()).toEqual([
      'https://example.org/sub/fonts/DejaVuSansMono-Bold.woff2',
      'https://example.org/sub/fonts/DejaVuSansMono.woff2',
      'https://example.org/sub/fonts/WebCockpitUnderscore-Bold.woff2',
      'https://example.org/sub/fonts/WebCockpitUnderscore.woff2',
      `https://example.org/sub/${REPLAY_BUNDLE_PATH}`,
    ]);
    const html = await blob.text();
    const s = scripts(html);
    expect(s).toHaveLength(2);
    expect(await decodePayload(s[0]!.body)).toEqual(p);
    expect(s[1]!.body).toBe('console.log("\\x3C/script>")');
    expect(html).toContain('<title>A fight</title>');
    // DejaVu regular and bold, and the underscore face (ADR 0043) with its unicode-range.
    expect(html.match(/@font-face/g)).toHaveLength(4);
    expect(html.match(/unicode-range:U\+5F}/g)).toHaveLength(2);
  });

  it('fails when the bundle is missing', async () => {
    const fetch = async (url: string): Promise<Response> => new Response('', { status: url.endsWith('.js') ? 404 : 200 });
    await expect(buildReplayHtml(payload(), { fetch, base: 'http://x/' })).rejects.toThrow('replay/replay.js: HTTP 404');
  });
});

describe('replay header', () => {
  it('shows title · char (level) · date, and the replay hints', () => {
    const p = payload();
    const h = replayHeader(p);
    expect(h.left.map((x) => x.text)).toEqual(['A fight', 'Rasta (L42)', fmtDate(BASE_US)]);
    expect(fitHints(200, h.hints)).toEqual(['Space Play', '↑↓ Scroll', '1–6 Speed', 'F Fullscreen']);
    expect(fitHints(5, REPLAY_HINTS)).toEqual([]);
    const untitled = replayHeader({ ...p, title: '', level: undefined as never });
    expect(untitled.left.map((x) => x.text)).toEqual(['Rasta', fmtDate(BASE_US)]);
    expect(replayHeader({ ...p, title: 'x'.repeat(100) }).left[0]!.text).toHaveLength(60);
  });

  it('titles the page by the export title, else the character and date', () => {
    expect(replayTitle(payload())).toBe('A fight');
    expect(replayTitle(payload({ title: '' }))).toBe(`Rasta · ${fmtDate(BASE_US)}`);
    expect(fmtDate(new Date(2026, 8, 26, 21, 0).getTime() * 1000)).toBe('2026-09-26');
  });
});
