// The hidden info poll's filter (stage 77 part C, ADR 0166 points 1–4, 21,
// 22, 25): real telnet and assembler in front of it.
import { describe, expect, it } from 'vitest';
import { Bus } from '../../src/core/bus';
import type { Line } from '../../src/core/types';
import { INFO_FIELDS, type InfoAnswer } from '../../src/gmcp/info-answer';
import { HOLD_MS, InfoFilter, MAX_LINES, infoCommand, isGamePrompt } from '../../src/gmcp/info-filter';
import { Telnet } from '../../src/net/telnet';
import { FakeScheduler } from '../../src/script/engine/timers';
import { LineAssembler } from '../../src/text/assembler';
import { ANSWER_FIELDS, GA, XML_PROMPT, answerLines, answerPulse, answerText, wire } from '../fixtures/info-poll-answer';

const N = 'k3m9qz';
const PROMPT = XML_PROMPT + GA;

function setup(o: { poll?: string | null; prompt?: string } = {}) {
  const sched = new FakeScheduler();
  const bus = new Bus();
  /** What the assembler made, before the filter. */
  const raw: Line[] = [];
  const lines: Line[] = [];
  /** Every partial with text that got through. */
  const partials: string[] = [];
  /** What the output pane would show as the partial. */
  let open = '';
  const events: string[] = [];
  const found: { nonce: string; answer: InfoAnswer }[] = [];
  const failed: string[] = [];
  const filter = new InfoFilter({
    line: (l) => {
      lines.push(l);
      events.push(`line ${l.text}`);
      open = '';
    },
    partial: (l) => {
      if (l.text) partials.push(l.text);
      open = l.text;
    },
    found: (nonce, answer) => found.push({ nonce, answer }),
    failed: (nonce) => failed.push(nonce),
    scheduler: sched,
  });
  bus.on('text.line', (l) => {
    raw.push(l);
    filter.line(l);
  });
  bus.on('text.partial', (l) => filter.partial(l));
  let ts = 0;
  const telnet = new Telnet({ sink: new LineAssembler(bus), write: () => {}, onGmcp: (p) => events.push(`gmcp ${p}`) });
  const bytes = (b: readonly number[]): void => telnet.receive(Uint8Array.from(b), ++ts);
  /** One frame of one or more chunks. */
  const frame = (...chunks: (string | readonly number[])[]): void => {
    for (const c of chunks) bytes(typeof c === 'string' ? wire(c) : c);
    filter.frameEnd();
  };
  frame(o.prompt ?? PROMPT);
  if (o.poll !== null) filter.expect(o.poll ?? N);
  const clear = (): void => {
    for (const a of [raw, lines, partials, events]) a.length = 0;
  };
  clear();
  return { filter, sched, frame, clear, raw, lines, partials, events, found, failed, open: () => open, texts: () => lines.map((l) => l.text) };
}

const wimpy = (t: ReturnType<typeof setup>): (number | null)[] => t.found.map((f) => f.answer.wimpy);

describe('infoCommand', () => {
  it('is one ASCII line with the sentinels, every field and " | " between', () => {
    const c = infoCommand(N);
    expect(c).toBe(
      'info WCk3m9qz[%l | %O | %D | %k | %A | %S | %i | %w | %d | %o | %I | %p | %G | %a | %N | %n | %h | %W | %C | %F | %q | %c | %r | %K | %v | %H | %s | %y]WCk3m9qz',
    );
    expect(c).toMatch(/^[\x20-\x7e]+$/);
    expect(ANSWER_FIELDS).toHaveLength(INFO_FIELDS.length);
  });
});

