# Start menu, account and community: prep for the sync session

Prepared 2026-11-14 for a session with the owner. It compares the
owner's brainstorm (`notes/start-menu-brainstorm.md`) with what is
decided (`intent.md` Goals 13–15, `spec.md` §7, ADR 0145, 0146, 0148)
and with what is built (stage 60, on staging, not released). Not
authoritative: the session's outcome goes into the spec, the ADRs and
the stage files.

How to use it: section 1 is the one decision everything else hangs on.
Section 2 goes through the proposals one by one. Section 3 answers the
brainstorm's nine questions. Section 4 lists what the brainstorm did
not ask. Section 5 is the agenda, in the order the decisions depend on
each other, each with a recommendation.

## Where things stand

- **Built, on staging:** accounts (stage 60): the Account row on the
  start menu, Log in, Create account, the recovery code, Recovery, the
  Account page. Nothing syncs. Not released; the flag is off in
  production.
- **Planned, not built:** sync of profiles and scripts (61), settings
  (62), runs (63), share links (64), the gallery (65), the admin
  panel (66).
- So the brainstorm arrives at a good time: almost everything it
  touches is not built yet. What is built and would change is listed
  in section 2 and is small.

## 1. The ground rule changes the sync model

The brainstorm's rule: **logged out you see the device's things,
logged in the account's, never a mixture.** A first login *moves* the
device's things into the account (if the player says yes); a log out
*removes* the account's things from the device.

