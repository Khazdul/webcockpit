// Stage 66 (ADR 0157 "The audit log cannot be changed afterwards"): the
// database refuses UPDATE, DELETE and an insert out of line; a row changed
// or removed with the triggers dropped (as from the D1 console) is found
// by the chain's check; two actions racing both land in one line; and no
// Worker source updates or deletes an entry.
import { beforeEach, describe, expect, it } from 'vitest';
import type { AdminLogPage } from '../../shared/cloud/api.ts';
import { RETRIES, macOf, sealedBatch } from '../auditlog.ts';
import type { D1 } from '../runtime.ts';
import { count, db, emptyTables, realEnv, withoutLogTriggers } from './helpers.ts';
import { admin, adminJson, forgetAccessKeys } from './access-helpers.ts';

// Vite's import.meta.glob, which the worker's tsconfig has no types for (vite/client).
declare global {
  interface ImportMeta {
    glob(pattern: string | string[], options: { query: string; import: string; eager: true }): Record<string, unknown>;
  }
}

const line = (i: number) => ({ ts: 1000 + i, who: 'w'.repeat(22), action: 'pub.hide', target: `t${i}`, note: i % 2 ? 'a | note' : '' });

async function seal(n: number): Promise<void> {
  for (let i = 0; i < n; i++) await sealedBatch(realEnv, db, line(i), (e) => [e]);
}

const page = (q = ''): Promise<AdminLogPage> => adminJson<AdminLogPage>(`/api/admin/log${q}`);

async function fails(sql: string, ...binds: unknown[]): Promise<string> {
  try {
    await db.prepare(sql).bind(...binds).run();
  } catch (e) {
    return String(e instanceof Error ? e.message : e);
  }
  return 'did not fail';
}

beforeEach(async () => {
  await emptyTables();
  forgetAccessKeys();
});

describe('the database refuses a change', () => {
  it('a direct UPDATE or DELETE fails, alone or in a batch (which rolls back whole)', async () => {
    await seal(3);
    expect(await fails("UPDATE admin_log SET note = 'changed'")).toMatch(/admin_log_append_only/);
    expect(await fails('DELETE FROM admin_log WHERE id = 2')).toMatch(/admin_log_append_only/);
    expect(await fails("REPLACE INTO admin_log (id, ts, who, action, target, note) VALUES (1, 1, 'w', 'x', 'y', '')")).toMatch(/admin_log/);
    await expect(db.batch([db.prepare("INSERT INTO flag (name, value) VALUES ('stats', 0)"), db.prepare('DELETE FROM admin_log')])).rejects.toThrow(/admin_log_append_only/);
    expect(await count('flag')).toBe(0);
    expect(await count('admin_log')).toBe(3);
    expect((await page()).chain).toMatchObject({ state: 'intact', sealed: 3, unsealed: 0, brokenAt: null });
  });

  it('an insert out of line fails: a wrong prev, no prev, or no seal once the chain has begun', async () => {
    await seal(2);
    const headMac = (await db.prepare('SELECT mac FROM admin_log ORDER BY id DESC LIMIT 1').first<{ mac: string }>())?.mac;
    const ins = "INSERT INTO admin_log (ts, who, action, target, note, prev, mac) VALUES (5, 'w', 'pub.hide', 'x', '', ?1, ?2)";
    expect(await fails(ins, 'not-the-head', 'm')).toMatch(/admin_log_chain/);
    expect(await fails(ins, null, 'm')).toMatch(/admin_log_chain/);
    expect(await fails(ins, headMac, null)).toMatch(/admin_log_chain/);
    // As the 0.14.0 Worker wrote (no prev, no mac): refused once the chain has begun.
    expect(await fails("INSERT INTO admin_log (ts, who, action, target, note) VALUES (5, 'w', 'pub.hide', 'x', '')")).toMatch(/admin_log_chain/);
    expect(await count('admin_log')).toBe(2);
  });

  it('the 0.14.0 Worker’s inserts work until the first sealed entry, which starts the chain; those are "not sealed"', async () => {
    await db.prepare("INSERT INTO admin_log (ts, who, action, target, note) VALUES (1, 'oldwho', 'pub.hide', 'old1', '')").run();
    await db.prepare("INSERT INTO admin_log (ts, who, action, target, note) VALUES (2, 'oldwho', 'account.suspend', 'old2', '')").run();
    await seal(2);
    const p = await page();
    expect(p.chain).toMatchObject({ state: 'intact', sealed: 2, unsealed: 2, brokenAt: null });
    expect(p.entries.map((e) => [e.target, e.sealed])).toEqual([
      ['t1', true],
      ['t0', true],
      ['old2', false],
      ['old1', false],
    ]);
  });
});

