// Session controller (spec §2.1, Inv §9.1–9.2): owns one socket at a time,
// the telnet parser, GMCP, the keep-alive and the link probe, and
// implements `Sender`. The link probe (ADR 0030) runs on the same edges
// as the keep-alive, only when a probe `fetch` is given and never for a
// replay connection; its readout feeds `KeepAlive.setHttpRtt`.
//
// State machine (types.ts `ConnState`):
//   idle/disconnected --connect()--> connecting --socket open--> login
//   login --GMCP Char.Name--> playing
//   connecting/login/playing --Core.Goodbye | socket close | disconnect()-->
//     disconnected
// Transitions are idempotent: one `conn.state` per actual change, so a
// Core.Goodbye followed by the socket close gives one disconnect.
//
// Commands end in CR LF: RFC 854's NVT end of line, and what tt++ (the
// owner's reference client) sends. MUME accepts LF alone too.
//
// Sending is synchronous: `sendCommand` encodes and calls `socket.send`
// in the same call stack, then emits `cmd.sent`.
//
// `cmd.sent` timestamps: a command sent while an inbound frame is being
// parsed (e.g. the width commands sent on GMCP Char.Name) is stamped with
// that frame's receive time, not the wall clock. Lines from the same frame
// carry the frame's time too, so events stay in the order they happened
// and the capture file's timestamps never go backwards.

import type { Bus } from '../../src/core/bus';
import type { ConnState, Sender, Socketish } from '../../src/core/types';
import { nowUs } from '../../src/core/types';
import { Gmcp, GmcpRegistry } from '../../src/net/gmcp';
import { KeepAlive, type Timers } from '../../src/net/keepalive';
import { type FetchLike, LinkProbe } from '../../src/net/link-probe';
import { Telnet } from './telnet';
import type { TextSink } from '../../src/net/textsink';
import { WebSocketTransport } from '../../src/net/ws-transport';

/** Reason given when the user disconnects. */
export const REASON_USER_DISCONNECT = 'disconnected by user';
/** Reason given for the close half of a user reconnect. */
export const REASON_USER_RECONNECT = 'reconnect by user';

/** Commands sent once on entering `playing` (Inv §9, spec §2.1). */
export const PLAYING_COMMANDS: readonly string[] = ['change width all 500', 'change width table terminal'];

/**
 * A socket that carries UTF-8 without CHARSET negotiation (the replay
 * socket). Session switches the telnet decoder to UTF-8 on connect.
 */
export interface ForcesUtf8 {
  readonly forceUtf8: true;
}

function forcesUtf8(s: Socketish): boolean {
  return (s as Partial<ForcesUtf8>).forceUtf8 === true;
}

/**
 * A socket that replays a recorded log (ReplaySocket). Every `conn.state`
 * of its connection carries `replay: true`, so the recorder never captures
 * it, even when recorded GMCP (`Char.Name`) takes it to `playing`.
 */
export interface IsReplay {
  readonly replay: true;
  /**
   * Set by Session on connect: a recorded outbound command, emitted as
   * `cmd.sent` with `replay: true` (not sent, echoed or captured again).
   */
  onSent?: ((text: string) => void) | null;
}

function isReplay(s: Socketish): boolean {
  return (s as Partial<IsReplay>).replay === true;
}

export interface SessionOptions {
  bus: Bus;
  /** Receives decoded text and GA marks (the line assembler). */
  sink: TextSink;
  /** Creates the socket for each connect. Default: `WebSocketTransport`. */
  socketFactory?: () => Socketish;
  registry?: GmcpRegistry;
  /** Timers for the keep-alive and the link probe (tests). */
  timers?: Timers;
  /**
   * `fetch` for the link probe (ADR 0030). Absent or null: no probe, and
   * `Link:` shows the Core.Ping minimum. The app passes the browser's.
   */
  linkFetch?: FetchLike | null;
  /** TTYPE answer. Default `WebCockpit`. */
  ttype?: string;
  /** A new MSSP table from the server (game time for the clock, ADR 0016). */
  onMssp?: (vars: ReadonlyMap<string, string[]>) => void;
  /**
   * Receive-time clock in µs for frames and `cmd.sent` (default `nowUs`).
   * The log player passes its log-time clock (src/player/clock.ts).
   */
  clockUs?: () => number;
}

