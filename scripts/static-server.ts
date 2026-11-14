// A plain static file server that stands in for the production host:
// files from one directory under a base path, no dev middleware.
//
//   node scripts/static-server.ts [dir] [--port n] [--base path] [--profile pages|cloudflare]
//                                  (defaults: dist, 4180, /, pages)
//
// Two profiles, one per host:
//
// `pages`: GitHub Pages (ADR 0028, ADR 0029), the live host until the
// switch of stage 58. No COOP/COEP (so not cross-origin isolated) and
// `Cache-Control: max-age=600` on everything, MIME types by extension, no
// fallback. Only paths under the base are served; the base without its
// trailing slash redirects to it (as Pages does), everything else is 404.
//
// `cloudflare`: the Worker with static assets of wrangler.jsonc (ADR 0144),
// as `wrangler dev` 4.162 answers (compared header by header):
//   - /api/*, /admin and /admin/* are answered by the real router
//     (worker/router.ts), with an assets binding that reads from the
//     directory and no other binding: no database (the beat answers 503
//     `unavailable`, the flags are off) and no Access settings (/admin
//     answers 503 `admin_not_configured`)
//   - `Cache-Control: public, max-age=0, must-revalidate` and an ETag by
//     default; `If-None-Match` gives 304; Range is ignored
//   - the rules of the directory's own `_headers` file, on every answer
//     that is not the Worker's (also 404s and redirects); `_headers` and
//     `_redirects` are not served
//   - `html_handling: auto-trailing-slash`: `/` is `index.html`,
//     `/x.html` redirects (307) to `/x`, `/x/index.html` to `/x/`
//   - `not_found_handling: 404-page`: the nearest `404.html` with status
//     404, an empty 404 without one
//   - no Content-Type for an extension Cloudflare does not know (`.mm2`)
// Not emulated: compression, `CF-Cache-Status`, `_redirects`, the 100-rule
// and line-length limits of `_headers` (wrangler checks those at deploy).
//
// Used by the smoke test (playwright.prod.config.ts) and by
// `npm run build:site` / `build:pages` to check a build before it goes live.
import { createHash } from 'node:crypto';
import { createReadStream, existsSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { type IncomingMessage, type ServerResponse, createServer } from 'node:http';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { type Env, handle } from '../worker/router.ts';

export type Profile = 'pages' | 'cloudflare';

/** The headers of every response, as GitHub Pages sends them. */
export const PAGES_HEADERS: Record<string, string> = { 'Cache-Control': 'max-age=600' };

/** Cloudflare's `Cache-Control` of a static asset that no `_headers` rule changes. */
export const CLOUDFLARE_CACHE = 'public, max-age=0, must-revalidate';

/** `/`, or `/x/y/` for any spelling of a base path. */
export function normaliseBase(raw: string): string {
  const trimmed = raw.trim().replace(/^\/+|\/+$/g, '');
  return trimmed ? `/${trimmed}/` : '/';
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.woff2': 'font/woff2',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
  '.mm2': 'application/octet-stream',
};

/** Where Cloudflare's types differ from `MIME` (null: no Content-Type at all). */
const CLOUDFLARE_MIME: Record<string, string | null> = {
  '.md': 'text/markdown; charset=utf-8',
  '.ico': 'image/vnd.microsoft.icon',
  '.mm2': null,
};

export function mimeType(path: string): string {
  return MIME[extname(path).toLowerCase()] ?? 'application/octet-stream';
}

/** The Content-Type Cloudflare gives a static asset, or null when it sends none. */
export function cloudflareMimeType(path: string): string | null {
  const ext = extname(path).toLowerCase();
  if (ext in CLOUDFLARE_MIME) return CLOUDFLARE_MIME[ext] ?? null;
  return MIME[ext] ?? null;
}

/** One rule of a `_headers` file: a path pattern and what it does to the headers. */
export interface HeaderRule {
  pattern: string;
  match: RegExp;
  /** Placeholder names in pattern order (`splat` for `*`). */
  names: string[];
  /** In file order: `set` adds a value (joined with a comma to an earlier one), `unset` removes the header. */
  ops: Array<{ op: 'set'; name: string; value: string } | { op: 'unset'; name: string }>;
}

/**
 * Parses a Cloudflare `_headers` file: a path pattern on a line of its own
 * (`*` is a splat, `:name` a placeholder for one segment), then indented
 * `Name: value` lines, `! Name` to remove a header, `#` comments.
 */
export function parseHeadersFile(text: string): HeaderRule[] {
  const rules: HeaderRule[] = [];
  let rule: HeaderRule | null = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    if (!/^\s/.test(raw)) {
      const names: string[] = [];
      const source = line
        .split(/(\*|:[A-Za-z]\w*)/)
        .map((part) => {
          if (part === '*') return names.push('splat'), '(.*)';
          if (/^:[A-Za-z]\w*$/.test(part)) return names.push(part.slice(1)), '([^/]+)';
          return part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        })
        .join('');
      rule = { pattern: line, match: new RegExp(`^${source}$`), names, ops: [] };
      rules.push(rule);
      continue;
    }
    if (!rule) continue;
    if (line.startsWith('! ')) {
      rule.ops.push({ op: 'unset', name: line.slice(2).trim().toLowerCase() });
      continue;
    }
    const colon = line.indexOf(':');
    if (colon <= 0) continue;
    rule.ops.push({ op: 'set', name: line.slice(0, colon).trim().toLowerCase(), value: line.slice(colon + 1).trim() });
  }
  return rules;
}

