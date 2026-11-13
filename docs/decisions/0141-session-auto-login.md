# 0141 — Automatic login for the session (phone and tablet)

- Status: Accepted as a way to start (owner, 2026-11-12: "agreed way to
  start, to be judged over time"). Built in stage 54, round 54c. Tried
  against a mocked MUME only; **not yet tried against the live game**,
  not yet released.
- Date: 2026-11-13
- Related: adds to ADR 0136 §10 ("Reconnect automatically": a dead link
  found on resume reconnects "with no saved login") and ADR 0075 §3.4
  (the link check on resume). Takes up the parked proposal of
  `notes/research/phone-review.md` §6.1 (saved login) and §6.6
  (reconnect and log in), in a narrower form. `intent.md` Goal 10
  (scripts never reach the password) holds. Stage:
  `docs/stages/54-tablet.md`.

## Context

A phone or tablet suspends a background tab, and the MUME link dies
meanwhile. Since ADR 0075 the client finds the dead link on resume, and
since ADR 0136 it can reconnect by itself; the player then types the
name and the password again, every time, on a touch keyboard.

The owner's wish (2026-11-12): after a login on a phone or tablet a box
asks whether to log in automatically as that character for the rest of
the session; the name and password are then kept for a while in the
browser, safely; when the client finds itself disconnected on coming
back, it connects and types the name and then the password.

The phone review (§6.1, §6.6) proposed more: character cards with a
password saved in the browser's storage, and a login over GMCP
`Char.Login`. That was parked: it needs an explicit yes, and
`Char.Login` is unverified against the live game.

**Why memory only.** The client has no server and no secret of its own.
Anything it writes to the browser's storage (localStorage,
sessionStorage, IndexedDB) can be encrypted only with a key that lies
beside it, so it is readable by whoever has the unlocked device or the
browser's profile directory, and it stays there after the tab is closed.
A value held in the page's memory is gone with the page. That is the
least that does what was asked, so it is where this starts.

## Decision

### 1. Scope

The phone's game layout only (`phoneGame`: phones, and tablets since
ADR 0140). All of it is in the phone's chunk (`src/phone/`): the rule
(`login-rule.ts`, pure), the vault (`login-vault.ts`), the question's
card (`login-ask.ts`) and the controller (`auto-login.ts`). Desktop runs
none of it. What the desktop's first load carries is one nullable
property on the session and a few words of wiring in the shell (see
Consequences).

### 2. Where the password is

