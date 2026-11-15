// The owner's mail on reports (worker/mail.ts, ADR 0154 "As built ...
// mail on reports"), with a fake `send_email` binding and EmailMessage:
// one mail per report with its facts, safe headers, the hourly cap and
// the collected mail, and a report whose mail fails or is not configured.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MAIL_PER_HOUR, HOUR_MS, composeMail, encodeWords, headerSafe } from '../mail.ts';
import { handle } from '../router.ts';
import type { Deps, Env } from '../runtime.ts';
import { SAMPLE_CRON, runCron } from '../stats.ts';
import { db, emptyTables } from './helpers.ts';
import { NOW, ORIGIN, envOf, publish, signUp, siteverify } from './share-helpers.ts';
import { commented, list, noted } from './community-helpers.ts';

const TO = 'owner@example.net';

interface Sent {
  from: string;
  to: string;
  raw: string;
}

/** A fake binding: what it was sent, or it throws / hangs. */
function binding(mode: 'ok' | 'fail' | 'hang' = 'ok'): { sent: Sent[]; send(m: unknown): Promise<unknown> } {
  const sent: Sent[] = [];
  return {
    sent,
    async send(m) {
      if (mode === 'fail') throw Object.assign(new Error('nope'), { code: 'E_SENDER_NOT_VERIFIED' });
      if (mode === 'hang') return new Promise(() => undefined);
      sent.push(m as Sent);
      return { messageId: 'x' };
    },
  };
}

let pending: Promise<unknown>[] = [];

function depsAt(now: number, mail = true): Deps {
  return {
    now: () => now,
    fetch: siteverify,
    waitUntil: (p) => pending.push(p),
    ...(mail ? { emailMessage: (from: string, to: string, raw: string): Sent => ({ from, to, raw }) } : {}),
  };
}

async function settle(): Promise<void> {
  while (pending.length) {
    const p = pending;
    pending = [];
    await Promise.all(p);
  }
}

function mailEnv(b: ReturnType<typeof binding> | undefined, over: Partial<Record<keyof Env, unknown>> = {}): Env {
  return envOf({ REPORT_MAIL: b, REPORT_MAIL_TO: TO, ...over });
}

function report(cookie: string, id: string, env: Env, o: { now?: number; reason?: string; text?: string; mail?: boolean } = {}): Promise<Response> {
  const body: Record<string, unknown> = { kind: 'run', target: id, reason: o.reason ?? 'harassment' };
  if (o.text !== undefined) body.text = o.text;
  const req = new Request(`${ORIGIN}/api/u/report`, {
    method: 'POST',
    headers: { cookie, 'x-wc': '1', origin: ORIGIN, 'cf-connecting-ip': '203.0.113.7' },
    body: JSON.stringify(body),
  });
  return handle(req, env, depsAt(o.now ?? NOW, o.mail !== false));
}

/** The headers (unfolded) and the decoded body of a raw message. */
function parse(raw: string): { headers: Map<string, string>; lines: string[]; body: string } {
  const [head = '', b64 = ''] = raw.split('\r\n\r\n');
  const lines = head.split('\r\n');
  const headers = new Map<string, string>();
  for (const l of head.replace(/\r\n /g, ' ').split('\r\n')) {
    const i = l.indexOf(':');
    headers.set(l.slice(0, i).toLowerCase(), l.slice(i + 1).trim());
  }
  const bin = atob(b64.replace(/\r\n/g, ''));
  const body = new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
  return { headers, lines, body };
}

/** RFC 2047 words as text. */
function decodeWords(s: string): string {
  const words = [...s.matchAll(/=\?UTF-8\?B\?([^?]*)\?=/g)].map((m) => m[1] as string);
  if (!words.length) return s;
  const bytes = words.flatMap((w) => [...atob(w)].map((c) => c.charCodeAt(0)));
  return new TextDecoder().decode(Uint8Array.from(bytes));
}

beforeEach(async () => {
  await emptyTables();
  pending = [];
});

afterEach(() => {
  vi.restoreAllMocks();
});

