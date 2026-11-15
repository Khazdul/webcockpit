// Comments (stage 65, ADR 0155 "Comments", "The text rules for free
// public text", "Reports, hiding and the admin"): writing, reading pages,
// removing, the limits under parallel requests, the text rules, reports
// that hide, the admin's queue and actions, and Delete account.
import { beforeEach, describe, expect, it } from 'vitest';
import type { AdminLogEntry, AdminReports, CommentPage, PubMeta } from '../../shared/cloud/api.ts';
import { count, db, emptyTables } from './helpers.ts';
import { AUTH_KEY, setLimits, oldSignUp, signUp } from './share-helpers.ts';
import { DAY, NOW, ccall, cenvOf, comment, commented, list, ok } from './community-helpers.ts';
import { adminCall } from './admin-call.ts';

beforeEach(async () => {
  await emptyTables();
});

const cp = String.fromCodePoint;
const pageOf = (id: string, q = ''): Promise<CommentPage> => ccall('GET', `/api/pub/${id}/comments${q}`).then((r) => ok<CommentPage>(r));
const countOf = async (id: string): Promise<number> => (await db.prepare('SELECT comment_count AS n FROM publication WHERE id = ?1').bind(id).first<{ n: number }>())!.n;
const report = (cookie: string, target: string, kind = 'comment'): Promise<Response> => ccall('POST', '/api/u/report', { kind, target, reason: 'harassment' }, { cookie });

