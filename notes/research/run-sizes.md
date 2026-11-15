# Run sizes: what a saved run costs in the cloud

Stage 63, part A, 2026-11-15. Input to the owner's call on the per-account
run storage limit (spec §7.5: "50 MB to begin with"; ADR 0153). Scripts in
the session scratchpad (`run-sizes/measure.mjs`, `summary.mjs`, not in the
repo). This note has no game text and no character names.

## Material

- **WebCockpit's own backups** of the owner's runs (`~/Downloads/
  webcockpit-runs-*.jsonl.gz`, four files, read only), merged by `runId`
  (the newer file wins): **72 runs, 11.8 played hours**, 2026-09-27 to
  2026-11-10, two characters, 23 of them saved. These are exactly what
  WebCockpit stores (meta, events, chunks with every client record:
  GMCP, VIEW, SIZE, SPANE). Runs from before GMCP was recorded
  (2026-09-27, the first day) have no GMCP.
- **Cockpit's run records** (`/home/ole/MUME/data/runs/<character>/`,
  read only): **12 runs, 10.6 played hours**, of which two long ones
  (2.4 h and 5.0 h, 3.2 and 3.9 MB of log). Each run is a `.log` (one
  line per received line or sent command, `<16-digit µs> <text>`, ANSI
  SGR as received, i.e. byte for byte WebCockpit's capture line format)
  and a `.jsonl` of events (`run_start`, `kill`, `pkill`, `tp_gained`,
  `group_changed`, `run_end`) and sometimes a `.meta.json` (saved,
  rating). They hold **no GMCP**.

Together: 84 runs, 22.5 played hours. "Played time" is the run's span,
`endedUs − startedUs` (connected time, idle included).

## Method

- **The body** as ADR 0153 builds it: the header line
  `{"type":"webcockpit-run-body","v":1}`, then the run's backup lines in
  `backup()`'s order and format (src/runs/library.ts): `{"type":"run",
  "run":{…RunMeta}}` (note: the backup's key is `run`, not `meta` as the
  ADR's wording has it), the events `{"type":"event",runId,seq,event}`,
  the chunks `{"type":"chunk",runId,seq,firstUs,lastUs,text}`. Gzip with
  node zlib at the default level. Then **the real `encryptBody`**
  (src/cloud/crypto/segments.ts, bundled with esbuild, a random AES-256
  key, kind `run`): the output length was checked against
  `sealedBodySize()` for every run.
- **Encryption overhead**: a 21-byte header (version 1, segment size 4,
  body id 16) and 28 bytes per started 1 MiB segment (nonce 12, tag 16).
  A body under 1 MiB costs gzip + 49 bytes; the largest body here
  (≤ 2.7 MB) costs ≈ 105 bytes. Negligible (< 0.1 %).
- **Cockpit runs converted**: the log lines are kept as they are (same
  line format). A VIEW and a SIZE record are put first, copied from the
  latest real WebCockpit run (what the recorder writes at a run's
  start). Lines are cut into chunks as the recorder does (one chunk per
  2 s flush window that has lines, at most 256 KiB). Events are mapped
  one to one to `RunEvent` (seconds → µs, snake → camel, `logUs` = `us`);
  the meta's `summary` is folded from them; `saved` is taken as true.
  Events are tiny (1 008 events in all 84 runs, 110–225 bytes each), so
  their error does not matter.
- **GMCP for the Cockpit runs is estimated.** In the WebCockpit runs GMCP
  is 30–70 % of the capture bytes of a normal play run (by package:
  Room.Info 45 %, Group.Update 20 %, Room.Chars.* 19 %, Char.Vitals 5 %,
  Event.Moved 4 %, Comm 3 %). It was measured how much it adds after
  gzip: for each WebCockpit run of at least 0.1 h with GMCP (28 runs),
  gzip of the whole body over gzip of the body with the GMCP records
  taken out. That factor is 1.02–2.81, quartiles 1.14 / **1.42** / 1.93
  (raw bytes: median 1.35, max 2.15). The Cockpit runs' figures below use
  the median 1.42; the bound is the largest factor seen, 2.81, given in
  brackets. Both long Cockpit runs are fighting and moving runs (73 and
  more kills), so the upper half of the band is the more likely.
- **The `run` item**: `canonicalJson({v: 1, runId, meta, size})`, meta
  as stored (summary included), sealed with the real `seal()` (blob.ts:
  29 bytes over the plaintext). The Worker counts the binary blob
  against `itemBytes` (worker/sync.ts); base64url (4/3) is only what the
  item log sends.

## Figures

All runs of at least 0.25 h (18 runs). KB = 1 000 bytes. "c" Cockpit
(estimated GMCP, bound in brackets), "w" WebCockpit (measured).

| Run | Hours | Raw JSONL | Gzip | Encrypted body | KB per hour | GMCP / SPANE share of capture |
|---|---|---|---|---|---|---|
| c, long A | 2.41 | 5 254 KB | 1 008 KB | 1 008 KB [1 991] | 419 [826] | — (est.) |
| c, long B | 5.04 | 6 690 KB | 1 363 KB | 1 363 KB [2 693] | 270 [534] | — (est.) |
| w | 1.86 | 4 140 KB | 623 KB | 623 KB | 335 | 64 % / 0 % |
| w | 0.86 | 2 865 KB | 383 KB | 383 KB | 445 | 64 % / 0 % |
| w | 0.74 | 2 337 KB | 300 KB | 300 KB | 405 | 40 % / 23 % |
| w | 1.13 | 1 363 KB | 187 KB | 187 KB | 165 | 47 % / 13 % |
| w | 0.36 | 345 KB | 48 KB | 48 KB | 133 | 36 % / 1 % |
| w | 1.13 | 722 KB | 91 KB | 91 KB | 81 | 33 % / 4 % |
| w | 0.31 | 157 KB | 25 KB | 25 KB | 79 | 63 % / 0 % |
| w | 1.25 | 431 KB | 63 KB | 63 KB | 51 | 53 % / 1 % |
| w, script panes | 0.29 | 3 476 KB | 238 KB | 238 KB | **820** | 2 % / 95 % |
| w, script panes | 0.33 | 1 994 KB | 204 KB | 204 KB | 610 | 1 % / 97 % |
| w, script panes | 0.35 | 1 533 KB | 82 KB | 82 KB | 232 | 2 % / 86 % |
| w, idle | 0.66 | 391 KB | 30 KB | 30 KB | 45 | 12 % / 39 % |
| w, idle | 0.30 | 29 KB | 6 KB | 6 KB | 19 | 55 % / 5 % |
| w, idle | 0.55 | 36 KB | 7 KB | 7 KB | 12 | 34 % / 8 % |
| w, idle | 0.82 | 35 KB | 6 KB | 6 KB | 8 | 27 % / 14 % |
| w, idle | 0.80 | 21 KB | 4 KB | 4 KB | 5 | 40 % / 14 % |

| Figure | Value |
|---|---|
| All 84 runs, 22.5 h: raw / encrypted | 42.0 MB / 5.8 MB (8.2 MB with the Cockpit bound) |
| Compression (gzip of the JSONL) | 5–8× for play, up to 21× for script pane records; 7.3× over all |
| JSON framing over the capture text | about +20 % raw (chunk records, `\u001b` for each ESC, escaped quotes in GMCP); gzip takes most of it back |
| Encrypted bytes per played hour, runs ≥ 0.25 h | median **149 KB**, quartiles 46 / 388 KB, max **820 KB** |
| Active play (moving, fighting) | **270–445 KB per hour** (Cockpit bound: up to 830 KB) |
| Over all material | 257 KB per hour (364 KB with the Cockpit bound) |
| Largest single body | 1.4 MB, a 5-hour run (bound 2.7 MB); the largest measured one 0.62 MB (1.9 h). 20 MB limit: **7–14 % of it**; reached only after about **25 hours** in one run at the worst rate seen |
| `run` item, canonical JSON | 212–461 bytes (median 404) |
| `run` item, sealed blob (what counts) | 241–490 bytes (median 433) |
| `run` item in the item log (base64url) | median 578, max 654 characters |
| Mean encrypted body per run (all 84, short ones included) | 69 KB; 3.7 runs per played hour (reconnects and short logins) |

### What fits in 50 MB (50 MiB, as `DEFAULT_ACCOUNT_LIMITS.runBytes`)

| Rate | Played hours in 50 MiB |
|---|---|
| Heavy active play, 445 KB/h | about 118 h |
| Typical active play, 335 KB/h | about 156 h |
| The material's mix, 257 KB/h | about 204 h |
| Median run, 149 KB/h | about 350 h |
| Worst run seen (script pane records), 820 KB/h | about 64 h |

With the material's mix that is about 760 saved runs, whose `run` items
take about 0.3 MiB of the 2 MiB of small items and 760 of the 2 000 items
(plus one `exportDoc` per session).

### Cost on R2

100 accounts all at 50 MiB = 5.2 GB, about half of R2's free 10 GB-month;
the free storage holds 190 full accounts. Beyond it R2 costs
$0.015 per GB-month, so 100 more full accounts are about $0.08 a month.
Requests are no matter: one PUT per saved run (Class A, a million free a
month), one GET per opened cloud run. Few accounts will be full: all of
the owner's 84 runs over seven weeks, saved or not, are 5.8 MB.

## Conclusion

- A saved run is small once gzipped: **0.3–0.45 MB per hour of active
  play**, 0.15 MB per hour for the median run, idle runs almost nothing.
  GMCP is half of the raw capture but compresses well (Room.Info
  repeats); script pane records (SPANE) are the one thing that can push
  a run toward 0.8 MB per hour.
- Encryption adds nothing to speak of (49 bytes per body below 1 MiB).
- **The 20 MB per body** is far away: the longest real run (5 h) is
  1.4 MB, at most 2.7 MB. It stays as a guard.
- **50 MB is 120–200 hours of play** for an active player, about 64 hours
  in the worst case seen. That is weeks to months of saved sessions,
  since only saved runs go up.

## Proposal: the per-account limit (the owner decides)

**Keep 50 MB (50 MiB) to begin with.**

- It holds 120–200 played hours of saved runs, several months for most
  players, since saving is a choice per session; the "does not fit"
  dialog with Download covers the rest.
- It keeps the cost at nothing: 100 full accounts are half the free R2
  storage; 190 full accounts fit before a cent is paid, and real
  accounts will be far below full.
- It is a server value (`RUN_BYTES_LIMIT`, ADR 0153), so raising it to
  100 MB later needs no release, and per-account limits come in stage 66.
  Starting low and raising is easy; lowering means refusing runs players
  already expect to sync.

## The small-item limits (2 MB, 2 000 items)

**They need not move for runs at 50 MB.** A run item is about 430 bytes
sealed. At 50 MiB a typical library is some 760 run items: 0.3 MiB and
760 items, beside a heavy week of Comm (≈ 0.95 MB, stage 62) and the
profiles, scripts and settings. They start to bite only if:

- **the run limit goes past about 100 MiB** (about 1 500 runs: 0.6 MiB
  and 1 500 items, plus Comm, scripts and export docs comes near both
  limits), or
- **a library of very many tiny runs** (reconnect fragments of a few KB):
  2 000 of them fill only about 10 MB of R2 but all 2 000 items and about
  1 MB of item bytes.

So when the run limit is raised above about 100 MB, raise the item count
(for example to 5 000) and `itemBytes` (for example to 4 MB) with it.
For the build: the upload queue must handle the item push failing with
`too_many_items` or `storage_full` after the body is up (otherwise the
body is an orphan and is dropped a day later, ADR 0153), for example by
treating it like `quota` (the row `full`, the "does not fit" dialog).
