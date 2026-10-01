// A minimal loopback WebSocket server (RFC 6455, no extensions) for the
// bench: binary frames, subprotocol `binary` like MUME's ws-play, and a
// receive timestamp (Node epoch ms) for every client message. From the
// performance review's input harness (notes/research/perf-review/harness/C).
import { createHash } from 'node:crypto';
import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { Socket } from 'node:net';

export interface WsConn {
  send(data: Uint8Array): boolean;
  close(): void;
  readonly socket: Socket;
}

export interface WsServerOpts {
  port: number;
  onConnect(conn: WsConn): void;
  onMessage(conn: WsConn, data: Buffer, atEpoch: number): void;
}

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

export function startWsServer(o: WsServerOpts): Promise<Server> {
  const server = createServer((_, res) => {
    res.writeHead(426);
    res.end();
  });
  server.on('upgrade', (req: IncomingMessage, socket: Socket) => {
    const key = req.headers['sec-websocket-key'];
    if (typeof key !== 'string') return socket.destroy();
    const accept = createHash('sha1').update(key + GUID).digest('base64');
    const proto = String(req.headers['sec-websocket-protocol'] ?? '').includes('binary') ? 'Sec-WebSocket-Protocol: binary\r\n' : '';
    socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n${proto}\r\n`);
    socket.setNoDelay(true);
    const conn: WsConn = {
      socket,
      send(data) {
        const n = data.length;
        let head: Buffer;
        if (n < 126) head = Buffer.from([0x82, n]);
        else if (n < 65536) head = Buffer.from([0x82, 126, n >> 8, n & 255]);
        else {
          head = Buffer.alloc(10);
          head[0] = 0x82;
          head[1] = 127;
          head.writeBigUInt64BE(BigInt(n), 2);
        }
        return socket.write(Buffer.concat([head, Buffer.from(data.buffer, data.byteOffset, data.byteLength)]));
      },
      close() {
        socket.end(Buffer.from([0x88, 0]));
      },
    };
    let buf: Buffer = Buffer.alloc(0);
    socket.on('data', (chunk: Buffer) => {
      const at = performance.timeOrigin + performance.now();
      buf = buf.length ? Buffer.concat([buf, chunk]) : chunk;
      for (;;) {
        if (buf.length < 2) return;
        const op = buf[0]! & 15;
        let len = buf[1]! & 127;
        const masked = (buf[1]! & 128) !== 0;
        let p = 2;
        if (len === 126) {
          if (buf.length < 4) return;
          len = buf.readUInt16BE(2);
          p = 4;
        } else if (len === 127) {
          if (buf.length < 10) return;
          len = Number(buf.readBigUInt64BE(2));
          p = 10;
        }
        const mk = masked ? buf.subarray(p, p + 4) : null;
        if (masked) p += 4;
        if (buf.length < p + len) return;
        const payload = Buffer.from(buf.subarray(p, p + len));
        if (mk) for (let i = 0; i < payload.length; i++) payload[i]! ^= mk[i & 3]!;
        buf = buf.subarray(p + len);
        if (op === 8) {
          socket.end();
          return;
        }
        if (op === 9) socket.write(Buffer.concat([Buffer.from([0x8a, payload.length]), payload]));
        else if (op === 1 || op === 2) o.onMessage(conn, payload, at);
      }
    });
    socket.on('error', () => {});
    o.onConnect(conn);
  });
  return new Promise((ok) => server.listen(o.port, '127.0.0.1', () => ok(server)));
}
