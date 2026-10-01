// Streaming telnet parser and option negotiator (spec §1.2 layer 2,
// ADR 0002, ADR 0007).
//
// - Input is fed frame by frame with `receive(bytes, ts)`. Every piece of
//   parser state lives on the object, so a frame may end anywhere: between
//   IAC and its command, inside a subnegotiation, or inside a UTF-8
//   multibyte character.
// - Text runs between telnet commands are decoded (Latin-1 until CHARSET
//   agrees on UTF-8, then a streaming UTF-8 TextDecoder) and handed to the
//   `TextSink`. IAC GA and IAC EOR become `sink.ga(ts)`.
// - `ts` is taken once per incoming frame by the caller (Session uses
//   `nowUs()` when the socket delivers the frame). Every text run and GA in
//   that frame carries the same timestamp. Frames arrive as whole network
//   reads, so this is the best resolution available anyway.
// - Negotiation is RFC 1143-lite: we never initiate, and we only answer a
//   WILL/DO/WONT/DONT when it changes the option's state, so two peers can
//   never loop. Accepted: GMCP, MSSP, ECHO, EOR (server side); NAWS, TTYPE,
//   CHARSET (our side). Everything else is refused (MCCP2 → DONT,
//   NEW-ENVIRON → WONT, per ADR 0007).
// - NUL bytes in the text stream are dropped (telnet NVT no-op, and the
//   second half of CR NUL).

import type { TextSink } from './textsink';

// Telnet commands.
export const IAC = 255;
export const DONT = 254;
export const DO = 253;
export const WONT = 252;
export const WILL = 251;
export const SB = 250;
export const GA = 249;
export const NOP = 241;
export const SE = 240;
export const EOR_CMD = 239;

// Options.
export const OPT_ECHO = 1;
export const OPT_SGA = 3;
export const OPT_TTYPE = 24;
export const OPT_EOR = 25;
export const OPT_NAWS = 31;
export const OPT_NEW_ENVIRON = 39;
export const OPT_CHARSET = 42;
export const OPT_MSSP = 70;
export const OPT_MCCP2 = 86;
export const OPT_GMCP = 201;

// CHARSET subnegotiation codes (RFC 2066).
const CS_REQUEST = 1;
const CS_ACCEPTED = 2;
const CS_REJECTED = 3;
const CS_TTABLE_IS = 4;
const CS_TTABLE_REJECTED = 5;

// TTYPE / MSSP codes.
const TTYPE_IS = 0;
const TTYPE_SEND = 1;
const MSSP_VAR = 1;
const MSSP_VAL = 2;

/** The charset list we offer in our own CHARSET REQUEST. */
export const CHARSET_REQUEST = ';UTF-8;ISO-8859-1';
export const DEFAULT_TTYPE = 'WebCockpit';

/** Largest subnegotiation we buffer; anything longer is discarded. */
const MAX_SB = 1 << 20;

// Parser states.
const S_DATA = 0;
const S_IAC = 1;
const S_WILL = 2;
const S_WONT = 3;
const S_DO = 4;
const S_DONT = 5;
const S_SB_OPT = 6;
const S_SB_DATA = 7;
const S_SB_IAC = 8;

export interface TelnetOptions {
  /** Receives decoded text and GA marks. */
  sink: TextSink;
  /** Writes protocol or text bytes to the socket. */
  write: (bytes: Uint8Array) => void;
  /**
   * A complete GMCP message payload (`Package.Name [json]`), decoded. `ts`
   * is the receive time of the frame that completed it (µs).
   */
  onGmcp?: (payload: string, ts: number) => void;
  /** GMCP was enabled (server WILL GMCP, we already sent DO GMCP). */
  onGmcpEnabled?: () => void;
  /** Server ECHO state changed (true: server echoes, i.e. password mode). */
  onEcho?: (serverEchoes: boolean) => void;
  /** A new MSSP table arrived. */
  onMssp?: (vars: ReadonlyMap<string, string[]>) => void;
  /** The text charset changed (after CHARSET agreement or `forceUtf8`). */
  onCharset?: (charset: 'UTF-8' | 'ISO-8859-1') => void;
  /** TTYPE answer. Default `WebCockpit`. */
  ttype?: string;
}

const latin1Chunk = 8192;

