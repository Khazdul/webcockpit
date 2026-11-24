// The hidden info poll's filter (stage 77 part C, ADR 0166 points 1–4, 21,
// 22, 25): real telnet and assembler in front of it.
import { describe, expect, it } from 'vitest';
import { Bus } from '../../src/core/bus';
import type { Line } from '../../src/core/types';
import { INFO_FIELDS, type PollAnswer } from '../../src/gmcp/info-answer';
import { HOLD_MS, InfoFilter, MAX_LINES, OK_MS, infoCommand, isGamePrompt, sexProbeCommand } from '../../src/gmcp/info-filter';
import { Telnet } from '../../src/net/telnet';
import { FakeScheduler } from '../../src/script/engine/timers';
import { LineAssembler } from '../../src/text/assembler';
import {
  ANSWER_FIELDS,
  GA,
  XML_PROMPT,
  answerLines,
  answerPulse,
  answerText,
  plainInfoLines,
  probeText,
  wire,
} from '../fixtures/info-poll-answer';

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
  const found: { nonce: string; answer: PollAnswer }[] = [];
  const failed: string[] = [];
  const sexes: string[] = [];
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
    foundSex: (nonce, sex) => sexes.push(`${nonce} ${sex}`),
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
  return { filter, sched, frame, clear, raw, lines, partials, events, found, failed, sexes, open: () => open, texts: () => lines.map((l) => l.text) };
}

const wimpy = (t: ReturnType<typeof setup>): (number | null)[] => t.found.map((f) => f.answer.info.wimpy);