async function reporters(n: number): Promise<string[]> {
  const out: string[] = [];
  for (let i = 0; i < n; i++) out.push(await signUp(`reporter${i}`, { rules: false }));
  return out;
}

describe('the mail of a report', () => {
  it('one mail per report, to the secret, from reports@, with the run, its sender, the reason, the text, the counts and the links', async () => {
    const alice = await signUp('alice');
    const [bob, carol] = await reporters(2);
    const id = await publish(alice);
    const b = binding();
    const env = mailEnv(b);
    expect((await report(bob as string, id, env, { reason: 'real_life', text: 'Names a\nreal person.' })).status).toBe(204);
    await settle();
    expect(b.sent).toHaveLength(1);
    const m = b.sent[0] as Sent;
    expect(m.from).toBe('reports@mumecockpit.com');
    expect(m.to).toBe(TO);
    const { headers, body } = parse(m.raw);
    expect(headers.get('from')).toBe('WebCockpit <reports@mumecockpit.com>');
    expect(headers.get('to')).toBe(`<${TO}>`);
    expect(headers.get('subject')).toBe('WebCockpit report: Orc fight at the ford');
    expect(headers.get('content-type')).toBe('text/plain; charset=utf-8');
    expect(headers.get('content-transfer-encoding')).toBe('base64');
    expect(headers.get('date')).toBe('Sun, 15 Nov 2026 12:00:00 +0000');
    expect(headers.get('message-id')).toMatch(/^<[0-9a-f]{32}@mumecockpit\.com>$/);
    expect(body).toContain("The run's title:\r\n> Orc fight at the ford");
    expect(body).toContain(`Id:       ${id}`);
    expect(body).toContain('Sender:   alice');
    expect(body).toContain('Reason:   real_life');
    expect(body).toContain('Reported: by 1 account in all; 1 open');
    expect(body).toContain('Hidden:   no');
    expect(body).toContain('> Names a\r\n> real person.');
    expect(body).toContain(`Admin:    ${ORIGIN}/admin`);
    expect(body).toContain(`Run:      ${ORIGIN}/r/${id}?admin`);

    // The second report: a second mail with the new count.
    expect((await report(carol as string, id, env)).status).toBe(204);
    await settle();
    expect(b.sent).toHaveLength(2);
    const second = parse((b.sent[1] as Sent).raw).body;
    expect(second).toContain('Reported: by 2 accounts in all; 2 open');
    expect(second).toContain("The reporter's text:\r\n(none)");
    // A refused report (409) sends nothing.
    expect((await report(carol as string, id, env)).status).toBe(409);
    await settle();
    expect(b.sent).toHaveLength(2);
  });

  it('the fifth says hidden by reports; on staging the subject says so and the links use SITE_ORIGIN', async () => {
    const alice = await signUp('alice');
    const r = await reporters(5);
    const id = await publish(alice);
    const b = binding();
    const env = mailEnv(b, { NOINDEX: true, SITE_ORIGIN: 'https://staging.example.test/' });
    for (const cookie of r) expect((await report(cookie, id, env)).status).toBe(204);
    await settle();
    expect(b.sent).toHaveLength(5);
    const { headers, body } = parse((b.sent[4] as Sent).raw);
    expect(headers.get('subject')).toBe('[staging] WebCockpit report: Orc fight at the ford');
    expect(body).toContain('Reported: by 5 accounts in all; 5 open');
    expect(body).toContain('Hidden:   yes (by reports)');
    expect(body).toContain('Admin:    https://staging.example.test/admin');
    expect(body).toContain(`https://staging.example.test/r/${id}?admin`);
    expect(parse((b.sent[3] as Sent).raw).body).toContain('Hidden:   no');
  });

  it('header injection in a title, a name or the text stays out of the headers', async () => {
    const alice = await signUp('alice');
    const [bob] = await reporters(1);
    const id = await publish(alice);
    // Rows the API would refuse, written straight to the database.
    await db.prepare('UPDATE publication SET title = ?1 WHERE id = ?2').bind('Hi\r\nBcc: evil@example.com\r\n\r\nbody\u2028X-Evil: 1', id).run();
    await db.prepare("UPDATE account SET name = ?1 WHERE name_key = 'alice'").bind('al\r\nBcc: evil@example.com').run();
    const b = binding();
    expect((await report(bob as string, id, mailEnv(b), { text: 'Look\nBcc: evil@example.com\n\nTo: x@y.z' })).status).toBe(204);
    await settle();
    const raw = (b.sent[0] as Sent).raw;
    const { headers, lines, body } = parse(raw);
    for (const l of lines) expect(l, l).toMatch(/^(From|To|Subject|Date|Message-ID|MIME-Version|Content-Type|Content-Transfer-Encoding|Auto-Submitted): | =\?UTF-8\?B\?/);
    expect(headers.has('bcc')).toBe(false);
    expect(headers.has('x-evil')).toBe(false);
    expect(decodeWords(headers.get('subject') as string)).toBe('WebCockpit report: Hi Bcc: evil@example.com body X-Evil: 1');
    // The user's text is only in the base64 body.
    expect(raw.split('\r\n\r\n')[1]).toMatch(/^[A-Za-z0-9+/=\r\n]+$/);
    expect(body).toContain('> Look\r\n> Bcc: evil@example.com');
  });

  it('a failing or hanging binding never fails or holds the report; the report is stored', async () => {
    const alice = await signUp('alice');
    const [bob, carol] = await reporters(2);
    const id = await publish(alice);
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect((await report(bob as string, id, mailEnv(binding('fail')))).status).toBe(204);
    await settle();
    expect(error).toHaveBeenCalledWith('report mail: send failed (E_SENDER_NOT_VERIFIED)');
    // A send that never ends: the answer is still there (its work is left to waitUntil).
    expect((await report(carol as string, id, mailEnv(binding('hang')))).status).toBe(204);
    pending = [];
    expect((await db.prepare('SELECT COUNT(*) AS n FROM report').first<{ n: number }>())?.n).toBe(2);
  });

  it('no binding, no secret or no EmailMessage: no mail, one log line', async () => {
    const alice = await signUp('alice');
    const r = await reporters(3);
    const id = await publish(alice);
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const b = binding();
    expect((await report(r[0] as string, id, mailEnv(undefined))).status).toBe(204);
    expect((await report(r[1] as string, id, mailEnv(b, { REPORT_MAIL_TO: undefined }))).status).toBe(204);
    expect((await report(r[2] as string, id, mailEnv(b), { mail: false })).status).toBe(204);
    await settle();
    expect(b.sent).toHaveLength(0);
    expect(log.mock.calls.filter((c) => String(c[0]).startsWith('report mail:'))).toHaveLength(3);
    expect(log).toHaveBeenCalledWith('report mail: skipped (REPORT_MAIL or REPORT_MAIL_TO not configured)');
  });
});

