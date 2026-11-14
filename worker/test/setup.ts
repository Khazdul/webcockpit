// Applies the D1 migrations (worker/migrations, read by vitest.config.ts)
// to the test database before each test file. applyD1Migrations skips
// what is already applied.
import { applyD1Migrations } from 'cloudflare:test';
import { env } from 'cloudflare:workers';

await applyD1Migrations(env.DB, env.TEST_MIGRATIONS ?? []);
