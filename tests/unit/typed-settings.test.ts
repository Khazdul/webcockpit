// Typed settings persist (ADR 0038): a definition or `#un…` typed on the
// input line goes into the stored profile text at once; what scripts create
// stays in the session. Engine hook, document edits and the write-back,
// wired as the App wires them.
import { describe, expect, it } from 'vitest';
import { ProfileWriteBack } from '../../src/app/writeback';
import { ProfileStore } from '../../src/profiles';
import { parseProfile, serialize } from '../../src/script/doc';
import { FakeScheduler, ScriptEngine, type TypedChange, escapeVars, expandVars } from '../../src/script/engine';
import { LIST_KINDS } from '../../src/script/engine/store';
import { applyTypedChange } from '../../src/script/persist';

const BASE = [
  '#nop   My profile, odd   spacing kept',
  '#VARIABLE   {target}   {elf}',
  '',
  '#ALIAS {k} {kill $target}',
  '#ALIAS {arm} {#action {%1 arrives} {kill %%1};#variable {armed} {1};#variable {target} {%1}}',
  '',
  '#ACTION {You are hungry.} {eat bread} {3}',
  '',
  'loose text stays',
  '',
].join('\n');

function snapshot(e: ScriptEngine) {
  const rules: string[] = [];
  for (const kind of LIST_KINDS) for (const r of e.user.rules(kind)) rules.push(`${kind}|${r.pattern}|${r.body}|${r.priority}`);
  const vars = [...e.user.vars].map(([k, v]) => `${k}=${v}`).sort();
  const tickers = e.user.timerList('ticker').map((t) => `${t.name}|${t.body}|${t.seconds}`).sort();
  return { rules: rules.sort(), vars, tickers };
}

async function setup(text = BASE) {
  const store = new ProfileStore({ factory: null });
  await store.create('p', text);
  const refused: string[] = [];
  const messages: string[] = [];
  const changes: TypedChange[] = [];
  const wb = new ProfileWriteBack(store, { delayMs: 5, onRefused: (m) => refused.push(m), onError: (m) => refused.push(m) });
  const clock = new FakeScheduler();
  const engine = new ScriptEngine({
    send: () => {},
    message: (m) => messages.push(m),
    onVariable: (n, v) => wb.queue(n, v),
    onTyped: (c) => {
      changes.push(c);
      wb.typed(c);
    },
    scheduler: clock,
  });
  expect(engine.loadProfile(text).ok).toBe(true);
  await wb.setTarget('p');
  const stored = async () => {
    await wb.flush();
    return (await store.get('p'))!.text;
  };
  const type = async (line: string) => {
    engine.input(line);
    return stored();
  };
  /** A fresh engine loaded from the stored text holds the same rules. */
  const reloaded = async () => {
    const e = new ScriptEngine({ send: () => {}, message: () => {}, scheduler: new FakeScheduler() });
    expect(e.loadProfile(await stored()).ok).toBe(true);
    return snapshot(e);
  };
  return { store, wb, engine, clock, refused, messages, changes, stored, type, reloaded };
}

