# 0036 — khazdul as a reference profile; `_send` deprecated

- Status: Accepted
- Date: 2026-09-30
- Amends: ADR 0024, ADR 0015 (built-ins, echo)

## Context

The bundled `khazdul` profile (ADR 0024) was a verbatim copy of the
owner's tt++ profile. The owner now wants it to be a reference: an
example of how to write good settings in WebCockpit. The copy carried
terminal-client habits that make no sense here, above all `_send`. In
Cockpit `_send <cmd>` echoed a command and sent it, because tt++ does not
echo what an alias sends. WebCockpit echoes every command (ADR 0015), so
`_send x` is `x`.

## Decision

- `src/profiles/khazdul.tin` is a curated reference profile, no longer a
  copy of `/home/ole/MUME/ttpp/profiles/khazdul.tin`. It keeps the owner's
  gameplay rules and is organised by topic with short `#nop` headers.
  - No `_send`; bodies send plain commands.
  - Macros use key names (`F1`–`F9`) instead of escape codes.
  - Lower-case command words. A body of one short command list is on one
    line; longer bodies use `#alias {name} {` … `}`, the layout the lite
    editor writes.
  - Helper aliases `_spell` and `_scroll` replace repeated bodies; `dx`
    calls `sd`; the two `raises his/her hand` actions are one pattern.
  - Removed: the autobash aliases, `e1`, `e2`, the accented direction
    aliases, the `#ticker {clock}` (`#lua` is inert here), the unused
    variables `test` and `weapon1`, and the top-level `_sd_line` (scratch
    state of `sd`, which would otherwise be written back to the profile).
  - Every top-level line is a typed entry, a `#nop` or blank, and the
    profile loads with no warnings. A unit test keeps it so, and checks
    that no sent command starts with the name of another alias.
- `_send` is **deprecated but still honoured.** The engine keeps the
  built-in (it sends its argument without alias lookup and cannot be
  shadowed) because stored profiles, including seeded copies of the old
  khazdul, use it; without the built-in they would send the literal text
  `_send …` to the game. It is no longer documented: `#help` and the
  reference profile do not mention it. The editor's warning for an alias
  named `_send` stays.
- A plain command is now trimmed after variable expansion, as `_send`
  already was, so `close $door` with an empty `$door` sends `close`, not
  `close ` with a trailing space. With this, `_send x` and `x` send the
  same text whenever `x` is not an alias.

## Consequences

- Existing users' stored profiles are untouched (ADR 0024: the bundled
  text only reaches a first run). They keep working as before.
- A user who wants to send a word that is also an alias name still has
  `_send`, undocumented. An alias never re-enters itself, which covers
  the common case (`#alias {look} {look; exits}`).
- One known difference from the old copy: text typed after a spell alias
  (`bh x`) becomes part of the spell name, where it used to be ignored.
