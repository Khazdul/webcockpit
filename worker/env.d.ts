// What `cloudflare:workers` exports for this Worker (`env`, `exports`):
// the bindings of wrangler.jsonc and the entry module. Written by hand
// (`wrangler types` would generate the same from the config); keep it in
// step with wrangler.jsonc when a binding is added. The router sees these
// through its own small interfaces (worker/runtime.ts).
declare namespace Cloudflare {
  interface GlobalProps {
    mainModule: typeof import('./index.ts');
  }
  interface Env {
    ASSETS: Fetcher;
    DB: D1Database;
    /** R2 `webcockpit` / `webcockpit-staging` (eu): used from stage 63. */
    // FILES: R2Bucket; (from stage 63, once R2 is enabled; wrangler.jsonc)
    BEAT_LIMITER: RateLimit;
    FLAG_STATS: boolean;
    ACCESS_TEAM_DOMAIN: string;
    ACCESS_AUD: string;
    /** A secret, set in the dashboard. */
    ADMIN_EMAILS?: string;
    NOINDEX?: boolean;
    /** worker/test only: the migrations, read by vitest.config.ts. */
    TEST_MIGRATIONS?: import('cloudflare:test').D1Migration[];
  }
}
