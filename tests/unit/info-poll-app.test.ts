// @vitest-environment happy-dom
// The hidden info poll in the real App (stage 77 part C): the recorder,
// the user's actions, the scripts' bus and the display get no trace of it.
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, describe, expect, it } from 'vitest';
import { App } from '../../src/app/app';
import { RunStore } from '../../src/runs/store';
import { SETTLE_MS } from '../../src/gmcp/info-poll';
import { FakeScheduler } from '../../src/script/engine/timers';
import { FIGHT_VITALS, GA, XML_PROMPT, answerPulse, answerText, pollNonce, probeNonce, probeText, wire } from '../fixtures/info-poll-answer';
import { FakeSocket, sb, utf8 } from './net-helpers';

const PROMPT = XML_PROMPT + GA;
const gmcp = (pkg: string, data: unknown): number[] => sb(201, utf8(`${pkg} ${JSON.stringify(data)}`));

const apps: App[] = [];
afterEach(() => {
  for (const a of apps.splice(0)) a.dispose();
  document.body.innerHTML = '';
});

function setup(o: { player?: boolean } = {}) {
  const root = document.createElement('div');
  document.body.append(root);
  const sched = new FakeScheduler();
  const sock = new FakeSocket();
  const frames: Array<() => void> = [];
  const factory = new IDBFactory();
  const app = new App({
    root,
    ...(o.player ? { player: true } : {}),
    socketFactory: () => sock,
    scheduler: sched,
    now: () => 1_790_000_000_000 + sched.now(),
    recorder: {
      openStore: () => RunStore.open(factory),
      locks: { request: (_n, _o, cb) => Promise.resolve(cb({})) },
      win: null,
      flushMs: 60_000,
    },
    requestFrame: (cb) => frames.push(cb),
    paneRequestFrame: () => {},
    paneDb: null,
    clockStorage: null,
  });
  apps.push(app);
  const heard: string[] = [];
  app.bus.on('text.line', (l) => heard.push(l.text));
  app.bus.on('text.partial', (l) => l.text && heard.push(l.text));
  app.bus.on('text.display', (d) => heard.push(d.line.text));
  app.bus.on('cmd.sent', (c) => heard.push(c.text));
  app.bus.on('sys.message', (m) => heard.push(m.text));
  const frame = (...parts: (string | number[])[]): void => sock.data(parts.flatMap((p) => (typeof p === 'string' ? wire(p) : p)));
  const sent = (): string => new TextDecoder('latin1').decode(Uint8Array.from(sock.sentBytes()));
  const login = (): void => {
    app.connectLive();
    sock.open();
    frame([255, 251, 201]);
    frame(gmcp('Char.Name', { name: 'Rasta' }));
    frame(gmcp('Char.Vitals', { hp: 100, maxhp: 200 }), PROMPT);
    sched.advance(SETTLE_MS);
  };
  const rows = (): string => {
    while (frames.length) frames.shift()!();
    return [...app.output.el.querySelectorAll('.wc-row')].map((r) => r.textContent).join('\n');
  };
  const type = (text: string): void => {
    app.input.input.value = text;
    app.input.input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
  };
  return { app, sched, sock, heard, frame, sent, login, rows, type };
}

