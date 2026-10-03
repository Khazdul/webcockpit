// The bundled readability script (src/scripts/bundled/readability.lua,
// stage 16), run in the real script host with MUME lines from Cockpit's
// readability examples (ttpp/readability/modules/*.meta) and run logs.

import { afterEach, describe, expect, it } from 'vitest';
import { Bus } from '../../src/core/bus';
import { type BusEvents, type Line, type StyleRun, type XmlSpan, adaptiveColor } from '../../src/core/types';
import { GameState } from '../../src/gmcp/state';
import { loadLuaRuntime } from '../../src/lua';
import { FakeScheduler, ScriptEngine } from '../../src/script/engine';
import { resetScriptKeys } from '../../src/script/script-keys';
import { ScriptLibrary } from '../../src/scripts';
import { BUNDLED_SCRIPTS } from '../../src/scripts/bundled';
import { parseCecho } from '../../src/scripts/colors';
import { ScriptHost } from '../../src/scripts/host';

const TEAL = adaptiveColor(0x3fb0a0);
const GREY = adaptiveColor(0x6e6e6e);
const GOLD = adaptiveColor(0xf0c850);
const PINK = adaptiveColor(0xef6fa6);
const LILAC = adaptiveColor(0xda9bff);

const hosts: ScriptHost[] = [];
afterEach(() => {
  for (const h of hosts.splice(0)) h.dispose();
  resetScriptKeys();
});

function mkLine(text: string, runs: StyleRun[] = [], tags: XmlSpan[] = []): Line {
  return { text, runs, tags, prompt: false, raw: text, ts: 0 };
}

async function setup(settings: Record<string, string> = {}) {
  const bus = new Bus();
  const shown: BusEvents['text.display'][] = [];
  let host: ScriptHost | null = null;
  const engine = new ScriptEngine({
    send: () => {},
    message: () => {},
    scheduler: new FakeScheduler(),
    scriptCommand: (n, a) => host!.command(n, a),
  });
  engine.attach(bus);
  const game = new GameState();
  game.attach(bus);
  bus.on('text.display', (d) => shown.push(d));
  const lib = new ScriptLibrary({ factory: null, bundled: BUNDLED_SCRIPTS });
  await lib.init();
  await lib.setEnabled('readability', true);
  for (const [k, v] of Object.entries(settings)) await lib.setSetting('readability', k, v);
  host = new ScriptHost({
    engine,
    bus,
    library: lib,
    game,
    send: () => {},
    print: () => {},
    message: () => {},
    loadRuntime: () => loadLuaRuntime(),
  });
  hosts.push(host);
  await host.start();
  /** The shown copy of one game line. */
  const show = (l: Line | string): { text: string; runs: StyleRun[] } => {
    shown.length = 0;
    bus.emit('text.line', typeof l === 'string' ? mkLine(l) : l);
    const d = shown[0];
    return d ? { text: d.line.text, runs: d.line.runs } : { text: '(gagged)', runs: [] };
  };
  return { lib, host, show };
}

/** The style runs cecho text gives, to compare against. */
const ce = (s: string) => parseCecho(s);