/** Decodes bytes as ISO-8859-1 (true Latin-1, not windows-1252). */
export function decodeLatin1(bytes: Uint8Array, start = 0, end = bytes.length): string {
  const n = end - start;
  if (n <= 0) return '';
  if (n <= latin1Chunk) {
    return String.fromCharCode.apply(null, bytes.subarray(start, end) as unknown as number[]);
  }
  let s = '';
  for (let i = start; i < end; i += latin1Chunk) {
    const e = Math.min(end, i + latin1Chunk);
    s += String.fromCharCode.apply(null, bytes.subarray(i, e) as unknown as number[]);
  }
  return s;
}

/** Encodes a string as Latin-1; characters above U+00FF become `?`. */
export function encodeLatin1(s: string): Uint8Array {
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    out[i] = c <= 0xff ? c : 0x3f;
  }
  return out;
}

/** Doubles every 0xFF byte. Returns the input unchanged when there is none. */
export function escapeIac(bytes: Uint8Array): Uint8Array {
  let count = 0;
  for (let i = 0; i < bytes.length; i++) if (bytes[i] === IAC) count++;
  if (count === 0) return bytes;
  const out = new Uint8Array(bytes.length + count);
  let j = 0;
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i]!;
    out[j++] = b;
    if (b === IAC) out[j++] = IAC;
  }
  return out;
}

const utf8Encoder = new TextEncoder();

export class Telnet {
  private readonly o: TelnetOptions;
  private readonly ttype: string;

  private state = S_DATA;
  private sbOpt = 0;
  private sbBuf = new Uint8Array(4096);
  private sbLen = 0;
  private sbOverflow = false;

  /** Options enabled on the server side (it WILL, we said DO). */
  private readonly him = new Uint8Array(256);
  /** Options enabled on our side (it said DO, we said WILL). */
  private readonly us = new Uint8Array(256);

  private isUtf8 = false;
  private decoder: TextDecoder | null = null;
  /** One-byte buffer for a literal IAC IAC data byte. */
  private readonly ffByte = new Uint8Array([IAC]);

  private cols = 0;
  private rows = 0;
  private nawsSentCols = -1;
  private nawsSentRows = -1;

  private msspMap: Map<string, string[]> = new Map();

  constructor(opts: TelnetOptions) {
    this.o = opts;
    this.ttype = opts.ttype ?? DEFAULT_TTYPE;
  }

  // -------------------------------------------------------------------------
  // Public state
  // -------------------------------------------------------------------------

  /** True once UTF-8 is agreed (or forced). Latin-1 before that. */
  get utf8(): boolean {
    return this.isUtf8;
  }

  /** True when the server enabled GMCP and we accepted. */
  get gmcpEnabled(): boolean {
    return this.him[OPT_GMCP] === 1;
  }

  /** True when the server said WILL ECHO (password mode). */
  get serverEchoes(): boolean {
    return this.him[OPT_ECHO] === 1;
  }

  /** The latest MSSP table (empty until the server sends one). */
  get mssp(): ReadonlyMap<string, string[]> {
    return this.msspMap;
  }

  /** Is the option enabled on the server side (`him`) / our side (`us`)? */
  isEnabled(side: 'him' | 'us', opt: number): boolean {
    return (side === 'him' ? this.him : this.us)[opt & 0xff] === 1;
  }

  /** Clears all per-connection state. The window size is kept. */
  reset(): void {
    this.state = S_DATA;
    this.sbLen = 0;
    this.sbOverflow = false;
    this.him.fill(0);
    this.us.fill(0);
    this.isUtf8 = false;
    this.decoder = null;
    this.nawsSentCols = -1;
    this.nawsSentRows = -1;
    this.msspMap = new Map();
  }

  /**
   * Switches the text decoder to UTF-8 without negotiation (replay mode:
   * Cockpit logs are UTF-8).
   */
  forceUtf8(): void {
    this.setUtf8();
  }

  // -------------------------------------------------------------------------
  // Inbound
  // -------------------------------------------------------------------------

