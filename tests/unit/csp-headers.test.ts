import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CSP_SCRIPT_HASHES, enforceCsp, fillCspHashes, inlineScriptHashes, reportOnlyPolicy } from '../../scripts/csp.ts';
import { applyHeaderRules, parseHeadersFile, serve } from '../../scripts/static-server.ts';

const HEADERS = readFileSync(new URL('../../public/_headers', import.meta.url), 'utf8');
const INDEX = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');

/** The directives of a policy: name → sources. */
function directives(policy: string): Record<string, string[]> {
  return Object.fromEntries(
    policy
      .split(';')
      .map((d) => d.trim().split(/\s+/))
      .filter((d) => d[0])
      .map(([name, ...sources]) => [name!, sources]),
  );
}

const headersOf = (text: string, path: string): Record<string, string> => applyHeaderRules(parseHeadersFile(text), path, {});

describe('the Content-Security-Policy of the static files (ADR 0144, stage 60)', () => {
  it('hashes inline scripts as a browser does, and leaves scripts with a src alone', () => {
    // The example of the CSP specification.
    expect(inlineScriptHashes("<script>alert('Hello, world.');</script>")).toEqual(["'sha256-qznLcsROx4GACP2dm0UCKCzCG+HiZ1guq6ZZDob/Tng='"]);
    const html = '<script type="module" src="/a.js"></script><script>\n  a();\n</script><SCRIPT>b()</SCRIPT><script>\n  a();\n</script>';
    const hashes = inlineScriptHashes(html);
    // Two different texts (whitespace is part of the text), the repeat once.
    expect(hashes).toHaveLength(2);
    expect(hashes[0]).toMatch(/^'sha256-[A-Za-z0-9+/]{43}='$/);
    // index.html itself: the call of the first paint (the first paint's own script is inlined by the build).
    expect(inlineScriptHashes(INDEX)).toHaveLength(1);
  });

  it('public/_headers: the full policy is report-only, beside the enforced frame-ancestors', () => {
    const h = headersOf(HEADERS, '/');
    expect(h['content-security-policy']).toBe("frame-ancestors 'none'");
    const policy = h['content-security-policy-report-only']!;
    expect(policy).toBe(reportOnlyPolicy(HEADERS));
    const d = directives(policy);
    expect(d['default-src']).toEqual(["'none'"]);
    // Scripts: no inline, no eval; WebAssembly, the hashes' placeholder and Turnstile.
    expect(d['script-src']).toEqual(["'self'", "'wasm-unsafe-eval'", CSP_SCRIPT_HASHES, 'https://challenges.cloudflare.com', "'report-sample'"]);
    expect(d['connect-src']).toEqual(["'self'", 'wss://mume.org', 'https://mume.org']);
    expect(d['worker-src']).toEqual(["'self'"]);
    expect(d['frame-src']).toEqual(['https://challenges.cloudflare.com']);
    for (const name of ['object-src', 'base-uri', 'form-action', 'frame-ancestors']) expect(d[name], name).toEqual(["'none'"]);
    // Nowhere but in style-src is anything inline allowed, and nothing is a wildcard.
    for (const [name, sources] of Object.entries(d)) {
      if (name !== 'style-src') expect(sources, name).not.toContain("'unsafe-inline'");
      expect(sources, name).not.toContain("'unsafe-eval'");
      expect(sources.some((s) => s.includes('*') || s === 'https:' || s === 'blob:'), name).toBe(false);
    }
    // Every static file gets it: a script (a worker takes its policy from its own answer), the 404 page.
    expect(headersOf(HEADERS, '/assets/map.worker-abc.js')['content-security-policy-report-only']).toBe(policy);
    expect(headersOf(HEADERS, '/no/such/page')['content-security-policy-report-only']).toBe(policy);
    // Cloudflare refuses a `_headers` line over 2,000 characters; two hashes are about 110.
    for (const line of HEADERS.split('\n')) expect(line.length).toBeLessThan(1800);
  });

  it('fillCspHashes replaces the placeholder with the hashes of every page, once each', () => {
    const a = '<script>one()</script>';
    const b = '<script>one()</script><script>two()</script>';
    const filled = fillCspHashes(HEADERS, [a, b]);
    expect(filled).not.toContain('INLINE-SCRIPTS');
    const d = directives(reportOnlyPolicy(filled)!);
    expect(d['script-src']).toEqual(["'self'", "'wasm-unsafe-eval'", ...inlineScriptHashes(b), 'https://challenges.cloudflare.com', "'report-sample'"]);
    // No inline script at all: no hash, and no stray placeholder.
    expect(directives(reportOnlyPolicy(fillCspHashes(HEADERS, ['<p>x</p>']))!)['script-src']).toEqual([
      "'self'",
      "'wasm-unsafe-eval'",
      'https://challenges.cloudflare.com',
      "'report-sample'",
    ]);
    // A `_headers` without the placeholder is a mistake, not something to pass over.
    expect(() => fillCspHashes(filled, [a])).toThrow(/INLINE-SCRIPTS/);
  });

  it('enforceCsp makes the report-only policy the one enforced policy and touches nothing else', () => {
    const filled = fillCspHashes(HEADERS, ['<script>one()</script>']);
    const policy = reportOnlyPolicy(filled)!;
    const enforced = enforceCsp(filled);
    const h = headersOf(enforced, '/');
    expect(h['content-security-policy']).toBe(policy);
    expect(h['content-security-policy-report-only']).toBeUndefined();
    expect(reportOnlyPolicy(enforced)).toBeNull();
    // The other headers and rules are as they were.
    const { 'content-security-policy': _a, 'content-security-policy-report-only': _b, ...before } = headersOf(filled, '/assets/x.js');
    const { 'content-security-policy': _c, ...after } = headersOf(enforced, '/assets/x.js');
    expect(after).toEqual(before);
    expect(enforced.split('\n').length).toBe(filled.split('\n').length - 1);
    // Twice is a mistake; so is a policy that would drop frame-ancestors.
    expect(() => enforceCsp(enforced)).toThrow(/no Content-Security-Policy-Report-Only/);
    expect(() => enforceCsp("/*\n  Content-Security-Policy-Report-Only: default-src 'none'\n")).toThrow(/frame-ancestors/);
  });

  it('the local server sends the policy as built, or enforced on request (the rehearsal of the switch)', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'wc-csp-'));
    const page = '<!doctype html><script>one()</script>';
    writeFileSync(join(dir, 'index.html'), page);
    writeFileSync(join(dir, '_headers'), fillCspHashes(HEADERS, [page]));
    const get = async (enforce: boolean): Promise<Headers> => {
      const server = serve(dir, 0, { profile: 'cloudflare', enforceCsp: enforce });
      await new Promise((r) => server.once('listening', r));
      try {
        return (await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/`)).headers;
      } finally {
        server.close();
      }
    };
    try {
      const built = await get(false);
      expect(built.get('content-security-policy')).toBe("frame-ancestors 'none'");
      const policy = built.get('content-security-policy-report-only')!;
      expect(policy).toContain(inlineScriptHashes(page)[0]);
      const enforced = await get(true);
      expect(enforced.get('content-security-policy')).toBe(policy);
      expect(enforced.get('content-security-policy-report-only')).toBeNull();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