describe('comments', () => {
  it('POST answers the comment; GET pages oldest first, the last page by default; the meta counts them', async () => {
    const alice = await signUp('alice');
    const bob = await signUp('bob');
    const id = await list(alice);
    const res = await comment(bob, id, 'Two orcs!\nWell played.');
    const { comment: c } = await ok<{ comment: { id: string; writer: string; text: string; created: number } }>(res);
    expect(c).toEqual({ id: expect.stringMatching(/^[A-Za-z0-9]{12}$/), writer: 'bob', text: 'Two orcs!\nWell played.', created: NOW });
    // One's own run is allowed.
    await commented(alice, id, 'Thanks.', { now: NOW + 1 });
    expect(await pageOf(id)).toEqual({
      comments: [
        { id: c.id, writer: 'bob', text: 'Two orcs!\nWell played.', created: NOW },
        { id: expect.any(String), writer: 'alice', text: 'Thanks.', created: NOW + 1 },
      ],
      page: 1,
      pages: 1,
      total: 2,
    });
    expect((await ok<PubMeta>(await ccall('GET', `/api/pub/${id}`))).comments).toBe(2);
    await setLimits('bob', { commentsPerHour: 1000 });
    for (let i = 0; i < 60; i++) await commented(bob, id, `c${i}`, { now: NOW + 10 + i });
    const last = await pageOf(id);
    expect(last.page).toBe(2);
    expect(last.pages).toBe(2);
    expect(last.total).toBe(62);
    expect(last.comments.map((x) => x.text)).toEqual(Array.from({ length: 12 }, (_, i) => `c${48 + i}`));
    expect((await pageOf(id, '?page=1')).comments).toHaveLength(50);
    expect((await pageOf(id, '?page=3')).comments).toEqual([]);
    for (const q of ['?page=0', '?page=x', '?page=-1']) expect((await ccall('GET', `/api/pub/${id}/comments${q}`)).status).toBe(400);
  });

  it('refuses a hidden or unknown run, a suspended account, bad bodies, and the flag off', async () => {
    const alice = await signUp('alice');
    const bob = await signUp('bob');
    const id = await list(alice);
    expect((await comment(bob, 'AAAAAAAAAAAA', 'x')).status).toBe(404);
    for (const b of [{}, { text: 1 }, { text: 'x', more: 1 }]) expect((await ccall('POST', `/api/u/pub/${id}/comments`, b, { cookie: bob })).status).toBe(400);
    await db.prepare("UPDATE publication SET state = 'hidden' WHERE id = ?1").bind(id).run();
    expect((await comment(bob, id, 'x')).status).toBe(404);
    expect((await ccall('GET', `/api/pub/${id}/comments`)).status).toBe(451);
    await db.prepare("UPDATE publication SET state = 'active' WHERE id = ?1").bind(id).run();
    await db.prepare("UPDATE account SET state = 'suspended' WHERE name_key = 'bob'").run();
    expect((await comment(bob, id, 'x')).status).toBe(403);
    await db.prepare("UPDATE account SET state = 'active' WHERE name_key = 'bob'").run();
    const off = cenvOf({ FLAG_GALLERY: false });
    expect((await comment(bob, id, 'x', { env: off })).status).toBe(404);
    expect((await ccall('DELETE', '/api/u/comments/AAAAAAAAAAAA', undefined, { cookie: bob, env: off })).status).toBe(404);
    expect(await count('comment')).toBe(0);
  });

  it('the text rules: 400 bad_text for invisible and smuggling characters, tags, bidi, Zalgo towers, too many lines, untrimmed or long text', async () => {
    const alice = await signUp('alice');
    const bob = await signUp('bob');
    const id = await list(alice);
    await setLimits('bob', { commentsPerHour: 1000 });
    const bad = [
      '',
      ' padded',
      'padded ',
      `a${cp(0x200b)}b`,
      `a${cp(0x00ad)}b`,
      `a${cp(0xfeff)}b`,
      `a${cp(0x2060)}b`,
      `a${cp(0x3164)}b`,
      `a${cp(0x061c)}b`,
      `a${cp(0x2028)}b`,
      `hi${cp(0xe0068)}${cp(0xe0069)}`,
      `a${cp(0x202e)}b`,
      `a${cp(0x2066)}b`,
      `a\r\nb`,
      `a\tb`,
      `a${cp(0x0007)}`,
      `e${cp(0x0301)}${cp(0x0302)}${cp(0x0303)}${cp(0x0304)}`,
      `e${cp(0x0301)}`, // not NFC (NFC is the precomposed letter)
      'x'.repeat(1001),
      Array.from({ length: 22 }, () => 'l').join('\n'),
      `a${String.fromCharCode(0xd800)}b`,
    ];
    for (const text of bad) {
      const res = await comment(bob, id, text);
      expect(res.status, JSON.stringify(text)).toBe(400);
      expect(await res.json(), JSON.stringify(text)).toEqual({ error: 'bad_text' });
    }
    const good = [
      'x'.repeat(1000),
      Array.from({ length: 21 }, () => 'l').join('\n'),
      `x${cp(0x0301)}${cp(0x0302)}${cp(0x0303)}`,
      `family ${cp(0x1f468)}${cp(0x200d)}${cp(0x1f469)}${cp(0x200d)}${cp(0x1f467)}`,
      `heart ${cp(0x2764)}${cp(0xfe0f)}`,
      'Å fight at the ford, ∑ and ü',
      'https://example.com is plain text',
    ];
    for (const text of good) expect((await comment(bob, id, text)).status, JSON.stringify(text)).toBe(200);
  });

  it('holds commentsPerHour in the statement under parallel posts; removed ones still count for the hour', async () => {
    const alice = await signUp('alice');
    const bob = await signUp('bob');
    const id = await list(alice);
    await setLimits('bob', { commentsPerHour: 4 });
    const answers = await Promise.all(Array.from({ length: 9 }, (_, i) => comment(bob, id, `c${i}`)));
    expect(answers.map((r) => r.status).sort()).toEqual([200, 200, 200, 200, 429, 429, 429, 429, 429]);
    expect(await countOf(id)).toBe(4);
    const first = (await pageOf(id)).comments[0]!.id;
    expect((await ccall('DELETE', `/api/u/comments/${first}`, undefined, { cookie: bob })).status).toBe(204);
    expect((await comment(bob, id, 'again')).status).toBe(429);
    expect((await comment(bob, id, 'later', { now: NOW + 3_600_001 })).status).toBe(200);
  });

  it('holds 1 000 visible comments per run (409 full) under parallel posts', async () => {
    const alice = await signUp('alice');
    const id = await list(alice);
    await db.prepare('UPDATE publication SET comment_count = 998 WHERE id = ?1').bind(id).run();
    const writers: string[] = [];
    for (let i = 0; i < 5; i++) writers.push(await signUp(`writer${i}`));
    const answers = await Promise.all(writers.map((w) => comment(w, id, 'me too')));
    expect(answers.map((r) => r.status).sort()).toEqual([200, 200, 409, 409, 409]);
    expect(await (answers.find((r) => r.status === 409) as Response).json()).toEqual({ error: 'full' });
    expect(await countOf(id)).toBe(1000);
  });

  it('DELETE: the writer or the run’s sender; the text goes at once, the count follows; others get 404; the cron deletes the row after an hour', async () => {
    const alice = await signUp('alice');
    const bob = await signUp('bob');
    const carol = await signUp('carol');
    const id = await list(alice);
    const c1 = await commented(bob, id, 'one');
    const c2 = await commented(bob, id, 'two');
    expect((await ccall('DELETE', `/api/u/comments/${c1}`, undefined, { cookie: carol })).status).toBe(404);
    expect((await ccall('DELETE', `/api/u/comments/${c1}`, undefined, { cookie: bob })).status).toBe(204);
    expect((await ccall('DELETE', `/api/u/comments/${c1}`, undefined, { cookie: bob })).status).toBe(204);
    expect((await ccall('DELETE', `/api/u/comments/${c2}`, undefined, { cookie: alice })).status).toBe(204);
    expect(await countOf(id)).toBe(0);
    expect((await pageOf(id)).comments).toEqual([]);
    expect((await db.prepare("SELECT COUNT(*) AS n FROM comment WHERE text <> ''").first<{ n: number }>())!.n).toBe(0);
    const { runCron, DAILY_CRON } = await import('../stats.ts');
    await runCron(cenvOf({}), DAILY_CRON, NOW + 30 * 60_000);
    expect(await count('comment')).toBe(2);
    await runCron(cenvOf({}), DAILY_CRON, NOW + 2 * 3_600_000);
    expect(await count('comment')).toBe(0);
  });

  it('a removed run takes its comments with it', async () => {
    const alice = await signUp('alice');
    const bob = await signUp('bob');
    const id = await list(alice);
    const c = await commented(bob, id);
    await report(alice, c);
    expect((await ccall('DELETE', `/api/u/pub/${id}`, undefined, { cookie: alice })).status).toBe(204);
    expect(await count('comment')).toBe(0);
    expect((await db.prepare('SELECT handled FROM report').first<{ handled: number }>())!.handled).toBe(NOW);
  });

  it('Delete account deletes the account’s comments and the counts follow', async () => {
    const alice = await signUp('alice');
    const bob = await signUp('bob');
    const id = await list(alice);
    await commented(bob, id, 'one');
    await commented(bob, id, 'two');
    await commented(alice, id, 'mine');
    expect((await ccall('DELETE', '/api/u/account', { authKey: AUTH_KEY }, { cookie: bob })).status).toBe(204);
    expect(await countOf(id)).toBe(1);
    expect(await count('comment')).toBe(1);
  });
});

