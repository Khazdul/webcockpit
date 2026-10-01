import { describe, expect, it } from 'vitest';
import {
  DO,
  DONT,
  GA,
  OPT_CHARSET,
  OPT_ECHO,
  OPT_GMCP,
  OPT_MCCP2,
  OPT_MSSP,
  OPT_NAWS,
  OPT_NEW_ENVIRON,
  OPT_TTYPE,
  Telnet,
  WILL,
  WONT,
  escapeIac,
} from '../../src/net/telnet';
import { BANNER_NEG, BANNER_TEXT, IAC, RecSink, SE, SB, ascii, concat, sb, utf8 } from './net-helpers';

function make() {
  const sink = new RecSink();
  const writes: number[][] = [];
  const gmcp: string[] = [];
  const echo: boolean[] = [];
  let enabled = 0;
  const t = new Telnet({
    sink,
    write: (b) => writes.push(Array.from(b)),
    onGmcp: (p) => gmcp.push(p),
    onGmcpEnabled: () => enabled++,
    onEcho: (e) => echo.push(e),
  });
  return { t, sink, writes, gmcp, echo, enabled: () => enabled };
}

/** A recorded-style session: negotiation, text, GA, GMCP, CHARSET switch, UTF-8. */
const STREAM = concat(
  BANNER_NEG,
  BANNER_TEXT,
  ascii('By what name do you wish to be known? '),
  [IAC, GA],
  sb(OPT_GMCP, ascii('Client.Map {"url":"https://mume.org/download/mapper/arda-base.xml"}')),
  ascii('Latin1: caf'),
  [0xe9], // é in Latin-1
  ascii(' y'),
  [IAC, IAC], // ÿ
  ascii('\r\n'),
  sb(OPT_CHARSET, [1, ...ascii(';ISO_8859-1:1987;ISO-8859-1;UTF-8;US-ASCII')]),
  sb(OPT_CHARSET, [2, ...ascii('UTF-8')]),
  utf8('Välkommen — 🐉 till Arda\r\n'),
  sb(OPT_GMCP, utf8('Char.Name {"name":"Åke","fullname":"Åke the Ω"}')),
  sb(OPT_GMCP, ascii('Core.Ping')),
  [IAC, WILL, OPT_ECHO],
  ascii('Password: '),
  [IAC, GA],
  [IAC, 241], // NOP
  [IAC, WONT, OPT_ECHO],
  utf8('oO Mana:Hot>'),
  [IAC, GA],
);

function run(chunks: Uint8Array[]) {
  const m = make();
  for (const c of chunks) m.t.receive(c, 1);
  return {
    out: m.sink.out,
    writes: m.writes.flat(),
    gmcp: m.gmcp,
    echo: m.echo,
    enabled: m.enabled(),
    utf8: m.t.utf8,
  };
}

function split(bytes: Uint8Array, cuts: number[]): Uint8Array[] {
  const out: Uint8Array[] = [];
  let prev = 0;
  for (const c of [...cuts, bytes.length]) {
    out.push(bytes.slice(prev, c));
    prev = c;
  }
  return out;
}

// Small deterministic PRNG so failures are reproducible.
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