describe('InfoFilter: the answer is hidden', () => {
  for (const cols of [20, 40, 98]) {
    for (const queued of [false, true]) {
      const name = `${cols} columns, ${queued ? 'queued' : 'not queued'}`;
      const bytes = wire(answerPulse(N, { cols: cols - 1, queued }));

      it(`${name}: in one frame, cut in two chunks at every position`, () => {
        for (let cut = 0; cut <= bytes.length; cut++) {
          const t = setup();
          t.frame(bytes.slice(0, cut), bytes.slice(cut));
          expect(t.texts(), `cut ${cut}`).toEqual([]);
          expect(t.partials, `cut ${cut}`).toEqual([]);
          expect(wimpy(t), `cut ${cut}`).toEqual([120]);
          expect(t.failed).toEqual([]);
          expect(t.sched.pending).toBe(0);
        }
      });

      it(`${name}: in two frames, cut at every position`, () => {
        const start = `WC${N}[`.length;
        for (let cut = 0; cut <= bytes.length; cut++) {
          const t = setup();
          t.frame(bytes.slice(0, cut));
          t.frame(bytes.slice(cut));
          // A blank line waits no longer than its frame: cut before the start was whole, it has shown, and so the prompt stays.
          const blankShown = queued && cut >= 2 && cut < 2 + start;
          expect(t.texts(), `cut ${cut}`).toEqual(blankShown ? ['', 'o>'] : []);
          expect(t.partials.filter((p) => !blankShown || !'o>'.startsWith(p)), `cut ${cut}`).toEqual([]);
          expect(t.open(), `cut ${cut}`).toBe('');
          expect(wimpy(t), `cut ${cut}`).toEqual([120]);
        }
      });
    }
  }

  it('one byte at a time', () => {
    const t = setup();
    t.frame(...wire(answerPulse(N, { cols: 39, queued: true })).map((b) => [b]));
    expect(t.texts()).toEqual([]);
    expect(t.partials).toEqual([]);
    expect(wimpy(t)).toEqual([120]);
  });

  it('is read whole: the first and the last field without the sentinels', () => {
    const t = setup();
    t.frame(answerPulse(N, { cols: 19 }));
    expect(t.found[0]).toMatchObject({ nonce: N, answer: { level: 74, smell: 20, wimpy: 120, purse: { gold: 380, silver: 5, copper: 49 } } });
  });

  it('the end cut by the wrap at each of its positions', () => {
    const body = answerLines(N, 97);
    const last = body.pop()!;
    const end = `]WC${N}`.length;
    for (let cut = last.length - end; cut < last.length; cut++) {
      for (let second = cut + 1; second <= last.length; second++) {
        const t = setup();
        const tail = [last.slice(0, cut), last.slice(cut, second), last.slice(second)].filter(Boolean);
        t.frame(`${[...body, ...tail].join('\r\n')}\r\n\r\n${PROMPT}`);
        expect(t.texts(), `cut ${cut}, ${second}`).toEqual([]);
        expect(wimpy(t), `cut ${cut}, ${second}`).toEqual([120]);
      }
    }
  });

  it('a start long after the poll is still taken, and nothing is held before it', () => {
    const t = setup();
    t.frame(`A crow flies over.\r\n\r\n${PROMPT}`);
    t.sched.advance(10 * 60_000);
    expect(t.texts()).toEqual(['A crow flies over.', '', 'o>']);
    t.clear();
    t.frame(answerPulse(N));
    expect(t.texts()).toEqual([]);
    expect(wimpy(t)).toEqual([120]);
  });

  it('two answers in one pulse, the older one too', () => {
    const t = setup();
    t.filter.expect('bbbbbb');
    t.frame(answerText(N, { queued: true }) + answerText('bbbbbb', { queued: true }) + PROMPT);
    expect(t.texts()).toEqual([]);
    expect(t.found.map((f) => f.nonce)).toEqual([N, 'bbbbbb']);
  });

  it('a shown partial of what is hidden is cleared', () => {
    const t = setup();
    // Spaces show as a partial before the line turns out to be the blank one.
    t.frame(`${answerLines(N).join('\r\n')}\r\n  `);
    expect(t.open()).toBe('  ');
    t.frame(`\r\n${PROMPT}`);
    expect(t.texts()).toEqual([]);
    expect(t.open()).toBe('');
  });
});