What is decided today (ADR 0146, spec §7.4) is a different model:
**one set of things on the device, which the account keeps in step.**
A first sync merges (safety copy, same-name items kept as "<name>
(this device)", untouched seeds give way); log out asks "keep the data
on this device (default) or remove it".

| | Today's plan (ADR 0146) | The brainstorm |
|---|---|---|
| On the device | one set | two sets: the device's and the account's copy |
| First login | merge, with a safety copy | move (or leave behind) |
| Log out | keep (default) or remove | always remove; back to the device's own |
| Shared computer | the next person sees your things unless you chose remove | clean by construction |
| "Whose things am I looking at?" | not answered | answered by the owner row |

The brainstorm's model is clearer and fits the owner row. It is also
more work and has consequences that need answers before stage 61 is
planned, because stage 61 starts with the database layout
(IndexedDB 9):

1. **Two spaces in the database.** Profiles, scripts, script data,
   settings, runs and export docs each need a device set and an
   account set (or one set tagged by owner). Every reader of those
   stores (the game, the editors, History, exports, backups) must ask
   for "the current space". This is the largest technical cost, and it
   is why the decision must come first.
2. **Things that are neither.** Some things belong to the browser on
   this machine whoever is logged in: the map file and uploaded
   tiles, saved MUME logins (never synced, ADR 0145), the device id,
   the update state, first-paint appearance. "Never a mixture" needs a
   third, small category: *this device, always*. To decide: which
   things are in it. Settings are the hard case (see 4.3).
3. **A log out that removes must not lose anything.** Spec §7.0 rule
   4: nothing a player wrote is dropped without a notice. At log out
   there can be unsynced edits, and runs that never go to the cloud at
   all (below). The dialog must sync first and say what cannot be
   saved.
4. **Runs do not fit the rule as it stands.** Today's plan: only
   *saved* runs sync; unsaved runs stay on the device for 14 days; a
   saved run that does not fit the account's 50 MB stays "on this
   device". Under "never a mixture" a logged-in player's unsaved and
   over-limit runs are in the account's space on the device but not in
   the account. At log out they would be removed. And an account
   holds *less* than a device does today (50 MB against the browser's
   much larger room), so "logged in" can mean fewer saved runs, not
   more. To decide: what happens to runs that are not in the cloud
   when the player logs out, and whether the limit is right for a
   model where the account is the only home.
5. **A log out the player did not ask for.** "You stay logged in until
   you log out yourself" is not quite true: a session ends when the
   password is changed or the account recovered on another device,
   when it is ended from another device's Account page, when the
   account is deleted, and after 180 days without a visit. Today the
   device then logs out locally at once. With "log out removes", that
   would remove unsynced things with nobody there to warn. To decide:
   on a lost session, keep the account's copy on the device, locked,
   until the player logs in again or chooses to drop it.
6. **Offline.** Logged in and offline must keep working on the
   account's copy (it does in both models). Logging *in* offline is
   impossible in both.

**Recommendation:** take the brainstorm's rule. It is the better
product and the owner row makes it visible. Accept that stage 61
grows (the two spaces) and settle points 2–5 in the session, since
they shape the database.

## 2. The proposals, one by one

| Proposal | Against the plan | Cost and notes |
|---|---|---|
| **Three zones and a foot row** | New. Spec §2 lists seven equal rows; stage 60 added an eighth (Account). | A redesign of the start menu: mockups first (spec §7.0 rule 6), desktop and phone. The menu box, the key letters and the phone menu change. |
| **Account as an owner row** ("On this device · log in" / "ole · synced") | Replaces the built `ACCOUNT (log in)` row (the owner's choice A of this morning). The sync state in words is what the state mark of stage 61 was to be. | Small in code: the row in `start-main.tsx` and its tests. "· synced" is only true once sync exists (4.1). A row that is a heading *and* a button is a new kind of row: the mockup must show that it can be pressed. |
| **Profile → Settings** | **Collides with names in use.** The game's menu bar has both Profile and Settings; Settings is the popup for the client's settings (font, colours, panes), and spec §7.4 syncs "settings" per device type as its own thing. The phone has a settings page. | See 4.2. The worry behind it is real (a public "profile" reads as a user page); the word chosen is the problem. |
| **Scripts beside Settings, owned by the account or the device** | As planned (scripts are items of their own). | None. |
| **History, Spotlights, Credits → one row with tabs** (Sessions, Spotlights, Diary) | New. Today three pages with three looks the owner chose from mockups (stages 45–47: History's table, the Spotlights wall and viewer, Credits as a book). | A stage of its own: one page that holds three looks, on desktop and phone; Statistics also lives in History today. Mockups first. Not account work, and it can be done before or after sync. |
| **Credits → Diary** | A rename of a page and a menu word. | Small. "Chronicle" is what the page's look is called in the spec ("Krönikeboken"); Diary is the owner's word now. |
| **Community** as the menu word; **Hall of Fame** the top list | Fits: spec §7.8 has a new start menu entry with the working name Gallery and says the owner picks the word and the letter. The top list is planned. | The word settles an open point. |
| **Random Runes**, a notice board anybody logged in can write on | **New feature**, in no goal, spec section or ADR. | Free public text is the most moderation-heavy thing a site can have: rules, reports, hiding, rate limits, storage, the admin queue. Comments on runs (planned) already need all of that, so the machinery exists by stage 65; the board is then a list of comments without a run. Needs a line in intent Goal 15 and its own decisions (4.6). |
| **A counter on Community** ("3 new"), also for guests | Differs: spec §7.8 has a notice for logged-in players only, kept on the server (`gallery_seen`), with a switch to turn it off. | A guest counter needs the "last seen" in the browser and a public request from every start page load (cheap if cached, but it is one more request per visit for everybody). See question 3. |
| **Guests: Spotlights and Diary do not exist** | **Against intent Goal 13** ("Playing without [an account] stays possible and loses nothing it has today") and spec §7.0 rule 2. Both pages exist today for everybody. | The owner can change the goal; it should be a decision, not a side effect. See 4.4. |
| **Publish needs an account; the account name is shown** | As planned (ADR 0145, 0148). | None. |
| **Publish beside the export choices in History** | As planned: the export editor's format toggle gets Link (spec §7.7). | None. |
| **First login: move, not copy** | Differs from ADR 0146's merge with a safety copy. | Part of section 1. A move still needs the rule for a name that exists on both sides (keep both, renamed) on a *second* device's first login. A safety copy is still worth having for one release. |
| **Log out removes the account's things** | Differs: today "keep (default) or remove". The built dialog says "Your profiles, scripts and runs on this device stay as they are", which is true only while nothing syncs. | The dialog's text and behaviour change with stage 61. Section 1, points 3–5. |

**What in the built stage 60 would change:** the Account row (becomes
the owner row), the Log out dialog's text, what a lost session does on
the device, and the menu's key letters. The server, the crypto, the
flows and the pages (Log in, Create account, recovery code, Recovery,
Account) stand as they are.

## 3. The nine questions

1. **Spotlights and Diary for guests: hidden or locked?**
   Not thought of, because today they are simply there. If they become
   account-only: locked and visible, since a hidden feature sells
   nothing and existing players would otherwise see two pages vanish
   without a word. But first decide 4.4: whether to take them away at
   all.
2. **Do the guest's local runs come along?**
   Partly thought of: ADR 0146 uploads local saved runs at the first
   sync "while there is room, oldest last". Under the move rule the
   same question is sharper: what does not fit cannot be moved, and
   must stay somewhere visible. Recommendation: yes, saved runs come
   along, newest first, and the page says how many did not fit and
   where they are.
3. **What does the Community counter count?**
   Planned differently (a logged-in notice). New published runs since
   the last visit is a good rule and works for guests from a public,
   cached answer. Keep the planned switch to turn notices off, and
   decide whether the game's quiet notice (spec §7.8) stays beside the
   menu's counter or the counter replaces it.
4. **Where do reactions to one's own runs show?**
   Partly planned: "My shared runs" on the Account page lists views
   and stars. A mark for *new* stars or comments is not planned. The
   owner row is the right home ("ole · synced · 2 new"), since it
   leads to the Account page where the list is. It needs a "seen"
   time per account on the server.
5. **How does History show that a run is published, and where is it
   withdrawn?**
   Thought of: spec §7.7 has it on History's row for a shared session
   and on the Account page (link, views, stars, listed, Remove). A
   "published" mark on the row fits.
6. **What does a guest see where comments and stars sit?**
   Not written down. "Log in to comment" in the same place is right;
   the same for stars. One sentence in the spec.
7. **Unsynced changes at log out?**
   Thought of in the mockup (the Log out dialog counted unsynced
   changes) and planned for stage 62. Under "log out removes" it
   becomes a rule: sync first; if that cannot be done (offline, the
   storage full, runs not in the cloud) the dialog names what would be
   lost and offers to download it or stay logged in. Section 1,
   point 3.
8. **Random Runes: beside the runs or a tab of its own?**
   Not thought of (the board is new). A box at the side on a desktop
   has no place on a phone, where it must be a tab or a section
   anyway. Decide after 4.6.
9. **Do the renames fit what is built?**
   Diary and Community: yes, they are words. The merge under History:
   a page redesign, independent of accounts. Settings: no, see 4.2.

## 4. What the brainstorm did not ask

1. **When are accounts released?** An account without sync gives the
   player nothing, and the owner row's "· synced" would not be true.
   Recommendation: do not turn the flag on in production after stage
   60. Keep stage 60 on staging, build the new menu and stage 61 on
   it, and open accounts when profiles and scripts sync. (The enforced
   CSP can still go to production with the next release, on its own.)
2. **The word for a profile.** Settings is taken (the game's Settings
   popup, the phone's settings page, the synced "settings" of spec
   §7.4), and S is also the letter of Scripts. A profile is more than
   settings: it is the player's aliases, actions, macros and
   variables (spec §3 calls it the profile language). Options:
   a. keep **Profile** and solve the confusion on the other side:
      never call anything in the community a profile (it is an
      account, a player, a name);
   b. a new word that is free: **Setup**, **Config**, **Kit**;
   c. **Settings**, and rename the client's settings to something else
      (Options, Appearance) everywhere.
   Whatever is chosen must hold in the game's menu bar, the Profile
   window, the phone and the help texts, not only on the start menu.
   Recommendation: b with Setup, or a. Not c.
3. **Are settings the account's or the device's?** Today's plan:
   synced per device type (desktop, tablet, phone), with a choice at
   the first sync. Under the ground rule a guest's font size and pane
   layout would change at login and change back at log out. That is
   consistent, but it means the screen rearranges itself when one logs
   in. To decide: follow the rule fully, or put layout and appearance
   in "this device, always".
4. **Taking Spotlights and Diary from guests.** Every player today is
   a guest and has both. Options: a. leave them for guests, built on
   the device's runs (the rule "never a mixture" still holds: guest
   pages show the device's runs, account pages the account's); b. lock
   them for guests and change Goal 13. Recommendation: a. It costs
   nothing, breaks no promise, and the account still has its own
   draw: the same pages on every device, publishing, the community.
5. **The run limit.** 50 MB per account was set low on purpose (ADR
   0146), with "the run stays on this device" as the way out. If the
   account is the only home of a logged-in player's runs, the way out
   is gone. To decide together with section 1, point 4: a higher
   limit, or over-limit runs kept in a "this device" shelf that
   survives log out, or log out blocked until they are downloaded.
6. **Random Runes, if it is wanted:** who may write (any account, or
   one that has existed for some days), length, how long a note
   lives, whether notes can be answered, the same reports and hiding
   as comments, a limit per account and day, and that it is listed in
   the registration's six points if the name shows there. And the
   order: with the gallery (stage 65), not before.
7. **The key letters.** Today E P S H L C A and U. The new menu has
   Enter, the owner row, the profile row, Scripts, History, Community,
   About. Suggested: E, U (the owner row, as built), P or the new
   word's letter, S, H, C (Community takes Credits' letter), A.
8. **The account menu.** "A click opens the account menu": for a
   guest that is Log in (built). Logged in, is it the Account page
   (built) or a small menu first (Account, My shared runs, Log out)?
   Recommendation: the Account page directly; it already is that
   list.
9. **Several accounts on one device.** The rule makes this work
   (a family computer): log out removes one account's copy, the next
   login fetches another's. Worth saying in the spec so it is tested.
10. **Existing players at the release.** All are guests with their
    things on the device. Nothing may change for them until they log
    in, and the first login is where the move is offered. This is the
    case the first-login page must be designed around.

## 5. Agenda for the session

In this order, because each depends on the ones before.

| # | Decide | Recommendation |
|---|---|---|
| 1 | The ground rule: two spaces, move at login, remove at log out (section 1) | Yes |
| 2 | What is "this device, always" (1.2), and whether settings are the account's or the device's (4.3) | Map, saved MUME logins, device id: device. Settings: the owner's call; lean to following the rule, with the first-paint copy |
| 3 | Runs under the rule: unsaved runs, over-limit runs, the limit (1.4, 4.5) | A "this device" shelf for what is not in the cloud, shown as such; the limit reviewed in stage 63 as planned |
| 4 | A lost session: keep the account's copy locked until login (1.5) | Yes |
| 5 | Log out: sync first, name what would be lost (question 7) | Yes |
| 6 | Guests keep Spotlights and Diary (4.4, question 1) | Yes, keep |
| 7 | The word for a profile (4.2) | Setup, or keep Profile |
| 8 | The menu: three zones, the owner row, About as a foot row | Yes; mockups before code |
| 9 | History with tabs (Sessions, Spotlights, Diary); Credits → Diary | Yes, as a stage of its own with mockups |
| 10 | Community: the word, the counter for guests, the game notice (question 3), reactions on the owner row (question 4) | Community; counter of new runs; keep the switch |
| 11 | Random Runes: in or out, and its rules (4.6, question 8) | In with the gallery, not before; rules as for comments |
| 12 | The order of the work and when accounts open (4.1) | Menu mockups → the menu stage → stage 61 on the two-space model → open accounts with sync |

What the session should end with: a change list for `intent.md` (Goal
13 if guests lose anything, Goal 15 for the board), `spec.md` (§2 the
start menu, §7.2, §7.4, §7.5, §7.8, §7.12 the stage order), ADR 0146
(the two spaces, the move, log out) and a new ADR for the menu's
structure; then the stage file of the next stage.