describe('Telnet parser', () => {
  const whole = run([STREAM]);

  it('parses the recorded-style stream', () => {
    expect(whole.out).toContain('***  MUME IX  ***');
    expect(whole.out).toContain('By what name do you wish to be known? ⟨GA⟩');
    expect(whole.out).toContain('Latin1: café yÿ\r\n');
    expect(whole.out).toContain('Välkommen — 🐉 till Arda\r\n');
    expect(whole.out.endsWith('Password: ⟨GA⟩oO Mana:Hot>⟨GA⟩')).toBe(true);
    expect(whole.gmcp).toEqual([
      'Client.Map {"url":"https://mume.org/download/mapper/arda-base.xml"}',
      'Char.Name {"name":"Åke","fullname":"Åke the Ω"}',
      'Core.Ping',
    ]);
    expect(whole.echo).toEqual([true, false]);
    expect(whole.enabled).toBe(1);
    expect(whole.utf8).toBe(true);
  });

  it('gives identical results when fed byte by byte', () => {
    const bytes = Array.from(STREAM, (b) => Uint8Array.of(b));
    expect(run(bytes)).toEqual(whole);
  });

  it('gives identical results for every single split point', () => {
    for (let c = 1; c < STREAM.length; c++) {
      expect(run(split(STREAM, [c]))).toEqual(whole);
    }
  });

  it('gives identical results for random chunkings', () => {
    const r = rng(42);
    for (let iter = 0; iter < 300; iter++) {
      const cuts: number[] = [];
      let p = 0;
      for (;;) {
        p += 1 + Math.floor(r() * 12);
        if (p >= STREAM.length) break;
        cuts.push(p);
      }
      expect(run(split(STREAM, cuts))).toEqual(whole);
    }
  });

  it('answers the MUME banner negotiation', () => {
    const m = make();
    m.t.setWindowSize(120, 40);
    m.t.receive(BANNER_NEG, 1);
    expect(m.writes).toEqual([
      [IAC, WILL, OPT_NAWS],
      [IAC, SB, OPT_NAWS, 0, 120, 0, 40, IAC, SE],
      [IAC, WILL, OPT_TTYPE],
      [IAC, WILL, OPT_CHARSET],
      [IAC, SB, OPT_CHARSET, 1, ...ascii(';UTF-8;ISO-8859-1'), IAC, SE],
      [IAC, DONT, OPT_MCCP2],
      [IAC, DO, OPT_MSSP],
      [IAC, WONT, OPT_NEW_ENVIRON],
      [IAC, DO, OPT_GMCP],
    ]);
    expect(m.enabled()).toBe(1);
  });

  it('does not re-acknowledge repeated requests (no loops)', () => {
    const m = make();
    m.t.receive(Uint8Array.from([IAC, WILL, OPT_GMCP, IAC, WILL, OPT_GMCP, IAC, DO, OPT_NAWS, IAC, DO, OPT_NAWS]), 1);
    const n = m.writes.length;
    // Refusal of an unknown option, then the server's WONT: no reply to the WONT.
    m.t.receive(Uint8Array.from([IAC, WILL, 99]), 1);
    expect(m.writes.length).toBe(n + 1);
    expect(m.writes.at(-1)).toEqual([IAC, DONT, 99]);
    m.t.receive(Uint8Array.from([IAC, WONT, 99, IAC, DONT, 77]), 1);
    expect(m.writes.length).toBe(n + 1);
    expect(m.enabled()).toBe(1);
    // DONT on an enabled option is acknowledged once.
    m.t.receive(Uint8Array.from([IAC, DONT, OPT_NAWS, IAC, DONT, OPT_NAWS]), 1);
    expect(m.writes.slice(n + 1)).toEqual([[IAC, WONT, OPT_NAWS]]);
  });

  it('refuses DO for unknown options with WONT', () => {
    const m = make();
    m.t.receive(Uint8Array.from([IAC, DO, 3]), 1);
    expect(m.writes).toEqual([[IAC, WONT, 3]]);
  });

  it('answers TTYPE SEND with IS WebCockpit', () => {
    const m = make();
    m.t.receive(concat([IAC, DO, OPT_TTYPE], sb(OPT_TTYPE, [1])), 1);
    expect(m.writes[1]).toEqual([IAC, SB, OPT_TTYPE, 0, ...ascii('WebCockpit'), IAC, SE]);
  });

  it('sends NAWS on resize only when enabled and changed, escaping 255', () => {
    const m = make();
    m.t.setWindowSize(80, 24);
    expect(m.writes).toEqual([]);
    m.t.receive(Uint8Array.from([IAC, DO, OPT_NAWS]), 1);
    expect(m.writes.at(-1)).toEqual([IAC, SB, OPT_NAWS, 0, 80, 0, 24, IAC, SE]);
    const n = m.writes.length;
    m.t.setWindowSize(80, 24);
    expect(m.writes.length).toBe(n);
    m.t.setWindowSize(255, 511);
    expect(m.writes.at(-1)).toEqual([IAC, SB, OPT_NAWS, 0, IAC, IAC, 1, IAC, IAC, IAC, SE]);
  });

  it('parses MSSP', () => {
    const m = make();
    m.t.receive(
      concat([IAC, WILL, OPT_MSSP], sb(OPT_MSSP, [1, ...ascii('NAME'), 2, ...ascii('MUME'), 1, ...ascii('PORT'), 2, ...ascii('4242'), 2, ...ascii('443')])),
      1,
    );
    expect(m.t.mssp.get('NAME')).toEqual(['MUME']);
    expect(m.t.mssp.get('PORT')).toEqual(['4242', '443']);
  });

  it('treats EOR like GA and drops NUL', () => {
    const m = make();
    m.t.receive(Uint8Array.from([...ascii('a\r'), 0, ...ascii('b'), IAC, 239]), 1);
    expect(m.sink.out).toBe('a\rb⟨GA⟩');
  });

  it('carries the frame timestamp to text and GA', () => {
    const got: number[] = [];
    const t = new Telnet({ sink: { text: (_s, ts) => got.push(ts), ga: (ts) => got.push(ts) }, write: () => {} });
    t.receive(Uint8Array.from([...ascii('x'), IAC, GA]), 7);
    t.receive(Uint8Array.from(ascii('y')), 8);
    expect(got).toEqual([7, 7, 8]);
  });
});

