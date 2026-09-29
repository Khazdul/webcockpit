// A plain static file server that stands in for GitHub Pages, the
// production host (ADR 0028, ADR 0029): files from one directory under a
// base path, MIME types by extension, no fallback, no dev middleware.
//
//   node scripts/static-server.ts [dir] [--port n] [--base path]
//                                  (defaults: dist, 4180, /)
//
// Headers as on Pages: no COOP/COEP (so not cross-origin isolated) and
// `Cache-Control: max-age=600` on everything. Only paths under the base
// are served; the base without its trailing slash redirects to it (as
// Pages does), everything else is 404.
//
// Used by the smoke test (playwright.prod.config.ts) and by
// `npm run build:pages` to check a build before it goes live.
import { createReadStream, realpathSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, resolve, sep } from 'node:path';

/** The headers of every response, as GitHub Pages sends them. */
export const PAGES_HEADERS: Record<string, string> = { 'Cache-Control': 'max-age=600' };

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

export function mimeType(path: string): string {
  return MIME[extname(path).toLowerCase()] ?? 'application/octet-stream';
}

export interface ServeOptions {
  /** URL path prefix the directory is served under (default `/`). */
  base?: string;
}

export function serve(dir: string, port: number, opts: ServeOptions = {}): ReturnType<typeof createServer> {
  const root = realpathSync(dir);
  const base = normaliseBase(opts.base ?? '/');
  const server = createServer((req, res) => {
    const notFound = (code = 404): void => {
      res.writeHead(code, { ...PAGES_HEADERS, 'Content-Type': 'text/plain' });
      res.end(code === 404 ? 'not found' : 'bad request');
    };
    if (req.method !== 'GET' && req.method !== 'HEAD') return notFound(400);
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
      res.writeHead(301, { ...PAGES_HEADERS, Location: `${base}${url.search}` });
      return res.end();
    }
    if (!full.startsWith(base)) return notFound();
    let path = full.slice(base.length - 1);
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
  const dir = resolve(args[0] ?? 'dist');
  serve(dir, port, { base }).on('listening', () =>
    console.log(`static: ${dir} at http://127.0.0.1:${port}${base}`),
  );
}