  /** Parses one inbound frame. `ts` is the frame's receive time (µs). */
  receive(bytes: Uint8Array, ts: number): void {
    const n = bytes.length;
    let i = 0;
    // Start of the pending plain-text run, or -1.
    let run = -1;
    // Positions of the next IAC and NUL at or after `i` (n: none), each
    // found with a native scan and reused until `i` passes it.
    let iac = -1;
    let nul = -1;
    while (i < n) {
      if (this.state === S_DATA) {
        // Plain text runs to the next IAC or NUL: no per-byte work.
        if (iac < i) {
          iac = bytes.indexOf(IAC, i);
          if (iac < 0) iac = n;
        }
        if (nul < i) {
          nul = bytes.indexOf(0, i);
          if (nul < 0) nul = n;
        }
        const stop = iac < nul ? iac : nul;
        if (stop > i && run < 0) run = i;
        if (stop >= n) break;
        if (run >= 0) {
          this.emitText(bytes, run, stop, ts);
          run = -1;
        }
        if (stop === iac) this.state = S_IAC;
        i = stop + 1;
        continue;
      }
      const b = bytes[i]!;
      switch (this.state) {
        case S_IAC:
          this.state = S_DATA;
          switch (b) {
            case IAC:
              this.emitText(this.ffByte, 0, 1, ts);
              break;
            case GA:
            case EOR_CMD:
              this.o.sink.ga(ts);
              break;
            case WILL:
              this.state = S_WILL;
              break;
            case WONT:
              this.state = S_WONT;
              break;
            case DO:
              this.state = S_DO;
              break;
            case DONT:
              this.state = S_DONT;
              break;
            case SB:
              this.state = S_SB_OPT;
              break;
            default:
              // NOP, DM, BRK, AYT, stray SE, ...: ignored.
              break;
          }
          break;

        case S_WILL:
          this.state = S_DATA;
          this.onWill(b);
          break;
        case S_WONT:
          this.state = S_DATA;
          this.onWont(b);
          break;
        case S_DO:
          this.state = S_DATA;
          this.onDo(b);
          break;
        case S_DONT:
          this.state = S_DATA;
          this.onDont(b);
          break;

        case S_SB_OPT:
          this.sbOpt = b;
          this.sbLen = 0;
          this.sbOverflow = false;
          this.state = S_SB_DATA;
          break;

        case S_SB_DATA: {
          // Copy up to the next IAC in one go.
          let j = bytes.indexOf(IAC, i);
          if (j < 0) j = n;
          this.sbAppend(bytes, i, j);
          if (j < n) this.state = S_SB_IAC;
          i = j + 1;
          continue;
        }

        case S_SB_IAC:
          if (b === IAC) {
            this.ffByte[0] = IAC;
            this.sbAppend(this.ffByte, 0, 1);
            this.state = S_SB_DATA;
          } else if (b === SE) {
            this.state = S_DATA;
            if (!this.sbOverflow) this.onSubneg(this.sbOpt, this.sbBuf.subarray(0, this.sbLen), ts);
            this.sbLen = 0;
          } else {
            // Protocol error: IAC <cmd> inside SB. Abort the subnegotiation
            // and treat the byte as a command after IAC.
            this.sbLen = 0;
            this.state = S_IAC;
            continue;
          }
          break;
      }
      i++;
    }
    if (run >= 0 && this.state === S_DATA) this.emitText(bytes, run, n, ts);
  }

  private emitText(bytes: Uint8Array, start: number, end: number, ts: number): void {
    let s: string;
    if (this.decoder) s = this.decoder.decode(bytes.subarray(start, end), { stream: true });
    else s = decodeLatin1(bytes, start, end);
    if (s.length) this.o.sink.text(s, ts);
  }

  private sbAppend(src: Uint8Array, start: number, end: number): void {
    const len = end - start;
    if (len <= 0 || this.sbOverflow) return;
    const need = this.sbLen + len;
    if (need > MAX_SB) {
      this.sbOverflow = true;
      return;
    }
    if (need > this.sbBuf.length) {
      let cap = this.sbBuf.length * 2;
      while (cap < need) cap *= 2;
      const nb = new Uint8Array(cap);
      nb.set(this.sbBuf.subarray(0, this.sbLen));
      this.sbBuf = nb;
    }
    this.sbBuf.set(src.subarray(start, end), this.sbLen);
    this.sbLen = need;
  }

  // -------------------------------------------------------------------------
  // Negotiation
  // -------------------------------------------------------------------------

  private acceptsHim(opt: number): boolean {
    return (
      opt === OPT_GMCP || opt === OPT_MSSP || opt === OPT_ECHO || opt === OPT_EOR || opt === OPT_CHARSET
    );
  }

