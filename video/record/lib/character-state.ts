// The Character pane film's browser state and mocked MUME (stage 78,
// video/manuscript-character.md): Gittan at Mason Road in Bree, the night of
// 2026-11-25.
//
//   - a fresh profile: weather effects off, no pane on; the map's place is
//     the right dock's lane, the Character pane's a float in the middle at
//     a Medium size (both switched on on camera);
//   - Gittan's sex remembered (`wc.charSex.v1`), so no probe goes at login;
//   - MUME's socket mocked (nothing reaches mume.org). The mock answers the
//     client's hidden info poll (ADR 0166: `info WC<nonce>[…]WC<nonce>`)
//     with Gittan's values as they stand at the take's moment of the run
//     (`Mume.state`), in MUME's form: the fields, the vitals, the affects,
//     a blank line, the prompt. The client hides all of it, as in the
//     product. Every other command it gets is the scene's own: the scene
//     plays MUME's answers from the run.
//   - prompts go as MUME's XML prompts (`<prompt>…</prompt>` and GA): the
//     poll waits for one (src/gmcp/info-poll.ts).
import type { Page, WebSocketRoute } from '@playwright/test';
import { GMCP, IAC, WILL, gmcpBytes, sleep, startMenu } from '../../../scripts/lib/mume-feed.ts';
import { answerText, pollNonce, probeNonce } from '../../../tests/fixtures/info-poll-answer.ts';
import { type PollState, pollFields } from '../../feeds/character.ts';
import { freshStart } from './film-state.ts';

/** The game's moment for the start page (it is never filmed): MUME's night. */
const NIGHT = 3039 * 518_400 + 7 * 43_200 + 15 * 1440 + 23 * 60;
/** The page options. */
export const CHARACTER_PAGE = { moment: NIGHT, seed: 3 };

/** The cockpit's cell, CSS px (160 × 49 at 1600 × 900). */
export const CELL = { w: 10, h: 900 / 49 } as const;

/** Where the card floats when it comes on (cells, frame included): the middle, Medium. */
export const CARD_FLOAT = { x: 35, y: 17, w: 40, h: 11 } as const;
/** The right dock's lane, as wide as the map wants (cells). */
export const DOCK_LANE = 50;

/** Escaped for an XML prompt. */
const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
/** A prompt as MUME's XML mode sends it, GA after it. */
export const promptBytes = (text: string): Buffer => Buffer.concat([Buffer.from(`<prompt>${esc(text)}</prompt>`, 'utf8'), Buffer.from([IAC, 249])]);

/** What the poll answers with now, kept by the scene as the run plays. */
export interface MumeState extends PollState {
  vitals: Record<string, unknown>;
  affects: string[];
  prompt: string;
}

export class Mume {
  server: WebSocketRoute | null = null;
  /** Every line the client sent, the hidden polls included. */
  readonly sent: string[] = [];
  readonly polls: { at: number; nonce: string }[] = [];
  state: MumeState;
  /** Called with each command the client sends (not the polls, not the telnet). */
  onCommand: ((cmd: string) => void) | null = null;

  constructor(state: MumeState) {
    this.state = state;
  }

  send(out: Buffer): void {
    this.server!.send(out);
  }

  /** The poll's answer, as MUME prints it, with the prompt (all its pulse shows). */
  answer(nonce: string): Buffer {
    const s = this.state;
    const v = s.vitals;
    const fighting = v.position === 'fighting';
    const num = (k: string): string => (fighting ? 'xxx' : String(v[k] ?? 'xxx'));
    const vit = ['hp', 'maxhp', 'mana', 'maxmana', 'mp', 'maxmp'].map(num);
    const text = answerText(nonce, { cols: 100, fields: pollFields(s), vitals: vit, affects: s.affects });
    return Buffer.concat([Buffer.from(text, 'utf8'), promptBytes(s.prompt)]);
  }