describe('infoCommand', () => {
  it('is one ASCII line with the sentinels, every field, the vitals and the affects last, " | " between', () => {
    const c = infoCommand(N);
    expect(c).toBe(
      'info WCk3m9qz[%l | %O | %D | %k | %A | %S | %i | %w | %d | %o | %I | %p | %G | %a | %N | %n | %h | %W | %C | %F | %q | %c | %r | %K | %v | %H | %s | %y | %z | %Z | %e | %E | %j | %J | %f]WCk3m9qz',
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
    expect(t.found[0]).toMatchObject({
      nonce: N,
      answer: { info: { level: 74, smell: 20, wimpy: 120, purse: { gold: 380, silver: 5, copper: 49 } }, vitals: { hp: 357, maxmp: 112 }, affects: [] },
    });
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

describe('InfoFilter: the affects, %f (stage 77 H9)', () => {
  const shapes: Array<[string, string[]]> = [
    ['none', []],
    ['one', ['armour']],
    ['several', ['potion', 'detect magic', 'shield', 'armour']],
    ['the flags’ twins', ['hunger', 'thirst']],
  ];
  for (const [name, affects] of shapes) {
    for (const cols of [20, 98]) {
      for (const queued of [false, true]) {
        it(`${name}, ${cols} columns${queued ? ', queued' : ''}: hidden whole at every chunk boundary, the list read`, () => {
          const bytes = wire(answerPulse(N, { cols: cols - 1, queued, affects }));
          for (let cut = 0; cut <= bytes.length; cut++) {
            const t = setup();
            t.frame(bytes.slice(0, cut), bytes.slice(cut));
            expect(t.texts(), `cut ${cut}`).toEqual([]);
            expect(t.partials, `cut ${cut}`).toEqual([]);
            expect(t.found.map((f) => f.answer.affects), `cut ${cut}`).toEqual([affects]);
            expect(t.failed).toEqual([]);
            expect(t.sched.pending).toBe(0);
          }
        });
      }
    }
  }

  const around = (affects: string[]): Array<[string, string, string[]]> => [
    ['before', `A troll arrives.\r\n${answerText(N, { affects })}${PROMPT}`, ['A troll arrives.', 'o>']],
    ['after', `${answerText(N, { affects })}- armour\r\nYou feel protected.\r\n\r\n${PROMPT}`, ['- armour', 'You feel protected.', '', 'o>']],
    ['both', `One.\r\n${answerText(N, { affects, queued: true })}\r\nAffected by:\r\n- shield\r\n\r\n${PROMPT}`, ['One.', '', '', 'Affected by:', '- shield', '', 'o>']],
  ];
  for (const affects of [[], ['potion'], ['potion', 'hunger', 'thirst', 'armour']]) {
    for (const [name, text, want] of around(affects)) {
      it(`${affects.length} listed, game text ${name}: untouched, in order, at every chunk boundary`, () => {
        const bytes = wire(text);
        for (let cut = 0; cut <= bytes.length; cut++) {
          const t = setup();
          t.frame(bytes.slice(0, cut), bytes.slice(cut));
          expect(t.texts(), `cut ${cut}`).toEqual(want);
          for (const l of t.lines) expect(t.raw).toContain(l);
          expect(t.found.map((f) => f.answer.affects), `cut ${cut}`).toEqual([affects]);
        }
      });
    }
  }

  it('one line at a time, in frames of their own: hidden, the list read', () => {
    const t = setup();
    const lines = answerLines(N, 39, undefined, { affects: ['potion', 'unable to quit'] });
    for (const l of lines) t.frame(`${l}\r\n`);
    t.frame(`\r\n${PROMPT}`);
    expect(t.texts()).toEqual([]);
    expect(t.found[0]!.answer.affects).toEqual(['potion', 'unable to quit']);
  });

  it('a list with no end: the held lines go out as they came at HOLD_MS', () => {
    const t = setup();
    t.frame(answerLines(N, 97, undefined, { affects: ['armour'] }).slice(0, -1).join('\r\n') + '\r\n');
    expect(t.texts()).toEqual([]);
    t.sched.advance(HOLD_MS);
    expect(t.lines).toEqual(t.raw);
    expect(t.texts().at(-1)).toBe('- armour');
    expect(t.failed).toEqual([N]);
  });

  it('a prompt inside the list ends the hiding: the lines and the prompt shown', () => {
    const t = setup();
    const lines = answerLines(N, 97, undefined, { affects: ['armour', 'shield'] });
    t.frame(`${lines.slice(0, -2).join('\r\n')}\r\n${PROMPT}`);
    expect(t.lines).toEqual(t.raw);
    expect(t.texts().at(-1)).toBe('o>');
    expect(t.failed).toEqual([N]);
  });

  it('many affects at a narrow width stay under MAX_LINES', () => {
    const many = Array.from({ length: 30 }, (_, i) => `affect number ${i}`);
    const lines = answerLines(N, 19, undefined, { affects: many });
    expect(lines.length).toBeLessThan(MAX_LINES);
    const t = setup();
    t.frame(answerPulse(N, { cols: 19, affects: many }));
    expect(t.texts()).toEqual([]);
    expect(t.found[0]!.answer.affects).toEqual(many);
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

describe('InfoFilter: a tagged prompt that is no game prompt', () => {
  it("the editor's, after an answer: shown once it is whole", () => {
    const t = setup();
    t.frame(answerText(N), `<prompt>: </prompt>${GA}`);
    expect(t.texts()).toEqual([': ']);
    expect(t.found).toHaveLength(1);
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
    // Only what ends as MUME's prompts do (`change prompt` has fields, no free text).
    for (const p of ['![>', '*[>', '*%~- CSW A1 M2 P8 S3 HP:Fine Mana:Burning Move:Tired>', '>']) expect(isGamePrompt(ln(p)), p).toBe(true);
    for (const p of [': ', ':', '==>', 'Account password: ', 'Are you sure? [y/n] ', '']) expect(isGamePrompt(ln(p)), p).toBe(false);
    expect(isGamePrompt(ln('*** Return: continue, b: back, r: redisplay, q: quit, >: bottom (39%) *** '))).toBe(false);
  });
});

describe('InfoFilter: the sex probe', () => {
  const P = 'p7x2ab';
  const probe = (o: { poll?: string | null } = {}) => {
    const t = setup(o);
    t.filter.expect(P, 'sex');
    return t;
  };

  it('sexProbeCommand: three ASCII info commands with their own brackets', () => {
    expect(sexProbeCommand(P)).toBe(`info WC${P}{\r\ninfo\r\ninfo }WC${P}`);
    expect(sexProbeCommand(P).replace(/\r\n/g, '')).toMatch(/^[\x20-\x7e]+$/);
  });

  it('alone: hidden with its blank lines and the prompt, the sex read', () => {
    const t = probe({ poll: null });
    t.frame(probeText(P, { sex: 'female' }) + PROMPT);
    expect(t.texts()).toEqual([]);
    expect(t.partials).toEqual([]);
    expect(t.sexes).toEqual([`${P} female`]);
    expect(t.failed).toEqual([]);
    expect(t.sched.pending).toBe(0);
  });

  it('right after the fields in one frame: nothing leaks, both read', () => {
    const t = probe();
    const bytes = wire(answerText(N) + probeText(P, { sex: 'female' }) + PROMPT);
    for (let cut = 0; cut <= bytes.length; cut += 7) {
      const u = probe();
      u.frame(bytes.slice(0, cut), bytes.slice(cut));
      expect(u.texts(), `cut ${cut}`).toEqual([]);
      expect(u.partials, `cut ${cut}`).toEqual([]);
      expect(u.sexes, `cut ${cut}`).toEqual([`${P} female`]);
      expect(wimpy(u), `cut ${cut}`).toEqual([120]);
    }
    t.frame(bytes);
    expect(t.texts()).toEqual([]);
    // What follows is shown again.
    t.frame(`A crow flies over.\r\n${PROMPT}`);
    expect(t.texts()).toEqual(['A crow flies over.', 'o>']);
  });

  it('a man: the first sex line is the one read', () => {
    const t = probe({ poll: null });
    t.frame(probeText(P, { body: [...plainInfoLines('male'), 'You are a female Tarkhnarb Orc.'] }) + PROMPT);
    expect(t.sexes).toEqual([`${P} male`]);
  });

  it('no sex line between the sentinels: a failure, everything shown as it came', () => {
    const t = probe({ poll: null });
    t.frame(probeText(P, { body: ['Huh?!'] }) + PROMPT);
    expect(t.sexes).toEqual([]);
    expect(t.failed).toEqual([P]);
    expect(t.texts()).toEqual(t.raw.map((l) => l.text));
    t.lines.forEach((l, i) => expect(l).toBe(t.raw[i]));
  });

  it('no end: at the prompt, everything shown', () => {
    const t = probe({ poll: null });
    t.frame(`WC${P}{\r\n\r\n\r\n${plainInfoLines().join('\r\n')}\r\n\r\n${PROMPT}`);
    expect(t.failed).toEqual([P]);
    expect(t.texts()).toEqual(t.raw.map((l) => l.text));
    expect(t.texts()[0]).toBe(`WC${P}{`);
  });

  it(`no end: after ${HOLD_MS} ms`, () => {
    const t = probe({ poll: null });
    t.frame(`WC${P}{\r\n\r\n\r\n${plainInfoLines().join('\r\n')}\r\n`);
    expect(t.texts()).toEqual([]);
    t.sched.advance(HOLD_MS);
    expect(t.failed).toEqual([P]);
    expect(t.texts()).toEqual(t.raw.map((l) => l.text));
  });

  it("the fields' start is not the probe's, nor the other way", () => {
    const t = setup({ poll: null });
    t.filter.expect(P, 'fields');
    t.frame(probeText(P) + PROMPT);
    expect(t.sexes).toEqual([]);
    expect(t.texts()).toEqual(t.raw.map((l) => l.text));
  });

  it('forged in a say: shown', () => {
    const t = probe({ poll: null });
    t.frame(`Bob says 'WC${P}{ You are a female Tarkhnarb Orc. }WC${P}'\r\n${PROMPT}`);
    expect(t.lines).toEqual(t.raw);
    expect(t.sexes).toEqual([]);
  });
});

describe("InfoFilter: the login's width commands' Ok.", () => {
  const OKS = 'Ok.\r\n\r\nOk.\r\n\r\n';
  const VITALS = [255, 250, 201, ...wire('Char.Vitals {"hp":1}'), 255, 240];
  /** The sample login: the game entered (armed) before the login prompt of the same frame, which shows. */
  const login = (o: { poll?: boolean } = {}) => {
    const t = setup({ poll: null });
    t.frame([255, 251, 201]);
    t.frame('Reconnecting.\r\n');
    t.clear();
    t.filter.expectOk(2);
    if (o.poll) {
      t.filter.expect(N);
      t.filter.expect('p7x2ab', 'sex');
    }
    t.frame(PROMPT);
    expect(t.texts()).toEqual(['o>']);
    t.clear();
    return t;
  };

  it('the sample: both hidden with their blank lines and the pulse prompt, GMCP kept', () => {
    const t = login();
    t.frame(OKS, VITALS, PROMPT);
    expect(t.events).toEqual(['gmcp Char.Vitals {"hp":1}']);
    expect(t.partials).toEqual([]);
    // Disarmed: the fast path again, the same objects.
    t.frame(`A troll arrives.\r\n${PROMPT}`);
    expect(t.lines).toEqual(t.raw.slice(-2));
    expect(t.texts()).toEqual(['A troll arrives.', 'o>']);
  });

  it('cut in two chunks at every position, every 3 bytes, one byte at a time: nothing leaks', () => {
    const bytes = [...wire(OKS), ...VITALS, ...wire(PROMPT)];
    const cuts: number[][][] = [];
    for (let cut = 0; cut <= bytes.length; cut++) cuts.push([bytes.slice(0, cut), bytes.slice(cut)]);
    for (const n of [1, 3]) cuts.push(Array.from({ length: Math.ceil(bytes.length / n) }, (_, i) => bytes.slice(i * n, i * n + n)));
    for (const chunks of cuts) {
      const t = login();
      t.frame(...chunks);
      const name = chunks.map((c) => c.length).join(',');
      expect(t.texts(), name).toEqual([]);
      expect(t.partials, name).toEqual([]);
      expect(t.open(), name).toBe('');
    }
  });

  it('in two frames: nothing leaks', () => {
    const t = login();
    t.frame('Ok.\r\n\r\n');
    t.frame('Ok.\r\n\r\n');
    t.frame(PROMPT);
    expect(t.texts()).toEqual([]);
  });

  it('a tell between them shows, and so does the prompt after it', () => {
    const t = login();
    t.frame(`Ok.\r\n\r\nBob tells you 'hi'\r\nOk.\r\n\r\n${PROMPT}`);
    expect(t.texts()).toEqual(["Bob tells you 'hi'", 'o>']);
  });

  it('text in the same pulse shows with its prompt', () => {
    const t = login();
    t.frame(`${OKS}A troll arrives.\r\n${PROMPT}`);
    expect(t.texts()).toEqual(['A troll arrives.', 'o>']);
  });

  it('a third Ok. shows', () => {
    const t = login();
    t.frame(OKS + PROMPT);
    t.frame(`Ok.\r\n\r\n${PROMPT}`);
    expect(t.texts()).toEqual(['Ok.', '', 'o>']);
  });

  it(`an Ok. after ${OK_MS} ms shows`, () => {
    const t = login();
    t.sched.advance(OK_MS);
    t.frame(`Ok.\r\n\r\n${PROMPT}`);
    expect(t.texts()).toEqual(['Ok.', '', 'o>']);
    expect(t.sched.pending).toBe(0);
  });

  it('one before the time limit is hidden, then the limit disarms the second', () => {
    const t = login();
    t.frame(`Ok.\r\n\r\n${PROMPT}`);
    t.sched.advance(OK_MS);
    t.frame(`Ok.\r\n\r\n${PROMPT}`);
    expect(t.texts()).toEqual(['Ok.', '', 'o>']);
  });

  it('only a line that is Ok. and nothing else: colour and spaces do not count, other text shows', () => {
    const t = login();
    t.frame(`\x1b[32m Ok. \x1b[0m\r\n\r\nOk, fine.\r\nOk. Bob\r\nok.\r\n${PROMPT}`);
    expect(t.texts()).toEqual(['Ok, fine.', 'Ok. Bob', 'ok.', 'o>']);
  });

  it('a tagged prompt Ok. is not one', () => {
    const t = login();
    t.frame(`<prompt>Ok.</prompt>${GA}`);
    expect(t.texts()).toEqual(['Ok.']);
  });

  it('a partial that can become Ok. waits; one that cannot shows', () => {
    const t = login();
    t.frame('Ok');
    expect(t.partials).toEqual([]);
    t.frame('ay then.');
    expect(t.partials).toEqual(['Okay then.']);
    t.frame('\r\n');
    expect(t.texts()).toEqual(['Okay then.']);
  });

  it('a waiting partial shows when disarmed', () => {
    const t = login();
    t.frame('Ok');
    t.filter.dropOk();
    expect(t.open()).toBe('Ok');
  });

  it('dropOk and reset disarm', () => {
    for (const drop of [(f: InfoFilter) => f.dropOk(), (f: InfoFilter) => f.reset()]) {
      const t = login();
      drop(t.filter);
      t.frame(OKS + PROMPT);
      expect(t.texts()).toEqual(['Ok.', '', 'Ok.', '', 'o>']);
      t.lines.forEach((l, i) => expect(l).toBe(t.raw[i]));
    }
  });

  it('with the login poll and the sex probe answered in the same frame, at every 7th cut: nothing leaks', () => {
    const P = 'p7x2ab';
    const bytes = wire(OKS + answerText(N, { queued: true }) + probeText(P, { sex: 'female' }) + PROMPT);
    for (let cut = 0; cut <= bytes.length; cut += 7) {
      const t = login({ poll: true });
      t.frame(bytes.slice(0, cut), bytes.slice(cut));
      expect(t.texts(), `cut ${cut}`).toEqual([]);
      expect(t.partials, `cut ${cut}`).toEqual([]);
      expect(wimpy(t), `cut ${cut}`).toEqual([120]);
      expect(t.sexes, `cut ${cut}`).toEqual([`${P} female`]);
      t.frame(`Ok.\r\nA crow flies over.\r\n${PROMPT}`);
      expect(t.texts(), `cut ${cut}`).toEqual(['Ok.', 'A crow flies over.', 'o>']);
    }
  });

  it('with the login poll and the sex probe answered in the next frame: nothing leaks, nothing else hidden', () => {
    const P = 'p7x2ab';
    const t = login({ poll: true });
    t.frame(OKS + PROMPT);
    t.frame(answerText(N, { queued: true }) + probeText(P, { sex: 'male' }) + PROMPT);
    expect(t.texts()).toEqual([]);
    expect(wimpy(t)).toEqual([120]);
    expect(t.sexes).toEqual([`${P} male`]);
    t.frame(`A crow flies over.\r\n${PROMPT}`);
    expect(t.texts()).toEqual(['A crow flies over.', 'o>']);
  });
});
