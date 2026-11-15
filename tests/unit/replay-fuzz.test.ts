// @vitest-environment happy-dom
// Fuzzing the shared replay's runtime (ADR 0154 "Hardening the replay
// runtime"): real payloads, mutated with fixed seeds (a failure repeats:
// the case's seed and mutation are in its name), through the frame's own
// path: the wire bytes (gzip JSON) → `readSharedPayload` (bounded gunzip,
// validatePayload) → `openReplay` in the unit DOM, played to its end on a
// fake wall. No throw escapes but the reader's own refusal, nothing is
// added to the document outside the player's root, and every case ends in
// bounded wall time.
import { afterEach, describe, expect, it } from 'vitest';
import { PayloadReadError, payloadBytes, readSharedPayload } from '../../src/replay/codec';
import { openReplay } from '../../src/replay/page';
import { PayloadError, validatePayload } from '../../src/replay/validate';
import type { ReplayPayload } from '../../src/share/payload';
import { FakeWall } from './player-helpers';
import { logPayload } from './replay-payloads';

/** mulberry32: a small seeded PRNG. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type R = () => number;
const pick = <T>(r: R, xs: readonly T[]): T => xs[Math.floor(r() * xs.length)]!;

const T0 = 1_790_000_000_000_000;
const ts = (s: number): string => String(T0 + Math.round(s * 1e6));

/** Lines a run's text may get: broken ANSI, broken and hostile GMCP, VIEW and SPANE records. */
const NASTY_LINES = [
  '\x1b[38;2;999;999;999m\x1b[48;5;9999m\x1b[1;2;3;4;5;6;7;8;9;0;99999999999mansi',
  '\x1b[',
  '\x1b]8;;javascript:alert(1)\x07link\x1b]8;;\x07',
  '\x1b]0;' + 'x'.repeat(10000),
  '\x1bP' + 'q'.repeat(2000),
  '<img src=x onerror=alert(1)><script>alert(2)</script>',
  '\x00\x01\x02\x7f𐏿�',
  '\x1bGMCP Char.Vitals {"hp":"NaN","maxhp":1e308,"mana":-1e308,"mp":null}',
  '\x1bGMCP Char.Vitals {',
  '\x1bGMCP Group.Set [{"id":"__proto__","name":{"x":1},"hp":1e999}]',
  '\x1bGMCP Group.Add {"id":1e308,"type":"constructor","name":"<b>x</b>","label":"__proto__"}',
  '\x1bGMCP Comm.Channel.List [{"name":"__proto__","caption":"<i>"},{"name":"constructor"}]',
  '\x1bGMCP Comm.Channel.Text {"channel":"toString","talker":"__proto__","text":"\x1b[31m<script>"}',
  '\x1bGMCP Room.Info {"id":"x","name":{"a":1},"exits":"__proto__"}',
  '\x1bGMCP Char.StatusVars {"level":"99999999999999999999","race":{"__proto__":{"x":1}}}',
  '\x1bGMCP Event.Achieved {"text":"<b>a</b>"}',
  '\x1bGMCP WebCockpit.Timers {"constructor":1,"__proto__":{"x":1}}',
  '\x1bGMCP ' + 'A.'.repeat(5000),
  '\x1bVIEW {"panes":{"statistics":1,"comm":null},"layout":{"docks":"x"},"appearance":{"bg":"url(x)","ansi":7,"size":1e308}}',
  '\x1bVIEW {"__proto__":{"appearance":{"bg":"#ff0000"}},"timers":[]}',
  '\x1bVIEW [1,2,3]',
  '\x1bSIZE {"cols":1e9,"rows":-5}',
  '\x1bSPANE evil/p {"title":"<b>t</b>","lines":[{"spans":[{"text":"x","fg":1e308,"bg":"red"}],"gauges":[{"value":1e308,"max":0,"label":"<i>"}]}],"links":[{"row":1e9,"col":-1,"len":1e9,"hint":"<a>"}],"temp":{"rows":1e9,"cols":1e9}}',
  '\x1bSPANE evil/~t {"title":"t","lines":[],"links":[],"temp":{"rows":-1,"cols":"x","rect":{"x":1e308}}}',
  '\x1bSPANE __proto__/x {}',
  '\x1bSPANE evil/q null',
  '\x1bXYZZY unknown record',
];

