// Random Runes (stage 65, ADR 0155): the board, writing and removing a
// note, the day's limit under parallel posts, the text rules, the flags,
// no age limit (ADR 0155 addendum 2026-11-17), the cron, reports, the admin and Delete account.
import { beforeEach, describe, expect, it } from 'vitest';
import type { AdminReports, RunesBoard } from '../../shared/cloud/api.ts';
import { DAILY_CRON, runCron } from '../stats.ts';
import { count, db, emptyTables } from './helpers.ts';
import { AUTH_KEY, setLimits, oldSignUp, signUp } from './share-helpers.ts';
import { CENV, DAY, NOW, ccall, cenvOf, note, noted, ok } from './community-helpers.ts';
import { adminCall } from './admin-call.ts';

beforeEach(async () => {
  await emptyTables();
});

const board = (now = NOW): Promise<RunesBoard> => ccall('GET', '/api/runes', undefined, { now }).then((r) => ok<RunesBoard>(r));
const report = (cookie: string, target: string): Promise<Response> => ccall('POST', '/api/u/report', { kind: 'note', target, reason: 'rules' }, { cookie });

describe('Random Runes', () => {
  it('POST answers the note; the board is the latest 50 visible, newest first, with the writer', async () => {
    const alice = await signUp('alice');
    await setLimits('alice', { notesPerDay: 100 });
    const res = await note(alice, 'Orcs at the ford, bring a cleric.');
    expect(await ok(res)).toEqual({ note: { id: expect.stringMatching(/^[A-Za-z0-9]{12}$/), writer: 'alice', text: 'Orcs at the ford, bring a cleric.', created: NOW } });
    for (let i = 0; i < 55; i++) await noted(alice, `n${i}`, { now: NOW + 1 + i });
    const b = await board(NOW + 100);
    expect(b.notes).toHaveLength(50);
    expect(b.notes[0]).toEqual({ id: expect.any(String), writer: 'alice', text: 'n54', created: NOW + 55 });
    expect(b.time).toBe(NOW + 100);
  });

  it('one line, 1–250 (round 13) code points, the text rules; suspended and the flags off refused', async () => {
    const alice = await signUp('alice');
    await setLimits('alice', { notesPerDay: 100 });
    for (const text of ['', 'two\nlines', 'x'.repeat(251), ` x`, `a${String.fromCodePoint(0x200b)}b`]) {
      const res = await note(alice, text);
      expect(res.status, JSON.stringify(text)).toBe(400);
      expect(await res.json()).toEqual({ error: 'bad_text' });
    }
    expect((await note(alice, '🐉'.repeat(250))).status).toBe(200);
    for (const env of [cenvOf({ FLAG_RUNES: false }), cenvOf({ FLAG_GALLERY: false })]) {
      expect((await note(alice, 'hi', { env })).status).toBe(404);
      expect((await ccall('DELETE', '/api/u/runes/AAAAAAAAAAAA', undefined, { cookie: alice, env })).status).toBe(404);
      expect((await ccall('POST', '/api/u/report', { kind: 'note', target: 'AAAAAAAAAAAA', reason: 'rules' }, { cookie: alice, env })).status).toBe(400);
    }
    await db.prepare("UPDATE account SET state = 'suspended'").run();
    expect((await note(alice, 'hi')).status).toBe(403);
  });

  it('holds notesPerDay (a UTC day) in the statement under parallel posts; a removed note still counts that day', async () => {
    const alice = await signUp('alice');
    const answers = await Promise.all(Array.from({ length: 8 }, (_, i) => note(alice, `n${i}`)));
    expect(answers.map((r) => r.status).sort()).toEqual([200, 200, 200, 200, 200, 429, 429, 429]);
    const id = (await board()).notes[0]!.id;
    expect((await ccall('DELETE', `/api/u/runes/${id}`, undefined, { cookie: alice })).status).toBe(204);
    expect((await board()).notes).toHaveLength(4);
    expect((await note(alice, 'again')).status).toBe(429);
    expect((await note(alice, 'tomorrow', { now: NOW + DAY })).status).toBe(200);
  });

  it('only the writer removes a note; a second remove is 204; the text goes at once', async () => {
    const alice = await signUp('alice');
    const bob = await signUp('bob');
    const id = await noted(alice);
    expect((await ccall('DELETE', `/api/u/runes/${id}`, undefined, { cookie: bob })).status).toBe(404);
    expect((await ccall('DELETE', `/api/u/runes/${id}`, undefined, { cookie: alice })).status).toBe(204);
    expect((await ccall('DELETE', `/api/u/runes/${id}`, undefined, { cookie: alice })).status).toBe(204);
    expect((await db.prepare('SELECT text, state FROM note').first())).toEqual({ text: '', state: 'removed' });
  });

  it('a note has no age limit: one of 400 days is on the board and survives the cron, hidden ones too; removed rows go after their day', async () => {
    const alice = await signUp('alice');
    const bob = await signUp('bob');
    await noted(alice, 'old', { now: NOW - 400 * DAY });
    const queued = await noted(alice, 'queued', { now: NOW - 31 * DAY });
    await noted(alice, 'new');
    const gone = await noted(alice, 'gone');
    await ccall('DELETE', `/api/u/runes/${gone}`, undefined, { cookie: alice });
    await report(bob, queued);
    await db.prepare("UPDATE note SET state = 'hidden', hidden_reason = 'reports' WHERE id = ?1").bind(queued).run();
    // The board shows the newest visible notes, however old.
    expect((await board()).notes.map((n) => n.text)).toEqual(['new', 'old']);
    await runCron(CENV, DAILY_CRON, NOW);
    expect((await db.prepare('SELECT text FROM note ORDER BY text').all<{ text: string }>()).results.map((r) => r.text)).toEqual(['', 'new', 'old', 'queued']);
    // The removed row goes once its day's limit has passed; the rest stays.
    await runCron(CENV, DAILY_CRON, NOW + DAY);
    expect((await db.prepare('SELECT text FROM note ORDER BY text').all<{ text: string }>()).results.map((r) => r.text)).toEqual(['new', 'old', 'queued']);
    // The admin's dismiss leaves the hidden note hidden, and the cron leaves it too.
    await adminCall(`/api/admin/note/${queued}`, { action: 'dismiss' });
    await runCron(CENV, DAILY_CRON, NOW + 400 * DAY);
    expect((await db.prepare('SELECT text FROM note ORDER BY text').all<{ text: string }>()).results.map((r) => r.text)).toEqual(['new', 'old', 'queued']);
    expect((await board(NOW + 400 * DAY)).notes.map((n) => n.text)).toEqual(['new', 'old']);
  });

  it('the board is the newest RUNES_SHOWN with no age limit: older ones fall off only by count', async () => {
    const alice = await signUp('alice');
    await setLimits('alice', { notesPerDay: 100 });
    for (let i = 0; i < 51; i++) await noted(alice, `n${i}`, { now: NOW - (100 + i) * DAY });
    const shown = (await board()).notes.map((n) => n.text);
    expect(shown).toHaveLength(50);
    expect(shown[0]).toBe('n0');
    expect(shown[49]).toBe('n49');
  });

  it('five reports hide a note; the queue shows it with its text and writer; the admin acts', async () => {
    const alice = await signUp('alice');
    const id = await noted(alice, 'Buy gold at my shop');
    expect((await report(alice, id)).status).toBe(403);
    const reporters: string[] = [];
    for (let i = 0; i < 5; i++) reporters.push(await oldSignUp(`reporter${i}`));
    await Promise.all(reporters.map((r) => report(r, id)));
    expect((await board()).notes).toEqual([]);
    const q = await ok<AdminReports>(await adminCall('/api/admin/reports'));
    expect(q.items).toEqual([{ kind: 'note', target: id, title: '', sender: 'alice', state: 'hidden', reasons: { rules: 5 }, reporters: 5, newest: NOW, content: 'Buy gold at my shop', hiddenReason: 'reports' }]);
    expect((await adminCall(`/api/admin/note/${id}`, { action: 'restore' })).status).toBe(204);
    expect((await board()).notes.map((n) => n.id)).toEqual([id]);
    expect((await adminCall(`/api/admin/note/${id}`, { action: 'delete' })).status).toBe(204);
    expect(await count('note')).toBe(0);
  });

  it('Delete account deletes its notes', async () => {
    const alice = await signUp('alice');
    await noted(alice);
    expect((await ccall('DELETE', '/api/u/account', { authKey: AUTH_KEY }, { cookie: alice })).status).toBe(204);
    expect(await count('note')).toBe(0);
  });
});