describe('Telnet data state', () => {
  /** A stream that puts IAC, NUL and subnegotiation edges right next to text. */
  const EDGES = concat(
    [IAC, WILL, OPT_GMCP],
    ascii('ab'),
    [0, 0],
    ascii('c'),
    [IAC, IAC, IAC, IAC],
    ascii('d'),
    [0, IAC, GA, 0],
    sb(OPT_GMCP, ascii('Core.Ping')),
    ascii('e'),
    [IAC, 241, 0], // NOP, NUL
    sb(200, [...ascii('X '), IAC, IAC, 0, ...ascii('y')]), // an unknown option, ignored
    sb(OPT_GMCP, ascii('Y')),
    [IAC, IAC],
    ascii('f\r\n'),
    [0],
  );
  const expected = 'abcÿÿd⟨GA⟩eÿf\r\n';

  it('drops NULs, decodes IAC IAC and keeps text next to subnegotiations', () => {
    const r = run([EDGES]);
    expect(r.out).toBe(expected);
    expect(r.gmcp).toEqual(['Core.Ping', 'Y']);
  });

  it('gives identical results for every split point and byte by byte', () => {
    const whole = run([EDGES]);
    expect(run(Array.from(EDGES, (b) => Uint8Array.of(b)))).toEqual(whole);
    for (let c = 1; c < EDGES.length; c++) {
      expect(run(split(EDGES, [c])), `cut at ${c}`).toEqual(whole);
    }
    for (let a = 1; a < EDGES.length; a++) {
      for (let b = a + 1; b < EDGES.length; b++) {
        expect(run(split(EDGES, [a, b])), `cuts ${a},${b}`).toEqual(whole);
      }
    }
  });

  it('completes an IAC split across messages', () => {
    const m = make();
    m.t.receive(Uint8Array.from([...ascii('prompt>'), IAC]), 1);
    expect(m.sink.out).toBe('prompt>');
    m.t.receive(Uint8Array.from([GA, ...ascii('next')]), 2);
    expect(m.sink.out).toBe('prompt>⟨GA⟩next');
    m.t.receive(Uint8Array.from([IAC]), 3);
    m.t.receive(Uint8Array.from([IAC, ...ascii('!')]), 4);
    expect(m.sink.out).toBe('prompt>⟨GA⟩nextÿ!');
  });

  it('emits a run of plain text as one piece and splits it only at IAC or NUL', () => {
    const m = make();
    m.t.receive(Uint8Array.from(ascii('x'.repeat(5000))), 1);
    expect(m.sink.texts).toBe(1);
    m.t.receive(Uint8Array.from([...ascii('one'), 0, ...ascii('two'), IAC, GA, ...ascii('three')]), 1);
    expect(m.sink.texts).toBe(4);
    expect(m.sink.out.endsWith('onetwo⟨GA⟩three')).toBe(true);
  });

  it('handles frames of only NULs or only IACs', () => {
    const m = make();
    m.t.receive(new Uint8Array(1000), 1);
    m.t.receive(new Uint8Array(1000).fill(IAC), 1);
    expect(m.sink.out).toBe('ÿ'.repeat(500));
  });
});