  private acceptsUs(opt: number): boolean {
    return opt === OPT_NAWS || opt === OPT_TTYPE || opt === OPT_CHARSET;
  }

  private onWill(opt: number): void {
    if (this.him[opt]) return; // already enabled: no answer (no loops)
    if (!this.acceptsHim(opt)) {
      this.sendCmd(DONT, opt);
      return;
    }
    this.him[opt] = 1;
    this.sendCmd(DO, opt);
    if (opt === OPT_GMCP) this.o.onGmcpEnabled?.();
    else if (opt === OPT_ECHO) this.o.onEcho?.(true);
  }

  private onWont(opt: number): void {
    if (!this.him[opt]) return;
    this.him[opt] = 0;
    this.sendCmd(DONT, opt);
    if (opt === OPT_ECHO) this.o.onEcho?.(false);
  }

  private onDo(opt: number): void {
    if (this.us[opt]) return;
    if (!this.acceptsUs(opt)) {
      this.sendCmd(WONT, opt);
      return;
    }
    this.us[opt] = 1;
    this.sendCmd(WILL, opt);
    if (opt === OPT_NAWS) this.sendNaws(true);
    else if (opt === OPT_CHARSET) this.sendCharsetRequest();
  }

  private onDont(opt: number): void {
    if (!this.us[opt]) return;
    this.us[opt] = 0;
    this.sendCmd(WONT, opt);
  }

  private sendCmd(cmd: number, opt: number): void {
    this.o.write(new Uint8Array([IAC, cmd, opt]));
  }

  /** Writes `IAC SB opt <payload, IAC-escaped> IAC SE`. */
  private sendSb(opt: number, payload: Uint8Array): void {
    const esc = escapeIac(payload);
    const out = new Uint8Array(esc.length + 5);
    out[0] = IAC;
    out[1] = SB;
    out[2] = opt;
    out.set(esc, 3);
    out[esc.length + 3] = IAC;
    out[esc.length + 4] = SE;
    this.o.write(out);
  }

  private onSubneg(opt: number, data: Uint8Array, ts: number): void {
    switch (opt) {
      case OPT_GMCP:
        if (this.him[OPT_GMCP]) this.o.onGmcp?.(this.decodeWhole(data), ts);
        break;
      case OPT_TTYPE:
        if (data[0] === TTYPE_SEND && this.us[OPT_TTYPE]) {
          const name = encodeLatin1(this.ttype);
          const p = new Uint8Array(name.length + 1);
          p[0] = TTYPE_IS;
          p.set(name, 1);
          this.sendSb(OPT_TTYPE, p);
        }
        break;
      case OPT_CHARSET:
        this.onCharsetSb(data);
        break;
      case OPT_MSSP:
        this.onMsspSb(data);
        break;
      default:
        break;
    }
  }

  // -------------------------------------------------------------------------
  // CHARSET (RFC 2066)
  // -------------------------------------------------------------------------

  private sendCharsetRequest(): void {
    const s = encodeLatin1(CHARSET_REQUEST);
    const p = new Uint8Array(s.length + 1);
    p[0] = CS_REQUEST;
    p.set(s, 1);
    this.sendSb(OPT_CHARSET, p);
  }

  private onCharsetSb(data: Uint8Array): void {
    if (data.length === 0) return;
    const code = data[0]!;
    if (code === CS_REQUEST) {
      let k = 1;
      // Optional "[TTABLE]" <version>.
      if (decodeLatin1(data, 1, Math.min(data.length, 9)) === '[TTABLE]') k = 10;
      if (k >= data.length) {
        this.sendSb(OPT_CHARSET, new Uint8Array([CS_REJECTED]));
        return;
      }
      const sep = String.fromCharCode(data[k]!);
      const names = decodeLatin1(data, k + 1).split(sep);
      const utf8 = names.find((nm) => isUtf8Name(nm));
      if (utf8 !== undefined) {
        const nb = encodeLatin1(utf8);
        const p = new Uint8Array(nb.length + 1);
        p[0] = CS_ACCEPTED;
        p.set(nb, 1);
        this.sendSb(OPT_CHARSET, p);
        this.setUtf8();
      } else {
        this.sendSb(OPT_CHARSET, new Uint8Array([CS_REJECTED]));
      }
    } else if (code === CS_ACCEPTED) {
      const name = decodeLatin1(data, 1);
      if (isUtf8Name(name)) this.setUtf8();
      else this.setLatin1();
    } else if (code === CS_REJECTED) {
      // Stay with the current charset (Latin-1 unless already agreed).
    } else if (code === CS_TTABLE_IS) {
      this.sendSb(OPT_CHARSET, new Uint8Array([CS_TTABLE_REJECTED]));
    }
  }