describe('the info poll in the App', () => {
  it('no trace on the bus, on the screen, in the history or in the run log; wimpy is set', async () => {
    const t = setup();
    t.login();
    const n = pollNonce(t.sent())!;
    expect(n).toMatch(/^[a-z0-9]{6}$/);
    t.frame(answerPulse(n, { queued: true }));
    t.frame(`A troll arrives.\r\n\r\n${PROMPT}`);
    expect(t.app.game.char.view().wimpy).toBe(120);
    for (const trace of [n, 'GoblinTown', 'info ']) {
      expect(t.heard.join('\n')).not.toContain(trace);
      expect(t.rows()).not.toContain(trace);
    }
    expect(t.app.input.getHistory()).toEqual([]);

    await t.app.recorder.idle();
    await t.app.recorder.flush();
    const store = (await t.app.recorder.getStore())!;
    const log = (await store.getChunks(t.app.recorder.runId!)).map((c) => c.text).join('');
    expect(log).toContain('A troll arrives.');
    expect(log).toContain('change width all 500');
    for (const trace of [n, 'GoblinTown', 'info ']) expect(log).not.toContain(trace);
    expect(log.split('\n').filter((l) => / o>$/.test(l))).toHaveLength(2);
  });

  it('the sex probe: no trace anywhere, the sex set', async () => {
    const t = setup();
    expect(t.app.applyProfile('#action {You are a %1} {say leak}\n').ok).toBe(true);
    // A window tall enough for the probe (PROBE_MIN_ROWS): MUME would page it in a short one.
    t.app.session.setWindowSize(110, 49);
    t.login();
    const p = probeNonce(t.sent())!;
    expect(p).toMatch(/^[a-z0-9]{6}$/);
    t.frame(answerText(pollNonce(t.sent())!) + probeText(p, { sex: 'female' }) + PROMPT);
    t.frame(`A troll arrives.\r\n\r\n${PROMPT}`);
    expect(t.app.game.sex).toBe('female');
    expect(t.sent()).not.toContain('say leak');
    for (const trace of [p, 'You are a female', 'info']) {
      expect(t.heard.join('\n')).not.toContain(trace);
      expect(t.rows()).not.toContain(trace);
    }
    await t.app.recorder.idle();
    await t.app.recorder.flush();
    const store = (await t.app.recorder.getStore())!;
    const log = (await store.getChunks(t.app.recorder.runId!)).map((c) => c.text).join('');
    expect(log).toContain('A troll arrives.');
    for (const trace of [p, 'You are a female']) expect(log).not.toContain(trace);
  });

  it("the user's actions do not fire on the answer, and do on the text beside it", () => {
    const t = setup();
    expect(t.app.applyProfile('#action {GoblinTown} {say leak}\n#action {warlord} {say leak}\n#action {troll arrives} {say hello}\n').ok).toBe(true);
    t.login();
    t.frame(`A troll arrives.\r\n${answerText(pollNonce(t.sent())!)}${PROMPT}`);
    expect(t.sent()).toContain('say hello\r\n');
    expect(t.sent()).not.toContain('say leak');
  });

  it('off in the settings: nothing is sent', () => {
    const t = setup();
    const settings = (t.app as unknown as { settings: { update(p: object): void } }).settings;
    settings.update({ character: { fetchInfo: false } });
    t.login();
    expect(t.sent()).not.toContain('info WC');
    // On again: the login poll that waited.
    settings.update({ character: { fetchInfo: true } });
    expect(t.sent()).toContain('info WC');
  });

  it('keys and presses on the page are activity', () => {
    const t = setup();
    (t.app as unknown as { settings: { update(p: object): void } }).settings.update({ character: { pollEvery: 300 } });
    t.login();
    t.frame(answerPulse(pollNonce(t.sent())!));
    t.app.infoPoll!.open();
    t.sched.advance(11 * 60_000);
    // The field polls: the login's sex probe (`info WC…{`) is not one.
    const count = (): number => t.sent().match(/info WC[a-z0-9]{6}\[/g)?.length ?? 0;
    expect(count()).toBe(1);
    window.dispatchEvent(new Event('pointerdown'));
    t.sched.advance(0);
    expect(count()).toBe(2);
  });

  it('a click on the card: sent as typed, no alias; nothing into the line editor (as seen live)', () => {
    const t = setup();
    expect(t.app.applyProfile('#alias {sneak} {say leak}\n').ok).toBe(true);
    t.login();
    t.frame(answerPulse(pollNonce(t.sent())!));
    t.frame(gmcp('Char.Vitals', { mood: 'brave', position: 'standing' }));
    const pane = [...(t.app.cockpit as unknown as { shells: Map<string, { content: HTMLElement; render(): void }> }).shells].find(([id]) => id === 'character')![1];
    pane.render();
    const click = (id: string): void => pane.content.querySelector<HTMLElement>(`[data-click="${id}"]`)!.click();

    t.frame(`Write your message for the Mages' board\r\nType %e on an empty line to save and exit, %q to abandon and %h for help.\r\n==&gt;\r\n<prompt>: </prompt>${GA}`);
    click('mood');
    t.frame("A hobbit tells you 'hello'\r\n");
    click('mood');
    expect(t.sent()).not.toContain('change mood');

    t.frame(`Cancelled.\r\n\r\n${PROMPT}`);
    click('mood');
    click('sneak');
    expect(t.sent()).toContain('change mood aggressive\r\n');
    expect(t.sent()).toContain('sneak\r\n');
    expect(t.sent()).not.toContain('say leak');
    // Echoed and logged like a typed command (decision 19).
    expect(t.heard).toContain('change mood aggressive');
  });

  it("the width commands' Ok.: not on the bus, the screen or in the run log; a later one is", async () => {
    const t = setup();
    t.app.connectLive();
    t.sock.open();
    t.frame([255, 251, 201]);
    t.frame(gmcp('Char.Name', { name: 'Rasta' }), PROMPT);
    t.frame('Ok.\r\n\r\nOk.\r\n\r\n', gmcp('Char.Vitals', { hp: 100, maxhp: 200 }), PROMPT);
    expect(t.heard.filter((h) => h === 'Ok.')).toEqual([]);
    expect(t.rows()).not.toContain('Ok.');
    t.sched.advance(10_000);
    t.frame(`Ok.\r\n\r\n${PROMPT}`);
    // Its line and its display.
    expect(t.heard.filter((h) => h === 'Ok.')).toHaveLength(2);
    await t.app.recorder.idle();
    await t.app.recorder.flush();
    const store = (await t.app.recorder.getStore())!;
    const log = (await store.getChunks(t.app.recorder.runId!)).map((c) => c.text).join('');
    expect(log).toContain('change width all 500');
    expect(log.split('\n').filter((l) => / Ok\.$/.test(l))).toHaveLength(1);
  });

  it('a log player has no poll', () => {
    const t = setup({ player: true });
    expect(t.app.infoPoll).toBeNull();
    t.login();
    expect(t.sent()).not.toContain('info WC');
  });

  it('%f (stage 77 H9): no trace of the list, the affects reconciled, the vitals taken', async () => {
    const t = setup();
    t.login();
    const n = pollNonce(t.sent())!;
    t.frame(answerPulse(n, { queued: true, affects: ['potion', 'unable to quit', 'armour', 'hunger', 'thirst'] }));
    t.frame(`A troll arrives.\r\n\r\n${PROMPT}`);
    const view = t.app.game.timers.view();
    expect(view.cells.debuff.map((c) => c.name).sort()).toEqual(['hunger', 'thirst', 'unable to quit']);
    expect(view.cells.buff.map((c) => c.name)).toEqual(['potion']);
    expect(view.cells.spell.map((c) => c.name)).toEqual(['armour']);
    expect(view.cells.buff[0]).toMatchObject({ tracked: false, expiresAt: null });
    // The vitals: Char.Vitals said 100/200 before the poll was sent; the poll's numbers are newer.
    expect(t.app.game.char.view().vitals.hp).toMatchObject({ value: 357, max: 375, exact: true });
    expect(t.app.game.char.view().vitals.mana).toMatchObject({ value: 88, max: 121, exact: true });
    for (const trace of [n, 'Affected by', '- potion', 'unable to quit']) {
      expect(t.heard.join('\n')).not.toContain(trace);
      expect(t.rows()).not.toContain(trace);
    }
    expect(t.rows()).toContain('A troll arrives.');
    await t.app.recorder.idle();
    await t.app.recorder.flush();
    const store = (await t.app.recorder.getStore())!;
    const log = (await store.getChunks(t.app.recorder.runId!)).map((c) => c.text).join('');
    for (const trace of [n, 'Affected by', 'unable to quit']) expect(log).not.toContain(trace);
  });

  it('%f: an affect gone from the next answer is gone; a Char.Vitals after the poll was sent wins', () => {
    const t = setup();
    t.login();
    const n = pollNonce(t.sent())!;
    t.frame(answerPulse(n, { queued: true, affects: ['panic'] }));
    expect(t.app.game.timers.view().cells.debuff.map((c) => c.name)).toEqual(['panic']);
    t.app.infoPoll!.open();
    t.sched.advance(60_000);
    const m = pollNonce(t.sent())!;
    expect(m).not.toBe(n);
    t.frame(gmcp('Char.Vitals', { hp: 50, maxhp: 375 }));
    t.frame(answerPulse(m, { queued: true }));
    expect(t.app.game.timers.view().cells.debuff).toEqual([]);
    // HP from GMCP (newer than the poll's send), mana and moves from the poll.
    expect(t.app.game.char.view().vitals.hp).toMatchObject({ value: 50, max: 375 });
    expect(t.app.game.char.view().vitals.mp).toMatchObject({ value: 68, max: 112 });
  });
});

describe('the info poll in the App: a fight (stage 77 H11)', () => {
  const FP = `<prompt>o HP:Hurt a grizzled orc:Wounded&gt;</prompt>${GA}`;

  it('polls in a fight with no trace; the rounds round it shown; xxx writes no vitals; the bars follow GMCP', async () => {
    const t = setup();
    t.app.connectLive();
    t.sock.open();
    t.frame([255, 251, 201]);
    t.frame(gmcp('Char.Name', { name: 'Rasta' }));
    t.frame(gmcp('Char.Vitals', { hp: 150, maxhp: 200, position: 'fighting', opponent: 'a grizzled orc' }), FP);
    expect(t.app.game.fighting()).toBe(true);
    t.sched.advance(SETTLE_MS);
    const n = pollNonce(t.sent())!;
    expect(n).toMatch(/^[a-z0-9]{6}$/);
    t.frame(`\r\nDig hits a grizzled orc's body extremely hard.\r\n\r\n${FP}`, answerPulse(n, { queued: true, vitals: FIGHT_VITALS }).replace(PROMPT, FP));
    t.frame(gmcp('Char.Vitals', { hp: 140 }), `\r\nA grizzled orc hits you.\r\n\r\n${FP}`);
    expect(t.app.game.char.view().wimpy).toBe(120);
    expect(t.app.game.char.view().vitals.hp).toMatchObject({ value: 140, max: 200 });
    for (const trace of [n, 'xxx', 'warlord']) {
      expect(t.heard.join('\n')).not.toContain(trace);
      expect(t.rows()).not.toContain(trace);
    }
    expect(t.rows()).toContain("Dig hits a grizzled orc's body extremely hard.");
    expect(t.rows()).toContain('A grizzled orc hits you.');
    await t.app.recorder.idle();
    await t.app.recorder.flush();
    const store = (await t.app.recorder.getStore())!;
    const log = (await store.getChunks(t.app.recorder.runId!)).map((c) => c.text).join('');
    for (const trace of [n, 'xxx']) expect(log).not.toContain(trace);
    expect(log).toContain('Dig hits a grizzled orc');
  });

  it('your GMCP `waiting` holds it (the App wires the group model)', () => {
    const t = setup();
    t.app.connectLive();
    t.sock.open();
    t.frame([255, 251, 201]);
    t.frame(gmcp('Char.Name', { name: 'Rasta' }), gmcp('Group.Set', [{ id: 1, type: 'you', name: 'Rasta', waiting: true }]));
    t.frame(gmcp('Char.Vitals', { hp: 100, maxhp: 200 }), PROMPT);
    t.sched.advance(30_000);
    expect(pollNonce(t.sent())).toBeNull();
    expect(t.app.infoPoll!.request()).toBe('MUME holds your commands (waiting)');
    t.frame(gmcp('Group.Update', { id: 1, waiting: false }), PROMPT);
    t.sched.advance(SETTLE_MS);
    expect(pollNonce(t.sent())).not.toBeNull();
  });
});

describe('the info poll in the App: the owner’s live session after F1b (regression)', () => {
  const count = (t: ReturnType<typeof setup>): number => t.sent().match(/info WC[a-z0-9]{6}\[/g)?.length ?? 0;
  const lastNonce = (t: ReturnType<typeof setup>): string => [...t.sent().matchAll(/info WC([a-z0-9]{6})\[/g)].at(-1)![1]!;
  /** In the game, the login poll answered, the card's poll held, the login's burst over. */
  const ready = (): ReturnType<typeof setup> => {
    const t = setup();
    t.login();
    t.frame(answerPulse(lastNonce(t)));
    t.frame(gmcp('Char.Vitals', { mood: 'brave', position: 'standing' }), PROMPT);
    t.app.infoPoll!.open();
    t.sched.advance(15_000);
    t.frame(answerPulse(lastNonce(t)));
    return t;
  };

  it("MUME's own aliases for the mood poll 1 s after the command, as a typed `cha mood` does", () => {
    const t = ready();
    for (const [cmd, echo, mood] of [
      ['wi', '[cha mood wimpy]', 'wimpy'],
      ['ag', '[cha mood ag]', 'aggressive'],
      ['cha mood bra', null, 'brave'],
      ['wi', '[cha mood wimpy]', 'wimpy'],
    ] as const) {
      const n = count(t);
      t.sched.advance(3000);
      window.dispatchEvent(new Event('keydown'));
      t.type(cmd);
      t.sched.advance(150);
      t.frame(`${echo ? `${echo}\r\n` : ''}Ok.\r\n\r\n`, gmcp('Char.Vitals', { mood }), PROMPT);
      t.sched.advance(849);
      expect(count(t), cmd).toBe(n);
      t.sched.advance(1);
      expect(count(t), cmd).toBe(n + 1);
      t.sched.advance(150);
      t.frame(answerPulse(lastNonce(t)));
    }
  });

  it('an alias typed just after a repeat poll went: one more poll after the gap', () => {
    const t = ready();
    const n = count(t);
    while (count(t) === n) t.sched.advance(10);
    window.dispatchEvent(new Event('keydown'));
    t.type('wi');
    t.sched.advance(150);
    // The poll's answer and the alias's in one pulse, the answer first (MUME answers in order).
    t.frame(answerPulse(lastNonce(t)).split(XML_PROMPT)[0]!, '[cha mood wimpy]\r\nOk.\r\n\r\n', gmcp('Char.Vitals', { mood: 'wimpy' }), PROMPT);
    t.sched.advance(3000);
    expect(count(t)).toBe(n + 2);
  });
});