describe('InfoFilter: the text round it', () => {
  const shared: Array<[string, string, string[]]> = [
    ['before', `A troll arrives.\r\n${answerText(N)}${PROMPT}`, ['A troll arrives.', 'o>']],
    ['before, with its blank line', `A troll arrives.\r\n\r\n${answerText(N)}${PROMPT}`, ['A troll arrives.', '', 'o>']],
    ['a blank line first', `\r\nA troll arrives.\r\n${answerText(N)}${PROMPT}`, ['', 'A troll arrives.', 'o>']],
    ['after', `${answerText(N)}A troll arrives.\r\n\r\n${PROMPT}`, ['A troll arrives.', '', 'o>']],
    ['after a queued one', `${answerText(N, { queued: true })}\r\nThe Road\r\nExits: north.\r\n${PROMPT}`, ['', 'The Road', 'Exits: north.', 'o>']],
    ['both', `One.\r\n${answerText(N)}Two.\r\n${PROMPT}`, ['One.', 'Two.', 'o>']],
  ];
  for (const [name, text, want] of shared) {
    it(`${name}: untouched, in order, and the shared prompt stays, at every chunk boundary`, () => {
      const bytes = wire(text);
      for (let cut = 0; cut <= bytes.length; cut++) {
        const t = setup();
        t.frame(bytes.slice(0, cut), bytes.slice(cut));
        expect(t.texts(), `cut ${cut}`).toEqual(want);
        expect(t.partials.every((p) => !p.includes(N)), `cut ${cut}`).toBe(true);
        for (const l of t.lines) expect(t.raw).toContain(l);
        expect(wimpy(t)).toEqual([120]);
      }
    });
  }

  it('text of an earlier frame keeps the prompt', () => {
    const t = setup();
    t.frame('A troll arrives.\r\n');
    t.frame(answerPulse(N));
    expect(t.texts()).toEqual(['A troll arrives.', 'o>']);
  });

  it('only the next prompt is hidden, not the one after', () => {
    const t = setup();
    t.frame(answerPulse(N) + PROMPT);
    expect(t.texts()).toEqual(['o>']);
  });

  it('GMCP keeps its place', () => {
    const t = setup();
    const sb = (s: string): number[] => [255, 250, 201, ...wire(s), 255, 240];
    const lines = answerLines(N);
    t.frame([255, 251, 201]);
    t.frame('Before.\r\n', sb('A 1'), `${lines[0]}\r\n`, sb('B 2'), `${lines.slice(1).join('\r\n')}\r\n\r\n`, sb('C 3'), PROMPT);
    expect(t.events).toEqual(['line Before.', 'gmcp A 1', 'gmcp B 2', 'gmcp C 3', 'line o>']);
  });

  it('a question, the pager or a prompt with text after it is never hidden as the prompt', () => {
    const pager = '*** Return: continue, b: back, r: redisplay, q: quit, &gt;: bottom (39%) *** ';
    const ends: Array<[string, string]> = [
      [`Are you sure? ${GA}`, 'Are you sure? '],
      [`o&gt;${GA}`, 'o>'],
      [`<prompt>${pager}</prompt>${GA}`, pager.replace('&gt;', '>')],
      [`${XML_PROMPT}A troll arrives.\r\n`, 'o>A troll arrives.'],
    ];
    for (const [end, shown] of ends) {
      const t = setup();
      t.frame(answerText(N) + end);
      expect(t.texts(), end).toEqual([shown]);
      expect(wimpy(t)).toEqual([120]);
    }
  });

  it('a blank line waits for the next line, and no longer than its frame', () => {
    const t = setup();
    t.frame('\r\n');
    expect(t.texts()).toEqual(['']);
    t.clear();
    t.frame(PROMPT);
    t.clear();
    t.frame('\r\nA troll', ' arrives.\r\n');
    expect(t.texts()).toEqual(['', 'A troll arrives.']);
  });

  it('a partial that could be a start shows as soon as it cannot', () => {
    const t = setup();
    t.frame('W');
    expect(t.partials).toEqual([]);
    t.frame('ell met');
    expect(t.partials).toEqual(['Well met']);
    t.frame('.\r\n');
    expect(t.texts()).toEqual(['Well met.']);
  });

  it('with no poll known everything passes at once, the same objects', () => {
    const t = setup({ poll: null });
    t.frame(answerPulse(N, { queued: true }));
    expect(t.lines).toEqual(t.raw);
    t.lines.forEach((l, i) => expect(l).toBe(t.raw[i]));
    expect(t.found).toEqual([]);
    expect(t.sched.pending).toBe(0);
  });

  it('when the poll is answered, everything passes again', () => {
    const t = setup();
    t.frame(answerPulse(N));
    t.clear();
    t.frame(answerPulse(N, { queued: true }));
    expect(t.lines).toEqual(t.raw);
    expect(t.found).toHaveLength(1);
  });
});

describe('InfoFilter: forged sentinels', () => {
  const body = ANSWER_FIELDS.join(' | ');
  const forged: Array<[string, string]> = [
    ['another nonce', `WCaaaaaa[${body}]WCaaaaaa`],
    ['in a say', `Bob says 'WC${N}[${body}]WC${N}'`],
    ['indented', ` WC${N}[${body}]WC${N}`],
    ['no bracket', `WC${N} ${body}`],
    ['an end alone', `${body}]WC${N}`],
  ];
  for (const [name, text] of forged) {
    it(`${name}: shown`, () => {
      const t = setup();
      t.frame(`${text}\r\n${PROMPT}`);
      expect(t.lines).toEqual(t.raw);
      expect(t.found).toEqual([]);
      expect(t.failed).toEqual([]);
    });
  }
});