describe('bundled readability', () => {
  it('is listed with its header, settings, help and credit', async () => {
    const t = await setup();
    const s = t.lib.get('readability')!;
    expect(s).toMatchObject({ bundled: true, readonly: true, problems: [], loadProblem: null });
    expect(s.settings).toEqual({ directions: true, exits: true, mobs: true, flags: true, arrows: true, shortnames: true });
    const help = s.header.help.join('\n');
    expect(help).toMatch(/Lamia/);
    expect(help).toMatch(/#script set readability shortnames off/);
    expect(t.host.isRunning('readability')).toBe(true);
  });

  describe('mobs', () => {
    it('shortens known mobs and colours them by tier', async () => {
      const t = await setup();
      expect(t.show('A squirrel scampers around here, looking for nuts from the trees.')).toEqual(
        ce('A squirrel<~#6e6e6e> is here<reset><~#6e6e6e>.<reset>'),
      );
      const bear = t.show('A huge, black bear is here, proud heir to the great and ancient mountain bears.');
      expect(bear.text).toBe('The huge, black bear is here.');
      expect(bear.runs).toEqual([
        { start: 0, end: 20, fg: GOLD },
        { start: 20, end: 29, fg: GREY },
      ]);
      const roots = t.show('Some roots lie here waiting to ensnare weary travellers.');
      expect(roots.text).toBe('A clump of roots is here.');
      expect(roots.runs[0]).toEqual({ start: 0, end: 16, fg: PINK });
      expect(t.show('A pair of tiny eyes gleam at you from the shadows.').text).toBe('A packrat is here.');
      expect(t.show('Bill Ferny is watching you with suspicious eyes.').runs[0]!.fg).toBe(GOLD);
    });

    it('keeps the UTF-8 names of the list', async () => {
      const t = await setup();
      expect(t.show('A red-eyed shaman of the Morgundul tribe is here, chanting in evil tongues.').text).toBe(
        'Luxzúm the Morgundul Shaman is here.',
      );
      expect(t.show('A scrawny Durbûk-hai orc struggles to clear a rockslide.').text).toBe('A scrawny Durbûk-hai orc is here.');
    });

    it('strips flags before the lookup and colours them (MUME puts them before the period)', async () => {
      const t = await setup();
      const s = t.show('An orc assassin is hiding here, waiting for a victim to stab (hidden).');
      expect(s.text).toBe('An orc assassin is here (hidden).');
      expect(s.runs).toEqual([
        { start: 15, end: 23, fg: GREY },
        { start: 25, end: 31, fg: GREY },
        { start: 32, end: 33, fg: GREY },
      ]);
      const g = t.show('A red-eyed shaman of the Morgundul tribe is here, chanting in evil tongues (glowing).');
      expect(g.text).toBe('Luxzúm the Morgundul Shaman is here (glowing).');
      expect(g.runs).toContainEqual({ start: 37, end: 44, fg: LILAC });
      // Cockpit's .meta form: the flag after the period.
      expect(t.show('An orc-guard is on patrol here. (hidden)').text).toBe('An orc-guard is here (hidden).');
    });

    it('dims the rest of unlisted mobs and keeps the name, colours included', async () => {
      const t = await setup();
      const w = t.show('A wandering nameless pilgrim is standing here.');
      expect(w.text).toBe('A wandering nameless pilgrim is standing here.');
      expect(w.runs).toEqual([{ start: 28, end: 46, fg: GREY }]);
      // A red enemy from a run log stays red.
      const text = '*Maddy the Silvan Elf*, wielding a black runed dagger, is standing here.';
      const enemy = t.show(mkLine(text, [{ start: 0, end: 22, fg: 1 }]));
      expect(enemy.text).toBe(text);
      expect(enemy.runs[0]).toEqual({ start: 0, end: 22, fg: 1 });
      expect(enemy.runs).toContainEqual({ start: 54, end: 72, fg: GREY });
      const fight = t.show('A hungry warg is here, fighting Taube.');
      expect(fight.runs).toEqual([{ start: 13, end: 38, fg: GREY }]);
      const hidden = t.show('Grugzuk the Morruhk Orc, wielding a black runed dagger, is standing here (hidden).');
      expect(hidden.text).toBe('Grugzuk the Morruhk Orc, wielding a black runed dagger, is standing here (hidden).');
      expect(hidden.runs).toContainEqual({ start: 74, end: 80, fg: GREY });
    });

    it('dims players fighting or riding (run logs), flags included', async () => {
      const t = await setup();
      const l = 'Taube the Tarkhnarb Orc (t), wielding a mighty dwarven axe, is here fighting the kraken (glowing).';
      const s = t.show(l);
      expect(s.text).toBe(l);
      const at = l.indexOf(' is here fighting');
      expect(s.runs[0]).toEqual({ start: at, end: l.indexOf(' (glowing)'), fg: GREY });
      expect(s.runs).toContainEqual({ start: l.indexOf('glowing'), end: l.indexOf('glowing') + 7, fg: LILAC });
      const r = t.show('Kvällulv the Morruhk Orc, wielding a narrow runed awlpike, is here riding a hungry warg (glowing).');
      expect(r.runs[0]!.start).toBe('Kvällulv the Morruhk Orc, wielding a narrow runed awlpike,'.length);
    });

    it('colours flags on other lines', async () => {
      const t = await setup();
      const s = t.show('A long sword lies here (glowing).');
      expect(s.text).toBe('A long sword lies here (glowing).');
      expect(s.runs).toEqual([{ start: 24, end: 31, fg: LILAC }]);
    });

    it('leaves corpses, objects and prose alone', async () => {
      const t = await setup();
      for (const l of [
        'The corpse of a guard is lying here.',
        'A butcher knife is lying here.',
        "Bob says 'A troll is standing here, I swear.'",
        'You are standing here.',
      ]) {
        expect(t.show(l)).toEqual({ text: l, runs: [] });
      }
    });

    it('with shortnames off keeps MUME text, name coloured, rest dimmed', async () => {
      const t = await setup({ shortnames: 'off' });
      const bear = t.show('A huge, black bear is here, proud heir to the great and ancient mountain bears.');
      expect(bear.text).toBe('A huge, black bear is here, proud heir to the great and ancient mountain bears.');
      expect(bear.runs[0]).toEqual({ start: 0, end: 18, fg: GOLD });
      expect(bear.runs[1]).toEqual({ start: 18, end: bear.text.length, fg: GREY });
      const sq = t.show('A squirrel scampers around here, looking for nuts from the trees.');
      expect(sq.runs).toEqual([{ start: 10, end: sq.text.length, fg: GREY }]);
    });

    it('turns off with mobs off', async () => {
      const t = await setup({ mobs: 'off' });
      const l = 'A squirrel scampers around here, looking for nuts from the trees.';
      expect(t.show(l)).toEqual({ text: l, runs: [] });
    });

    it('does not touch a description line in XML mode', async () => {
      const t = await setup();
      const l = 'A huge, black bear is here, proud heir to the great and ancient mountain bears.';
      expect(t.show(mkLine(l, [], [{ tag: 'room', start: 0, end: l.length }])).text).toBe('The huge, black bear is here.');
      expect(t.show(mkLine(l, [], [{ tag: 'description', start: 0, end: l.length }])).text).toBe(l);
    });
  });

  describe('movement', () => {
    it('dims leaves and colours the direction with an arrow', async () => {
      const t = await setup();
      expect(t.show('A young troll leaves north.')).toEqual(ce('A young troll<~#6e6e6e> leaves <~#3fb0a0>north ▲<reset>'));
      expect(t.show('Frodo leaves west.').text).toBe('Frodo leaves ◄ west');
      expect(t.show('A young troll leaves up.').text).toBe('A young troll leaves up ⇑');
      expect(t.show('A young troll leaves down.').text).toBe('A young troll leaves down ⇓');
      expect(t.show('An orc leaves east riding a pack horse.').text).toBe('An orc leaves east ► riding a pack horse');
    });

    it('keeps a red enemy red', async () => {
      const t = await setup();
      const s = t.show(mkLine('*a Dwarf* leaves west.', [{ start: 0, end: 9, fg: 1 }]));
      expect(s.text).toBe('*a Dwarf* leaves ◄ west');
      expect(s.runs).toEqual([
        { start: 0, end: 9, fg: 1 },
        { start: 9, end: 17, fg: GREY },
        { start: 17, end: 23, fg: TEAL },
      ]);
    });

    it('colours arrivals, with and without a direction', async () => {
      const t = await setup();
      expect(t.show('A young troll has arrived from the west.')).toEqual(
        ce('A young troll<~#6e6e6e> has arrived<~#3fb0a0> from the west<~#6e6e6e>.<reset>'),
      );
      expect(t.show('A guard has arrived from above.').runs).toContainEqual({ start: 19, end: 30, fg: TEAL });
      expect(t.show('A young troll has arrived.')).toEqual(ce('A young troll<~#6e6e6e> has arrived.<reset>'));
    });

    it('without arrows keeps the word and period', async () => {
      const t = await setup({ arrows: 'off' });
      expect(t.show('A young troll leaves north.')).toEqual(ce('A young troll<~#6e6e6e> leaves <~#3fb0a0>north<~#6e6e6e>.<reset>'));
    });

    it('leaves prose and speech alone', async () => {
      const t = await setup();
      for (const l of [
        "Gandalf says 'Frodo leaves north.'",
        'X leaves his hiding place.',
        'A cloak leaves is growing here.',
      ]) {
        expect(t.show(l)).toEqual({ text: l, runs: [] });
      }
      const say = 'Frodo leaves north.';
      expect(t.show(mkLine(say, [], [{ tag: 'say', start: 0, end: say.length }])).text).toBe(say);
      expect(t.show(mkLine(say, [], [{ tag: 'description', start: 0, end: say.length }])).text).toBe(say);
    });

    it('turns off with directions off', async () => {
      const t = await setup({ directions: 'off' });
      expect(t.show('A young troll leaves north.').text).toBe('A young troll leaves north.');
    });
  });

  describe('exits', () => {
    it('colours each direction, dims the rest', async () => {
      const t = await setup();
      expect(t.show('Exits: (north), east, south, west, up.')).toEqual(
        ce(
          '<~#6e6e6e>Exits: (<~#3fb0a0>north<~#6e6e6e>), <~#3fb0a0>east<~#6e6e6e>, <~#3fb0a0>south<~#6e6e6e>, <~#3fb0a0>west<~#6e6e6e>, <~#3fb0a0>up<~#6e6e6e>.<reset>',
        ),
      );
    });

    it('keeps climb exits and the door names after the list', async () => {
      const t = await setup();
      const s = t.show(
        mkLine('Exits: north, \\east/, south, west. - n:attention.', [{ start: 40, end: 49, fg: 3 }]),
      );
      expect(s.text).toBe('Exits: north, \\east/, south, west. - n:attention.');
      expect(s.runs).toContainEqual({ start: 15, end: 19, fg: TEAL });
      expect(s.runs).toContainEqual({ start: 40, end: 49, fg: 3 });
      expect(t.show('Exits: none.').runs).toEqual([{ start: 0, end: 12, fg: GREY }]);
    });

    it('turns off with exits off', async () => {
      const t = await setup({ exits: 'off' });
      expect(t.show('Exits: north.')).toEqual({ text: 'Exits: north.', runs: [] });
    });
  });
});
