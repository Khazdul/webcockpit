// A throttling HTTP proxy for slow-link tests (ADR 0083): stands in front
// of any local server (the vite dev server, `vite preview`, the static
// server) and slows every response down like a real link, for any browser.
// Chromium's own network emulation (CDP) does not exist in Firefox.
//
//   node scripts/throttle-proxy.ts --target http://127.0.0.1:5173 [--port 4271]
//       [--kbit 750] [--latency 100] [--gzip]
//
// The link: `--kbit` kbit/s down, shared by every response in flight
// (round robin in 1 KB slices every 5 ms, like TCP flows sharing a line);
// each response starts `--latency` ms after its request (one round trip).
// Upstream bytes are passed through as they are (vite dev and preview do
// not compress); `--gzip` compresses text responses like GitHub Pages does.
// WebSocket upgrades (vite's HMR) pass through unthrottled.
// Also usable as a module: `startProxy(opts)` returns the server.
import { type IncomingMessage, type Server, type ServerResponse, createServer, request } from 'node:http';
import { connect } from 'node:net';
import { gzipSync } from 'node:zlib';

export interface ProxyOptions {
  target: string;
  port: number;
  /** Downstream bandwidth, kbit/s (0: unlimited). */
  kbit: number;
  /** Delay before each response starts, ms. */
  latency: number;
  gzip?: boolean;
}

interface Flow {
  res: ServerResponse;
  chunks: Buffer[];
  ended: boolean;
}

const SLICE = 1024;
const TICK_MS = 5;

/** Starts the proxy; resolves once it listens. */
export function startProxy(o: ProxyOptions): Promise<Server> {
  const target = new URL(o.target);
  const bytesPerMs = (o.kbit * 1000) / 8 / 1000;
  const flows: Flow[] = [];
  let credit = 0;
  let last = performance.now();
  let rr = 0;

  const pump = (): void => {
    const now = performance.now();
    credit = Math.min(credit + (now - last) * bytesPerMs, 64 * 1024);
    last = now;
    if (!flows.length) credit = 0;
    // Round robin over the flows with data, one slice at a time.
    while (flows.length && (o.kbit <= 0 || credit >= 1)) {
      let moved = false;
      for (let k = 0; k < flows.length && (o.kbit <= 0 || credit >= 1); k++) {
        const f = flows[(rr + k) % flows.length]!;
        const head = f.chunks[0];
        if (!head) continue;
        const n = o.kbit <= 0 ? head.length : Math.min(head.length, SLICE, Math.floor(credit));
        if (n <= 0) break;
        f.res.write(head.subarray(0, n));
        if (n === head.length) f.chunks.shift();
        else f.chunks[0] = head.subarray(n);
        credit -= n;
        moved = true;
      }
      rr++;
      if (!moved) break;
    }
    for (let i = flows.length - 1; i >= 0; i--) {
      const f = flows[i]!;
      if (f.ended && !f.chunks.length) {
        f.res.end();
        flows.splice(i, 1);
      }
    }
  };
  const timer = setInterval(pump, TICK_MS);

  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    const t0 = performance.now();
    const headers = { ...req.headers, host: target.host };
    if (o.gzip) delete headers['accept-encoding'];
    const up = request(
      { hostname: target.hostname, port: target.port, path: req.url, method: req.method, headers },
      (ur) => {
        const out = { ...ur.headers };
        const parts: Buffer[] = [];
        const type = String(ur.headers['content-type'] ?? '');
        const zip = !!o.gzip && /text|javascript|json|css|svg|xml/.test(type) && !ur.headers['content-encoding'];
        ur.on('data', (c: Buffer) => parts.push(c));
        ur.on('end', () => {
          let body = Buffer.concat(parts);
          if (zip && /gzip/.test(String(req.headers['accept-encoding'] ?? ''))) {
            body = gzipSync(body);
            out['content-encoding'] = 'gzip';
            out['content-length'] = String(body.length);
            delete out['transfer-encoding'];
          }
          const wait = Math.max(0, o.latency - (performance.now() - t0));
          setTimeout(() => {
            res.writeHead(ur.statusCode ?? 502, out);
            if (req.method === 'HEAD' || !body.length) return res.end();
            flows.push({ res, chunks: [body], ended: true });
          }, wait);
        });
      },
    );
    up.on('error', () => {
      res.writeHead(502);
      res.end();
    });
    req.pipe(up);
  });
  // WebSockets (vite HMR): a plain TCP tunnel.
  server.on('upgrade', (req: IncomingMessage, socket, head) => {
    const up = connect(Number(target.port), target.hostname, () => {
      const lines = [`${req.method} ${req.url} HTTP/1.1`];
      for (let i = 0; i < req.rawHeaders.length; i += 2) {
        const k = req.rawHeaders[i]!;
        lines.push(`${k}: ${k.toLowerCase() === 'host' ? target.host : req.rawHeaders[i + 1]}`);
      }
      up.write(`${lines.join('\r\n')}\r\n\r\n`);
      if (head.length) up.write(head);
      up.pipe(socket);
      socket.pipe(up);
    });
    up.on('error', () => socket.destroy());
    socket.on('error', () => up.destroy());
  });
  server.on('close', () => clearInterval(timer));
  return new Promise((resolve) => server.listen(o.port, '127.0.0.1', () => resolve(server)));
}

if (import.meta.main) {
  const arg = (name: string, d: string): string => {
    const i = process.argv.indexOf(`--${name}`);
    return i >= 0 && process.argv[i + 1] ? process.argv[i + 1]! : d;
  };
  const o: ProxyOptions = {
    target: arg('target', 'http://127.0.0.1:5173'),
    port: Number(arg('port', '4271')),
    kbit: Number(arg('kbit', '750')),
    latency: Number(arg('latency', '100')),
    gzip: process.argv.includes('--gzip'),
  };
  await startProxy(o);
  console.log(`throttle proxy: http://127.0.0.1:${o.port}/ -> ${o.target} (${o.kbit} kbit/s, ${o.latency} ms)`);
}
