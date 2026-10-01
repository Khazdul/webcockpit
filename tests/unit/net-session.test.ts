import { describe, expect, it } from 'vitest';
import { Bus } from '../../src/core/bus';
import type { BusEvents } from '../../src/core/types';
import { NOT_SENT, REASON_USER_DISCONNECT, REASON_USER_RECONNECT, Session } from '../../src/net/session';
import { OPT_ECHO, OPT_GMCP, WILL, WONT } from '../../src/net/telnet';
import { FakeSocket, FakeTimers, IAC, RecSink, ascii, gmcpOut, sb, utf8 } from './net-helpers';

function make() {
  const bus = new Bus();
  const sink = new RecSink();
  const sockets: FakeSocket[] = [];
  const states: BusEvents['conn.state'][] = [];
  const cmds: BusEvents['cmd.sent'][] = [];
  const echo: boolean[] = [];
  const order: string[] = [];
  bus.on('conn.state', (p) => (states.push(p), order.push('state:' + p.state)));
  bus.on('cmd.sent', (p) => (cmds.push(p), order.push('cmd')));
  bus.on('net.bytesOut', () => order.push('out'));
  bus.on('telnet.echo', (p) => echo.push(p.serverEchoes));
  const s = new Session({
    bus,
    sink,
    socketFactory: () => {
      const f = new FakeSocket();
      sockets.push(f);
      return f;
    },
  });
  const sock = () => sockets.at(-1)!;
  return { bus, sink, s, sockets, sock, states, cmds, echo, order };
}

const gmcp = (payload: string) => Uint8Array.from(sb(OPT_GMCP, utf8(payload)));

describe('Session state machine', () => {
  it('goes idle → connecting → login → playing → disconnected', () => {
    const m = make();
    expect(m.s.state).toBe('idle');
    m.s.connect();
    expect(m.sock().connected).toBe(1);
    m.sock().open();
    m.sock().data([IAC, WILL, OPT_GMCP]);
    m.sock().data(gmcp('Char.Name {"name":"Rasta","fullname":"Rasta Fari"}'));
    m.sock().data(gmcp('char.name {"name":"Rasta"}')); // no second transition
    m.sock().data(gmcp('Core.Goodbye "Come back soon!"'));
    m.sock().drop();
    expect(m.states).toEqual([
      { state: 'connecting', prev: 'idle' },
      { state: 'login', prev: 'connecting' },
      { state: 'playing', prev: 'login' },
      { state: 'disconnected', prev: 'playing', reason: 'Core.Goodbye: Come back soon!' },
    ]);
  });

  it('sends the width commands without echo on entering playing', () => {
    const m = make();
    m.s.connect();
    m.sock().open();
    m.sock().data([IAC, WILL, OPT_GMCP]);
    m.sock().sent.length = 0;
    m.sock().data(gmcp('Char.Name {"name":"Rasta"}'));
    const text = new TextDecoder().decode(Uint8Array.from(m.sock().sentBytes()));
    expect(text).toBe('change width all 500\r\nchange width table terminal\r\n');
    expect(m.cmds.map((c) => [c.text, c.echo])).toEqual([
      ['change width all 500', false],
      ['change width table terminal', false],
    ]);
  });

  it('gives one disconnect per drop, with the socket reason', () => {
    const m = make();
    m.s.connect();
    m.sock().open();
    m.sock().drop('closed by server (code 1006)');
    m.sock().drop('again');
    expect(m.states.at(-1)).toEqual({ state: 'disconnected', prev: 'login', reason: 'closed by server (code 1006)' });
    expect(m.states.filter((x) => x.state === 'disconnected').length).toBe(1);
  });

  it('reports a failed connect from connecting', () => {
    const m = make();
    m.s.connect();
    m.sock().drop('connection failed (code 1006)');
    expect(m.states.at(-1)).toEqual({ state: 'disconnected', prev: 'connecting', reason: 'connection failed (code 1006)' });
  });

  it('disconnect() is user-initiated and idempotent', () => {
    const m = make();
    m.s.connect();
    m.sock().open();
    m.s.disconnect();
    m.s.disconnect();
    expect(m.sock().closed).toBe(1);
    expect(m.states.at(-1)).toEqual({ state: 'disconnected', prev: 'login', reason: REASON_USER_DISCONNECT });
    expect(m.states.filter((x) => x.state === 'disconnected').length).toBe(1);
  });

  it('reconnect() closes, marks the close as user-initiated, and connects again', () => {
    const m = make();
    m.s.connect();
    m.sock().open();
    const first = m.sock();
    m.s.reconnect();
    expect(first.closed).toBe(1);
    expect(m.sockets.length).toBe(2);
    expect(m.states.slice(-2)).toEqual([
      { state: 'disconnected', prev: 'login', reason: REASON_USER_RECONNECT },
      { state: 'connecting', prev: 'disconnected' },
    ]);
    // A late event from the old socket is ignored.
    first.onData?.(Uint8Array.from(ascii('stale')));
    expect(m.sink.out).toBe('');
  });

  it('ignores connect() while connected', () => {
    const m = make();
    m.s.connect();
    m.s.connect();
    expect(m.sockets.length).toBe(1);
  });
});