  private setUtf8(): void {
    if (this.isUtf8) return;
    this.isUtf8 = true;
    this.decoder = new TextDecoder('utf-8', { fatal: false, ignoreBOM: true });
    this.o.onCharset?.('UTF-8');
  }

  private setLatin1(): void {
    if (!this.isUtf8) return;
    this.isUtf8 = false;
    this.decoder = null;
    this.o.onCharset?.('ISO-8859-1');
  }

  // -------------------------------------------------------------------------
  // MSSP
  // -------------------------------------------------------------------------

  private onMsspSb(data: Uint8Array): void {
    const map = new Map<string, string[]>();
    let name: string | null = null;
    let i = 0;
    const n = data.length;
    while (i < n) {
      const code = data[i]!;
      let j = i + 1;
      while (j < n && data[j] !== MSSP_VAR && data[j] !== MSSP_VAL) j++;
      const s = this.decodeWhole(data.subarray(i + 1, j));
      if (code === MSSP_VAR) {
        name = s;
        if (!map.has(name)) map.set(name, []);
      } else if (code === MSSP_VAL && name !== null) {
        map.get(name)!.push(s);
      }
      i = j;
    }
    this.msspMap = map;
    this.o.onMssp?.(map);
  }

  // -------------------------------------------------------------------------
  // Outbound
  // -------------------------------------------------------------------------

  /** Decodes a complete byte string with the current charset (non-streaming). */
  decodeWhole(bytes: Uint8Array): string {
    if (this.isUtf8) return new TextDecoder('utf-8', { ignoreBOM: true }).decode(bytes);
    return decodeLatin1(bytes);
  }

  /** Encodes with the current charset. No IAC escaping. */
  encode(s: string): Uint8Array {
    return this.isUtf8 ? utf8Encoder.encode(s) : encodeLatin1(s);
  }

  /** Encodes `text` for the wire: current charset, IAC doubled. */
  encodeText(text: string): Uint8Array {
    return escapeIac(this.encode(text));
  }

  /**
   * Builds the GMCP frame `IAC SB GMCP <payload> IAC SE`, or null when GMCP
   * is not enabled.
   */
  encodeGmcp(payload: string): Uint8Array | null {
    if (!this.him[OPT_GMCP]) return null;
    const esc = escapeIac(this.encode(payload));
    const out = new Uint8Array(esc.length + 5);
    out[0] = IAC;
    out[1] = SB;
    out[2] = OPT_GMCP;
    out.set(esc, 3);
    out[esc.length + 3] = IAC;
    out[esc.length + 4] = SE;
    return out;
  }

  /** Sends a GMCP message. Returns false (and sends nothing) when GMCP is off. */
  sendGmcp(payload: string): boolean {
    const out = this.encodeGmcp(payload);
    if (!out) return false;
    this.o.write(out);
    return true;
  }

  /**
   * Sets the window size in character cells. Sent as NAWS right away when
   * NAWS is enabled and the size changed; otherwise kept for later.
   */
  setWindowSize(cols: number, rows: number): void {
    this.cols = clamp16(cols);
    this.rows = clamp16(rows);
    this.sendNaws(false);
  }

  private sendNaws(force: boolean): void {
    if (!this.us[OPT_NAWS]) return;
    if (!force && this.cols === this.nawsSentCols && this.rows === this.nawsSentRows) return;
    this.nawsSentCols = this.cols;
    this.nawsSentRows = this.rows;
    this.sendSb(
      OPT_NAWS,
      new Uint8Array([this.cols >> 8, this.cols & 0xff, this.rows >> 8, this.rows & 0xff]),
    );
  }
}

function clamp16(v: number): number {
  if (!Number.isFinite(v) || v < 0) return 0;
  return Math.min(0xffff, Math.floor(v));
}

function isUtf8Name(name: string): boolean {
  const n = name.trim().toUpperCase();
  return n === 'UTF-8' || n === 'UTF8';
}
