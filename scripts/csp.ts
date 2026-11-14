// The Content-Security-Policy of the static files (ADR 0144, "As built
// (stage 60): the CSP"). The policy itself is written in `public/_headers`;
// this module holds what a build does to it:
//
//   1. `fillCspHashes`: the inline scripts of the built pages change with
//      every build (the first paint carries the hashed file names), so
//      `_headers` names them with a placeholder (`CSP_SCRIPT_HASHES`) that
//      `vite build` replaces with their SHA-256 hashes (vite.config.ts
//      `cspHashesPlugin`). No `'unsafe-inline'` for scripts.
//   2. `enforceCsp`: the switch from report-only to enforced, per target
//      (`CSP_ENFORCED`), applied by `npm run build:site`.
import { createHash } from 'node:crypto';

/** The placeholder in `public/_headers` for the hashes of the pages' inline scripts. */
export const CSP_SCRIPT_HASHES = "'sha256-INLINE-SCRIPTS'";

/** The header the policy is sent in while it only reports, and when it is enforced. */
export const CSP_REPORT_ONLY = 'Content-Security-Policy-Report-Only';
export const CSP_ENFORCE = 'Content-Security-Policy';

export type CspTarget = 'production' | 'staging';

/**
 * THE SWITCH. `false`: the full policy is sent as
 * `Content-Security-Policy-Report-Only` (nothing is blocked; the browser
 * only says what would be) beside the enforced `frame-ancestors 'none'`.
 * `true`: `npm run build:site` for that target sends it as
 * `Content-Security-Policy`, enforced, as the only policy.
 * Order: staging first, the CSP walk (tests/e2e-prod/csp.spec.ts) and the
 * account pages by hand there, then production.
 */
export const CSP_ENFORCED: Record<CspTarget, boolean> = {
  staging: true,
  production: false,
};

/** `'sha256-…'` of every inline `<script>` (no `src`) in `html`, in document order, without repeats. */
export function inlineScriptHashes(html: string): string[] {
  const out: string[] = [];
  for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)) {
    if (/\bsrc\s*=/i.test(m[1]!)) continue;
    // The browser hashes the element's text exactly as it stands in the file (UTF-8).
    const hash = `'sha256-${createHash('sha256').update(m[2]!, 'utf8').digest('base64')}'`;
    if (!out.includes(hash)) out.push(hash);
  }
  return out;
}

/**
 * `headers` (a `_headers` file) with the placeholder replaced by the hashes
 * of the inline scripts of `pages` (the built HTML files). Throws when the
 * placeholder is missing: a policy without the hashes would block the
 * first paint once it is enforced.
 */
export function fillCspHashes(headers: string, pages: string[]): string {
  if (!headers.includes(CSP_SCRIPT_HASHES)) throw new Error(`_headers: no ${CSP_SCRIPT_HASHES} to replace`);
  const hashes: string[] = [];
  for (const html of pages) for (const h of inlineScriptHashes(html)) if (!hashes.includes(h)) hashes.push(h);
  // No inline script at all: the placeholder goes, with the space before it.
  return hashes.length ? headers.replaceAll(CSP_SCRIPT_HASHES, hashes.join(' ')) : headers.replaceAll(` ${CSP_SCRIPT_HASHES}`, '');
}

/** The value of the report-only policy in `headers`, or null. */
export function reportOnlyPolicy(headers: string): string | null {
  const m = new RegExp(`^[ \\t]+${CSP_REPORT_ONLY}:[ \\t]*(.+)$`, 'm').exec(headers);
  return m ? m[1]!.trim() : null;
}

/**
 * `headers` with the report-only policy enforced: its line becomes
 * `Content-Security-Policy`, and the earlier enforced line of the same
 * rule (`frame-ancestors 'none'` alone) goes, since the full policy has
 * that directive and two lines of one name would be joined with a comma.
 * Throws when there is no report-only line, or when the full policy has no
 * `frame-ancestors`.
 */
export function enforceCsp(headers: string): string {
  const policy = reportOnlyPolicy(headers);
  if (!policy) throw new Error(`_headers: no ${CSP_REPORT_ONLY} line to enforce`);
  if (!/(^|;)\s*frame-ancestors\s/.test(policy)) throw new Error('_headers: the policy has no frame-ancestors');
  const lines = headers.split('\n').filter((l) => !new RegExp(`^[ \\t]+${CSP_ENFORCE}:`).test(l));
  return lines.map((l) => l.replace(new RegExp(`^([ \\t]+)${CSP_REPORT_ONLY}:`), `$1${CSP_ENFORCE}:`)).join('\n');
}
