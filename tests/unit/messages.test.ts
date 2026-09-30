// `#message` and the confirmations of typed commands (ADR 0039): what the
// engine reports, the rows the game window gets, class names, and the
// setting's round trip through the profile text.
import { describe, expect, it } from 'vitest';
import { messageRows, messageText, messageWidth } from '../../src/app/messages';
import { ProfileWriteBack } from '../../src/app/writeback';
import { ProfileStore } from '../../src/profiles';
import { commandByName } from '../../src/script/commands';
import { parseProfile, serialize } from '../../src/script/doc';
import { FakeScheduler, MESSAGE_CLASSES, REMOVED_ROWS, type Report, ScriptEngine, type TypedChange, resolveMessageClass } from '../../src/script/engine';
import { applyTypedChange } from '../../src/script/persist';

function setup(cols = 200) {
  const sent: string[] = [];
  const msgs: string[] = [];
  const reports: Report[] = [];
  const typed: TypedChange[] = [];
  const clock = new FakeScheduler();
  const e = new ScriptEngine({
    send: (t) => sent.push(t),
    message: (m) => msgs.push(m),
    report: (r) => reports.push(r),
    onTyped: (c) => typed.push(c),
    scheduler: clock,
  });
  /** The rows of everything reported so far, as text; then forgets them. */
  const rows = () => reports.splice(0).flatMap((r) => messageRows(r, cols).map(messageText));
  const type = (line: string) => {
    e.input(line);
    return rows();
  };
  return { e, sent, msgs, reports, typed, clock, rows, type };
}

