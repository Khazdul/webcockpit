// Minimal static server for perf/builds/<name>/ (area E harness). Optional
// COOP/COEP headers: `vite preview` sends them; production (GitHub Pages)
// does not.
import { createServer, type Server } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.fnt': 'text/plain; charset=utf-8',
  '.mm2': 'application/octet-stream',
  '.wasm': 'application/wasm',
  '.webmanifest': 'application/manifest+json',
};

export function serveDir(dir: string, port: number, coi: boolean): Promise<Server> {
  const root = resolve(dir);
  const srv = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', 'http://x');
      let p = normalize(decodeURIComponent(url.pathname));
      if (p.endsWith('/')) p += 'index.html';
      const file = join(root, p);
      if (!file.startsWith(root)) {
        res.statusCode = 403;
        return res.end();
      }
      let f = file;
      try {
        const st = await stat(f);
        if (st.isDirectory()) f = join(f, 'index.html');
      } catch {
        f = join(root, 'index.html');
      }
      const body = await readFile(f);
      res.setHeader('Content-Type', MIME[extname(f)] ?? 'application/octet-stream');
      res.setHeader('Cache-Control', 'no-store');
      if (coi) {
        res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
        res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
        res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
      }
      res.end(body);
    } catch (err) {
      res.statusCode = 500;
      res.end(String(err));
    }
  });
  return new Promise((ok, fail) => {
    srv.once('error', fail);
    srv.listen(port, '127.0.0.1', () => ok(srv));
  });
}