describe('the hourly cap', () => {
  const HOUR = Math.floor(NOW / HOUR_MS) * HOUR_MS;

  it(`${MAIL_PER_HOUR} mails an hour; past it one collected mail at the first report of a new hour`, async () => {
    const alice = await signUp('alice');
    const r = await reporters(4);
    const id = await publish(alice);
    const b = binding();
    const env = mailEnv(b);
    // 19 mails of this hour already sent.
    await db.prepare("INSERT INTO attempt (key, start, count, until) VALUES ('mail|sent', ?1, ?2, 0)").bind(HOUR, MAIL_PER_HOUR - 1).run();
    for (const cookie of r.slice(0, 3)) expect((await report(cookie, id, env)).status).toBe(204);
    await settle();
    expect(b.sent).toHaveLength(1);
    expect(await db.prepare("SELECT count FROM attempt WHERE key = ?1").bind(`mail|over|${HOUR}`).first()).toEqual({ count: 2 });

    // The next hour: the collected mail, then this report's own.
    expect((await report(r[3] as string, id, env, { now: HOUR + HOUR_MS + 60_000 })).status).toBe(204);
    await settle();
    expect(b.sent).toHaveLength(3);
    const collected = parse((b.sent[1] as Sent).raw);
    expect(collected.headers.get('subject')).toBe('WebCockpit: 2 more reports');
    expect(collected.body).toContain('2026-11-15 12:00–13:00 UTC: 2');
    expect(collected.body).toContain(`Admin: ${ORIGIN}/admin`);
    expect(parse((b.sent[2] as Sent).raw).headers.get('subject')).toBe('WebCockpit report: Orc fight at the ford');
    expect(await db.prepare("SELECT COUNT(*) AS n FROM attempt WHERE key LIKE 'mail|over|%'").first()).toEqual({ n: 0 });
  });

  it('the 5-minute cron sends the collected mail once, after the hour has ended', async () => {
    const alice = await signUp('alice');
    const r = await reporters(2);
    const id = await publish(alice);
    const b = binding();
    const env = mailEnv(b, { NOINDEX: true, SITE_ORIGIN: 'https://staging.example.test' });
    await db.prepare("INSERT INTO attempt (key, start, count, until) VALUES ('mail|sent', ?1, ?2, 0)").bind(HOUR, MAIL_PER_HOUR).run();
    for (const cookie of r) expect((await report(cookie, id, env)).status).toBe(204);
    await settle();
    expect(b.sent).toHaveLength(0);
    // Still the same hour: nothing.
    await runCron(env, SAMPLE_CRON, HOUR + HOUR_MS - 1, depsAt(HOUR + HOUR_MS - 1));
    expect(b.sent).toHaveLength(0);
    await runCron(env, SAMPLE_CRON, HOUR + HOUR_MS + 5 * 60_000, depsAt(HOUR + HOUR_MS + 5 * 60_000));
    expect(b.sent).toHaveLength(1);
    const { headers, body } = parse((b.sent[0] as Sent).raw);
    expect(headers.get('subject')).toBe('[staging] WebCockpit: 2 more reports');
    expect(body).toContain('Admin: https://staging.example.test/admin');
    await runCron(env, SAMPLE_CRON, HOUR + HOUR_MS + 10 * 60_000, depsAt(HOUR + HOUR_MS + 10 * 60_000));
    expect(b.sent).toHaveLength(1);
    // A cron without the EmailMessage (or the binding) sends nothing and does not fail.
    await runCron(envOf({}), SAMPLE_CRON, HOUR + 2 * HOUR_MS, depsAt(HOUR + 2 * HOUR_MS, false));
  });
});