/** Deeply nested JSON (a parser or a recursive walk that does not bound it). */
const deep = (n: number): unknown => {
  let v: unknown = 1;
  for (let i = 0; i < n; i++) v = i % 2 ? { a: v } : [v];
  return v;
};

/** One mutation of a payload's JSON form (in place); returns its name. */
function mutate(r: R, o: Record<string, any>): string {
  const kind = Math.floor(r() * 12);
  const runs = Array.isArray(o.runs) ? o.runs : [];
  const run = runs.length ? pick(r, runs) : null;
  switch (kind) {
    case 0: {
      // Flip a top-level field's type.
      const k = pick(r, ['title', 'character', 'startUs', 'level', 'settings', 'runs', 'comments', 'cuts', 'markers', 'hiddenSys', 'map']);
      o[k] = pick(r, [null, 0, -1, '', 'x', [], {}, true, [null], { length: 1e9 }]);
      return `flip ${k}`;
    }
    case 1: {
      const k = pick(r, ['startUs', 'level']);
      o[k] = pick(r, [1e308, -1e308, Number.MAX_SAFE_INTEGER, 2 ** 53 + 1, -0, 1e-300]);
      return `huge ${k}`;
    }
    case 2: {
      if (run) run.text = String(run.text ?? '').slice(0, Math.floor(r() * String(run.text ?? '').length));
      return 'truncated run text';
    }
    case 3: {
      // Nasty lines spliced into a run, at its times.
      if (!run) return 'no run';
      const lines = String(run.text).split('\n');
      for (let i = 0; i < 1 + Math.floor(r() * 8); i++) {
        const at = Math.floor(r() * lines.length);
        const t = /^\d{16}/.exec(lines[at] ?? '')?.[0] ?? ts(r() * 10);
        lines.splice(at, 0, `${t} ${pick(r, NASTY_LINES)}`);
      }
      run.text = lines.join('\n');
      return 'nasty lines';
    }
    case 4: {
      o.title = 'x'.repeat(Math.floor(r() * 2000));
      o.comments = Array.from({ length: Math.floor(r() * 40) }, () => ({
        beforeUs: r() < 0.2 ? null : T0 + r() * 1e8,
        text: pick(r, ['<b>c</b>', 'x'.repeat(4000), '‮\u0000', '']),
        holdMs: pick(r, [0, 2500, 60000]),
      }));
      return 'long strings and comments';
    }
    case 5:
      o.settings = deep(500);
      return 'deep settings';
    case 6: {
      o.markers = Array.from({ length: Math.floor(r() * 300) }, () => ({
        us: pick(r, [T0, T0 + r() * 1e9, -1e18, 8e18]),
        kind: pick(r, ['A', 'D', 'K', 'L']),
        tip: pick(r, ['<b>t</b>', '', 'x'.repeat(2000)]),
      }));
      o.cuts = Array.from({ length: Math.floor(r() * 30) }, () => {
        const a = T0 + r() * 1e8;
        return [a, r() < 0.2 ? null : a + r() * 1e8];
      });
      return 'markers and cuts';
    }
    case 7: {
      // Prototype keys as own keys of objects (as JSON.parse makes them), all through the payload.
      const walk = (v: unknown, depth: number): void => {
        if (!v || typeof v !== 'object' || depth > 6) return;
        for (const x of Object.values(v)) walk(x, depth + 1);
        if (!Array.isArray(v) && r() < 0.3) {
          Object.defineProperty(v, '__proto__', { value: { polluted: 1, schema: 2 }, enumerable: true, writable: true, configurable: true });
          (v as Record<string, unknown>)["constructor"] = { prototype: { polluted: 2 } };
        }
      };
      walk(o, 0);
      return 'prototype keys';
    }
    case 8: {
      o.hiddenSys = [pick(r, [0, runs.length, -1, 0.5, 1e9])];
      return 'hiddenSys';
    }
    case 9: {
      o.map = {
        name: '<b>m</b>',
        rooms: pick(r, [0, 1e9, -1]),
        visited: 1,
        mm2: pick(r, ['', 'AAAA', 'not base64', 'eJzLSM3JyQcABiwCFQ==']),
        files: pick(r, [
          {},
          { 'pixmaps/x.png': 'https://example.invalid/x.png' },
          { 'pixmaps/../x.png': 'data:image/png;base64,AA==' },
          { 'fonts/Cantarell18.fnt': 'data:text/plain;base64,aW5mbw==' },
        ]),
        ...(r() < 0.5 ? { tints: { dark: 'url(x)', noSundeath: '#000000' } } : {}),
      };
      return 'map';
    }
    case 10: {
      o.runs = Array.from({ length: pick(r, [0, 1, 2, 201]) }, (_, i) => ({ meta: { startedUs: T0 + i }, text: `${ts(i)} run ${i}\n` }));
      return 'run count';
    }
    default: {
      if (run) run.meta = pick(r, [null, {}, { startedUs: 'x' }, { startedUs: T0, summary: { startUs: NaN } }, { startedUs: T0, summary: null }]);
      return 'run meta';
    }
  }
}