export class Session implements Sender {
  readonly telnet: Telnet;
  readonly gmcp: Gmcp;
  readonly keepalive: KeepAlive;
  /** The link probe, or null when no `linkFetch` was given. */
  readonly linkProbe: LinkProbe | null;

  private readonly bus: Bus;
  private socketFactory: () => Socketish;
  private socket: Socketish | null = null;
  private open = false;
  private st: ConnState = 'idle';
  /** Receive time of the inbound frame being parsed, or null. */
  private frameTs: number | null = null;
  /** The current (or last) connection is a replay. */
  private replayConn = false;
  private readonly clockUs: () => number;

  constructor(opts: SessionOptions) {
    this.bus = opts.bus;
    this.clockUs = opts.clockUs ?? nowUs;
    this.socketFactory = opts.socketFactory ?? (() => new WebSocketTransport());
    this.telnet = new Telnet({
      sink: opts.sink,
      write: this.writeRaw,
      onGmcp: (payload, ts) => this.gmcp.handle(payload, ts),
      onGmcpEnabled: () => this.gmcp.onEnabled(),
      onEcho: (serverEchoes) => this.bus.emit('telnet.echo', { serverEchoes }),
      ...(opts.ttype !== undefined ? { ttype: opts.ttype } : {}),
      ...(opts.onMssp ? { onMssp: opts.onMssp } : {}),
    });
    this.gmcp = new Gmcp({
      bus: opts.bus,
      send: (payload) => this.telnet.sendGmcp(payload),
      ...(opts.registry ? { registry: opts.registry } : {}),
      onMessage: this.onGmcpMessage,
    });
    this.keepalive = new KeepAlive({
      bus: opts.bus,
      sendPing: () => this.gmcp.send('Core.Ping'),
      ...(opts.timers ? { timers: opts.timers } : {}),
    });
    this.linkProbe = opts.linkFetch
      ? new LinkProbe({
          fetch: opts.linkFetch,
          onReadout: (ms) => this.keepalive.setHttpRtt(ms),
          ...(opts.timers ? { timers: opts.timers } : {}),
        })
      : null;
  }

  // -------------------------------------------------------------------------
  // State
  // -------------------------------------------------------------------------

  get state(): ConnState {
    return this.st;
  }

  /** True while the server echoes (ECHO on): mask input, no history. */
  get passwordMode(): boolean {
    return this.open && this.telnet.serverEchoes;
  }

  /** True when the current (or last) connection is a replay. */
  get isReplay(): boolean {
    return this.replayConn;
  }

  /** True when the socket is open (state login or playing). */
  get isOpen(): boolean {
    return this.open;
  }

  /** Replaces the socket factory used by the next `connect()`. */
  setSocketFactory(factory: () => Socketish): void {
    this.socketFactory = factory;
  }

  private setState(next: ConnState, reason?: string): void {
    const prev = this.st;
    if (prev === next) return;
    this.st = next;
    if (next === 'login') {
      this.keepalive.start();
      if (!this.replayConn) this.linkProbe?.start();
    }
    if (next === 'disconnected') {
      this.keepalive.stop();
      this.linkProbe?.stop();
    }
    const ev: { state: ConnState; prev: ConnState; reason?: string; replay?: true } = { state: next, prev };
    if (reason !== undefined) ev.reason = reason;
    if (this.replayConn) ev.replay = true;
    this.bus.emit('conn.state', ev);
    if (next === 'playing') {
      for (const c of PLAYING_COMMANDS) this.sendCommand(c, { echo: false });
    }
  }

  // -------------------------------------------------------------------------
  // Connect / disconnect
  // -------------------------------------------------------------------------

  /**
   * Opens a new connection. Ignored while connecting or connected. `socket`
   * overrides the factory for this one connection (e.g. a replay socket).
   */
  connect(socket?: Socketish): void {
    if (this.st === 'connecting' || this.st === 'login' || this.st === 'playing') return;
    this.detach();
    const sock = socket ?? this.socketFactory();
    this.socket = sock;
    this.open = false;
    this.replayConn = isReplay(sock);
    this.telnet.reset();
    if (forcesUtf8(sock)) this.telnet.forceUtf8();
    sock.onOpen = () => {
      if (this.socket !== sock) return;
      this.open = true;
      this.setState('login');
    };
    sock.onData = (bytes) => {
      if (this.socket !== sock) return;
      this.bus.emit('net.bytesIn', bytes);
      const ts = this.clockUs();
      this.frameTs = ts;
      try {
        this.telnet.receive(bytes, ts);
      } finally {
        this.frameTs = null;
      }
    };
    if (this.replayConn) {
      (sock as unknown as IsReplay).onSent = (text) => {
        if (this.socket !== sock) return;
        this.bus.emit('cmd.sent', { text, ts: this.clockUs(), replay: true });
      };
    }
    sock.onClose = (reason) => {
      if (this.socket !== sock) return;
      if (this.replayConn) (sock as unknown as IsReplay).onSent = null;
      this.socket = null;
      this.open = false;
      this.dropped(reason);
    };
    this.setState('connecting');
    sock.connect();
  }