describe('typed definitions are written to the profile', () => {
  const cases: Array<{ name: string; define: string; line: string; redefine: string; line2: string; undo: string }> = [
    { name: 'alias', define: '#alias {zz} {say hi}', line: '#ALIAS {zz} {say hi}', redefine: '#alias zz say ho', line2: '#ALIAS {zz} {say ho}', undo: '#unalias zz' },
    {
      name: 'action',
      define: '#action {%1 waves} {wave %1} {2}',
      line: '#ACTION {%1 waves} {wave %1} {2}',
      redefine: '#act {%1 waves} {bow %1}',
      line2: '#ACTION {%1 waves} {bow %1}',
      undo: '#unaction {%1 waves}',
    },
    { name: 'highlight', define: '#highlight {orc} {red}', line: '#HIGHLIGHT {orc} {red}', redefine: '#high orc {bold blue}', line2: '#HIGHLIGHT {orc} {bold blue}', undo: '#unhighlight orc' },
    { name: 'substitute', define: '#sub {foo} {bar}', line: '#SUBSTITUTE {foo} {bar}', redefine: '#sub foo baz', line2: '#SUBSTITUTE {foo} {baz}', undo: '#unsub foo' },
    { name: 'macro', define: '#macro {F5} {flee}', line: '#MACRO {F5} {flee}', redefine: '#macro f5 {flee;flee}', line2: '#MACRO {F5} {flee;flee}', undo: '#unmacro F5' },
    { name: 'gag', define: '#gag {spam line}', line: '#GAG {spam line}', redefine: '#gag {spam line}', line2: '#GAG {spam line}', undo: '#ungag {spam line}' },
    { name: 'ticker', define: '#ticker {tk} {save} {60}', line: '#TICKER {tk} {save} {60}', redefine: '#tick tk {save all} 30', line2: '#TICKER {tk} {save all} {30}', undo: '#unticker tk' },
    {
      name: 'event',
      define: '#event {SESSION CONNECTED} {look}',
      line: '#EVENT {SESSION CONNECTED} {look}',
      redefine: '#event {session  connected} {score}',
      line2: '#EVENT {session  connected} {score}',
      undo: '#unevent {SESSION CONNECTED}',
    },
    { name: 'variable', define: '#variable {door} {gate}', line: '#VARIABLE {door} {gate}', redefine: '#var door hatch', line2: '#VARIABLE {door} {hatch}', undo: '#unvar door' },
  ];
  for (const c of cases) {
    it(`${c.name}: define adds, redefine replaces in place, #un removes`, async () => {
      const t = await setup();
      const a = await t.type(c.define);
      expect(a.split('\n')).toContain(c.line);
      expect(a.split('\n').filter((l) => !BASE.split('\n').includes(l))).toEqual([c.line]);
      expect(await t.reloaded()).toEqual(snapshot(t.engine));

      const at = a.split('\n').indexOf(c.line);
      const b = await t.type(c.redefine);
      expect(b.split('\n')[at]).toBe(c.line2);
      expect(b.split('\n').length).toBe(a.split('\n').length);
      expect(await t.reloaded()).toEqual(snapshot(t.engine));

      const d = await t.type(c.undo);
      expect(d).not.toContain(c.line2);
      // Every line of the original is still there, byte for byte, in order.
      expect(d.split('\n').filter((l) => l !== '')).toEqual(BASE.split('\n').filter((l) => l !== ''));
      expect(await t.reloaded()).toEqual(snapshot(t.engine));
      expect(t.refused).toEqual([]);
      expect(t.messages).toEqual([]);
    });
  }

  it('places a new entry after the last one of its kind and keeps every other byte', async () => {
    const t = await setup();
    expect(await t.type('#alias {zz} {say hi}')).toBe(BASE.replace('#variable {target} {%1}}\n', '#variable {target} {%1}}\n#ALIAS {zz} {say hi}\n'));
    expect(await t.type('#var target orc')).toBe(
      BASE.replace('{elf}', '{orc}').replace('#variable {target} {%1}}\n', '#variable {target} {%1}}\n#ALIAS {zz} {say hi}\n'),
    );
  });

  it('writes unbraced typed forms fully braced, each command of a ; line, and #N repeats once', async () => {
    const t = await setup('');
    const text = await t.type('#alias kk kill %1;#var target big orc;#2 {#gag noise}');
    expect(text).toBe('#alias {kk} {kill %1}\n\n#variable {target} {big orc}\n\n#gag {noise}\n');
    expect(await t.reloaded()).toEqual(snapshot(t.engine));
  });

  it('a redefine without a priority drops the old one; with one, sets it', async () => {
    const t = await setup();
    expect(await t.type('#action {You are hungry.} {eat meat}')).toContain('#ACTION {You are hungry.} {eat meat}\n');
    expect(await t.type('#action {You are hungry.} {eat meat} {7}')).toContain('#ACTION {You are hungry.} {eat meat} {7}\n');
    expect(await t.reloaded()).toEqual(snapshot(t.engine));
  });

  it('rewrites a definition the file holds in an unbraced form, and removes it', async () => {
    const t = await setup('#alias kk kill\n  #var hp 10\n#gag   noise\n');
    expect(await t.type('#alias kk slay;#var hp 20')).toBe('#alias {kk} {slay}\n  #var {hp} {20}\n#gag   noise\n');
    expect(await t.type('#unalias kk;#ungag noise')).toBe('  #var {hp} {20}\n');
    expect(await t.reloaded()).toEqual(snapshot(t.engine));
  });

  it('#un… with a * removes every entry the engine removed; duplicates go too', async () => {
    const t = await setup('#alias {ka} {1}\n#alias {kb} {2}\n#alias {x} {3}\n#alias {ka} {4}\n');
    expect(await t.type('#unalias k*')).toBe('#alias {x} {3}\n');
    expect(await t.reloaded()).toEqual(snapshot(t.engine));
  });

  it('stores rule bodies raw and a variable as its resulting value', async () => {
    const t = await setup();
    const text = await t.type('#alias {ks} {kill $target;#showme %1};#var {enemy} {$target};#var {ref} {$$target}');
    expect(text).toContain('#ALIAS {ks} {kill $target;#showme %1}\n');
    expect(text).toContain('#VARIABLE {enemy} {elf}\n');
    // The engine holds `$target` literally: the text escapes it for the load.
    expect(t.engine.getVariable('ref')).toBe('$target');
    expect(text).toContain('#VARIABLE {ref} {$$target}\n');
    expect(await t.reloaded()).toEqual(snapshot(t.engine));
  });

  it('a typed #math or #format result is a typed variable', async () => {
    const t = await setup('');
    expect(await t.type('#math {n} {2 + 3}')).toBe('#variable {n} {5}\n');
    expect(await t.reloaded()).toEqual(snapshot(t.engine));
  });

  it('a ticker is written with its resolved time', async () => {
    const t = await setup('#variable {secs} {30}\n');
    expect(await t.type('#ticker {tk} {save} {$secs}')).toBe('#variable {secs} {30}\n\n#ticker {tk} {save} {30}\n');
    expect(await t.reloaded()).toEqual(snapshot(t.engine));
  });
});