describe('a change from the console is found', () => {
  it('a row changed with the triggers dropped is reported broken at its id', async () => {
    await seal(5);
    const ids = (await db.prepare('SELECT id FROM admin_log ORDER BY id').all<{ id: number }>()).results.map((r) => r.id);
    await withoutLogTriggers(async () => {
      await db.prepare("UPDATE admin_log SET note = 'nothing happened' WHERE id = ?1").bind(ids[2]).run();
    });
    expect((await page()).chain).toMatchObject({ state: 'broken', brokenAt: ids[2], sealed: 5 });
  });

  it('a row removed is reported at the next one; a row put in the middle with a forged seal too', async () => {
    await seal(5);
    const ids = (await db.prepare('SELECT id FROM admin_log ORDER BY id').all<{ id: number }>()).results.map((r) => r.id);
    await withoutLogTriggers(async () => {
      await db.prepare('DELETE FROM admin_log WHERE id = ?1').bind(ids[1]).run();
    });
    expect((await page()).chain).toMatchObject({ state: 'broken', brokenAt: ids[2] });

    await emptyTables();
    await seal(3);
    const rows = (await db.prepare('SELECT id, mac FROM admin_log ORDER BY id').all<{ id: number; mac: string }>()).results;
    // Someone without the pepper re-seals a changed row with another key: the seal does not match.
    await withoutLogTriggers(async () => {
      await db
        .prepare("UPDATE admin_log SET target = 'other', mac = ?2 WHERE id = ?1")
        .bind(rows[1]?.id, await macOf({ AUTH_PEPPER: 'another-pepper-0123456789' }, rows[0]?.mac ?? null, { ...line(1), target: 'other' }))
        .run();
    });
    expect((await page()).chain).toMatchObject({ state: 'broken', brokenAt: rows[1]?.id });
  });

  it('the head is the newest seal, shortened to 12', async () => {
    expect((await page()).chain).toEqual({ state: 'intact', sealed: 0, unsealed: 0, brokenAt: null, head: '' });
    await seal(2);
    const mac = (await db.prepare('SELECT mac FROM admin_log ORDER BY id DESC LIMIT 1').first<{ mac: string }>())?.mac ?? '';
    expect((await page()).chain.head).toBe(mac.slice(0, 12));
    expect(mac).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });
});

describe('racing actions', () => {
  it('a batch whose head moved rolls back whole and is tried again on the new head', async () => {
    await seal(1);
    let raced = 0;
    // A database whose next batch is preceded by another sealed action (as a second admin tab would).
    const racing = (times: number): D1 => ({
      prepare: (sql) => db.prepare(sql),
      batch: async (st) => {
        if (raced < times) {
          raced++;
          await sealedBatch(realEnv, db, line(100 + raced), (e) => [e]);
        }
        return db.batch(st);
      },
    });
    await sealedBatch(realEnv, racing(2), line(50), (e) => [db.prepare("INSERT INTO flag (name, value) VALUES ('stats', 0)"), e]);
    expect(await count('flag')).toBe(1);
    expect((await page()).chain).toMatchObject({ state: 'intact', sealed: 4 });
    // More races than tries: the error comes out, nothing of the action is written.
    raced = 0;
    await expect(sealedBatch(realEnv, racing(RETRIES + 1), line(60), (e) => [db.prepare("INSERT INTO flag (name, value) VALUES ('sync', 0)"), e])).rejects.toThrow(/admin_log_chain/);
    expect(await db.prepare("SELECT 1 FROM flag WHERE name = 'sync'").first()).toBeNull();
    expect((await page()).chain).toMatchObject({ state: 'intact', sealed: 4 + RETRIES + 1 });
  });

  it('every admin action through the router seals its entry (moderation, accounts, limits, flags)', async () => {
    const { signUp } = await import('./share-helpers.ts');
    await signUp('alice');
    expect((await admin('/api/admin/flags/stats', { method: 'PUT', body: { value: false } })).status).toBe(200);
    expect((await admin('/api/admin/account/alice', { body: { action: 'suspend' } })).status).toBe(204);
    expect((await admin('/api/admin/account/alice/limits', { method: 'PUT', body: { limits: { items: 5 } } })).status).toBe(200);
    expect((await admin('/api/admin/limits', { method: 'PUT', body: { defaults: { notesPerDay: 6 } } })).status).toBe(200);
    expect((await admin('/api/admin/account/alice', { body: { action: 'end-sessions' } })).status).toBe(204);
    expect((await admin('/api/admin/account/alice', { body: { action: 'delete', confirm: 'alice' } })).status).toBe(204);
    const p = await page();
    expect(p.entries.map((e) => [e.action, e.sealed])).toEqual([
      ['account.delete', true],
      ['account.end-sessions', true],
      ['limits.default', true],
      ['account.limits', true],
      ['account.suspend', true],
      ['flag.off', true],
    ]);
    expect(p.chain).toMatchObject({ state: 'intact', sealed: 6, unsealed: 0 });
  });
});

describe('the Worker’s source', () => {
  it('has no UPDATE, DELETE, REPLACE or DROP on admin_log (nor its triggers), outside the tests and migration 0007', () => {
    const sources = {
      ...import.meta.glob(['../**/*.ts', '!../test/**'], { query: '?raw', import: 'default', eager: true }),
      ...import.meta.glob('../migrations/*.sql', { query: '?raw', import: 'default', eager: true }),
    } as Record<string, string>;
    const files = Object.keys(sources);
    expect(files).toContain('../auditlog.ts');
    expect(files).toContain('../moderation.ts');
    expect(files).toContain('../deletion.ts');
    expect(files.some((f) => f.startsWith('../test/'))).toBe(false);
    const bad =
      /\b(UPDATE\s+(OR\s+\w+\s+)?admin_log|DELETE\s+FROM\s+admin_log|REPLACE\s+INTO\s+admin_log|INSERT\s+OR\s+REPLACE\s+INTO\s+admin_log|DROP\s+(TABLE|TRIGGER)\s+(IF\s+EXISTS\s+)?admin_log|ALTER\s+TABLE\s+admin_log\s+(RENAME|DROP))/i;
    for (const [file, text] of Object.entries(sources)) {
      // 0007 creates the triggers ("BEFORE UPDATE ON admin_log"), which the pattern does not match.
      expect(text.match(bad)?.[0] ?? null, file).toBeNull();
    }
    // Every insert into admin_log is the one in auditlog.ts.
    for (const [file, text] of Object.entries(sources)) {
      if (file.endsWith('.sql')) continue;
      const inserts = text.match(/INSERT\s+INTO\s+admin_log/gi) ?? [];
      expect(inserts.length, file).toBe(file === '../auditlog.ts' ? 1 : 0);
    }
  });
});