const bodyChildren = (): Element[] => [...document.body.children];

/** Plays a validated payload to its end in a fresh root on a fake wall; returns the elapsed ms. */
function play(p: ReplayPayload): number {
  const t0 = performance.now();
  const before = bodyChildren();
  const root = document.createElement('div');
  document.body.appendChild(root);
  const wall = new FakeWall();
  const page = openReplay(document, root, p, { wall });
  const eng = page.host.engine!;
  eng.seek(eng.duration / 2);
  wall.advance(2000);
  eng.seek(eng.duration);
  wall.advance(2000);
  // Nothing outside the root: the body holds what it held, plus the root.
  // (The player's popups and tips live inside it.)
  const added = bodyChildren().filter((e) => !before.includes(e) && e !== root);
  page.host.dispose();
  root.remove();
  expect(added.map((e) => e.outerHTML.slice(0, 80))).toEqual([]);
  // No element of a payload's markup anywhere in the document.
  expect(document.querySelectorAll('img, script, iframe, object, embed, a[href]').length).toBe(0);
  return performance.now() - t0;
}

async function gz(json: string): Promise<Uint8Array> {
  return new Uint8Array(await new Response(new Blob([json]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer());
}

/** Reads and, if it passes, plays the wire bytes; a refusal is the reader's own. */
async function run(bytes: Uint8Array): Promise<'played' | 'refused'> {
  let p: ReplayPayload;
  try {
    p = await readSharedPayload(bytes);
  } catch (err) {
    expect(err).toBeInstanceOf(PayloadReadError);
    expect((err as PayloadReadError).text).toMatch(/^This replay (could not be read|is too large)/);
    return 'refused';
  }
  const ms = play(p);
  expect(ms).toBeLessThan(15_000);
  return 'played';
}

const BASES = ['gmcp-demo.log', 'timers-demo.log', 'map-demo.log', 'colour-chart.log'];
const SEEDS = 100;

afterEach(() => {
  expect(({} as Record<string, unknown>).polluted).toBeUndefined();
});

describe('replay fuzz: mutated real payloads through the frame’s path', () => {
  for (const base of BASES) {
    it(`${base}: ${SEEDS} seeds`, { timeout: 120_000 }, async () => {
      const real = logPayload(base);
      const outcome: Record<string, number> = {};
      for (let seed = 1; seed <= SEEDS; seed++) {
        const r = rng(seed * 7919 + base.length);
        const o = JSON.parse(JSON.stringify(real)) as Record<string, any>;
        const names: string[] = [];
        for (let k = 0; k < 1 + Math.floor(r() * 3); k++) names.push(mutate(r, o));
        let res: string;
        try {
          res = await run(await gz(JSON.stringify(o)));
        } catch (err) {
          throw new Error(`seed ${seed} (${names.join(', ')}): ${err instanceof Error ? err.stack : String(err)}`);
        }
        outcome[res] = (outcome[res] ?? 0) + 1;
      }
      // Both kinds happen: the fuzz is not refusing everything.
      expect(outcome.played).toBeGreaterThan(0);
      expect(outcome.refused).toBeGreaterThan(0);
    });
  }

  it('the unmutated payloads play', async () => {
    for (const base of BASES) expect(await run(await payloadBytes(logPayload(base)))).toBe('played');
  });
});

describe('replay fuzz: the wire bytes', () => {
  it('cut-up and bit-flipped gzip is refused, never thrown', async () => {
    const bytes = await payloadBytes(logPayload('gmcp-demo.log'));
    const r = rng(42);
    for (let i = 0; i < 40; i++) {
      const b = bytes.slice(0, Math.floor(r() * bytes.length));
      if (r() < 0.5 && b.length > 20) b[10 + Math.floor(r() * (b.length - 10))]! ^= 1 << Math.floor(r() * 8);
      const res = await run(b);
      expect(['refused', 'played']).toContain(res);
    }
    for (const junk of [new Uint8Array(0), new Uint8Array([0x1f, 0x8b]), new TextEncoder().encode('{"schema":1}')]) {
      expect(await run(junk)).toBe('refused');
    }
  });

  it('a gzip bomb stops at the ceiling, in bounded time', async () => {
    // 200 MiB of spaces: about 200 KiB of gzip.
    const chunk = new Uint8Array(1024 * 1024).fill(32);
    const stream = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(new TextEncoder().encode('{"schema":1,"title":"'));
        for (let i = 0; i < 200; i++) c.enqueue(chunk);
        c.enqueue(new TextEncoder().encode('"}'));
        c.close();
      },
    });
    const bomb = new Uint8Array(await new Response(stream.pipeThrough(new CompressionStream('gzip') as unknown as ReadableWritablePair<Uint8Array, Uint8Array>)).arrayBuffer());
    expect(bomb.byteLength).toBeLessThan(1024 * 1024);
    const t0 = performance.now();
    await expect(readSharedPayload(bomb)).rejects.toThrow('This replay is too large.');
    expect(performance.now() - t0).toBeLessThan(10_000);
    await expect(readSharedPayload(bomb, 1024 * 1024)).rejects.toThrow('This replay is too large.');
  });

  it('values JSON cannot carry (NaN, Infinity, cycles, getters) are refused by validatePayload, not thrown past it', () => {
    const base = logPayload('gmcp-demo.log');
    const cyclic: Record<string, unknown> = { ...base };
    cyclic.settings = cyclic;
    const getter = { ...base };
    Object.defineProperty(getter, 'title', {
      get() {
        throw new Error('trap');
      },
      enumerable: true,
    });
    for (const raw of [{ ...base, startUs: NaN }, { ...base, level: Infinity }, { ...base, markers: [{ us: NaN, kind: 'A' }] }, cyclic]) {
      let ok = true;
      try {
        validatePayload(raw);
      } catch (err) {
        ok = false;
        expect(err).toBeInstanceOf(PayloadError);
      }
      if (ok) play(validatePayload(raw));
    }
    // A getter that throws (only an object handed in by code, never parsed JSON) is the caller's own.
    expect(() => validatePayload(getter)).toThrow();
  });
});