describe('IAC escaping', () => {
  it('doubles 0xFF and leaves other bytes alone', () => {
    expect(Array.from(escapeIac(Uint8Array.from([1, 255, 2, 255])))).toEqual([1, 255, 255, 2, 255, 255]);
    const plain = Uint8Array.from([1, 2]);
    expect(escapeIac(plain)).toBe(plain);
  });

  it('escapes ÿ in outbound Latin-1 text and in GMCP payloads', () => {
    const writes: number[][] = [];
    const t = new Telnet({ sink: new RecSink(), write: (b) => writes.push(Array.from(b)) });
    expect(Array.from(t.encodeText('ÿ\r\n'))).toEqual([IAC, IAC, 13, 10]);
    expect(t.sendGmcp('X "ÿ"')).toBe(false); // GMCP not enabled yet
    t.receive(Uint8Array.from([IAC, WILL, OPT_GMCP]), 1);
    expect(t.sendGmcp('X "ÿ"')).toBe(true);
    expect(writes.at(-1)).toEqual([IAC, SB, OPT_GMCP, ...ascii('X "'), IAC, IAC, ...ascii('"'), IAC, SE]);
  });

  it('decodes IAC IAC inside a subnegotiation', () => {
    const m = make();
    m.t.receive(concat([IAC, WILL, OPT_GMCP], sb(OPT_GMCP, [...ascii('A "'), IAC, IAC, ...ascii('"')])), 1);
    expect(m.gmcp).toEqual(['A "ÿ"']);
  });
});

describe('CHARSET', () => {
  it('stays Latin-1 when our request is rejected', () => {
    const m = make();
    m.t.receive(concat([IAC, DO, OPT_CHARSET], sb(OPT_CHARSET, [3])), 1);
    expect(m.t.utf8).toBe(false);
    m.t.receive(Uint8Array.from([0xe5]), 1);
    expect(m.sink.out).toBe('å');
  });

  it('switches to UTF-8 when our request is accepted', () => {
    const m = make();
    m.t.receive(concat([IAC, DO, OPT_CHARSET], sb(OPT_CHARSET, [2, ...ascii('UTF-8')]), utf8('å')), 1);
    expect(m.t.utf8).toBe(true);
    expect(m.sink.out).toBe('å');
    expect(Array.from(m.t.encodeText('å'))).toEqual(utf8('å'));
  });

  it('accepts the server REQUEST when it offers UTF-8', () => {
    const m = make();
    m.t.receive(concat([IAC, WILL, OPT_CHARSET], sb(OPT_CHARSET, [1, ...ascii(' ISO-8859-1 utf-8')])), 1);
    expect(m.writes.at(-1)).toEqual([IAC, SB, OPT_CHARSET, 2, ...ascii('utf-8'), IAC, SE]);
    expect(m.t.utf8).toBe(true);
  });

  it('rejects a server REQUEST without UTF-8', () => {
    const m = make();
    m.t.receive(Uint8Array.from(sb(OPT_CHARSET, [1, ...ascii(';ISO-8859-1;US-ASCII')])), 1);
    expect(m.writes.at(-1)).toEqual([IAC, SB, OPT_CHARSET, 3, IAC, SE]);
    expect(m.t.utf8).toBe(false);
  });

  it('handles a [TTABLE] request prefix', () => {
    const m = make();
    m.t.receive(Uint8Array.from(sb(OPT_CHARSET, [1, ...ascii('[TTABLE]'), 1, ...ascii(';UTF-8')])), 1);
    expect(m.writes.at(-1)).toEqual([IAC, SB, OPT_CHARSET, 2, ...ascii('UTF-8'), IAC, SE]);
  });

  it('decodes each GMCP payload on its own: a cut sequence does not leak into the next', () => {
    const m = make();
    m.t.forceUtf8();
    m.t.receive(concat([IAC, WILL, OPT_GMCP], sb(OPT_GMCP, [...utf8('A "x'), 0xc3]), sb(OPT_GMCP, utf8('B "é"'))), 1);
    expect(m.gmcp).toEqual(['A "x\ufffd', 'B "é"']);
  });

  it('decodes multibyte UTF-8 split across frames', () => {
    const m = make();
    m.t.forceUtf8();
    const bytes = utf8('ä€🐉');
    for (const b of bytes) m.t.receive(Uint8Array.of(b), 1);
    expect(m.sink.out).toBe('ä€🐉');
  });
});