describe('what is not written', () => {
  it('rules and new variables made by a script stay in the session', async () => {
    const t = await setup();
    const text = await t.type('arm Gollum');
    // Only the declared variable changes (the ADR 0015 rule).
    expect(text).toBe(BASE.replace('{elf}', '{Gollum}'));
    expect(t.engine.user.rules('action').map((r) => r.pattern)).toContain('Gollum arrives');
    expect(t.engine.getVariable('armed')).toBe('1');
    expect(t.changes).toEqual([]);
  });

  it('macro, action, ticker and event bodies do not persist what they define', async () => {
    const text = '#macro {F1} {#alias {m} {1}}\n#action {go} {#alias {a} {1}}\n#ticker {t} {#alias {t} {1}} {1}\n#event {SESSION CONNECTED} {#alias {e} {1}}\n';
    const t = await setup(text);
    t.engine.runMacro('F1');
    t.engine.processLine({ text: 'go', runs: [], tags: [], prompt: false, raw: 'go', ts: 0 });
    t.clock.advance(1500);
    t.engine.fireEvent('SESSION CONNECTED', ['mume']);
    t.engine.run('#alias {r} {1}');
    expect(t.engine.user.rules('alias').map((r) => r.pattern).sort()).toEqual(['a', 'e', 'm', 'r', 't']);
    expect(await t.stored()).toBe(text);
    expect(t.changes).toEqual([]);
  });

  it('an alias that was typed still does not persist what its body defines', async () => {
    const t = await setup('');
    await t.type('#alias {mk} {#alias {inner} {x};#unalias {gone}}');
    const before = await t.stored();
    expect(await t.type('mk')).toBe(before);
    expect(t.engine.user.rules('alias').map((r) => r.pattern)).toContain('inner');
  });

  it('listing forms, rejected definitions, #delay and unknown #un… write nothing', async () => {
    const t = await setup();
    for (const line of ['#alias', '#alias {k*}', '#variable', '#variable target', '#ticker', '#gag', '#macro {Ctrl+W} {x}', '#macro {Enter} {x}', '#macro {NoSuchKey} {x}', '#highlight {x} {nocolour}', '#ticker {t} {x}', '#delay {5} {say hi}', '#delay {d} {say hi} {5}', '#undelay d', '#unalias nothere', '#unalias', '#nosuch x']) {
      t.engine.input(line);
    }
    expect(await t.stored()).toBe(BASE);
    expect(t.changes).toEqual([]);
    expect(t.refused).toEqual([]);
  });

  it('#unalias of a session-only rule leaves the text; a typed define of such a key adds it', async () => {
    const t = await setup();
    await t.type('arm Gollum');
    const before = await t.stored();
    expect(await t.type('#unaction {Gollum arrives}')).toBe(before);
    t.engine.run('#alias {tmp} {1}');
    expect(await t.type('#alias {tmp} {2}')).toContain('#ALIAS {tmp} {2}\n');
    expect(await t.reloaded()).toMatchObject({ rules: expect.arrayContaining(['alias|tmp|2|5']) });
  });

  it('refuses arguments that cannot sit in braces, with one line for the player', async () => {
    const t = await setup();
    expect(await t.type('#alias {bad} say }')).toBe(BASE);
    expect(await t.type('#var tail x\\')).toBe(BASE);
    expect(await t.type('#sub {a} b {c')).toBe(BASE);
    expect(t.refused).toHaveLength(3);
    expect(t.refused[0]).toMatch(/^Not saved to profile p: #alias \{bad\}/);
  });

  it('refuses to edit a line that holds several commands, or a text with unbalanced braces', async () => {
    const t = await setup('#alias {a} {1};#alias {b} {2}\n');
    expect(await t.type('#alias {a} {3};#unalias b')).toBe('#alias {a} {1};#alias {b} {2}\n');
    expect(t.refused).toHaveLength(2);
    await t.store.save('p', '#alias {x} {y\n');
    expect(await t.type('#alias {q} {1}')).toBe('#alias {x} {y\n');
    expect(t.refused[2]).toMatch(/unbalanced braces/);
  });

  it('writes nothing without a target', async () => {
    const t = await setup();
    await t.wb.setTarget(null);
    expect(t.wb.typed({ op: 'define', kind: 'alias', key: 'q', args: ['q', '1'] })).toBe(false);
    expect(await t.stored()).toBe(BASE);
  });
});

describe('variables: typed and script-set', () => {
  it('a typed #variable for an undeclared name adds an entry; a script set does not', async () => {
    const t = await setup('#alias {s} {#variable {fresh} {1}}\n');
    expect(await t.type('s')).toBe('#alias {s} {#variable {fresh} {1}}\n');
    expect(await t.type('#var fresh 2')).toBe('#alias {s} {#variable {fresh} {1}}\n\n#variable {fresh} {2}\n');
    // Now it is declared: the script's value is written (debounced).
    expect(await t.type('s')).toBe('#alias {s} {#variable {fresh} {1}}\n\n#variable {fresh} {1}\n');
  });

  it('a typed value wins over a script value queued before it', async () => {
    const t = await setup('#variable {v} {0}\n#alias {s} {#variable {v} {script}}\n');
    t.engine.input('s');
    t.engine.input('#var v typed');
    expect(await t.stored()).toContain('#variable {v} {typed}');
    await new Promise((r) => setTimeout(r, 20));
    expect(await t.stored()).toContain('#variable {v} {typed}');
    t.engine.input('#unvar v');
    t.engine.input('s');
    expect(await t.stored()).toBe('#alias {s} {#variable {v} {script}}\n');
  });

  it('#unvariable removes the entry', async () => {
    const t = await setup();
    expect(await t.type('#unvar target')).toBe(BASE.replace('#VARIABLE   {target}   {elf}\n', ''));
    expect(await t.reloaded()).toEqual(snapshot(t.engine));
  });
});

describe('ordering and the latest stored text', () => {
  it('rapid commands are all written, in order', async () => {
    const t = await setup('');
    for (let i = 0; i < 20; i++) t.engine.input(`#alias {a${i}} {${i}}`);
    t.engine.input('#alias {a3} {three}');
    t.engine.input('#unalias a5');
    t.engine.input('#alias {a5} {again}');
    const names = (await t.stored()).trim().split('\n');
    const want = Array.from({ length: 20 }, (_, i) => `#alias {a${i}} {${i === 3 ? 'three' : i}}`).filter((l) => !l.startsWith('#alias {a5}'));
    expect(names).toEqual([...want, '#alias {a5} {again}']);
    expect(await t.reloaded()).toEqual(snapshot(t.engine));
  });

  it('is applied to the latest stored text, so an editor save in between is kept', async () => {
    const t = await setup();
    await t.type('#alias {one} {1}');
    const edited = (await t.stored()) + '#nop added in the editor\n';
    await t.store.save('p', edited);
    expect(await t.type('#alias {two} {2}')).toBe(edited.replace('#ALIAS {one} {1}\n', '#ALIAS {one} {1}\n#ALIAS {two} {2}\n'));
  });

  it('CRLF files stay CRLF', async () => {
    const t = await setup('#alias {a} {1}\r\n#nop x\r\n');
    expect(await t.type('#alias {b} {2};#gag {g}')).toBe('#alias {a} {1}\r\n#alias {b} {2}\r\n\r\n#gag {g}\r\n\r\n#nop x\r\n');
  });

  it('round trip: a long typed session reloads to the same rule set', async () => {
    const t = await setup();
    const lines = [
      '#alias {kk} {kill %1;#if {"%2" != ""} {kill %2}}',
      '#action {^%1 tells you \'%2\'} {#showme {<119>%1: %2}} {1}',
      '#highlight {{orc|troll}} {bold red}',
      '#sub {%1 gold coins} {%1 gc}',
      '#gag {^You feel less hungry}',
      '#macro {Ctrl+F} {flee}',
      '#macro {Numpad5} {look}',
      '#ticker {save} {save} {300}',
      '#event {IAC SB GMCP Char.Vitals} {#var vit {%1}}',
      '#var {path} {n;e;{s w}}',
      '#var {esc} {a\;b}',
      '#class {pk} {open};#alias {pkk} {kill *elf*};#var {pkv} {1};#class {pk} {close}',
      '#alias {kk} {slay %1}',
      '#unmacro Numpad5',
      '#unaction {You are hungry.}',
      '#alias {k} {kill $target;loot}',
      '#class {pk} {kill}',
      '#unalias arm',
    ];
    for (const l of lines) {
      t.engine.input(l);
      expect(await t.reloaded(), l).toEqual(snapshot(t.engine));
    }
    expect(t.refused).toEqual([]);
    const text = await t.stored();
    expect(serialize(parseProfile(text))).toBe(text);
    expect(text).toContain('#nop   My profile, odd   spacing kept\n#VARIABLE   {target}   {elf}\n');
    expect(text).toContain('loose text stays\n');
    expect(text).not.toContain('pkk');
    expect(text).not.toContain('#class');
  });
});

describe('document edits (applyTypedChange)', () => {
  const apply = (text: string, c: TypedChange) => {
    const r = applyTypedChange(parseProfile(text), c);
    return { text: serialize(r.doc), problem: r.problem };
  };

  it('gag, ticker and event go after the last of their kind, with the word as written', () => {
    const base = '#GAG {a}\n#nop x\n#TICK {t} {x} {1}\n';
    expect(apply(base, { op: 'define', kind: 'gag', key: 'b', args: ['b'] }).text).toBe('#GAG {a}\n#GAG {b}\n#nop x\n#TICK {t} {x} {1}\n');
    expect(apply(base, { op: 'define', kind: 'ticker', key: 'u', args: ['u', 'y', '2'] }).text).toBe(base + '#TICK {u} {y} {2}\n');
    expect(apply(base, { op: 'define', kind: 'event', key: 'SESSION CONNECTED', args: ['SESSION CONNECTED', 'look'] }).text).toBe(
      base + '\n#EVENT {SESSION CONNECTED} {look}\n',
    );
    expect(apply('', { op: 'define', kind: 'gag', key: 'b', args: ['b'] }).text).toBe('#gag {b}\n');
    expect(apply('#nop only a comment', { op: 'define', kind: 'gag', key: 'b', args: ['b'] }).text).toBe('#nop only a comment\n\n#gag {b}\n');
  });

  it('matches macro keys and event names as the rule store does', () => {
    expect(apply('#macro {f5} {a}\n', { op: 'define', kind: 'macro', key: 'F5', args: ['F5', 'b'] }).text).toBe('#macro {f5} {b}\n');
    expect(apply('#macro {f5} {a}\n', { op: 'undefine', kind: 'macro', keys: ['F5'] }).text).toBe('');
    expect(apply('#event {session connected} {a}\n', { op: 'undefine', kind: 'event', keys: ['SESSION CONNECTED'] }).text).toBe('');
  });

  it('an unchanged redefinition returns the same text', () => {
    const base = '#alias   {a}   {1}\n#gag   {g}\n';
    expect(apply(base, { op: 'define', kind: 'alias', key: 'a', args: ['a', '1'] }).text).toBe(base);
  });

  it('escapeVars survives one expansion', () => {
    const vars: Record<string, string> = { hp: '10' };
    for (const s of ['$hp', '$$hp', '${hp} &hp', 'a $ b & c', '\\$hp', '$nope', '$', '${}']) {
      expect(expandVars(escapeVars(s), (n) => vars[n])).toBe(s);
    }
  });
});