describe('Session sending', () => {
  it('sends synchronously, CR LF terminated, and emits cmd.sent after the write', () => {
    const m = make();
    m.s.connect();
    m.sock().open();
    m.order.length = 0;
    m.s.sendCommand('look');
    expect(new TextDecoder().decode(m.sock().sent.at(-1))).toBe('look\r\n');
    expect(m.order).toEqual(['out', 'cmd']);
    expect(m.cmds.at(-1)).toMatchObject({ text: 'look' });
    expect(m.cmds.at(-1)!.secret).toBeUndefined();
    expect(m.cmds.at(-1)!.echo).toBeUndefined();
  });

  it('sends an empty Enter as a bare CR LF', () => {
    const m = make();
    m.s.connect();
    m.sock().open();
    m.s.sendCommand('');
    expect(Array.from(m.sock().sent.at(-1)!)).toEqual([13, 10]);
    expect(m.cmds.at(-1)!.text).toBe('');
  });

  it('blanks secret commands and escapes IAC', () => {
    const m = make();
    m.s.connect();
    m.sock().open();
    m.s.sendCommand('pÿss', { secret: true });
    expect(Array.from(m.sock().sent.at(-1)!)).toEqual([...ascii('p'), IAC, IAC, ...ascii('ss'), 13, 10]);
    expect(m.cmds.at(-1)).toMatchObject({ text: '', secret: true });
  });

  it('tracks server ECHO as password mode and forces secret', () => {
    const m = make();
    m.s.connect();
    m.sock().open();
    m.sock().data([IAC, WILL, OPT_ECHO]);
    expect(m.s.passwordMode).toBe(true);
    m.s.sendCommand('hunter2');
    expect(m.cmds.at(-1)).toMatchObject({ text: '', secret: true });
    m.sock().data([IAC, WONT, OPT_ECHO]);
    expect(m.s.passwordMode).toBe(false);
    expect(m.echo).toEqual([true, false]);
  });

  it('clears password mode when the link drops', () => {
    const m = make();
    m.s.connect();
    m.sock().open();
    m.sock().data([IAC, WILL, OPT_ECHO]);
    m.sock().drop();
    expect(m.s.passwordMode).toBe(false);
    expect(m.echo).toEqual([true, false]);
  });

  it('drops commands when not connected, with one [SYSTEM] line each', () => {
    const m = make();
    const sys: string[] = [];
    m.bus.on('sys.message', (p) => sys.push(p.text));
    m.s.sendCommand('look');
    m.s.connect();
    m.s.sendCommand('look');
    expect(m.sock().sent.length).toBe(0);
    expect(m.cmds.length).toBe(0);
    expect(sys).toEqual([NOT_SENT, NOT_SENT]);
  });

  it('drops a command while the socket is closing: no bytes, no cmd.sent', () => {
    const m = make();
    const sys: string[] = [];
    m.bus.on('sys.message', (p) => sys.push(p.text));
    m.s.connect();
    m.sock().open();
    const before = m.sock().sent.length;
    m.order.length = 0;
    (m.sock() as { isOpen?: boolean }).isOpen = false;
    m.s.sendCommand('look');
    expect(m.sock().sent.length).toBe(before);
    expect(m.order).toEqual([]);
    expect(m.cmds.length).toBe(0);
    expect(sys).toEqual([NOT_SENT]);
    (m.sock() as { isOpen?: boolean }).isOpen = true;
    m.s.sendCommand('look');
    expect(m.cmds.length).toBe(1);
    expect(sys.length).toBe(1);
  });

  it('does the GMCP handshake and answers Comm.Channel.List', () => {
    const m = make();
    m.s.connect();
    m.sock().open();
    m.sock().data([IAC, WILL, OPT_GMCP]);
    m.sock().data(gmcp('Comm.Channel.List [{"name":"tells"},{"name":"says"}]'));
    const out = gmcpOut(m.sock().sentBytes());
    expect(out[0]).toMatch(/^Core\.Hello /);
    expect(out[1]).toMatch(/^Core\.Supports\.Set /);
    expect(out.slice(2)).toEqual([
      'MUME.Client.XML {"enable":true,"silent":true}',
      'Comm.Channel.Enable "tells"',
      'Comm.Channel.Enable "says"',
    ]);
  });

  it('emits net.bytesIn and passes text to the sink', () => {
    const m = make();
    const ins: number[] = [];
    m.bus.on('net.bytesIn', (b) => ins.push(b.length));
    m.s.connect();
    m.sock().open();
    m.sock().data(ascii('hi\r\n'));
    expect(ins).toEqual([4]);
    expect(m.sink.out).toBe('hi\r\n');
  });
});

