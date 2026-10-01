// WebSocket transport to MUME (ADR 0002): `wss://mume.org/ws-play/`,
// subprotocol `binary`, binary frames carrying the raw telnet stream.

import type { Socketish } from '../core/types';

export const MUME_WS_URL = 'wss://mume.org/ws-play/';

type WsCtor = new (url: string, protocols?: string | string[]) => WebSocket;

export class WebSocketTransport implements Socketish {
  onOpen: (() => void) | null = null;
  onData: ((bytes: Uint8Array) => void) | null = null;
  onClose: ((reason: string) => void) | null = null;

  private ws: WebSocket | null = null;
  /** close() was called for the current socket. */
  private byClient = false;
  private readonly url: string;
  private readonly protocols: string[];
  private readonly Ctor: WsCtor;

  constructor(url: string = MUME_WS_URL, protocols: string[] = ['binary'], ctor?: WsCtor) {
    this.url = url;
    this.protocols = protocols;
    this.Ctor = ctor ?? (globalThis.WebSocket as unknown as WsCtor);
  }

  get isOpen(): boolean {
    return this.ws !== null && this.ws.readyState === 1;
  }

  get bufferedAmount(): number {
    return this.ws?.bufferedAmount ?? 0;
  }

  /** Opens the socket. One transport instance is meant for one connection. */
  connect(): void {
    if (this.ws) return;
    let ws: WebSocket;
    try {
      ws = new this.Ctor(this.url, this.protocols);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      queueMicrotask(() => this.onClose?.(`connection failed: ${msg}`));
      return;
    }
    ws.binaryType = 'arraybuffer';
    this.ws = ws;
    let opened = false;
    let done = false;
    this.byClient = false;
    const finish = (reason: string) => {
      if (done) return;
      done = true;
      if (this.ws === ws) this.ws = null;
      ws.onopen = ws.onmessage = ws.onerror = ws.onclose = null;
      this.onClose?.(reason);
    };
    ws.onopen = () => {
      opened = true;
      this.onOpen?.();
    };
    ws.onmessage = (ev: MessageEvent) => {
      const d: unknown = ev.data;
      if (d instanceof ArrayBuffer) this.onData?.(new Uint8Array(d));
      else if (typeof d === 'string') this.onData?.(new TextEncoder().encode(d));
    };
    ws.onerror = () => {
      // A close event always follows; the reason is reported there.
    };
    ws.onclose = (ev: CloseEvent) => {
      if (this.byClient) finish('closed by client');
      else if (!opened) finish(`connection failed (code ${ev.code})`);
      else finish(`closed by server (code ${ev.code}${ev.reason ? `: ${ev.reason}` : ''})`);
    };
  }

  send(bytes: Uint8Array): void {
    const ws = this.ws;
    if (ws && ws.readyState === 1) ws.send(bytes as Uint8Array<ArrayBuffer>);
  }

  close(): void {
    const ws = this.ws;
    if (!ws) return;
    this.byClient = true;
    ws.close();
  }
}
