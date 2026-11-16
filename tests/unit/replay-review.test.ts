// @vitest-environment happy-dom
// The review of stage 64 B2 (ADR 0154 "No HTML from the payload", "As
// built (stage 64 B2)"): every fix of a path from a hostile payload into
// the player, each with the case that went wrong before it.
import { describe, expect, it } from 'vitest';
import { formatPaneRecord, formatRecord } from '../../src/capture/format';
import { formatComm } from '../../src/gmcp/comm';
import { MM2_MAGIC, Mm2Error, inflateZlib, readMm2 } from '../../src/map/mm2';
import { channelInk, channelWord } from '../../src/panes/comm-view';
import { defaultSettings } from '../../src/settings';
import { MAX_SCRIPT_PANES } from '../../src/settings/migrate';
import { mergeInto } from '../../src/settings/store';
import { defaultExportDoc } from '../../src/share/edits';
import { buildReplayPayload } from '../../src/share/payload';
import { openPayload } from './fold-helpers';
import { BASE_US, makeLog, meta } from './player-helpers';
import { deflateSync } from 'node:zlib';

const us = (s: number) => BASE_US + Math.round(s * 1e6);

function payloadOf(text: string) {
  return buildReplayPayload([{ meta: meta('Evil/a', BASE_US), text }], [], defaultExportDoc('Evil/a'), defaultSettings(), { allPanes: true });
}

/** Plays `text` to its end in a PlayerHost on a fake wall. */
function playToEnd(text: string) {
  const o = openPayload(payloadOf(text));
  o.host.engine!.seek(o.host.engine!.duration);
  o.wall.flush();
  return o;
}

describe('VIEW records reach the player only as the settings take them', () => {
  it('a pane entry that is not an object does not stop the replay', () => {
    const text =
      makeLog(BASE_US, [{ at: 0, in: 'first' }]) +
      formatRecord(us(1), 'VIEW', JSON.stringify({ panes: { statistics: 1, comm: 'x', ui: null } })) +
      makeLog(BASE_US, [{ at: 2, in: 'after the view' }]);
    const { host } = playToEnd(text);
    expect(host.engine!.atEnd).toBe(true);
    const base = (host as unknown as { base: { panes: Record<string, unknown> } }).base;
    for (const id of ['statistics', 'comm', 'ui']) expect(typeof base.panes[id]).toBe('object');
  });

  it('a colour that is a CSS url() never reaches the Display popup’s swatch', () => {
    const text =
      makeLog(BASE_US, [{ at: 0, in: 'first' }]) +
      formatRecord(us(1), 'VIEW', JSON.stringify({ appearance: { bg: 'url(https://example.invalid/beacon)', fg: 'expression(alert(1))' } })) +
      makeLog(BASE_US, [{ at: 2, in: 'after' }]);
    const { host } = playToEnd(text);
    const controls = host.viewerControls(false);
    expect(controls.swatch('default')).toMatch(/^#[0-9a-f]{6}$/);
    const base = (host as unknown as { base: { appearance: { bg: string; fg: string } } }).base;
    expect(base.appearance.bg).toMatch(/^#[0-9a-f]{6}$/);
    expect(base.appearance.fg).toMatch(/^#[0-9a-f]{6}$/);
  });
});

describe('script pane records', () => {
  it('make at most MAX_SCRIPT_PANES panes, however many ids a log names', () => {
    let text = makeLog(BASE_US, [{ at: 0, in: 'first' }]);
    const snap = JSON.stringify({ title: 'P', lines: [{ spans: [{ text: 'x' }] }], links: [] });
    for (let i = 0; i < MAX_SCRIPT_PANES + 50; i++) text += formatPaneRecord(us(1), `evil/p${i}`, snap);
    text += makeLog(BASE_US, [{ at: 2, in: 'end' }]);
    const { host } = playToEnd(text);
    expect(host.app!.cockpit.scriptPanes().length).toBe(MAX_SCRIPT_PANES);
  });
});

describe('the map file is inflated with a ceiling', () => {
  it('a deflate bomb stops at the ceiling instead of filling the memory', async () => {
    const bomb = new Uint8Array(deflateSync(Buffer.alloc(8 * 1024 * 1024)));
    await expect(inflateZlib(bomb, 1024 * 1024)).rejects.toThrow(Mm2Error);
    expect((await inflateZlib(bomb)).byteLength).toBe(8 * 1024 * 1024);
  });

  it('a qCompress map stops at the length its header gives', async () => {
    const z = deflateSync(Buffer.alloc(4 * 1024 * 1024));
    const file = new Uint8Array(12 + z.length);
    const dv = new DataView(file.buffer);
    dv.setUint32(0, MM2_MAGIC);
    dv.setUint32(4, 42);
    dv.setUint32(8, 1000);
    file.set(z, 12);
    let max: number | undefined;
    await expect(readMm2(file, (zz, m) => ((max = m), inflateZlib(zz, m)))).rejects.toThrow(/decompression failed/);
    expect(max).toBe(1000);
  });
});

describe('names from the log are never read as Object.prototype members', () => {
  it('a channel called constructor or __proto__ reads as an unknown channel', () => {
    for (const channel of ['constructor', '__proto__', 'toString', 'hasOwnProperty']) {
      const text = formatComm({ channel, talker: 'Evil', talkerType: 'player', destination: null, text: 'hi' })
        .map((s) => s.text)
        .join('');
      expect(text).not.toMatch(/undefined|function|\[object/);
      expect(channelWord(channel)).toBe(channel);
      expect(channelInk(channel, false, '#000000')).toMatch(/^#[0-9a-f]{6}$|^rgb/);
    }
  });
});

describe('settings merges', () => {
  it('a patch with its own __proto__ key pollutes nothing', () => {
    const target: Record<string, unknown> = { a: { b: 1 } };
    mergeInto(target, JSON.parse('{"__proto__":{"polluted":1},"a":{"__proto__":{"polluted":2},"b":2},"constructor":{"prototype":{"polluted":3}}}'));
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(target).toEqual({ a: { b: 2 } });
  });
});
