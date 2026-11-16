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
    /** R2 `webcockpit` / `webcockpit-staging` (eu): the run bodies (stage 63). */
    FILES: R2Bucket;
    BEAT_LIMITER: RateLimit;
    FLAG_STATS: boolean;
    ACCESS_TEAM_DOMAIN: string;
    ACCESS_AUD: string;
    /** A secret, set in the dashboard. */
    ADMIN_EMAILS?: string;
    NOINDEX?: boolean;
    FLAG_ACCOUNTS: boolean;
    FLAG_SYNC: boolean;
    FLAG_RUNS: boolean;
    FLAG_SHARE: boolean;
    FLAG_GALLERY: boolean;
    FLAG_RUNES: boolean;
    /** The default run storage per account, bytes; unset: DEFAULT_ACCOUNT_LIMITS.runBytes. */
    RUN_BYTES_LIMIT?: number | string;
    API_LIMITER: RateLimit;
    AUTH_LIMITER: RateLimit;
    SEARCH_LIMITER: RateLimit;
    TURNSTILE_SITE_KEY: string;
    TURNSTILE_HOSTNAMES?: string;
    /** Secrets, set outside the repository (`wrangler secret put`, or the dashboard). */
    AUTH_PEPPER?: string;
    TURNSTILE_SECRET?: string;
    /** `send_email` (worker/mail.ts): the owner's mail on each report. */
    REPORT_MAIL?: SendEmail;
    /** A secret: the owner's address (a verified destination of Email Routing). */
    REPORT_MAIL_TO?: string;
    REPORT_MAIL_FROM?: string;
    SITE_ORIGIN?: string;
    /** worker/test only: the migrations, read by vitest.config.ts. */
    TEST_MIGRATIONS?: import('cloudflare:test').D1Migration[];
  }
}