describe('InfoFilter: hiding that fails puts everything back', () => {
  const same = (t: ReturnType<typeof setup>): void => {
    expect(t.texts()).toEqual(t.raw.map((l) => l.text));
    t.lines.forEach((l, i) => expect(l).toBe(t.raw[i]));
  };
  const open = answerLines(N).slice(0, -1).join('\r\n');

  it(`no end: after ${HOLD_MS} ms from the start, with the time stamps of their frames`, () => {
    const t = setup();
    t.sched.advance(60_000);
    t.frame(`\r\n${open}\r\n`);
    t.frame('A troll arrives.\r\n');
    t.sched.advance(HOLD_MS - 1);
    expect(t.lines).toEqual([]);
    expect(t.failed).toEqual([]);
    t.sched.advance(1);
    expect(t.failed).toEqual([N]);
    same(t);
    expect(t.lines[0]!.text).toBe('');
    expect(new Set(t.lines.map((l) => l.ts)).size).toBe(2);
    expect(t.sched.pending).toBe(0);
    t.frame(`${PROMPT}`);
    same(t);
  });

  it('no end: at a prompt', () => {
    const t = setup();
    t.frame(`${open}\r\n\r\n${PROMPT}`);
    expect(t.failed).toEqual([N]);
    same(t);
    expect(t.texts().at(-1)).toBe('o>');
    expect(t.sched.pending).toBe(0);
  });

  it('no end: at the line limit', () => {
    const t = setup();
    t.frame(`WC${N}[74 |\r\n${'more\r\n'.repeat(MAX_LINES - 2)}`);
    expect(t.lines).toEqual([]);
    t.frame('more\r\n');
    expect(t.failed).toEqual([N]);
    expect(t.lines).toHaveLength(MAX_LINES);
    same(t);
  });

  it('a partial that was held comes back', () => {
    const t = setup();
    t.frame(`${open}\r\nA troll arr`);
    expect(t.partials).toEqual([]);
    t.sched.advance(HOLD_MS);
    same(t);
    expect(t.open()).toBe('A troll arr');
    t.frame('ives.\r\n');
    expect(t.texts().at(-1)).toBe('A troll arrives.');
  });

  it('a start that never completes its line', () => {
    const t = setup();
    t.frame(`WC${N}[74 | 81`);
    expect(t.partials).toEqual([]);
    t.sched.advance(HOLD_MS);
    expect(t.open()).toBe(`WC${N}[74 | 81`);
    expect(t.failed).toEqual([N]);
  });

  it('an answer that cannot be read', () => {
    const t = setup();
    t.frame(answerPulse(N, { fields: ANSWER_FIELDS.slice(1) }));
    expect(t.failed).toEqual([N]);
    expect(t.found).toEqual([]);
    same(t);
    expect(t.texts().at(-1)).toBe('o>');
  });

  it('a reset (a disconnect): what is held goes out and the poll is forgotten', () => {
    const t = setup();
    t.frame(`${open}\r\nA troll arr`);
    t.filter.reset();
    same(t);
    expect(t.open()).toBe('A troll arr');
    expect(t.sched.pending).toBe(0);
    t.clear();
    t.frame(`\r\n${answerPulse(N)}`);
    expect(t.lines).toEqual(t.raw);
  });
});

describe('isGamePrompt', () => {
  const ln = (text: string, start = 0, end = text.length): Line => ({ text, runs: [], tags: [{ tag: 'prompt', start, end }], prompt: true, raw: text, ts: 0 });
  it('an XML prompt alone on its line, not the pager', () => {
    expect(isGamePrompt(ln('o>'))).toBe(true);
    expect(isGamePrompt(ln('o> ', 0, 2))).toBe(true);
    expect(isGamePrompt({ ...ln('o>'), tags: [] })).toBe(false);
    expect(isGamePrompt(ln('Text o>', 5))).toBe(false);
    expect(isGamePrompt(ln('o>Text', 0, 2))).toBe(false);
    expect(isGamePrompt(ln('*** Return: continue, b: back, r: redisplay, q: quit, >: bottom (39%) *** '))).toBe(false);
  });
});