describe('Session link probe', () => {
  function makeProbe() {
    const bus = new Bus();
    const timers = new FakeTimers();
    const urls: string[] = [];
    const rtts: BusEvents['link.rtt'][] = [];
    bus.on('link.rtt', (p) => rtts.push(p));
    const sockets: FakeSocket[] = [];
    const s = new Session({
      bus,
      sink: new RecSink(),
      timers,
      linkFetch: (url) => (urls.push(url), Promise.resolve({})),
      socketFactory: () => {
        const f = new FakeSocket();
        sockets.push(f);
        return f;
      },
    });
    const flush = async (): Promise<void> => {
      for (let i = 0; i < 20; i++) await Promise.resolve();
    };
    return { s, timers, urls, rtts, sockets, flush };
  }

  it('probes from login to disconnect and feeds the Link readout', async () => {
    const m = makeProbe();
    m.s.connect();
    m.timers.advance(0);
    expect(m.urls).toHaveLength(0); // not before the socket opens
    m.sockets[0]!.open();
    expect(m.s.linkProbe!.active).toBe(true);
    m.timers.advance(0);
    await m.flush();
    expect(m.urls).toHaveLength(3); // two warm-ups, one timed
    expect(m.rtts.at(-1)).toMatchObject({ ms: 0, http: 0, ping: null });
    m.s.disconnect();
    expect(m.s.linkProbe!.active).toBe(false);
    m.timers.advance(60_000);
    await m.flush();
    expect(m.urls).toHaveLength(3);
  });

  it('does not probe a replay connection', async () => {
    const m = makeProbe();
    const replay = Object.assign(new FakeSocket(), { replay: true as const });
    m.s.connect(replay);
    replay.open();
    m.timers.advance(20_000);
    await m.flush();
    expect(m.s.linkProbe!.active).toBe(false);
    expect(m.urls).toHaveLength(0);
  });

  it('has no probe without linkFetch', () => {
    const s = new Session({ bus: new Bus(), sink: new RecSink(), socketFactory: () => new FakeSocket() });
    expect(s.linkProbe).toBeNull();
  });
});

