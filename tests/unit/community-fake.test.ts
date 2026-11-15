// The e2e account fake's community block (stage 65 B) against the
// contract, so the views of part C can trust it: the list, votes,
// comments, notes and the counters.
import { describe, expect, it } from 'vitest';
import { FakeAccountServer } from '../e2e/cloud-account-fake';

const fields = { salt: 's', kdf: { name: 'pbkdf2-sha256' as const, rounds: 600_000 }, authKey: 'a', recoveryAuth: 'r', wrapPw: 'w', wrapRc: 'c' };
const ORIGIN = 'http://localhost';

function setup() {
  const server = new FakeAccountServer();
  server.flags = { accounts: true, share: true, gallery: true, runes: true };
  server.seed('Alice', fields, { created: server.now() - 30 * 86_400_000 });
  server.seed('Bob', fields, { created: server.now() - 30 * 86_400_000 });
  const alice = server.browser();
  const bob = server.browser();
  server.logInBrowser(alice, 'Alice');
  server.logInBrowser(bob, 'Bob');
  const call = (b: ReturnType<FakeAccountServer['browser']>, method: string, path: string, body?: unknown) => {
    const [p, search] = path.split('?');
    const r = b.communityRequest({ method, path: p!, search: search ? `?${search}` : '', headers: { 'x-wc': '1', origin: ORIGIN }, body: body === undefined ? null : JSON.stringify(body), origin: ORIGIN });
    if (r === 'offline') throw new Error('offline');
    return r;
  };
  return { server, alice, bob, call };
}

describe('the community fake', () => {
  it('lists, votes, comments, writes notes and counts the news', () => {
    const { server, alice, bob, call } = setup();
    const id = server.addPub('alice', { listed: true, title: 'Ford' });
    server.addPub('alice', { title: 'Link only' });
    expect(call(bob, 'GET', '/api/gallery?sort=new').body).toMatchObject({ rows: [{ id, title: 'Ford', sender: 'Alice', stars: { sum: 0, count: 0 } }], more: false });
    expect(call(bob, 'PUT', `/api/u/pub/${id}/vote`, { stars: 4 }).body).toEqual({ stars: { sum: 4, count: 1 }, mine: 4 });
    expect(call(alice, 'PUT', `/api/u/pub/${id}/vote`, { stars: 5 }).status).toBe(403);
    expect(call(bob, 'POST', `/api/u/pub/${id}/comments`, { text: 'Nice.' }).status).toBe(200);
    expect(call(bob, 'POST', `/api/u/pub/${id}/comments`, { text: ' padded' }).body).toEqual({ error: 'bad_text' });
    expect(call(bob, 'GET', `/api/pub/${id}/comments`).body).toMatchObject({ comments: [{ writer: 'Bob', text: 'Nice.' }], page: 1, pages: 1, total: 1 });
    expect(call(bob, 'POST', '/api/u/runes', { text: 'Hello' }).status).toBe(200);
    expect(call(bob, 'GET', '/api/runes').body).toMatchObject({ notes: [{ writer: 'Bob', text: 'Hello' }] });
    expect(call(alice, 'GET', '/api/u/community/news').body).toMatchObject({ runs: 0, reactions: 2 });
    expect(call(bob, 'GET', '/api/u/community/news').body).toMatchObject({ runs: 1, reactions: 0 });
    expect(call(alice, 'POST', '/api/u/community/seen', { reactions: server.now() }).status).toBe(200);
    expect(call(alice, 'GET', '/api/u/community/news').body).toMatchObject({ reactions: 0 });
    expect(server.pubsOf('alice').find((p) => p.id === id)).toMatchObject({ stars: { sum: 4, count: 1 }, comments: 1, news: { votes: 0, comments: 0 } });
    expect(call(bob, 'GET', '/api/community').body).toMatchObject({ topPosters: [{ name: 'Alice', runs: 1 }], hallOfFame: [{ id }] });
    expect(server.publicListed()).toHaveLength(1);
    server.flags.runes = false;
    expect(call(bob, 'GET', '/api/runes').status).toBe(404);
  });
});
