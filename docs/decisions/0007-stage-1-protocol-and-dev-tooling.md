# 0007 — Stage 1 protocol choices and dev tooling

- Status: Accepted
- Date: 2026-09-27

## Context

Stage 1 builds the transport, telnet and line layers and needs a way to
test without logging in (spec §4). Several protocol details were left to
implementation.

## Decision

- **MCCP2 declined** (`IAC DONT COMPRESS2`) until the benchmark shows a
  need. MUME's output is small; decompression adds a stream hop to the
  hot path.
- **TTYPE** answers `WebCockpit`. **NEW-ENVIRON** is refused (`WONT`).
- **CHARSET:** the client requests `UTF-8;ISO-8859-1` and accepts
  `UTF-8` when the server asks. The decoder is Latin-1 until UTF-8 is
  agreed.
- **Keep-alive:** GMCP `Core.Ping` every 10 s while logging in or
  playing with GMCP enabled, regardless of other traffic, one ping
  outstanding at a time (a ping unanswered for 60 s is given up so a lost
  reply cannot stop the keep-alive). Its round trip is the `Link:`
  readout. No pong within 10 s marks the link as suspect; it is not
  closed automatically; the next pong clears it.
  *Amended 2026-09-27:* originally the ping went out only after 30 s
  without outbound traffic, so `Link:` stayed `—` during active play
  (owner's first live test).
  *Amended 2026-09-27 (2):* `Link:` shows the minimum RTT over the last
  60 s (about six samples), because MUME answers on its ~250 ms game
  pulse, so single samples spread over ~250 ms above the network RTT
  (see notes/research/mume-websocket.md, "Measured 2026-09-27"). The raw
  last sample is kept in `link.rtt.last`.
  *Amended by 0030 (2026-09-29):* `Link:` shows an HTTPS round trip to
  mume.org (a timed `HEAD` on a warm keep-alive connection) and falls
  back to the Core.Ping minimum only when that probe fails. Core.Ping
  still does the keep-alive and the suspect flag.
- **Prompts:** a line ending in `IAC GA`, or wrapped in the XML `prompt`
  tag, is a prompt. Text after the last newline with no GA stays pending
  and is shown when more data or a GA arrives.
- **Replay mode:** a fake socket feeds a Cockpit raw `.log` (Inv §7.1)
  through the same line layer. Inbound lines are re-encoded as telnet
  text; lines that look like prompts (end in `>`) get `IAC GA`. The file
  is loaded with a file picker. Nothing from Cockpit is copied into the
  repository; tests that need real logs read them from
  `$WEBCOCKPIT_FIXTURES` (default `/home/ole/MUME/data/runs`) and skip
  when it is missing.
- **Temporary chrome** (status line, `[SYSTEM]` lines, `#connect`,
  `#disconnect`, `#reconnect`, `#runlog`, `#replay`) exists until stage 2
  and stage 3 replace it.

## Consequences

- Revisit MCCP2 if the benchmark or a live session shows bandwidth as a
  bottleneck.
- Replay-driven tests and the benchmark depend on the owner's local logs;
  CI would need synthetic fixtures.