/**
 * Applies every rule that matches `path`, in file order, to `headers`
 * (lower-case names). A header set twice is joined with a comma, as
 * Cloudflare does.
 */
export function applyHeaderRules(rules: HeaderRule[], path: string, headers: Record<string, string>): Record<string, string> {
  const out = { ...headers };
  const set = new Set<string>();
  for (const rule of rules) {
    const m = rule.match.exec(path);
    if (!m) continue;
    for (const op of rule.ops) {
      if (op.op === 'unset') {
        delete out[op.name];
        set.delete(op.name);
        continue;
      }
      const value = rule.names.reduce((v, name, i) => v.replaceAll(`:${name}`, m[i + 1] ?? ''), op.value);
      out[op.name] = set.has(op.name) ? `${out[op.name]}, ${value}` : value;
      set.add(op.name);
    }
  }
  return out;
}

export interface ServeOptions {
  /** URL path prefix the directory is served under (default `/`). */
  base?: string;
  /** Which host to stand in for (default `pages`). */
  profile?: Profile;
}

/** What the `cloudflare` profile answers for a path: a file, a redirect, or nothing. */
interface AssetAnswer {
  status: number;
  /** Lower-case names. */
  headers: Record<string, string>;
  file?: string;
}

/** Files Cloudflare reads as configuration and never serves. */
const CLOUDFLARE_PRIVATE = new Set(['/_headers', '/_redirects']);

/** The `cloudflare` profile's static assets over `root`. */
function cloudflareAssets(root: string): (method: string, path: string, search: string, ifNoneMatch: string | undefined) => AssetAnswer {
  const headersFile = join(root, '_headers');
  const rules = existsSync(headersFile) ? parseHeadersFile(readFileSync(headersFile, 'utf8')) : [];
  const etags = new Map<string, { stamp: string; etag: string }>();
  const etag = (file: string): string => {
    const st = statSync(file);
    const stamp = `${st.mtimeMs}:${st.size}`;
    const known = etags.get(file);
    if (known?.stamp === stamp) return known.etag;
    const value = `"${createHash('md5').update(readFileSync(file)).digest('hex')}"`;
    etags.set(file, { stamp, etag: value });
    return value;
  };
  /** The file at `path` (a URL path, `/`-rooted) inside the root, or null. */
  const fileAt = (path: string): string | null => {
    if (CLOUDFLARE_PRIVATE.has(path)) return null;
    try {
      const file = realpathSync(resolve(root, `.${path}`));
      return file.startsWith(root + sep) && statSync(file).isFile() ? file : null;
    } catch {
      return null;
    }
  };
  const fileAnswer = (status: number, file: string, ifNoneMatch: string | undefined): AssetAnswer => {
    const headers: Record<string, string> = { 'cache-control': CLOUDFLARE_CACHE, etag: etag(file) };
    const type = cloudflareMimeType(file);
    if (type) headers['content-type'] = type;
    const same = status === 200 && ifNoneMatch?.split(',').some((t) => t.trim().replace(/^W\//, '') === headers.etag);
    return same ? { status: 304, headers } : { status, headers, file };
  };
  const resolveAsset = (path: string, search: string, ifNoneMatch: string | undefined): AssetAnswer => {
    // html_handling: auto-trailing-slash.
    if (path.endsWith('/index.html') && fileAt(path)) return { status: 307, headers: { location: `${path.slice(0, -'index.html'.length)}${search}` } };
    if (path.endsWith('.html') && fileAt(path)) return { status: 307, headers: { location: `${path.slice(0, -'.html'.length)}${search}` } };
    const file = path.endsWith('/') ? fileAt(`${path}index.html`) : (fileAt(path) ?? fileAt(`${path}.html`));
    if (file) return fileAnswer(200, file, ifNoneMatch);
    // not_found_handling: 404-page, the nearest 404.html upwards.
    for (let dir = dirname(path); ; dir = dirname(dir)) {
      const page = fileAt(`${dir.replace(/\/$/, '')}/404.html`);
      if (page) return fileAnswer(404, page, undefined);
      if (dir === '/' || dir === '.') return { status: 404, headers: {} };
    }
  };
  return (method, path, search, ifNoneMatch) => {
    const answer: AssetAnswer = method === 'GET' || method === 'HEAD' ? resolveAsset(path, search, ifNoneMatch) : { status: 405, headers: {} };
    return { ...answer, headers: applyHeaderRules(rules, path, answer.headers) };
  };
}

function body(req: IncomingMessage): Promise<Buffer> {
  return new Promise((done, failed) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => done(Buffer.concat(chunks)));
    req.on('error', failed);
  });
}