  /** The route's handler. */
  attach(ws: WebSocketRoute): void {
    this.server = ws;
    ws.onMessage((m) => {
      const raw = typeof m === 'string' ? Buffer.from(m) : Buffer.from(m);
      if (raw.includes('Core.Ping')) {
        ws.send(gmcpBytes('Core.Ping'));
        return;
      }
      if (raw[0] === IAC) return;
      const text = raw.toString('utf8');
      if (probeNonce(text)) throw new Error('the client sent the sex probe: Gittan should be known');
      const nonce = pollNonce(text);
      if (nonce) {
        this.polls.push({ at: Date.now(), nonce });
        ws.send(this.answer(nonce));
        return;
      }
      for (const line of text.split(/\r?\n/)) {
        if (!line) continue;
        this.sent.push(line);
        // the login's width commands: MUME's `Ok.` each (the client hides them), the prompt after the last
        if (/^change width /.test(line)) ws.send(Buffer.concat([Buffer.from('Ok.\r\n\r\n'), ...(line.endsWith('table terminal') ? [promptBytes(this.state.prompt)] : [])]));
        else this.onCommand?.(line);
      }
    });
    ws.send(Buffer.from([IAC, WILL, GMCP]));
    // MUME's UTF-8 (CHARSET, as the balloon film)
    ws.send(Buffer.concat([Buffer.from([IAC, 250, 42, 1]), Buffer.from(';UTF-8', 'latin1'), Buffer.from([IAC, 240])]));
  }
}

interface CardSettings {
  weather: Record<string, boolean>;
  panes: Record<string, { on: boolean; border: boolean; glass: boolean; color?: string }>;
  profile: string;
  character: { fetchInfo: boolean; height: string };
  layout: {
    docks: Record<string, { lanes: { size: number; panes: { id: string; desired: number }[] }[]; head: { id: string }[]; tail: { id: string }[] }>;
    floating: { id: string; x: number; y: number; w: number; h: number }[];
  };
}
interface CardWindow {
  __wc?: { settings: { update(fn: (d: CardSettings) => void): void; get(): CardSettings } };
}

/** Into the game at Mason Road: the settings, then Enter MUME on the mocked socket. Returns the mock. */
export async function enterMasonRoad(page: Page, mume: Mume): Promise<Mume> {
  await page.routeWebSocket('wss://mume.org/ws-play/', (ws) => mume.attach(ws));
  await page.goto('/');
  await startMenu(page);
  await page.waitForFunction(() => (window as unknown as CardWindow).__wc !== undefined);
  await page.evaluate(
    ({ card, lane }) => {
      localStorage.setItem('wc.charSex.v1', JSON.stringify({ gittan: 'female' }));
      (window as unknown as CardWindow).__wc!.settings.update((d) => {
        d.weather.enabled = false;
        for (const p of Object.values(d.panes)) if (p) p.on = false;
        d.profile = 'default';
        d.character.fetchInfo = true;
        // the owner's looks (his run's VIEW): the card framed with glass, the map bare
        Object.assign(d.panes.character!, { border: true, glass: true });
        Object.assign(d.panes.map!, { border: false, glass: false });
        // the map alone in the right dock's lane; the card floats in the middle
        const strip = (l: { id: string }[]) => l.filter((p) => p.id !== 'map' && p.id !== 'character');
        for (const dock of Object.values(d.layout.docks)) {
          dock.head = strip(dock.head);
          dock.tail = strip(dock.tail);
          for (const l of dock.lanes) l.panes = strip(l.panes) as typeof l.panes;
          dock.lanes = dock.lanes.filter((l) => l.panes.length > 0);
        }
        d.layout.docks.right!.lanes = [{ size: lane, panes: [{ id: 'map', desired: 49 }] }, ...d.layout.docks.right!.lanes];
        d.layout.floating = [...d.layout.floating.filter((f) => f.id !== 'character' && f.id !== 'map'), { id: 'character', ...card }];
      });
    },
    { card: CARD_FLOAT, lane: DOCK_LANE },
  );
  // the settings are written to IndexedDB after a short debounce
  await sleep(600);
  await freshStart(page, NIGHT);
  await sleep(1500);
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => /^login/.test(document.querySelector('.wc-app')?.getAttribute('data-status') ?? ''));
  if (!mume.server) throw new Error('the game socket did not open');
  return mume;
}