describe('composeMail', () => {
  it('encodes a non-ASCII subject in RFC 2047 words, folded, and strips CR/LF from every header', () => {
    const subject = `Orc fight – åäö 🧌 ${'long '.repeat(30)}`;
    const raw = composeMail({ from: 'reports@mumecockpit.com', to: 'a@b.c\r\nBcc: x@y.z', subject, text: 'Hej\n', now: NOW });
    const { headers, lines } = parse(raw);
    expect(headers.get('to')).toBe('<a@b.c Bcc: x@y.z>');
    expect(headers.has('bcc')).toBe(false);
    for (const l of lines) expect(l.length).toBeLessThanOrEqual(78);
    expect(decodeWords(headers.get('subject') as string)).toBe(subject.trim());
    expect(encodeWords('plain =?x?= text')).toMatch(/^=\?UTF-8\?B\?/);
    expect(encodeWords('Plain ASCII')).toBe('Plain ASCII');
    expect(headerSafe('a\r\n\tb\u0000c\u2029d')).toBe('a b c d');
    expect(decodeWords('=?UTF-8?B?w6U=?=')).toBe('å');
  });
});

describe('the mail of a reported comment or note (stage 65)', () => {
  const env = (b: ReturnType<typeof binding>): Env => mailEnv(b, { FLAG_GALLERY: true, FLAG_RUNES: true });
  function reportItem(cookie: string, kind: string, target: string, e: Env, text?: string): Promise<Response> {
    const req = new Request(`${ORIGIN}/api/u/report`, {
      method: 'POST',
      headers: { cookie, 'x-wc': '1', origin: ORIGIN, 'cf-connecting-ip': '203.0.113.7' },
      body: JSON.stringify({ kind, target, reason: 'harassment', ...(text === undefined ? {} : { text }) }),
    });
    return handle(req, e, depsAt(NOW));
  }

  it('a comment: the subject names its run, the body has the kind, the text in full, the writer, the run and the links; nothing user-written reaches a header raw', async () => {
    const b = binding();
    const alice = await signUp('alice');
    const bob = await signUp('bob');
    const carol = await signUp('carol');
    const id = await list(alice, { title: 'Ford Ü' });
    const text = 'Line one\nBcc: victim@example.org\nSubject: hacked';
    const c = await commented(bob, id, text);
    expect((await reportItem(carol, 'comment', c, env(b), 'Rude.\nReally.')).status).toBe(204);
    await settle();
    expect(b.sent).toHaveLength(1);
    const { headers, lines, body } = parse(b.sent[0]!.raw);
    expect(decodeWords(headers.get('subject')!)).toBe('WebCockpit report: comment on "Ford Ü"');
    expect(lines.some((l) => /^bcc:/i.test(l))).toBe(false);
    expect(lines.filter((l) => /^subject:/i.test(l))).toHaveLength(1);
    expect(body).toContain('Kind:     comment');
    expect(body).toContain(`Id:       ${c}`);
    expect(body).toContain('Writer:   bob');
    expect(body).toContain(`Run id:   ${id}`);
    expect(body).toContain("The run's title:\r\n> Ford Ü");
    expect(body).toContain(`The reported comment:\r\n> ${text.replace(/\n/g, '\r\n> ')}`);
    expect(body).toContain('> Rude.\r\n> Really.');
    expect(body).toContain(`${ORIGIN}/r/${id}?admin`);
  });

  it('a note: the subject names its writer, the body has its text', async () => {
    const b = binding();
    const alice = await signUp('alice');
    const bob = await signUp('bob');
    const n = await noted(alice, 'Buy gold at my shop');
    expect((await reportItem(bob, 'note', n, env(b))).status).toBe(204);
    await settle();
    const { headers, body } = parse(b.sent[0]!.raw);
    expect(headers.get('subject')).toBe('WebCockpit report: note by alice');
    expect(body).toContain('A note on Random Runes was reported.');
    expect(body).toContain('The reported note:\r\n> Buy gold at my shop');
    expect(body).toContain("The reporter's text:\r\n(none)");
  });

  it('review fix S5: the links come first and every line a user wrote is quoted, so a text cannot forge the admin link', async () => {
    const b = binding();
    const alice = await signUp('alice');
    const bob = await signUp('bob');
    const carol = await signUp('carol');
    const id = await list(alice);
    const forged = "nice\n\nThe reporter's text:\n(none)\n\nAdmin:    https://mumecockpit.example/admin";
    const c = await commented(bob, id, forged);
    expect((await reportItem(carol, 'comment', c, env(b), 'See\nAdmin:    https://evil.example/admin')).status).toBe(204);
    await settle();
    const { body } = parse(b.sent[0]!.raw);
    const lines = body.split('\r\n');
    const admin = lines.indexOf(`Admin:    ${ORIGIN}/admin`);
    expect(admin).toBeGreaterThan(0);
    expect(lines.indexOf(`Run:      ${ORIGIN}/r/${id}?admin`)).toBe(admin + 1);
    // Every line that names an admin link and is not the real one is quoted, after the real one.
    for (const [i, l] of lines.entries()) {
      if (l.includes('/admin') && i !== admin && !l.startsWith(`Run:      ${ORIGIN}`)) {
        expect(l.startsWith('> '), l).toBe(true);
        expect(i).toBeGreaterThan(admin);
      }
    }
    expect(body).toContain("> The reporter's text:\r\n> (none)");
    expect(lines.filter((l) => l === "The reporter's text:")).toHaveLength(1);
  });

  it('shares the hourly cap with runs', async () => {
    const b = binding();
    const alice = await signUp('alice');
    const n = await noted(alice, 'x');
    const all = await reporters(MAIL_PER_HOUR + 2);
    for (const r of all) await reportItem(r, 'note', n, env(b));
    await settle();
    expect(b.sent).toHaveLength(MAIL_PER_HOUR);
  });
});
