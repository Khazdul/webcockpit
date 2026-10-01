// GMCP: module registry, handshake and message dispatch (ADR 0003, ADR 0007,
// Inv §8.1).
//
// - One registry builds the single `Core.Supports.Set`. The server replaces
//   the whole set on every `Core.Supports.Set`, so nothing else may send
//   one.
// - Every inbound message is emitted twice on the bus: `gmcp.raw` (package
//   and JSON text as received) and `gmcp` (parsed). JSON `null` stays
//   `null`; a message without a payload gives `undefined`.
// - `Comm.Channel.List` is answered with one `Comm.Channel.Enable "<name>"`
//   per listed channel. Nothing is hardcoded.

import type { Bus } from '../core/bus';
import { CLIENT_VERSION } from '../core/build-info';

/** Sent in `Core.Hello` (the version: package.json, src/core/build-info.ts). */
export const CLIENT_NAME = 'WebCockpit';
export { CLIENT_VERSION };

/** The default module set (spec stage 1, Inv §8.1). */
export const DEFAULT_GMCP_MODULES: ReadonlyArray<readonly [string, number]> = [
  ['Char', 1],
  ['Comm.Channel', 1],
  ['Event', 1],
  ['Core', 1],
  ['Group', 1],
  ['Room', 1],
  ['Room.Chars', 1],
  ['MUME.Client', 1],
];

/** The set of GMCP modules the client supports. Order is kept. */
export class GmcpRegistry {
  private readonly modules = new Map<string, number>();

  constructor(modules: Iterable<readonly [string, number]> = DEFAULT_GMCP_MODULES) {
    for (const [name, version] of modules) this.modules.set(name, version);
  }

  /** Adds or updates a module. Returns true when the set changed. */
  add(name: string, version = 1): boolean {
    if (this.modules.get(name) === version) return false;
    this.modules.set(name, version);
    return true;
  }

  /** Removes a module. Returns true when the set changed. */
  remove(name: string): boolean {
    return this.modules.delete(name);
  }

  has(name: string): boolean {
    return this.modules.has(name);
  }

  /** The `Core.Supports.Set` payload, e.g. `["Char 1","Core 1"]`. */
  supportsList(): string[] {
    const out: string[] = [];
    for (const [name, version] of this.modules) out.push(`${name} ${version}`);
    return out;
  }
}

export interface ParsedGmcp {
  /** Package name as sent. */
  pkg: string;
  /** JSON text after the first space ('' when none). */
  json: string;
  /** Parsed payload; `undefined` when absent or invalid. */
  data: unknown;
  /** Set when `json` was non-empty but did not parse. */
  error?: string;
}

/**
 * Splits a GMCP payload into package and JSON and parses the JSON. Accepts
 * any JSON value: object, array, string, number, boolean or `null`.
 */
export function parseGmcp(payload: string): ParsedGmcp {
  let start = 0;
  while (start < payload.length && isWs(payload.charCodeAt(start))) start++;
  let sp = start;
  while (sp < payload.length && !isWs(payload.charCodeAt(sp))) sp++;
  const pkg = payload.slice(start, sp);
  const json = payload.slice(sp).trim();
  if (json === '') return { pkg, json, data: undefined };
  try {
    return { pkg, json, data: JSON.parse(json) as unknown };
  } catch (e) {
    return { pkg, json, data: undefined, error: e instanceof Error ? e.message : String(e) };
  }
}

function isWs(c: number): boolean {
  return c === 32 || c === 9 || c === 10 || c === 13;
}

/** Builds the outbound payload text `pkg [json]`. */
export function formatGmcp(pkg: string, data?: unknown): string {
  return data === undefined ? pkg : `${pkg} ${JSON.stringify(data)}`;
}

export interface GmcpOptions {
  bus: Bus;
  /**
   * Sends a GMCP payload over telnet (encoding and IAC escaping are the
   * telnet layer's job). Returns false when GMCP is not enabled.
   */
  send: (payload: string) => boolean;
  registry?: GmcpRegistry;
  /** Called after the bus emits, with the package name in lower case. */
  onMessage?: (pkgLower: string, data: unknown) => void;
}

export class Gmcp {
  readonly registry: GmcpRegistry;
  private readonly o: GmcpOptions;

  constructor(opts: GmcpOptions) {
    this.o = opts;
    this.registry = opts.registry ?? new GmcpRegistry();
  }

  /** Sends a GMCP message. Returns false when GMCP is not enabled. */
  send(pkg: string, data?: unknown): boolean {
    return this.o.send(formatGmcp(pkg, data));
  }

  /**
   * GMCP was just enabled (DO GMCP already sent). Sends the handshake:
   * `Core.Hello`, one `Core.Supports.Set`, `MUME.Client.XML`.
   */
  onEnabled(): void {
    this.send('Core.Hello', { client: CLIENT_NAME, version: CLIENT_VERSION });
    this.sendSupports();
    this.send('MUME.Client.XML', { enable: true, silent: true });
  }

  /** (Re)sends the full `Core.Supports.Set` from the registry. */
  sendSupports(): boolean {
    return this.send('Core.Supports.Set', this.registry.supportsList());
  }

  /**
   * Handles one inbound GMCP payload (`Package.Name [json]`). `ts` is the
   * receive time (µs) passed on in `gmcp.raw`.
   */
  handle(payload: string, ts?: number): void {
    const bus = this.o.bus;
    const m = parseGmcp(payload);
    bus.emit('gmcp.raw', ts === undefined ? { pkg: m.pkg, json: m.json } : { pkg: m.pkg, json: m.json, ts });
    if (m.error !== undefined) {
      bus.emit('sys.message', { text: `GMCP ${m.pkg}: bad JSON (${m.error})` });
    }
    const lower = m.pkg.toLowerCase();
    bus.emit('gmcp', { pkg: m.pkg, key: lower, data: m.data });
    if (lower === 'comm.channel.list' && Array.isArray(m.data)) {
      for (const ch of m.data) {
        const name = channelName(ch);
        if (name !== null) this.send('Comm.Channel.Enable', name);
      }
    }
    this.o.onMessage?.(lower, m.data);
  }
}

function channelName(ch: unknown): string | null {
  if (typeof ch === 'string') return ch;
  if (ch !== null && typeof ch === 'object') {
    const name = (ch as { name?: unknown }).name;
    if (typeof name === 'string' && name !== '') return name;
  }
  return null;
}