describe('reports of comments and the admin', () => {
  async function setup(): Promise<{ alice: string; bob: string; id: string; c: string; reporters: string[] }> {
    const alice = await signUp('alice');
    const bob = await signUp('bob');
    const id = await list(alice, { title: 'Ford' });
    const c = await commented(bob, id, 'You are a bad player.');
    const reporters: string[] = [];
    for (let i = 0; i < 6; i++) reporters.push(await oldSignUp(`reporter${i}`));
    return { alice, bob, id, c, reporters };
  }

  it('one’s own comment is 403 own; an unknown one 404; five accounts hide it and the run’s count follows', async () => {
    const { bob, id, c, reporters } = await setup();
    expect((await report(bob, c)).status).toBe(403);
    expect((await report(reporters[0]!, 'AAAAAAAAAAAA')).status).toBe(404);
    expect((await report(reporters[0]!, 'not-an-id')).status).toBe(404);
    const answers = await Promise.all(reporters.slice(0, 5).map((r) => report(r, c)));
    expect(answers.map((a) => a.status)).toEqual([204, 204, 204, 204, 204]);
    expect((await db.prepare('SELECT state, hidden_reason FROM comment WHERE id = ?1').bind(c).first())).toEqual({ state: 'hidden', hidden_reason: 'reports' });
    expect(await countOf(id)).toBe(0);
    expect((await pageOf(id)).comments).toEqual([]);
    // A sixth report does not count it down again.
    expect((await report(reporters[5]!, c)).status).toBe(204);
    expect(await countOf(id)).toBe(0);
  });

  it('suspended reporters do not count; a reviewed comment is never hidden by reports again', async () => {
    const { c, reporters } = await setup();
    for (const r of reporters.slice(0, 5)) await report(r, c);
    // reporter0 suspended after its report: four count, not five.
    await db.prepare("DELETE FROM report").run();
    await db.prepare("UPDATE comment SET state = 'active', hidden_reason = NULL").run();
    for (const r of reporters.slice(0, 4)) await report(r, c);
    await db.prepare("UPDATE account SET state = 'suspended' WHERE name_key = 'reporter0'").run();
    await report(reporters[4]!, c);
    expect((await db.prepare('SELECT state FROM comment WHERE id = ?1').bind(c).first())).toEqual({ state: 'active' });
    await db.prepare("DELETE FROM report").run();
    await db.prepare("UPDATE account SET state = 'active' WHERE name_key = 'reporter0'").run();
    await adminCall(`/api/admin/comment/${c}`, { action: 'dismiss' });
    for (const r of reporters.slice(0, 5)) await report(r, c);
    expect((await db.prepare('SELECT state FROM comment WHERE id = ?1').bind(c).first())).toEqual({ state: 'active' });
  });

  it('the queue lists the comment with its text, writer and run; Hide, Restore, Dismiss and Delete act, log and move the count', async () => {
    const { id, c, reporters } = await setup();
    for (const r of reporters.slice(0, 2)) await report(r, c);
    const q = await ok<AdminReports>(await adminCall('/api/admin/reports'));
    expect(q.items).toEqual([
      { kind: 'comment', target: c, title: 'Ford', sender: 'bob', state: 'active', reasons: { harassment: 2 }, reporters: 2, newest: NOW, content: 'You are a bad player.', pub: id },
    ]);
    expect((await adminCall(`/api/admin/comment/${c}`, { action: 'hide' })).status).toBe(204);
    expect(await countOf(id)).toBe(0);
    expect((await ok<AdminReports>(await adminCall('/api/admin/reports'))).items).toEqual([]);
    expect((await adminCall(`/api/admin/comment/${c}`, { action: 'restore', note: 'fine' })).status).toBe(204);
    expect(await countOf(id)).toBe(1);
    expect((await adminCall(`/api/admin/comment/${c}`, { action: 'dismiss' })).status).toBe(204);
    expect((await adminCall(`/api/admin/comment/${c}`, { action: 'delete' })).status).toBe(204);
    expect(await countOf(id)).toBe(0);
    expect(await count('comment')).toBe(0);
    expect((await adminCall(`/api/admin/comment/${c}`, { action: 'delete' })).status).toBe(404);
    expect((await adminCall(`/api/admin/comment/${c}`, { action: 'nope' })).status).toBe(400);
    const log = await ok<{ entries: AdminLogEntry[] }>(await adminCall('/api/admin/log'));
    expect(log.entries.map((e) => [e.action, e.target, e.note])).toEqual([
      ['comment.delete', c, ''],
      ['comment.dismiss', c, ''],
      ['comment.restore', c, 'fine'],
      ['comment.hide', c, ''],
    ]);
  });

  it('Delete account handles the reports on its comments', async () => {
    const { bob, c, reporters } = await setup();
    await report(reporters[0]!, c);
    expect((await ccall('DELETE', '/api/u/account', { authKey: AUTH_KEY }, { cookie: bob })).status).toBe(204);
    expect((await db.prepare('SELECT handled FROM report').first<{ handled: number }>())!.handled).toBe(NOW);
    void DAY;
  });
});