describe('the message table: typed command → row', () => {
  const table: Array<[typed: string, rows: string[]]> = [
    ['#alias zz smile', ['#alias {zz} {smile}']],
    ['#alias {gc} {get all corpse;put all pack}', ['#alias {gc} {get all corpse;put all pack}']],
    ['#action {^%1 arrives$} {kill %1} {3}', ['#action {^%1 arrives$} {kill %1} {3}']],
    ['#action {^%1 leaves$} {follow %1} {5}', ['#action {^%1 leaves$} {follow %1}']],
    ['#macro {f5} {draw sword}', ['#macro {F5} {draw sword}']],
    ['#substitute {foo} {bar}', ['#substitute {foo} {bar}']],
    ['#highlight {orc} {light red}', ['#highlight {orc} {light red}']],
    ['#gag {^You are hungry}', ['#gag {^You are hungry}']],
    ['#variable {target} {orc}', ['#variable {target} {orc}']],
    ['#math {n} {6 * 7}', ['#variable {n} {42}']],
    ['#format {s} {%s!} {hi}', ['#variable {s} {hi!}']],
    ["#ticker {heal} {cast 'cure light'} {30}", ["#ticker {heal} {cast 'cure light'} {30}"]],
    ['#delay {1.5} {stand}', ['#delay {1.5} {stand}']],
    ['#delay {wake} {stand} {2}', ['#delay {wake} {stand} {2}']],
    ['#event {session connected} {look}', ['#event {SESSION CONNECTED} {look}']],
    // Removing.
    ['#unalias zz', ['#alias {zz} removed']],
    ['#unalias zz', ['#alias {zz} not found']],
    ['#unaction {^%1 *}', ['#action {^%1 arrives$} removed', '#action {^%1 leaves$}  removed']],
    ['#unmacro f5', ['#macro {F5} removed']],
    ['#unsubstitute foo', ['#substitute {foo} removed']],
    ['#unhighlight orc', ['#highlight {orc} removed']],
    ['#ungag {^You are hungry}', ['#gag {^You are hungry} removed']],
    ['#unvariable target', ['#variable {target} removed']],
    ['#unticker heal', ['#ticker {heal} removed']],
    ['#undelay wake', ['#delay {wake} removed']],
    ['#undelay wake', ['#delay {wake} not found']],
    ['#unevent {SESSION CONNECTED}', ['#event {SESSION CONNECTED} removed']],
    // Classes.
    ['#class {pvp} {open}', ['#class {pvp} opened']],
    ['#alias {b} {bash};#variable {foe} {orc}', ['#alias {b} {bash}', '#variable {foe} {orc}']],
    ['#class {pvp} {close}', ['#class {pvp} closed']],
    ['#class {pvp} {close}', ['#class {pvp} not open']],
    ['#class {pvp} {kill}', ['#class {pvp} removed (2)']],
    ['#class {pvp} {kill}', ['#class {pvp} not found']],
    // #message.
    ['#message variables off', ['#message {variables} off']],
    ['#message var', ['#message {variables} on']],
    ['#message all off', ['#message {all} off']],
    ['#message all', ['#message {all} on']],
    ['#message nope', ['#message {nope} not found']],
  ];

  it('gives exactly these rows, in one session', () => {
    const t = setup();
    for (const [typed, rows] of table) expect(t.type(typed), typed).toEqual(rows);
    expect(t.msgs).toEqual([]);
  });

  it('is lower case apart from the player\'s own text, without a period, and never a [SYSTEM] line', () => {
    const t = setup();
    for (const [typed, rows] of table) {
      for (const row of t.type(typed)) {
        expect(row, typed).toMatch(/^#[a-z]+( |$)/);
        expect(row.endsWith('.'), row).toBe(false);
        // Outside the braces: only lower-case words.
        expect(row.replace(/\{[^{}]*\}/g, ''), row).toMatch(/^[#a-z0-9 ()]+$/);
      }
    }
  });

  it('a definition row is a profile line that defines the same thing', () => {
    const t = setup();
    const rows = [
      ...t.type('#alias {gc} {get all corpse;put all pack};#action {^%1 arrives$} {kill %1} {3};#macro {f5} {draw sword}'),
      ...t.type('#substitute {foo} {bar};#highlight {orc} {light red} {2};#gag {^You are hungry};#variable {target} {orc}'),
      ...t.type("#ticker {heal} {cast 'cure light'} {30};#event {SESSION CONNECTED} {look}"),
    ];
    const u = setup();
    expect(u.e.loadProfile(rows.join('\n') + '\n')).toEqual({ ok: true, warnings: [] });
    u.e.input('#alias;#action;#macro;#substitute;#highlight;#gag;#variable;#ticker;#event');
    expect(u.rows()).toEqual(rows);
  });
});

describe('listing forms use the same rows', () => {
  it('lists, filters, aligns, and says none / not found', () => {
    const t = setup();
    expect(t.type('#alias;#variable;#ticker;#delay;#gag;#event;#macro;#action;#highlight;#substitute')).toEqual([
      '#alias none',
      '#variable none',
      '#ticker none',
      '#delay none',
      '#gag none',
      '#event none',
      '#macro none',
      '#action none',
      '#highlight none',
      '#substitute none',
    ]);
    t.e.loadProfile('#alias {k} {kill %1}\n#alias {kk} {kill $target} {3}\n#alias {gc} {get all corpse}\n#variable {target} {orc}\n#gag {spam}\n#delay {9} {stand}\n');
    expect(t.type('#alias')).toEqual(['#alias {kk} {kill $target} {3}', '#alias {k}  {kill %1}', '#alias {gc} {get all corpse}']);
    expect(t.type('#alias {k*}')).toEqual(['#alias {kk} {kill $target} {3}', '#alias {k}  {kill %1}']);
    expect(t.type('#alias {gc}')).toEqual(['#alias {gc} {get all corpse}']);
    expect(t.type('#alias {q*}')).toEqual(['#alias {q*} not found']);
    expect(t.type('#variable target')).toEqual(['#variable {target} {orc}']);
    expect(t.type('#variable nope')).toEqual(['#variable {nope} not found']);
    expect(t.type('#variable')).toEqual(['#variable {target} {orc}']);
    expect(t.type('#gag')).toEqual(['#gag {spam}']);
    expect(t.type('#delay')).toEqual(['#delay {9} {stand}']);
    expect(t.msgs).toEqual([]);
  });

  it('a listing is shown from a script and with its class off; a confirmation is not', () => {
    const t = setup();
    expect(t.type('#message all off')).toEqual(['#message {all} off']);
    expect(t.type('#alias {la} {#alias}')).toEqual([]);
    expect(t.type('la')).toEqual(['#alias {la} {#alias}']);
    expect(t.type('#variable x')).toEqual(['#variable {x} not found']);
  });

  it('#message lists every class, aligned', () => {
    const t = setup();
    t.e.input('#message var off;#message gags off');
    t.rows();
    expect(t.type('#message')).toEqual([
      '#message {actions}     on',
      '#message {aliases}     on',
      '#message {classes}     on',
      '#message {delays}      on',
      '#message {events}      on',
      '#message {gags}        off',
      '#message {highlights}  on',
      '#message {macros}      on',
      '#message {substitutes} on',
      '#message {tickers}     on',
      '#message {variables}   off',
    ]);
  });
});

describe('rows', () => {
  it('cut the longest argument with … inside its braces, to the pane width', () => {
    const body = 'say ' + 'a'.repeat(100);
    const report: Report = { type: 'set', item: { kind: 'alias', key: 'long', body, priority: 3 } };
    const [row] = messageRows(report, 41).map(messageText);
    expect(row).toBe('#alias {long} {say aaaaaaaaaaaaaaa…} {3}');
    expect(row!.length).toBe(40);
    for (const cols of [25, 30, 60, 81, 124, 125, 200]) {
      const r = messageText(messageRows(report, cols)[0]!);
      expect(r.length, String(cols)).toBeLessThanOrEqual(cols - 1);
      expect(r.endsWith('…} {3}'), r).toBe(cols - 1 < 124);
    }
    // Unmeasured pane: 80 cells.
    expect(messageWidth(0)).toBe(80);
    expect(messageText(messageRows(report)[0]!).length).toBe(80);
    // A long key with a state word.
    const gone = messageText(messageRows({ type: 'state', rows: [{ word: 'gag', key: 'x'.repeat(90), state: 'not found' }] }, 40)[0]!);
    expect(gone.length).toBe(39);
    expect(gone).toBe('#gag {' + 'x'.repeat(21) + '…} not found');
  });

  it('put a body of several lines on one row', () => {
    const t = setup();
    expect(t.type('#alias {prep} {\n    remove staff;\n    wield sword\n}')).toEqual(['#alias {prep} {remove staff; wield sword}']);
  });

  it('many removed keys: a row each up to REMOVED_ROWS, then one row with the count', () => {
    const t = setup();
    for (let i = 0; i < REMOVED_ROWS; i++) t.e.input(`#alias {a${i}} {x}`);
    t.rows();
    expect(t.type('#unalias a*')).toEqual(Array.from({ length: REMOVED_ROWS }, (_, i) => `#alias {a${i}} removed`));
    for (let i = 0; i <= REMOVED_ROWS; i++) t.e.input(`#alias {a${i}} {x}`);
    t.rows();
    expect(t.type('#unalias a*')).toEqual([`#alias {a*} removed (${REMOVED_ROWS + 1})`]);
  });

  it('carry the editor lexer classes, the state class, and a highlight colour as a game style', () => {
    const t = setup();
    t.e.input('#alias {k} {kill $target;#showme {<118>hi}}');
    expect(messageRows(t.reports.shift()!, 200)).toEqual([
      {
        cls: 'wc-msg',
        segs: [
          { text: '#alias', cls: 'wc-syn-cmd' },
          { text: ' ' },
          { text: '{', cls: 'wc-syn-brace' },
          { text: 'k' },
          { text: '}', cls: 'wc-syn-brace' },
          { text: ' ' },
          { text: '{', cls: 'wc-syn-brace' },
          { text: 'kill ' },
          { text: '$target', cls: 'wc-syn-var' },
          { text: ';', cls: 'wc-syn-delim' },
          { text: '#showme', cls: 'wc-syn-cmd' },
          { text: ' ' },
          { text: '{', cls: 'wc-syn-brace' },
          { text: '<118>', cls: 'wc-syn-code' },
          { text: 'hi' },
          { text: '}', cls: 'wc-syn-brace' },
          { text: '}', cls: 'wc-syn-brace' },
        ],
      },
    ]);
    t.e.input('#highlight {orc} {light red}');
    const hi = messageRows(t.reports.shift()!, 200)[0]!;
    expect(hi.segs.find((s) => s.text === 'light red')).toEqual({ text: 'light red', run: { fg: 9 } });
    t.e.input('#unalias k');
    expect(messageRows(t.reports.shift()!, 200)[0]!.segs.slice(-2)).toEqual([{ text: ' ' }, { text: 'removed', cls: 'wc-msg-state' }]);
    // Nothing done, or off: set apart.
    const last = (line: string) => {
      t.e.input(line);
      return messageRows(t.reports.shift()!, 200)[0]!.segs.at(-1);
    };
    expect(last('#unalias k')).toEqual({ text: 'not found', cls: 'wc-msg-state wc-msg-neg' });
    expect(last('#class {c} {close}')).toEqual({ text: 'not open', cls: 'wc-msg-state wc-msg-neg' });
    expect(last('#message gags off')).toEqual({ text: 'off', cls: 'wc-msg-state wc-msg-neg' });
    expect(last('#message gags on')).toEqual({ text: 'on', cls: 'wc-msg-state' });
    expect(last('#gag')).toEqual({ text: 'none', cls: 'wc-msg-state' });
  });
});

describe('when a confirmation is shown', () => {
  it('for every command of the typed line, also inside #N and #if', () => {
    const t = setup();
    expect(t.type('#alias a b;#2 {#var n 1};#if {1} {#gag spam}')).toEqual(['#alias {a} {b}', '#variable {n} {1}', '#variable {n} {1}', '#gag {spam}']);
  });

  it('not for commands run by an alias, macro, action, ticker, delay or event, and not while loading', () => {
    const t = setup();
    const res = t.e.loadProfile(
      [
        '#alias {mk} {#alias {x} {y};#variable {v} {1};#unalias {x};#class {c} {open};#class {c} {kill};#message {gags} {off}}',
        '#macro {F5} {#variable {v} {2}}',
        '#action {^go$} {#gag {spam};#ungag {spam}}',
        '#ticker {t} {#variable {v} {3}} {1}',
        '#event {SESSION CONNECTED} {#highlight {orc} {red}}',
        '#delay {1} {#substitute {a} {b}}',
        '#variable {w} {1}',
        '#unvariable {w}',
        '#class {k} {open}',
        '#class {k} {close}',
        '',
      ].join('\n'),
    );
    expect(res).toEqual({ ok: true, warnings: [] });
    t.e.input('mk');
    t.e.runMacro('F5');
    t.e.processLine({ text: 'go', runs: [], tags: [], prompt: false, raw: 'go', ts: 0 });
    t.e.fireEvent('SESSION CONNECTED', ['mume']);
    t.clock.advance(1500);
    t.e.run('#alias {r} {s}');
    expect(t.e.getVariable('v')).toBe('3');
    expect(t.e.user.count('highlight')).toBe(1);
    expect(t.e.user.messagesOff.has('gags')).toBe(true);
    expect(t.reports).toEqual([]);
    expect(t.typed).toEqual([]);
    expect(t.msgs).toEqual([]);
  });

  it('not for a class that is off; everything else is unchanged', () => {
    const t = setup();
    expect(t.type('#message var off')).toEqual(['#message {variables} off']);
    expect(t.type('#var target orc;#math n {1 + 1};#unvar n;#unvar nope;#alias a b')).toEqual(['#alias {a} {b}']);
    expect(t.e.getVariable('target')).toBe('orc');
    // Still saved (ADR 0038).
    expect(t.typed.filter((c) => c.op !== 'message')).toEqual([
      { op: 'define', kind: 'variable', key: 'target', args: ['target', 'orc'] },
      { op: 'define', kind: 'variable', key: 'n', args: ['n', '2'] },
      { op: 'undefine', kind: 'variable', keys: ['n'] },
      { op: 'define', kind: 'alias', key: 'a', args: ['a', 'b'] },
    ]);
    expect(t.type('#message variables on;#var target elf')).toEqual(['#message {variables} on', '#variable {target} {elf}']);
  });

  it('a rejected definition keeps its system line and gets no row', () => {
    const t = setup();
    expect(t.type('#highlight {orc} {nocolour};#ticker {t} {x}')).toEqual([]);
    expect(t.msgs).toEqual(['#highlight: Unknown highlight colour {nocolour}.', '#ticker {t} needs a time in seconds.']);
  });
});

describe('#message', () => {
  it('is a command the engine runs', () => {
    expect(commandByName('message')).toMatchObject({ kind: 'command', tier: 'should', inert: false });
  });

  it('resolves class names like command words', () => {
    const r = resolveMessageClass;
    expect(MESSAGE_CLASSES).toEqual([...MESSAGE_CLASSES].sort());
    for (const c of MESSAGE_CLASSES) expect(r(c)).toBe(c);
    expect([r('var'), r('variable'), r('VARIABLES'), r('v')]).toEqual(['variables', 'variables', 'variables', 'variables']);
    expect([r('al'), r('alias'), r('ac'), r('action')]).toEqual(['aliases', 'aliases', 'actions', 'actions']);
    expect([r('sub'), r('hi'), r('mac'), r('tick'), r('class'), r('gag'), r('event'), r('delay')]).toEqual([
      'substitutes',
      'highlights',
      'macros',
      'tickers',
      'classes',
      'gags',
      'events',
      'delays',
    ]);
    expect(r('all')).toBe('all');
    expect(r(' {x} ')).toBeNull();
    // One letter that starts several names; longer than a name; nothing.
    expect([r('a'), r('variabless'), r('foo'), r('')]).toEqual([null, null, null, null]);
  });

  it('is on for everything by default; toggles, sets, and sets all', () => {
    const t = setup();
    const off = () => [...t.e.user.messagesOff].sort();
    expect(off()).toEqual([]);
    expect(t.type('#message var')).toEqual(['#message {variables} off']);
    expect(t.type('#message {var} {off}')).toEqual(['#message {variables} off']);
    expect(t.type('#message variables')).toEqual(['#message {variables} on']);
    expect(t.type('#message al OFF;#message gag off')).toEqual(['#message {aliases} off', '#message {gags} off']);
    expect(off()).toEqual(['aliases', 'gags']);
    // `all` without a state: on when anything is off, else off.
    expect(t.type('#message all')).toEqual(['#message {all} on']);
    expect(off()).toEqual([]);
    expect(t.type('#message all')).toEqual(['#message {all} off']);
    expect(off()).toEqual([...MESSAGE_CLASSES]);
    expect(t.type('#message all on')).toEqual(['#message {all} on']);
    expect(t.type('#message variables maybe')).toEqual([]);
    expect(t.msgs).toEqual(['#message {variables} {maybe}: use on or off.']);
    expect(off()).toEqual([]);
  });

  it('a profile line is applied at load, silently, and a load starts from the default', () => {
    const t = setup();
    t.e.input('#message aliases off');
    t.rows();
    t.typed.length = 0;
    expect(t.e.loadProfile('#message {variables} {off}\n#message {gag}\n#message {nope} {off}\n')).toEqual({
      ok: true,
      warnings: ['line 3: #message: unknown class {nope}.'],
    });
    expect([...t.e.user.messagesOff].sort()).toEqual(['gags', 'variables']);
    expect(t.reports).toEqual([]);
    expect(t.typed).toEqual([]);
    // A text that is refused keeps the running state.
    expect(t.e.loadProfile('#alias {a} {b\n').ok).toBe(false);
    expect([...t.e.user.messagesOff].sort()).toEqual(['gags', 'variables']);
  });
});

describe('persistence (ADR 0038 typed setting)', () => {
  async function live(text: string) {
    const store = new ProfileStore({ factory: null });
    await store.create('p', text);
    const refused: string[] = [];
    const wb = new ProfileWriteBack(store, { delayMs: 5, onRefused: (m) => refused.push(m), onError: (m) => refused.push(m) });
    const reports: Report[] = [];
    const engine = new ScriptEngine({ send: () => {}, message: () => {}, report: (r) => reports.push(r), onTyped: (c) => void wb.typed(c), scheduler: new FakeScheduler() });
    const stored = async () => {
      await wb.flush();
      return (await store.get('p'))!.text;
    };
    const load = async () => expect(engine.loadProfile(await stored()).ok).toBe(true);
    await load();
    await wb.setTarget('p');
    const type = async (line: string) => {
      reports.length = 0;
      engine.input(line);
      return { text: await stored(), rows: reports.flatMap((r) => messageRows(r, 200).map(messageText)) };
    };
    return { engine, type, load, stored, refused };
  }

  it('round trip: off typed → a line in the profile → reload → still off → on removes the line', async () => {
    const BASE = '#nop mine\n#alias {a} {b}\n';
    const t = await live(BASE);
    expect((await t.type('#message var off')).text).toBe('#nop mine\n#alias {a} {b}\n\n#message {variables} {off}\n');
    await t.load();
    expect([...t.engine.user.messagesOff]).toEqual(['variables']);
    const quiet = await t.type('#var target orc');
    expect(quiet.rows).toEqual([]);
    expect(quiet.text).toBe('#nop mine\n#alias {a} {b}\n\n#variable {target} {orc}\n\n#message {variables} {off}\n');
    // A second class goes after the first; repeating a setting changes nothing.
    expect((await t.type('#message gags off;#message var off')).text).toContain('#message {variables} {off}\n#message {gags} {off}\n');
    expect((await t.type('#message gags on')).text).toBe(quiet.text);
    const on = await t.type('#message variables on');
    expect(on.rows).toEqual(['#message {variables} on']);
    expect(on.text).toBe('#nop mine\n#alias {a} {b}\n\n#variable {target} {orc}\n');
    await t.load();
    expect([...t.engine.user.messagesOff]).toEqual([]);
    expect((await t.type('#var target elf')).rows).toEqual(['#variable {target} {elf}']);
    expect(t.refused).toEqual([]);
  });

  it('all off is one line; switching one back on writes the rest, class by class', async () => {
    const t = await live('#alias {a} {b}\n');
    expect((await t.type('#message all off')).text).toBe('#alias {a} {b}\n\n#message {all} {off}\n');
    await t.load();
    expect(t.engine.user.messagesOff.size).toBe(MESSAGE_CLASSES.length);
    const rest = MESSAGE_CLASSES.filter((c) => c !== 'aliases').map((c) => `#message {${c}} {off}\n`).join('');
    expect((await t.type('#message al on')).text).toBe('#alias {a} {b}\n\n' + rest);
    await t.load();
    expect([...t.engine.user.messagesOff]).toEqual(MESSAGE_CLASSES.filter((c) => c !== 'aliases'));
    expect((await t.type('#message all on')).text).toBe('#alias {a} {b}\n');
  });

  it('keeps the word and the other bytes of a hand-written line; a listing and a script write nothing', async () => {
    const text = '#ALIAS {q} {#message {gags} {off}}\n  #MESS {var} {off}\r\n#nop end\n';
    const t = await live(text);
    expect((await t.type('#message')).text).toBe(text);
    expect((await t.type('q')).text).toBe(text);
    expect(t.engine.user.messagesOff.has('gags')).toBe(true);
    expect((await t.type('#message var off')).text).toBe('#ALIAS {q} {#message {gags} {off}}\n  #MESS {variables} {off}\r\n#nop end\n');
    expect((await t.type('#message tick off')).text).toBe('#ALIAS {q} {#message {gags} {off}}\n  #MESS {variables} {off}\r\n#MESS {tickers} {off}\n#nop end\n');
    expect((await t.type('#message var on')).text).toBe('#ALIAS {q} {#message {gags} {off}}\n#MESS {tickers} {off}\n#nop end\n');
  });

  it('a #message line is a command node that round-trips, and is not inert', () => {
    const text = '#message {variables} {off}\n#MESSAGE all on\n';
    const doc = parseProfile(text);
    expect(serialize(doc)).toBe(text);
    expect(doc.nodes.map((n) => (n.type === 'passthrough' ? n.reason : n.type))).toEqual(['command', 'command']);
  });

  it('refuses a line that holds several commands', () => {
    const doc = parseProfile('#message {gags} {off};#alias {a} {b}\n');
    const r = applyTypedChange(doc, { op: 'message', changed: ['gags'], off: [] });
    expect(serialize(r.doc)).toBe(serialize(doc));
    expect(r.problem).toMatch(/^#message: it is set on a line with several commands/);
  });
});