/** The `cloudflare` profile: the Worker's router for /api/*, the assets for the rest. */
function cloudflareHandler(root: string): (req: IncomingMessage, res: ServerResponse, path: string, search: string) => Promise<void> {
  const assets = cloudflareAssets(root);
  const env: Env = {
    ASSETS: {
      async fetch(input) {
        const request = input instanceof Request ? input : new Request(input);
        const url = new URL(request.url);
        const a = assets(request.method, decodeURIComponent(url.pathname), url.search, request.headers.get('if-none-match') ?? undefined);
        return new Response(a.file && request.method !== 'HEAD' ? readFileSync(a.file) : null, { status: a.status, headers: a.headers });
      },
    },
  };
  return async (req, res, path, search) => {
    const method = req.method ?? 'GET';
    // run_worker_first: ["/api/*", "/admin", "/admin/*"].
    if (path.startsWith('/api/') || path === '/admin' || path.startsWith('/admin/')) {
      const init: RequestInit = { method, headers: req.headers as Record<string, string> };
      if (method !== 'GET' && method !== 'HEAD') init.body = new Uint8Array(await body(req));
      const answer = await handle(new Request(`http://${req.headers.host ?? 'localhost'}${encodeURI(path)}${search}`, init), env);
      res.writeHead(answer.status, Object.fromEntries(answer.headers));
      res.end(method === 'HEAD' ? undefined : Buffer.from(await answer.arrayBuffer()));
      return;
    }
    const inm = req.headers['if-none-match'];
    const a = assets(method, path, search, Array.isArray(inm) ? inm.join(',') : inm);
    if (!a.file) {
      res.writeHead(a.status, { ...a.headers, ...(a.status === 304 ? {} : { 'content-length': 0 }) });
      res.end();
      return;
    }
    res.writeHead(a.status, { ...a.headers, 'content-length': statSync(a.file).size });
    if (method === 'HEAD') res.end();
    else createReadStream(a.file).pipe(res);
  };
}

export function serve(dir: string, port: number, opts: ServeOptions = {}): ReturnType<typeof createServer> {
  const root = realpathSync(dir);
  const base = normaliseBase(opts.base ?? '/');
  const cloudflare = opts.profile === 'cloudflare' ? cloudflareHandler(root) : null;
  const server = createServer((req, res) => {
    const notFound = (code = 404): void => {
      res.writeHead(code, { ...(cloudflare ? {} : PAGES_HEADERS), 'Content-Type': 'text/plain' });
      res.end(code === 404 ? 'not found' : 'bad request');
    };
    if (!cloudflare && req.method !== 'GET' && req.method !== 'HEAD') return notFound(400);
    let url: URL;
    let full: string;
    try {
      url = new URL(req.url ?? '/', 'http://x');
      full = decodeURIComponent(url.pathname);
    } catch {
      return notFound(400);
    }
    if (full.includes('\0')) return notFound(400);
    if (base !== '/' && `${full}/` === base) {
      res.writeHead(301, { ...(cloudflare ? {} : PAGES_HEADERS), Location: `${base}${url.search}` });
      return res.end();
    }
    if (!full.startsWith(base)) return notFound();
    let path = full.slice(base.length - 1);
    if (cloudflare) {
      cloudflare(req, res, path, url.search).catch((err: unknown) => {
        if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end(String(err));
      });
      return;
    }
    if (path.endsWith('/')) path += 'index.html';
    let file: string;
    try {
      file = realpathSync(resolve(root, `.${path}`));
      if (!file.startsWith(root + sep) || !statSync(file).isFile()) return notFound();
    } catch {
      return notFound();
    }
    res.writeHead(200, {
      ...PAGES_HEADERS,
      'Content-Type': mimeType(file),
      'Content-Length': statSync(file).size,
    });
    if (req.method === 'HEAD') return res.end();
    createReadStream(file).pipe(res);
  });
  server.listen(port, '127.0.0.1');
  return server;
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const option = (name: string): string | undefined => {
    const i = args.indexOf(name);
    return i >= 0 ? args.splice(i, 2)[1] : undefined;
  };
  const port = Number(option('--port') ?? 4180);
  const base = normaliseBase(option('--base') ?? '/');
  const profile = option('--profile') ?? 'pages';
  if (profile !== 'pages' && profile !== 'cloudflare') {
    console.error(`static: --profile is pages or cloudflare, not ${profile}`);
    process.exit(1);
  }
  const dir = resolve(args[0] ?? 'dist');
  serve(dir, port, { base, profile }).on('listening', () =>
    console.log(`static: ${dir} at http://127.0.0.1:${port}${base} (${profile})`),
  );
}