In one object, `LoginVault`, in the page's memory. Two private fields
(`#pending`, `#stored`): not enumerable, not serialised, no getter. It
is written from one place (the controller's tap, below) and read from
one (`use`, which hands the stored password to one call of the
session's `sendCommand`). It is never written to settings, localStorage,
sessionStorage, IndexedDB, the run log, the raw capture, the command
history, the DOM, a notice, an error or the console.

The rule is never given the password: it is told that a secret was
sent, and answers `keepPending`, `arm`, `sendPassword`, `wipe`.

What the rule does hold of what was typed is one **name candidate**: a
plain (not secret) line sent at the login prompts, and only if it has
the shape of a name (letters only, 2 to 20). It is dropped when the
login prompts are left (play, the connection ending, a new connection,
Exit, a restore) and is only ever compared with the name MUME gives;
the name asked about, shown and sent is MUME's own (`Char.Name`). One
case to know: a password of that shape typed *before* the server has
turned ECHO off is such a plain line. The client then shows it in the
game text and keeps it in the command history as any command (as it
did before this round, and on desktop); in the rule it sits as the
candidate until the login prompts are left. It is never kept as the
password and never leads to a question.

**The bus.** `net.bytesOut` carries every byte written to the socket,
so the password's bytes too, for a hand-typed and an automatic password
alike. It has no subscriber today. A future capture of the raw outbound
stream must leave secret sends out.

### 3. Capture

`Session.loginTap` (new; null unless the phone's controller sets it) is
called by `Session.sendCommand` for each line sent while the session is
at the login prompts (`login`) of a real connection: the text, and
whether it was secret (the server had ECHO off). Nothing is tapped in
play, before a connection, or on a replay.

The rule keeps, per connection: the last name-shaped plain line (the
name candidate; a line of another shape forgets it) and, at each
non-empty secret line, that candidate as the name and the secret as the
pending password. Once a secret is kept, plain lines are not looked at
any more. When the connection
reaches play (`playing`: GMCP `Char.Name`, the client's existing
notion), the capture counts only if the captured name is the character
MUME named, compared without case. So:

- a new character (the line before the password is the answer to "did I
  get that right?", which is not a name) is never asked about;
- a failed login never reaches play; its pending password is dropped
  when the connection ends;
- a wrong password followed by the right one keeps the right one.

### 4. The question

"Log in automatically as <Name> for the rest of this session?", with
"Your name and account password are kept in this page's memory only. They are
gone when the page is closed or reloaded." and No / Yes.

- **Not a dialog.** The owner asked for the look dialog of stage 53 (the
  kit's `Dialog`). That component is modal by construction: it lives in
  a frame stack, draws a veil and holds every plain key while it is up.
  A player may be attacked the second they log in, so the question must
  take no key and block nothing. It is therefore a card of the phone
  layer's own make (the sheet's iron band, hood and lit ground), in the
  layer, with **no veil, no focus and no key handler**: only a tap on
  Yes or No answers it, a press on it leaves the focus (and our
  keyboard) where it was, and everything typed goes to the game.
- **Placement.** In the game text's rectangle, at the top (the oldest
  text), clear of the map lens and its keys where there is room: beside
  the lens on a wide screen, under it on a narrow one. The newest text,
  the command row, the compass and the hot keys are at the bottom and
  stay free. On a low screen (a phone on its side with the keyboard up)
  it is laid out low, Yes and No beside the text.
- **Once per character per page load.** No is remembered: not asked
  again for that character, and the pending password is dropped at once.
  Yes is remembered too: after a wipe (below), the next login by hand as
  that character arms again without a question, with a notice.
- **Unanswered.** After 60 s, or when the connection ends, the card goes
  and the pending password is dropped. That is not an answer: the next
  login by hand asks again. (Departure from "asked once": a question
  missed in a fight would otherwise be lost for the page load.)

### 5. Use

With Yes the session is armed for that character.

- **Reconnect.** A dead link found on resume reconnects (the rule of
  `auto-reconnect.ts`, unchanged) whether or not "Reconnect
  automatically" is on. The menu's Reconnect, Enter on a dropped
  connection and `#connect` use the stored login too: every new real
  connection of an armed session is logged in, once.
- **The attempt.** The name is sent at MUME's name prompt (a line that
  matches `By what name do you wish to be known?`). The password is sent
  only when, after the name was sent, the server turns ECHO off
  (`IAC WILL ECHO`), and only if, once the frame that brought it has
  been read to its end, the session is still at the login prompts of the
  same real connection with its own password mode on. Then play as the
  armed character ends the attempt.
- **Both sends go straight to `Session.sendCommand`**, the call a
  hand-typed password ends in: below the command line's history, the
  alias expansion and the script engine. The session marks the password
  secret (`cmd.sent` carries no text), exactly as for a typed one.
- **Notices**, as `[SYSTEM]` lines in the game text: "Logging in as
  <Name>…", "Logged in as <Name>.", and on a stop "Automatic login
  stopped: <why>. The saved login is forgotten."
- **Anything unexpected stops the attempt and wipes the stored login**,
  and the player is left at MUME's own prompt: a second name prompt; a
  password prompt before the name was sent; a second password prompt
  (MUME did not take the password); play reached without a password
  prompt, or as another character; no play within 20 s of the
  connection; the connection ending. There is no second attempt and no
  timer that starts one.
- **The player's own lines during the attempt.** Until the password has
  been sent, a non-empty line sent by anything else stops the attempt
  and wipes (MUME would take it as the name or the password). Once the
  password has been sent, the attempt only waits for the game: what the
  player sends then is their own answer to whatever MUME asks first (a
  "press return", a menu), and stops nothing. An empty line never stops
  it, in either phase. It is still sent: the controller only listens to
  what the session sends and never stands between the command line and
  the session, and an empty line at the name prompt does at worst make
  MUME ask for the name again, which is not answered (see the addendum
  of 2026-11-13); the attempt then runs out of time.

### 6. Wipes, and what keeps the session armed

**A session that ends on purpose is never logged back in.** When a
connection that was up ends, the session stays armed only if the LINK
WAS LOST:

- the resume check's verdict (`REASON_BACKGROUND_LOST`), or
- the socket closed with WebSocket code 1006 ("abnormal closure": the
  code a browser makes up when the connection went away with no closing
  handshake from the server),

or if it is the player's own Reconnect. `isLinkLoss`
(`src/net/session.ts`) is the one test of it. **Every other end wipes:**
the player's `#disconnect`, MUME's GMCP `Core.Goodbye` (the session
drops with that reason before the socket closes), and any close the
server made itself, whatever its code: a quit, a rent, an idle kick, a
reboot. Where it cannot be told, it wipes. The shell asks the same
question before it reconnects by itself (`loginArmedAfter`), so a quit
with the page in the background does not open a connection either.

A connection that never came up (refused, no network yet after the
phone woke) ends nothing: the session stays as it was.

The stored login (and any pending password) is also wiped by: every
stop above; Exit session (also when the link was down already; the
answers given stay); a replay starting; `Char.Name` naming another
character; the phone layer's disposal; and a page restored from the
back/forward cache.

The controller is the last thing the phone layer makes, and it attaches
to the session and the bus last in its own constructor: a layer whose
mount fails leaves no listener behind.

**Back/forward cache.** A restored page comes back with the memory it
left with, so a wiped login stays wiped; but an armed one would come
back armed after the page had been left for another. A restore is
therefore treated as a new page load: the shell's resume watch
(`pageshow` with `persisted`) wipes the vault and forgets the answers
before it looks at the link. Nothing is done on `pagehide` (memory dies
with the page, and a wipe there would cost the feature on any browser
that fires it when the app is only put in the background).

**A layer mounted late.** The phone's chunk is loaded after the page;
a login already at MUME's prompts when the controller is made is
followed from there. One already in play is not asked about.

### 7. Not in this round

- No `Char.Login` over GMCP (unverified against the live game).
- Nothing in storage, no character cards.
- No switch to turn an armed session off other than Disconnect, Exit
  session or a reload, and no text for it in Settings (the page's rows
  have no second line).

## Threat notes

**Protects against**

- Reading the password from the device afterwards: nothing is written,
  so a closed or reloaded tab, the browser's profile directory, a
  backup, an exported settings file, a run log, a shared replay and the
  history hold nothing.
- User scripts and the profile: the Lua sandbox reaches only the script
  API, which has no way to the session object, the vault or the tap;
  aliases and triggers see neither send (they do not pass the engine),
  and `cmd.sent` for the password has no text.
- The password going to the wrong prompt: it is sent only under server
  ECHO off, at the login prompts, after the name, once.
- Markup in a name: the card and the notices set text, never HTML.

**Does not protect against**

- Someone holding the unlocked device while the tab is open and armed:
  they can play the character (as they can any logged-in session), and
  after a lost link the client logs in again for them. The password
  itself is not shown to them.
- **It is the account password.** MUME asks for the *account* password,
  which most likely opens every character on the account, not only the
  one named. What is held is therefore worth more than one character.
  The client only ever sends it after the armed character's name.
- Code running in the page's own origin (a malicious browser extension,
  a compromised build, devtools on an unlocked device): it can replace
  `Session.sendCommand` or the WebSocket and read what is typed, with or
  without this feature. A hand-typed password is equally exposed.
- The server: a server other than MUME behind the same socket address
  that shows the name prompt and turns ECHO off gets the password, as it
  would from a player typing. The socket address is fixed
  (`wss://mume.org/ws-play/`) and TLS-authenticated.
- Memory inspection of the browser process, or a memory image written to
  disk by the OS (swap, a crash dump). JavaScript strings cannot be
  zeroed; "wiped" means no reference is kept, not that the bytes are
  overwritten.

## Consequences

- A phone or tablet player types the login once per page load. When the
  browser discards the background tab (common on a phone under memory
  pressure), the page reloads and the login is gone: the player types it
  again. **If that proves too short-lived, the next step is
  `sessionStorage`** (survives a discard and reload of the same tab,
  gone when the tab is closed), with its cost stated: readable in
  plain text by anyone with the unlocked device while the tab lives.
  It needs the owner's explicit yes.
- An armed session overrides "Reconnect automatically: off" for a dead
  link found on resume.
- Desktop: `Session` has one more nullable property and one test of it
  per sent command; the shell passes the session and the bus to the
  phone layer and asks it whether it is armed. Nothing else changes.
- `watchResume` now tells its caller whether the page was restored from
  the back/forward cache.

## To verify on the live game

One real login was found in the reference client's text logs (no telnet
negotiation in it). It shows, in order: the banner, ending "If you have
never played MUME before, type NEW to create a new character, / or ?
for help."; `By what name do you wish to be known? `; a blank line;
`Account password: `; two blank lines; `Reconnecting.`; the room. The
name had been sent before the banner arrived (typed ahead) and was
taken. One more short line was sent after the password and before
"Reconnecting."; what it answered is not in the log. The mock
(`tests/e2e/mume-login-mock.ts`) uses these texts. Everything else
below is from the repository's own tests and fixtures:

1. The name prompt's text is `By what name do you wish to be known?`
   (the only text the feature matches; **seen in the real log**). If it
   differs, the attempt times out after 20 s and wipes.
2. MUME sends `IAC WILL ECHO` for the password prompt, after the name
   was sent, and not before the name prompt.
3. MUME sends `IAC WILL ECHO` only once per password prompt, and a
   refused password leads to a new password prompt (a second
   `WILL ECHO`) or a closed connection, both of which stop the attempt.
4. A login as a linkdead character goes name → account password → play
   ("Reconnecting." in the real log). If MUME asks something more after
   the password, the client does not answer it: the player does, and
   that stops nothing, but play must come within 20 s of the connection
   or the attempt stops and wipes. Whether 20 s is enough for a player
   to notice and answer is for the live test (the real log has one
   unexplained line sent after the password).
5. GMCP `Char.Name` carries `name` as the character's name, equal
   without case to what is typed at the name prompt.
6. A new character's creation asks at least one plain question between
   the name and the first password (so the captured "name" is not the
   character's).
7. MUME takes the name with the capitals of `Char.Name` (the stored
   name is MUME's spelling, not what was typed).
8. On iPadOS and Android: a tab put in the background and brought back
   fires `visibilitychange` (not a `pageshow` from the back/forward
   cache, which would wipe).
9. **How MUME ends a session.** After `quit`, a rent or an idle kick the
   server must either send GMCP `Core.Goodbye` or close the socket
   itself (any code but 1006). If it instead just drops the connection
   (the browser then reports 1006), the client takes it for a lost link
   and stays armed, and coming back to the page would log the character
   in again: **type `quit` while armed and watch for the notice
   "Automatic login is off: the session ended."**
10. The other way round: a link lost in the background must show as
    1006 or be found by the resume check. A phone OS that closes the
    socket cleanly when it suspends the tab would wipe every time (the
    feature would then never log in; safe, but useless).
11. A character's name is letters only, 2 to 20 (the shape a name
    candidate must have to be kept).

## Addendum 2026-11-13: the name prompt comes twice on the live game

The owner's first automatic login on the live site (0.8.0, phone)
stopped with "MUME asked for the name again": the name prompt stood
twice in the text, the first with the name after it, and MUME went on to
`Account password:`. So MUME took the name, and the second prompt was
MUME's own (the client sent one line, the name). Why MUME shows it
again is not known; the likely cause is that the name is answered at
once, before MUME is done with the connection's telnet negotiation, and
MUME writes its prompt again after it. A login by hand never shows it,
which fits: nobody types that fast.

Decision: a name prompt while the attempt waits for the password prompt
is not answered and stops nothing. The name is still sent once only.
If MUME did not take the name, nothing more is sent and the attempt
ends at `ATTEMPT_MS`. A name prompt after the password was sent still
stops the attempt and wipes. Released as 0.8.1.

### Same day, 0.8.2: the name waits a second

With 0.8.1 the login went through, and the prompt still stood twice in
the text, which is ugly. The output pane was checked: it shows a prompt
once however the echo and the line's end arrive, so MUME sent it twice.
A login by hand never shows it, so the early answer is the likely
trigger. Decision: the name is sent `NAME_WAIT_MS` (1 s) after the name
prompt, not in the same frame. A line of the player's in that second
stops the attempt as before. The rule's tolerance from 0.8.1 stays, for
a MUME that repeats the prompt anyway. Whether the second removes the
repeat is for the owner to see on the live game.

### Same day: a rent ends as a lost link ("to verify" 9, answered); three hours

The owner rented at an inn while armed: the connection closed, the
sheet with Reconnect came, and Reconnect logged the character in again.
So the live game ends a `rent` with no `Core.Goodbye` and no closing
handshake (the browser reports 1006), which the client cannot tell from
a lost link.

Tried and rejected by the owner: noting the player's own `rent` or
`quit` and treating a connection that vanishes right after it as a
session ended (built, never released). He does not want the client to
guess from what was typed.

Decision (owner): the session stays armed after such an end. To play
another character, Exit session to the start menu wipes the stored
login, as before. And a stored login runs out: **after three hours
(`EXPIRE_MS`) without a connection, it is wiped** ("Automatic login is
off: not connected for three hours."). The time starts when a
connection that was up ends and stops when one is up again; a failed
connect in between does not start it again. A timer wipes while the
page runs. A suspended page's timer stands still, so the wall clock is
also asked wherever the stored login would be used: when the shell asks
whether the session is armed (the reconnect on resume) and before every
new connection.

This replaces the claim in §6 that a character that quit is never
logged back in: on the live game it is, for up to three hours, by the
player's own Reconnect or by coming back to the page.

### Same day: the question every time

The owner: the question is asked after every login by hand, also for a
character answered Yes (or No) before. No answer is remembered any
more; the rule's `yes` and `no` lists are gone, and with them the
notice "…, as chosen before". `exit` and `restored` now do the same
(both wipe). This replaces what §2 says about answers kept for the
page load.
