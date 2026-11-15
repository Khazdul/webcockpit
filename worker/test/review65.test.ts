// Stage 65's review fixes on the Worker's community paths (ADR 0155 "As
// built (stage 65, review fixes)"; notes/research/stage65-security-review.md):
// one describe per finding.
import { beforeEach, describe, expect, it } from 'vitest';
import type { PubMeta, PubWritten } from '../../shared/cloud/api.ts';
import { viewAddressKey, addressKey } from '../address.ts';
import { db, device, emptyTables } from './helpers.ts';
import { META, call, post, signUp } from './share-helpers.ts';
import { DAY, NOW, ccall, cenvOf, list, ok, note } from './community-helpers.ts';

beforeEach(async () => {
  await emptyTables();
});

const cp = String.fromCodePoint;

describe('S1, S2: the free public text rules on the Worker', () => {
  it('refuses a tower of marks with ZWJ between them, an empty-looking note and a ZWJ run', async () => {
    const alice = await signUp('alice');
    const tower = `x${`${cp(0x0310)}${cp(0x0311)}${cp(0x0312)}${cp(0x200d)}`.repeat(60)}`.slice(0, 250);
    for (const text of [tower, `${cp(0x200d)}${cp(0x200d)}`, cp(0x2800), `a${cp(0x206a)}b`, `a${cp(0xe000)}`, `a${cp(0x200d)}${cp(0x200d)}b`]) {
      const res = await note(alice, text);
      expect(res.status, JSON.stringify(text)).toBe(400);
      expect(await res.json()).toEqual({ error: 'bad_text' });
    }
    expect((await note(alice, `${cp(0x2764)}${cp(0xfe0f)}${cp(0x200d)}${cp(0x1f525)} at the ford`)).status).toBe(200);
  });
});

describe('S3: a listed run’s title, description and character follow the free public text rules', () => {
  const patch = (cookie: string, id: string, body: unknown): Promise<Response> => ccall('PATCH', `/api/u/pub/${id}`, body, { cookie });
  const env = cenvOf({});

  it('POST with listed: true refuses a blank-looking or smuggling title, description or character (400 bad_text); link-only keeps stage 64’s rules', async () => {
    const alice = await signUp('alice');
    for (const over of [{ title: cp(0x3164) }, { title: `Orc${cp(0x200b)}s` }, { description: `Two${cp(0x00ad)} orcs` }, { character: `Olx${cp(0x0310)}${cp(0x0311)}${cp(0x0312)}${cp(0x0313)}` }]) {
      const res = await post(alice, { ...META, ...over, listed: true }, undefined, { env });
      expect(res.status, JSON.stringify(over)).toBe(400);
      expect(await res.json()).toEqual({ error: 'bad_text' });
      expect((await post(alice, { ...META, ...over, listed: false }, undefined, { env })).status, JSON.stringify(over)).toBe(200);
    }
    expect((await post(alice, { ...META, description: '', character: '', listed: true }, undefined, { env })).status).toBe(200);
  });

  it('PATCH to listed, or of the texts of a listed run, checks the texts the run will have', async () => {
    const alice = await signUp('alice');
    const linkOnly = (await ok<PubWritten>(await post(alice, { ...META, title: `Orc${cp(0x200b)}s` }, undefined, { env }))).pub.id;
    // Listing it with the stored title: refused; with a clean title in the same PATCH: listed.
    expect((await patch(alice, linkOnly, { listed: true })).status).toBe(400);
    expect((await ok<PubWritten>(await patch(alice, linkOnly, { listed: true, title: 'Orcs' }))).pub.listed).toBe(true);
    // A listed run's title or description: the rules.
    expect((await patch(alice, linkOnly, { title: cp(0x3164) })).status).toBe(400);
    expect((await patch(alice, linkOnly, { description: `a${cp(0x2800)}` })).status).toBe(400);
    expect((await patch(alice, linkOnly, { description: 'Two orcs.\nOne troll.' })).status).toBe(200);
    // Unlisted again: stage 64's rules.
    expect((await patch(alice, linkOnly, { listed: false })).status).toBe(200);
    expect((await patch(alice, linkOnly, { title: `Orc${cp(0x200b)}s` })).status).toBe(200);
  });
});

describe('S4: a view counts once a day per IPv6 /56', () => {
  const view = (id: string, ip: string): Promise<Response> => ccall('POST', `/api/pub/${id}/view`, { device: device() }, { ip, headers: { 'content-type': 'application/json' } });

  it('viewAddressKey is the /56, addressKey stays the /64', () => {
    expect(viewAddressKey('2001:db8:abcd:12ff::1')).toBe('2001:db8:abcd:1200::/56');
    expect(viewAddressKey('2001:db8:abcd:0012::1')).toBe('2001:db8:abcd:0::/56');
    expect(viewAddressKey('203.0.113.9')).toBe('203.0.113.9');
    expect(viewAddressKey('::ffff:203.0.113.9')).toBe('203.0.113.9');
    expect(viewAddressKey('nonsense')).toBe('unknown');
    expect(addressKey('2001:db8:abcd:12ff::1')).toBe('2001:db8:abcd:12ff::/64');
  });

  it('one customer’s /64s add one view', async () => {
    const alice = await signUp('alice');
    const id = await list(alice);
    for (let i = 0; i < 20; i++) expect((await view(id, `2001:db8:abcd:${i.toString(16)}::1`)).status).toBe(204);
    expect((await ok<PubMeta>(await ccall('GET', `/api/pub/${id}`))).views).toBe(1);
    await view(id, '2001:db8:abcd:100::1');
    expect((await ok<PubMeta>(await ccall('GET', `/api/pub/${id}`))).views).toBe(2);
  });
});

export { DAY, NOW, call, db };