  /** Closes the connection; state becomes `disconnected` right away. */
  disconnect(reason: string = REASON_USER_DISCONNECT): void {
    const had = this.socket !== null;
    this.detach();
    if (had || this.st === 'connecting' || this.st === 'login' || this.st === 'playing') {
      this.dropped(reason);
    }
  }

  /**
   * Detaches the socket without emitting anything and stops the keep-alive
   * (App.dispose). The session is not used afterwards.
   */
  dispose(): void {
    this.detach();
    this.keepalive.stop();
    this.linkProbe?.stop();
  }

  /**
   * Drops the current connection (reason `REASON_USER_RECONNECT`, so the
   * UI can tell it from a real drop) and connects again.
   */
  reconnect(socket?: Socketish): void {
    this.disconnect(REASON_USER_RECONNECT);
    this.connect(socket);
  }

  /** Detaches and closes the current socket without firing its callbacks. */
  private detach(): void {
    const sock = this.socket;
    if (!sock) return;
    this.socket = null;
    this.open = false;
    sock.onOpen = null;
    sock.onData = null;
    sock.onClose = null;
    if (isReplay(sock)) (sock as unknown as IsReplay).onSent = null;
    try {
      sock.close();
    } catch {
      // Closing a dead socket must not break the state machine.
    }
  }

  private dropped(reason: string): void {
    // Already down (e.g. Core.Goodbye, then the socket close): nothing new.
    if (this.st === 'disconnected' || this.st === 'idle') return;
    if (this.telnet.serverEchoes) this.bus.emit('telnet.echo', { serverEchoes: false });
    this.setState('disconnected', reason);
  }

  private readonly onGmcpMessage = (pkg: string, data: unknown): void => {
    if (pkg === 'char.name') {
      if (this.st === 'login') this.setState('playing');
    } else if (pkg === 'core.goodbye') {
      const why = typeof data === 'string' && data ? `Core.Goodbye: ${data}` : 'Core.Goodbye';
      this.dropped(why);
    } else if (pkg === 'core.ping') {
      this.keepalive.notePong();
    }
  };

  // -------------------------------------------------------------------------
  // Sending
  // -------------------------------------------------------------------------

  /** Writes bytes to the socket, emits `net.bytesOut`. False when not open. */
  private readonly writeRaw = (bytes: Uint8Array): boolean => {
    const sock = this.socket;
    if (!sock || !this.open) return false;
    sock.send(bytes);
    this.bus.emit('net.bytesOut', bytes);
    return true;
  };

  /**
   * Sends one command line followed by CR LF. Dropped when not connected.
   * While the server echoes (password mode) the command is always treated
   * as secret, whatever the caller says.
   */
  sendCommand(text: string, opts?: { secret?: boolean; echo?: boolean }): void {
    const secret = opts?.secret === true || this.passwordMode;
    if (!this.writeRaw(this.telnet.encodeText(text + '\r\n'))) return;
    const ts = this.frameTs ?? this.clockUs();
    const ev: { text: string; ts: number; secret?: boolean; echo?: boolean } = {
      text: secret ? '' : text,
      ts,
    };
    if (secret) ev.secret = true;
    if (opts?.echo === false) ev.echo = false;
    this.bus.emit('cmd.sent', ev);
  }

  /** Sends a GMCP message (dropped when GMCP is not enabled). */
  sendGmcp(pkg: string, data?: unknown): void {
    this.gmcp.send(pkg, data);
  }

  /** Window size in cells, sent via NAWS when enabled and changed. */
  setWindowSize(cols: number, rows: number): void {
    this.telnet.setWindowSize(cols, rows);
  }
}
