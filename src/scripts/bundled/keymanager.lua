-- @name     keymanager
-- @summary  Keeps your port keys from locate life in a pane, and casts with them
-- @api      1
-- @alias    keys      Show or hide the Port keys pane (also: keys list, keys help)
-- @alias    locatel   locatel <name>: store your room's key; locatel <target> <name>: a target's
-- @alias    kpick     Open the last pick window again
-- @alias    nkey      nkey <name> <key>: add a key by hand
-- @alias    teleport  teleport <name>: cast teleport to a key (also portal, scry, watchr)
-- @alias    tsafe     Teleport to the safe key (qtsafe: quickly, psafe: portal)
-- @alias    tv        Show or hide the TVs; tv <name> opens one (also: kecho <name> [rows])
-- @key      Ctrl+S    Teleport to the safe key (tsafe)
-- @key      Alt+S     Teleport quickly to the safe key (qtsafe)
-- @setting  hours    number  12  "Hours a key works after it was located"
-- @setting  tvgag    boolean true "Hide watch and scry lines from the game text while they go to a TV"
-- @setting  tvclose  number  0   "Seconds a TV stays open after its watch ends (0: it closes at once)"
-- @help     Locate life gives a key for a room: teleport, portal, scry and
-- @help     watch room take it. This script stores the keys under short
-- @help     names and casts with them. A key works only for the character
-- @help     who located it and only for 12 hours, so each character has
-- @help     its own keys, and old keys disappear by themselves.
-- @help
-- @help       locatel home          store the key of the room you stand in
-- @help       locatel troll cave    store the key of the troll's room
-- @help       teleport home         cast n 'teleport' <home's key>
-- @help       portal home, scry home, watchr home
-- @help       cast 'teleport' $home any command: $home becomes the key
-- @help
-- @help     Every locate life is caught, however you cast it (locatel, your
-- @help     own alias, or by hand), and opens the pick window: type the
-- @help     key's name and press Enter. Up and Down choose the hit (or
-- @help     click a row; a double click or OK stores it), Esc closes. The
-- @help     name is filled in: the locatel name, else one made up from the
-- @help     room type or the creature ($hill, $troll), selected so that
-- @help     typing replaces it. A locatel with a name and a single hit is
-- @help     stored at once. kpick opens the last window again.
-- @help
-- @help     The first key you store is the safe key (the star in the pane):
-- @help     Ctrl+S teleports there, Alt+S teleports quickly. Click another
-- @help     key's star to change it. When the safe key expires, your
-- @help     freshest key takes over.
-- @help
-- @help     TV. What watch room and scry show goes to a small pane per key,
-- @help     a TV, instead of the game text (setting tvgag). Up to four TVs
-- @help     open side by side from the top left of the game text, two per
-- @help     row in the order they opened; drag one to move them all.
-- @help     The title says how long the watch has left (the average of
-- @help     your last 3 watches), or how long ago the scry was. Lines keep
-- @help     the game's colours; for 10 seconds their plain text is white,
-- @help     then grey. A TV closes when its watch ends (setting tvclose
-- @help     gives it a delay), a scry's TV when its map blink ends (15 s);
-- @help     one you open yourself (tv <name>, ◻) stays until you close it
-- @help     or its watch ends. Its lines stay: ◻ or tv <name> shows them.
-- @help     A scry also shows the room on the Map pane: it blinks magenta
-- @help     for 15 seconds (an arrow points to it when it is off the view)
-- @help     and the map zooms out to show it and you, then back, unless you
-- @help     moved the map meanwhile. The mark then stays, steady, for three
-- @help     more minutes. Rooms are found by their name (several
-- @help     with that name: the 20 nearest); the KEYS line says what it
-- @help     found, or that the map is off.
-- @help     In the Port keys pane, a key with a watch running or a scry in
-- @help     the last 12 hours has a ◻ before its x: it opens and closes the
-- @help     TV; it blinks red while a watch runs, and the time column
-- @help     counts the watch down.
-- @help
-- @help     In the Port keys pane, click a key's name to rename it (Enter
-- @help     saves, Esc cancels). The letters are casts: t teleport,
-- @help     p portal, s scry, w watch room; x deletes (click it twice).
-- @help     Point at one to see the command. Names are 1 to 10 letters,
-- @help     digits or _. What changes in your keys is in the UI messages.

--[[
How it works

Locate life (MUME), cast on yourself or on a target:

  > cast n 'locate life' troll
  You start to concentrate...

  A troll - Inside  Far away  key: 'abcdefghi'
  Gittan - On a hill  Very near  key: 'uxevjobve'

  !( Mana:Burning>

A row is "<creature> - <room type>  <distance>  key: '<key>'" (two or
more spaces between the columns). The block ends with a blank line. No
hit: "Your mind fails to locate any such creature."

Capture. The row trigger is always on and every locate block is handled
the same way, however it was cast: its rows are gagged, and when the
block ends the pick window opens (a temporary pane with a name field,
pane:setInput). locatel only arms the name for the next block (15 s):
the window opens with it, and a single hit is stored at once without the
window. Otherwise the field holds a suggestion: the hit's name in the
library, else a name made up from the room type (a row for your own
character, state.char.name) or the creature (autoName). The block ends
at the first line that is not a row (a temporary trigger, only while a
block is open) or 2 s after the last row. The failure lines of the
Mudlet script cancel an armed name.

Keys are per character: one store entry per character ("char.<name>",
from state.char.name), holding the safe key's name and the keys with the
wall-clock time they were located (getEpoch), so they survive a reload.
A key expires `hours` after it was located: expired keys are dropped once
a minute, on use and on load, and named once in the UI messages.

$name. An alias catches any typed command with a $word; each $word that
is a live key's name becomes the key and the command runs again through
expandAlias (profile aliases apply; this alias does not run twice). With
no key name in it, the alias returns false and the command goes on as
typed. Profile variables ($var in tt++) are substituted before any alias
sees the command, so a profile variable wins over a key of the same name.
]]

-- ------------------------------------------------------------ constants

local NAME_MAX = 10
local LOCATE_TIMEOUT = 15   -- seconds an armed locate waits for its rows
local BLOCK_END = 2         -- seconds after the last row that end a block
local FRESH = 4             -- seconds a freshly stored key is highlighted
local CONFIRM = 4           -- seconds to click x a second time

local TAG = "<ansi_light_yellow>KEYS<reset> "
-- Colours (the bundled scripts' convention, ADR 0054 round 8): names in
-- gold, buttons and links in a light grey, notes and keys in the dim grey;
-- red, green and orange only where they mean something (delete, the safe
-- key and an open TV, little time left). On a light pane the pane shifts
-- them to keep 4.5:1 (ADR 0041).
local NAME_C = "#d7af5f"
local LINK_C = "#b8b8b8"
local DIM = "ansi_light_black"

-- ------------------------------------------------------------ helpers

local function now() return getEpoch() end

local function life()
  return math.max(0.1, tonumber(settings.hours) or 12) * 3600
end

local function trim(s) return (s:gsub("^%s+", ""):gsub("%s+$", "")) end

local function len(s) return utf8.len(s) or #s end

local function pad(s, w)
  local n = len(s)
  if n >= w then return s end
  return s .. string.rep(" ", w - n)
end

local function lpad(s, w)
  local n = len(s)
  if n >= w then return s end
  return string.rep(" ", w - n) .. s
end

-- `s` cut to `w` cells with an ellipsis.
local function cut(s, w)
  if len(s) <= w then return s end
  if w <= 1 then return w == 1 and "…" or "" end
  return s:sub(1, utf8.offset(s, w) - 1) .. "…"
end

-- "12h" / "45m": the pane's time column. Hours round up (a key located
-- a minute ago shows the full 12h, as in the Mudlet script); under an
-- hour it counts minutes.
local function short(secs)
  if secs >= 3600 then return math.ceil(secs / 3600) .. "h" end
  return math.max(1, math.floor(secs / 60)) .. "m"
end

-- "11h 20m" / "45m".
local function long(secs)
  secs = math.max(0, secs)
  local h, m = math.floor(secs / 3600), math.floor(secs % 3600 / 60)
  if h > 0 then return h .. "h " .. m .. "m" end
  return math.max(1, m) .. "m"
end

local function say(text) cecho(TAG .. text) end
-- A change to the library: in the UI messages (▶ KEYS: …), plain text.
local function note(text) uiMessage("keys", text) end
local function fail(text) cecho(TAG .. "<ansi_light_red>" .. text) end
local function nm(name) return "<" .. NAME_C .. ">$" .. name .. "<reset>" end

local function validName(name)
  return type(name) == "string" and #name >= 1 and #name <= NAME_MAX and name:match("^[%w_]+$") ~= nil
end

-- ------------------------------------------------------------ state

-- The character whose keys are shown: { id = lower-case name, name }.
local char = nil
-- Its keys: { safe = id or nil, keys = { [id] = { name, key, room, dist, at } } }.
local lib = nil
-- id -> epoch when it was stored (the highlight).
local fresh = {}
-- A delete waiting for its second click: { id, at }.
local confirm = nil
-- A locatel waiting for its rows: { name, target, timer }.
local armed = nil
-- The locate block being read: { hits, arm, trig, timer }.
local block = nil
-- The last locate's hits: { hits = { { mob, room, dist, key } }, name }.
local last = nil
-- The open pick list: { pane, hits, name, sel, keys }.
local pick = nil

local draw -- the pane, below

-- The TVs (round 4), by lower-case name: { id, name, lines = { { t, c, p, mark } },
--   watching = epoch or nil, ended = epoch or nil, scried = epoch or nil,
--   pane, bright = first line still bright, shut = the
--   player closed it during this watch }.
local tvs = {}
-- A watch or scry cast waiting for its answer: { kind, id, name, timer }.
local pendingCast = nil
local openTv, drawTv, closeTv, tvDue, watchOver -- below

local function storeId(id) return "char." .. id end

local function loadLib(id)
  local l = { safe = nil, keys = {}, watch = {} }
  local data = store.get(storeId(id))
  if type(data) ~= "table" then return l end
  for _, r in ipairs(data.keys or {}) do
    if type(r) == "table" and validName(r.name) and type(r.key) == "string" and type(r.at) == "number" then
      local k = {
        name = r.name, key = r.key, at = r.at,
        room = type(r.room) == "string" and r.room or "",
        dist = type(r.dist) == "string" and r.dist or "",
      }
      -- The last scry: when, and its lines ({ c, p }).
      if type(r.scry) == "table" and type(r.scry.at) == "number" and type(r.scry.lines) == "table" then
        local lines = {}
        for _, x in ipairs(r.scry.lines) do
          if type(x) == "table" and type(x.p) == "string" then
            lines[#lines + 1] = { c = type(x.c) == "string" and x.c or x.p, p = x.p }
          end
        end
        k.scry = { at = r.scry.at, lines = lines }
      end
      l.keys[r.name:lower()] = k
    end
  end
  if type(data.safe) == "string" and l.keys[data.safe:lower()] then l.safe = data.safe:lower() end
  -- The last watch durations, seconds (learnt; the TV's time left).
  l.watch = {}
  for _, d in ipairs(type(data.watch) == "table" and data.watch or {}) do
    if type(d) == "number" and d > 0 then l.watch[#l.watch + 1] = d end
  end
  while #l.watch > 3 do table.remove(l.watch, 1) end
  return l
end

local function save()
  if not char or not lib then return end
  local list = {}
  for _, k in pairs(lib.keys) do
    list[#list + 1] = { name = k.name, key = k.key, room = k.room, dist = k.dist, at = k.at, scry = k.scry }
  end
  table.sort(list, function(a, b) return a.name:lower() < b.name:lower() end)
  store.set(storeId(char.id), { name = char.name, safe = lib.safe, keys = list, watch = lib.watch })
end

local function sorted()
  local list = {}
  if not lib then return list end
  for id, k in pairs(lib.keys) do list[#list + 1] = { id = id, k = k } end
  table.sort(list, function(a, b) return a.id < b.id end)
  return list
end

local function count()
  local n = 0
  if lib then for _ in pairs(lib.keys) do n = n + 1 end end
  return n
end

local function expires(k) return k.at + life() end

-- The name of the key whose key text is `key`, or nil.
local function nameOfKey(key)
  if not lib then return nil end
  for _, e in ipairs(sorted()) do
    if e.k.key == key then return e.k.name end
  end
  return nil
end

-- ------------------------------------------------------------ safe key and expiry

-- The freshest key's id, or nil.
local function freshest()
  local best = nil
  for id, k in pairs(lib.keys) do
    if not best or k.at > lib.keys[best].at or (k.at == lib.keys[best].at and id < best) then best = id end
  end
  return best
end

-- Keeps the safe key on a live key. Returns the new safe key's id when it
-- had to move (false when nothing changed).
local function ensureSafe()
  if lib.safe and lib.keys[lib.safe] then return false end
  lib.safe = freshest()
  return lib.safe
end

-- Drops expired keys and re-elects the safe key; tells the player once.
local function prune()
  if not lib then return false end
  local t = now()
  local gone = {}
  local safeName = lib.safe and lib.keys[lib.safe] and lib.keys[lib.safe].name
  for id, k in pairs(lib.keys) do
    if expires(k) <= t then
      gone[#gone + 1] = k.name
      lib.keys[id] = nil
      fresh[id] = nil
    end
  end
  if #gone == 0 then return false end
  table.sort(gone, function(a, b) return a:lower() < b:lower() end)
  local names = {}
  for _, n in ipairs(gone) do names[#names + 1] = "$" .. n end
  local text = (#gone == 1 and "Key " or "Keys ") .. table.concat(names, ", ") .. " expired."
  local moved = ensureSafe()
  uiMessage("keys", text)
  -- The safe key's change, in a short message of its own.
  if moved ~= false and safeName then
    uiMessage("keys", lib.safe and ("Safe key is now $" .. lib.keys[lib.safe].name .. " ($" .. safeName .. " expired).")
      or "No safe key: no keys left.")
  end
  save()
  return true
end

-- ------------------------------------------------------------ the library

local function notLoggedIn()
  fail("Not logged in: keys are kept per character. Log in first.")
end

-- The live key called `name` (a leading $ is allowed), or nil with a message.
local function find(name)
  if not lib then
    notLoggedIn()
    return nil
  end
  name = (name or ""):gsub("^%$", "")
  local id = name:lower()
  local k = lib.keys[id]
  if k and expires(k) <= now() then
    prune()
    draw()
    fail("Key $" .. k.name .. " has expired. locatel " .. k.name .. " stores a new one.")
    return nil
  end
  if not k then
    fail("No key $" .. name .. ". Type keys to see your keys.")
    return nil
  end
  return k
end

local ARTICLES = { a = true, an = true, the = true }

-- A free name for a key nobody named: the room type's last word for your
-- own room, the creature's last word (after a, an, the) for a target;
-- cut to fit, then 2, 3 … while it is taken.
local function autoName(text)
  local words = {}
  for w in text:lower():gmatch("[%w_]+") do
    if not ARTICLES[w] then words[#words + 1] = w end
  end
  local base = words[#words] or "key"
  base = base:sub(1, NAME_MAX)
  if not lib.keys[base] then return base end
  for i = 2, 99 do
    local suffix = tostring(i)
    local n = base:sub(1, NAME_MAX - #suffix) .. suffix
    if not lib.keys[n] then return n end
  end
  return nil
end

local function stopFresh()
  tempTimer(FRESH + 0.1, function() draw() end)
end

-- Stores a key; tells the player what happened.
local function addKey(name, key, room, dist)
  local id = name:lower()
  local old = lib.keys[id]
  lib.keys[id] = { name = name, key = key, room = room or "", dist = dist or "", at = now(),
    -- The same room again keeps its last scry.
    scry = (old and old.key == key) and old.scry or nil }
  local becameSafe = false
  if not lib.safe or not lib.keys[lib.safe] then
    lib.safe = id
    becameSafe = true
  end
  fresh[id] = now()
  save()
  local what = {}
  if room and room ~= "" then what[#what + 1] = room end
  if dist and dist ~= "" then what[#what + 1] = dist end
  local info = #what > 0 and (" (" .. table.concat(what, ", ") .. ")") or ""
  local other = nil
  for oid, k in pairs(lib.keys) do
    if oid ~= id and k.key == key then other = k.name end
  end
  note((old and (old.key == key and "Renewed $" or "Replaced $") or "Stored $") .. name .. info .. ": " .. key .. "."
    .. (other and (" Same key as $" .. other .. ".") or "")
    .. (becameSafe and (" Safe key: $" .. name .. ".") or ""))
  stopFresh()
  draw()
end

local function deleteKey(id)
  local k = lib.keys[id]
  if not k then return end
  local wasSafe = lib.safe == id
  lib.keys[id] = nil
  fresh[id] = nil
  if confirm and confirm.id == id then confirm = nil end
  save()
  note("Deleted $" .. k.name .. ".")
  if wasSafe then
    ensureSafe()
    note(lib.safe and ("Safe key is now $" .. lib.keys[lib.safe].name .. " ($" .. k.name .. " deleted).") or "No safe key: no keys left.")
    save()
  end
  draw()
end

-- Renames key `id` to `to`; returns an error text, or nil when done.
local function renameKey(id, to)
  to = trim(to or ""):gsub("^%$", "")
  local k = lib.keys[id]
  if not k then return "That key is gone." end
  if not validName(to) then return "A name is 1 to " .. NAME_MAX .. " letters, digits or _." end
  local nid = to:lower()
  if lib.keys[nid] and nid ~= id then return "There is a key $" .. lib.keys[nid].name .. " already." end
  if to == k.name then return nil end
  local old = k.name
  lib.keys[id] = nil
  k.name = to
  lib.keys[nid] = k
  -- Its TV follows; a running watch still labels its lines with the old name.
  local tv = tvs[id]
  if tv then
    tv.name = to
    tvs[nid] = tv
    if not tv.watching then tvs[id] = nil end
  end
  if lib.safe == id then lib.safe = nid end
  if fresh[id] then fresh[nid], fresh[id] = fresh[id], nil end
  save()
  note("Renamed $" .. old .. " to $" .. to .. ".")
  return nil
end

local function setSafe(id)
  local k = lib.keys[id]
  if not k then return end
  if lib.safe == id then
    say(nm(k.name) .. " is already the safe key.")
    return
  end
  lib.safe = id
  save()
  note("Safe key: $" .. k.name .. ".")
  draw()
end

-- ------------------------------------------------------------ casts

local SPELLS = {
  teleport = { spell = "teleport", verb = "Teleporting", to = " to" },
  portal = { spell = "portal", verb = "Portalling", to = " to" },
  scry = { spell = "scry", verb = "Scrying", to = "" },
  watchr = { spell = "watch room", verb = "Watching", to = "" },
}

local function castCommand(what, k, quick)
  local s = SPELLS[what]
  local cmd = "cast " .. (quick and "q" or "n") .. " '" .. s.spell .. "' " .. k.key
  -- watch room labels its lines with the name: [home] ...
  if what == "watchr" then cmd = cmd .. " " .. k.name end
  return cmd
end

-- A watch or scry on its way: its answer goes to the TV of `name`.
local function expectCast(kind, name)
  if pendingCast and pendingCast.timer then killTimer(pendingCast.timer) end
  local pc = { kind = kind, id = name:lower(), name = name }
  pc.timer = tempTimer(LOCATE_TIMEOUT, function()
    if pendingCast == pc then pendingCast = nil end
  end)
  pendingCast = pc
end

local function cast(what, k, quick, safe)
  local s = SPELLS[what]
  if what == "watchr" then expectCast("watch", k.name) elseif what == "scry" then expectCast("scry", k.name) end
  say(s.verb .. (quick and " quickly" or "") .. s.to .. (safe and " the safe key " or " ") .. nm(k.name)
    .. " <" .. DIM .. ">(" .. k.key .. ")<reset>")
  send(castCommand(what, k, quick))
end

local function castSafe(what, quick)
  if not lib then return notLoggedIn() end
  if prune() then draw() end
  if not lib.safe then
    fail("No keys, so no safe key. locatel <name> stores one.")
    return
  end
  cast(what, lib.keys[lib.safe], quick, true)
end

-- ------------------------------------------------------------ TV helpers

local BRIGHT = 10        -- seconds a TV line stays bright
local TV_LINES = 250     -- lines kept per TV
local WATCH_DEFAULT = 200 -- seconds a watch lasts before any is learnt (Mudlet's start)
local WATCH_LEARN = 3    -- watches the average is taken over (as the spell timers)
local SCRY_KEEP = 12 * 3600 -- seconds a scried room keeps its TV button
-- How long a scry shows: the map mark blinks this long and the TV a scry
-- opened stays this long (one value, so they never drift apart).
local SCRY_SECS = 15
local SCRY_LINGER = 180     -- seconds the map mark then stays, steady

-- "2:31".
local function clock(secs)
  secs = math.max(0, math.floor(secs + 0.5))
  return string.format("%d:%02d", secs // 60, secs % 60)
end

-- How long a watch lasts: the whole seconds of the mean of the last
-- three this character watched (the spell timers' rule), else 200 s.
local function avgWatch()
  local w = lib and lib.watch or {}
  if #w == 0 then return WATCH_DEFAULT end
  local sum = 0
  for _, d in ipairs(w) do sum = sum + d end
  return math.floor(sum / #w)
end

-- Where avgWatch comes from, for the hover.
local function estimateText()
  local n = lib and #lib.watch or 0
  if n == 0 then return "estimate: " .. WATCH_DEFAULT .. " s (default, none learnt yet)" end
  return "estimate: " .. clock(avgWatch()) .. ", the average of the last " .. (n == 1 and "watch" or n .. " watches")
end

-- A key's time cell: the watch's time left while it runs, else the key's;
-- its colour; and its tooltip.
local function timeCell(id, k, t)
  local tv = tvs[id]
  if tv and tv.watching then
    local left = avgWatch() - (t - tv.watching)
    local txt = left >= 0 and clock(left) or ("+" .. clock(-left))
    return txt, nil, "Watch room on $" .. k.name .. ": " .. (left >= 0 and (txt .. " left") or (clock(-left) .. " past the estimate"))
      .. "\n" .. estimateText()
  end
  local left = expires(k) - t
  return short(left), left < 3600 and "orange" or nil, "$" .. k.name .. " works " .. long(left) .. " more"
end

-- A key with a TV to show: a watch running, or a scry in the last 12 h.
local function hasTv(id, k, t)
  local tv = tvs[id]
  if tv and tv.watching then return true end
  return k.scry ~= nil and t - k.scry.at < SCRY_KEEP
end

-- ------------------------------------------------------------ the pane

local pane = createPane{ id = "keys", title = "Port keys", dock = "right", rows = 8, cols = 44, anchor = "top" }
local width = 44

-- Writes a row from segments { text, color, fn, hint }, with links.
local function row(n, segs)
  local out, links, col = {}, {}, 1
  for _, s in ipairs(segs) do
    local w = len(s.text)
    if s.color then
      out[#out + 1] = "<" .. s.color .. ">" .. s.text .. "<reset>"
    else
      out[#out + 1] = s.text
    end
    if (s.fn or (s.tip and s.hint)) and w > 0 then links[#links + 1] = { col, w, s.fn, s.hint } end
    col = col + w
  end
  pane:setLine(n, table.concat(out))
  for _, l in ipairs(links) do pane:setLink(n, l[1], l[2], l[3], l[4]) end
end

local showHelp -- the alias part, below

-- A rename in the pane: { id, value, err, field, row, started }.
local renaming = nil
-- How many lines the pane has (a rename keeps its row while this holds).
local shownLines = 0

local function startRename(id)
  if not lib or not lib.keys[id] then return end
  renaming = { id = id, value = lib.keys[id].name }
  draw()
end

-- Ends an open rename without renaming (Esc, a click elsewhere, or
-- another action in the pane); true when there was one.
local function cancelRename()
  if not renaming then return false end
  renaming = nil
  draw()
  return true
end

-- A pane action: an open rename is cancelled first, then `fn` runs.
local function act(fn)
  return function()
    cancelRename()
    fn()
  end
end

-- The top row: the key count and the help link, or the rename's prompt.
local function header(n)
  if renaming then
    local msg = renaming.err or "Enter renames $" .. lib.keys[renaming.id].name .. ", Esc cancels"
    row(1, { { text = " " .. cut(msg, math.max(1, width - 2)), color = renaming.err and "ansi_light_red" or DIM } })
    return
  end
  local left = " " .. (n == 1 and "1 key" or n .. " keys")
  -- The ? sits where the last letter of a key row does (one cell in).
  row(1, {
    { text = left, color = DIM },
    { text = string.rep(" ", math.max(1, width - 2 - len(left))) },
    { text = "?", color = LINK_C, fn = function() showHelp() end, hint = "The key manager's help (keys help)" },
  })
end

-- The casts, in the order they are dropped from the right on a narrow pane.
local LETTERS = {
  { "t", "teleport", "Teleport to" },
  { "p", "portal", "Portal to" },
  { "s", "scry", "Scry" },
  { "w", "watchr", "Watch room" },
}

-- The time cells of the rows on screen: id -> { row, col, w, text } (the
-- tick rewrites only these, ADR 0056).
local timeAt = {}
-- The ◻ cells: id -> { row, col } (they blink while a watch runs).
local tvAt = {}

-- The ◻'s colour: grey, light green while its TV shows; while a watch runs it
-- alternates with red, a second each.
local function tvButtonColor(id, t)
  local tv = tvs[id]
  if tv and tv.watching and math.floor(t) % 2 == 1 then return "ansi_light_red" end
  return (tv and tv.pane and tv.pane:visible()) and "ansi_light_green" or LINK_C
end

-- The width of segments.
local function segsW(segs)
  local w = 0
  for _, sg in ipairs(segs) do w = w + len(sg.text) end
  return w
end

local function drawKey(n, id, k, t, nameW, timeW, roomW, keyW, tvW)
  local segs = {}
  -- The safe marker.
  if lib.safe == id then
    segs[#segs + 1] = { text = " " }
    segs[#segs + 1] = { text = "★", color = "ansi_light_green", fn = act(function() setSafe(id) end),
      hint = "$" .. k.name .. " is the safe key:\nCtrl+S teleports there, Alt+S quickly" }
  else
    segs[#segs + 1] = { text = " " }
    segs[#segs + 1] = { text = "☆", color = DIM, fn = act(function() setSafe(id) end),
      hint = "Make $" .. k.name .. " the safe key\n(Ctrl+S teleports to the safe key)" }
  end
  segs[#segs + 1] = { text = " " }
  -- The name; a fresh key is highlighted for a few seconds.
  local isFresh = fresh[id] and t - fresh[id] < FRESH
  segs[#segs + 1] = { text = "$" .. k.name, color = isFresh and "black:" .. NAME_C or NAME_C,
    fn = function() startRename(id) end,
    hint = "Click to rename\n$" .. k.name .. (k.room ~= "" and (": " .. k.room) or "") .. (k.dist ~= "" and (", " .. k.dist) or "")
      .. "\nkey " .. k.key .. ", located " .. long(t - k.at) .. " ago" }
  segs[#segs + 1] = { text = string.rep(" ", nameW - len(k.name) - 1) }
  if roomW > 0 then
    segs[#segs + 1] = { text = " " .. pad(cut(k.room, roomW), roomW) }
  end
  if keyW > 0 then
    segs[#segs + 1] = { text = " " .. pad(cut(k.key, keyW), keyW), color = DIM }
  end
  -- The actions: t p s w, the TV button (when any row has one), x; as
  -- many as fit, two cells each, ending one cell before the right edge;
  -- the time sits just before them.
  local nActs = #LETTERS + tvW + 1
  local used = 3 + nameW + (roomW > 0 and roomW + 1 or 0) + (keyW > 0 and keyW + 1 or 0) + 1 + timeW
  local fit = math.max(0, math.min(nActs, (width - used - 1) // 2))
  local gap = math.max(0, width - used - fit * 2 - 1)
  segs[#segs + 1] = { text = string.rep(" ", 1 + gap) }
  -- The countdown: not a button; its tooltip says what it counts.
  local time, timeC, timeHint = timeCell(id, k, t)
  timeAt[id] = { row = n, col = segsW(segs) + 1, w = timeW }
  segs[#segs + 1] = { text = lpad(time, timeW), color = timeC, hint = timeHint, tip = true }
  if confirm and confirm.id == id and fit >= 1 then
    local before = (fit - 1) * 2
    local word = before + 1 >= 9 and " delete? " or ""
    segs[#segs + 1] = { text = lpad(word, before + 1), color = "ansi_light_red" }
    segs[#segs + 1] = { text = "x", color = "ansi_light_red", fn = function()
      cancelRename()
      deleteKey(id)
    end, hint = "Click again to delete $" .. k.name }
    return row(n, segs)
  end
  local acts = {}
  for _, l in ipairs(LETTERS) do
    acts[#acts + 1] = { text = l[1], color = LINK_C, fn = function()
      cancelRename()
      local key = find(k.name)
      if key then cast(l[2], key) end
    end, hint = l[3] .. " $" .. k.name .. ":\n" .. castCommand(l[2], k) }
  end
  if tvW > 0 then
    if hasTv(id, k, t) then
      local shown = tvs[id] and tvs[id].pane and tvs[id].pane:visible()
      -- Its cell, after the time and four letters (two cells each).
      if fit >= #LETTERS + 1 then tvAt[id] = { row = n, col = segsW(segs) + #LETTERS * 2 + 2 } end
      acts[#acts + 1] = { text = "◻", color = tvButtonColor(id, t), fn = act(function()
        local tv = tvs[id]
        if tv and tv.pane and tv.pane:visible() then
          closeTv(tv)
          draw()
        else
          openTv(id, true)
        end
      end), hint = (shown and "Close" or "Open") .. " the TV of $" .. k.name
        .. ((tvs[id] and tvs[id].watching) and " (watch running)" or (k.scry and ("\nscried " .. long(t - k.scry.at) .. " ago") or "")) }
    else
      acts[#acts + 1] = { text = " " }
    end
  end
  acts[#acts + 1] = { text = "x", color = "ansi_light_red", fn = function()
    cancelRename()
    confirm = { id = id, at = now() }
    draw()
    local mine = confirm
    tempTimer(CONFIRM, function()
      if confirm == mine then
        confirm = nil
        draw()
      end
    end)
  end, hint = "Delete $" .. k.name .. " (click twice)" }
  for i = 1, fit do
    segs[#segs + 1] = { text = " " }
    segs[#segs + 1] = acts[i]
  end
  row(n, segs)
end

-- Puts the rename field on the name cells of row `r` (after the $).
local function renameField(r, nameW)
  local rn = renaming
  rn.row = r
  rn.field = pane:setInput(r, 5, nameW - 1, {
    value = rn.value,
    maxLength = NAME_MAX,
    onChange = function(text)
      rn.value = text
      if rn.err then
        rn.err = nil
        header(count())
      end
    end,
    onSubmit = function(text)
      if renaming ~= rn then return end
      local err = renameKey(rn.id, text)
      if err then
        rn.err = err
        header(count())
        rn.field:focus()
        return
      end
      renaming = nil
      draw()
    end,
    onCancel = function()
      if renaming == rn then cancelRename() end
    end,
    -- A click elsewhere: the same as Esc.
    onBlur = function()
      if renaming == rn then cancelRename() end
    end,
  })
  if rn.started then
    rn.field:focus()
  else
    rn.started = true
    rn.field:select()
  end
end

draw = function()
  if not char then
    pane:clear()
    shownLines = 0
    renaming = nil
    row(1, { { text = " Not logged in", color = DIM } })
    pane:setLine(3, " <" .. DIM .. ">Keys are kept per character.")
    pane:setLine(4, " <" .. DIM .. ">Log in to see yours.")
    return
  end
  local list = sorted()
  local n = #list
  local lines = n == 0 and 4 or n + 1
  -- A rename keeps its row (and the field's text and focus) while the
  -- rows stay where they are; otherwise the field is made again.
  local rr = nil
  if renaming then
    for i, e in ipairs(list) do
      if e.id == renaming.id then rr = i + 1 end
    end
    if not rr then renaming = nil end
  end
  local keep = renaming and renaming.field and renaming.row == rr and lines == shownLines and renaming.field:value() ~= nil
  if not keep then
    pane:clear()
    if renaming then renaming.field = nil end
  end
  shownLines = lines
  header(n)
  if n == 0 then
    pane:setLine(2, "")
    pane:setLine(3, " No keys yet.")
    pane:setLine(4, " <" .. DIM .. ">locatel <name> stores your room's key.")
    return
  end
  local t = now()
  local nameW, timeW, roomMax, keyMax, tvW = 5, 3, 0, 0, 0
  timeAt = {}
  tvAt = {}
  for _, e in ipairs(list) do
    nameW = math.max(nameW, len(e.k.name) + 1)
    timeW = math.max(timeW, len((timeCell(e.id, e.k, t))))
    if hasTv(e.id, e.k, t) then tvW = 1 end
    roomMax = math.max(roomMax, len(e.k.room))
    keyMax = math.max(keyMax, len(e.k.key))
  end
  -- Marker, name and time always; then the casts and delete (11 cells);
  -- the room type and the key get what is left, the key first to go.
  local fixed = 3 + nameW + 1 + timeW + (#LETTERS + tvW + 1) * 2 + 1
  local avail = width - fixed
  local roomW, keyW = 0, 0
  if roomMax > 0 and keyMax > 0 and avail >= roomMax + keyMax + 2 then
    roomW, keyW = roomMax, keyMax
  elseif roomMax > 0 and avail >= 7 then
    roomW = math.min(roomMax, avail - 1)
  elseif roomMax == 0 and keyMax > 0 and avail >= keyMax + 1 then
    keyW = keyMax
  end
  for i, e in ipairs(list) do
    if not (keep and i + 1 == rr) then drawKey(i + 1, e.id, e.k, t, nameW, timeW, roomW, keyW, tvW) end
  end
  if renaming and not renaming.field then renameField(rr, nameW) end
end

pane:onResize(function(rows, cols)
  width = cols
  draw()
end)

-- The countdowns only, once a second while a watch runs: three cells and
-- a tooltip per key (pane:setText), so the rest of the pane, and a hover
-- on it, stays as it is (ADR 0056). Anything wider than its cell redraws.
local function updateTimes()
  if not lib then return end
  local t = now()
  for id, at in pairs(timeAt) do
    local k = lib.keys[id]
    if not k then return draw() end
    local txt, c, hint = timeCell(id, k, t)
    if len(txt) > at.w then return draw() end
    pane:setText(at.row, at.col, "<" .. (c or "reset") .. ">" .. lpad(txt, at.w))
    pane:setLink(at.row, at.col, at.w, nil, hint)
  end
  -- The ◻ of a watched key blinks; only its cell is written (ADR 0056).
  for id, at in pairs(tvAt) do
    pane:setText(at.row, at.col, "<" .. tvButtonColor(id, t) .. ">◻")
  end
end

-- ------------------------------------------------------------ the TVs

-- TVs are a tiled group of temporary panes: the first at the game pane's
-- top left, the second right of it, the third below the first, … (the
-- player can move or resize the group; it is remembered).
local TV_MAX = 4
local TV_ROWS, TV_COLS = 10, 50

local tvTicker = nil

local function tvOf(name)
  local id = name:lower()
  local tv = tvs[id]
  if not tv then
    tv = { id = id, name = name, lines = {}, bright = 1 }
    tvs[id] = tv
  end
  return tv
end

-- "TV $home ● 2:31", "TV $home · scried 0:12 ago", "TV $home · ended".
local function tvTitle(tv, t)
  local who = tv.id == "scry" and "TV scry" or ("TV $" .. tv.name)
  if tv.watching then
    local left = avgWatch() - (t - tv.watching)
    local dot = math.floor(t) % 2 == 0 and "●" or "○"
    return who .. " " .. dot .. " " .. (left >= 0 and clock(left) or ("+" .. clock(-left)))
  end
  if tv.scried and (not tv.ended or tv.scried > tv.ended) then return who .. " · scried " .. clock(t - tv.scried) .. " ago" end
  return who .. " · ended"
end

-- `c` (copy2cecho text) with its default-coloured text in `color`; the
-- game's own colours stay (copy2cecho ends each coloured run with <reset>).
local function defaultIn(c, color)
  return "<" .. color .. ">" .. (c:gsub("<reset>", "<reset><" .. color .. ">"))
end

-- A line as drawn, as in Mudlet: for BRIGHT seconds its plain text is
-- white, then dim grey; the game's colours (a green room name) stay.
local function tvLine(e, t)
  if e.mark then return "<" .. DIM .. ">" .. e.p end
  return defaultIn(e.c or e.p, t - e.t < BRIGHT and "ansi_light_white" or DIM)
end

drawTv = function(tv)
  local p = tv.pane
  if not p then return end
  local t = now()
  p:clear()
  tv.bright = #tv.lines + 1
  for i, e in ipairs(tv.lines) do
    p:setLine(i, tvLine(e, t))
    if not e.mark and t - e.t < BRIGHT and tv.bright > i then tv.bright = i end
  end
  p:setTitle(tvTitle(tv, t))
end

-- Every way a TV opens, closes, shows or hides ends here or in draw():
-- the Port keys row's ◻ shows whether the TV is up (round 8 bug: it kept
-- its "open" colour after a close).
closeTv = function(tv)
  if not tv.pane then return end
  local p = tv.pane
  tv.pane = nil
  p:close()
  draw()
end

-- When a TV that is not watching closes by itself: its scry's map blink
-- end (SCRY_SECS after the scry) or its watch's end plus tvclose,
-- whichever is later.
tvDue = function(tv)
  local scry = tv.scried and (tv.scried + SCRY_SECS) or 0
  local watch = tv.ended and (tv.ended + math.max(0, tonumber(settings.tvclose) or 0)) or 0
  return math.max(scry, watch)
end

-- Once a second while a TV is open or a watch runs: titles, dimming, the
-- Port keys pane's watch times, and closing TVs that are done.
local function tvTick()
  local t = now()
  local busy, watching = false, false
  for _, tv in pairs(tvs) do
    if tv.watching then watching = true end
    local p = tv.pane
    if p then
      busy = true
      p:setTitle(tvTitle(tv, t))
      while tv.bright <= #tv.lines do
        local e = tv.lines[tv.bright]
        if not e.mark and t - e.t < BRIGHT then break end
        p:setLine(tv.bright, tvLine(e, t))
        tv.bright = tv.bright + 1
      end
      -- Only a TV an event opened closes by itself (tvDue). One the
      -- player opened stays until the player closes it or its watch ends.
      if tv.auto and not tv.watching and t >= tvDue(tv) then closeTv(tv) end
    end
  end
  if watching then updateTimes() end
  if not busy and not watching and tvTicker then
    killTimer(tvTicker)
    tvTicker = nil
  end
end

local function startTvTick()
  if not tvTicker then tvTicker = tempTimer(1, tvTick, true) end
end

-- Shows the TV of `id` (its pane, or a new one in the group).
openTv = function(id, force)
  local tv = tvs[id]
  -- A key scried before a reload: its TV from the saved block.
  local k = lib and lib.keys[id]
  if (not tv or #tv.lines == 0) and k and k.scry then
    tv = tv or tvOf(k.name)
    tv.scried = tv.scried or k.scry.at
    tv.lines[#tv.lines + 1] = { t = k.scry.at, p = "· scried", mark = true }
    for _, x in ipairs(k.scry.lines) do tv.lines[#tv.lines + 1] = { t = k.scry.at, c = x.c, p = x.p } end
  end
  if not tv then return false end
  -- The player's own open: no auto-close (tvTick).
  if force then
    tv.shut = false
    tv.auto = false
  end
  if tv.shut then return false end
  if tv.pane then
    tv.pane:show()
    draw()
    return true
  end
  -- At most four TVs: the one that finished first makes room (a running
  -- watch only when all four run).
  local open = {}
  for _, o in pairs(tvs) do
    if o.pane then open[#open + 1] = o end
  end
  if #open >= TV_MAX then
    local best, bestAt = nil, nil
    for _, o in ipairs(open) do
      local at = o.watching and (1e12 + o.watching) or math.max(o.ended or 0, o.scried or 0)
      if not best or at < bestAt then best, bestAt = o, at end
    end
    closeTv(best)
  end
  -- A tiled group (ADR 0053): from the game pane's top left, two per row,
  -- in opening order; closing one closes the gap.
  tv.pane = createPane{ id = "tv_" .. tv.id, title = tvTitle(tv, now()), temporary = true, group = "tv",
    grid = { cols = 2 }, at = "top-left", rows = TV_ROWS, cols = TV_COLS }
  local p = tv.pane
  p:onClose(function()
    if tv.pane ~= p then return end
    tv.pane = nil
    -- Closed by the player: it stays closed for the rest of this watch.
    tv.shut = tv.watching ~= nil
    draw()
  end)
  drawTv(tv)
  startTvTick()
  draw()
  return true
end

-- Adds a line to a TV (`c` cecho, `p` plain); `mark`: a dim note of ours.
local function tvAdd(tv, c, p, mark)
  local t = now()
  tv.lines[#tv.lines + 1] = { t = t, c = c, p = p, mark = mark or nil }
  if #tv.lines > TV_LINES + 50 then
    -- Trimmed in batches, so the pane is redrawn whole only now and then.
    local keep = {}
    for i = #tv.lines - TV_LINES + 1, #tv.lines do keep[#keep + 1] = tv.lines[i] end
    tv.lines = keep
    drawTv(tv)
    return
  end
  if tv.pane then
    local n = #tv.lines
    tv.pane:setLine(n, tvLine(tv.lines[n], t))
    if not mark and tv.bright > n then tv.bright = n end
  end
end

-- A short line in the game text instead of MUME's (with tvgag on).
local function tvSay(tv, what)
  if settings.tvgag then
    replaceLine(TAG .. "<" .. DIM .. ">" .. (tv.id == "scry" and "TV scry" or ("TV $" .. tv.name)) .. ": " .. what .. ".")
  end
end

local function watchStarted(tv)
  tv.watching = now()
  tv.ended = nil
  tv.shut = false
  tv.auto = true
  tvAdd(tv, nil, "· watching", true)
  openTv(tv.id)
  if tv.pane then tv.pane:setTitle(tvTitle(tv, tv.watching)) end
  startTvTick()
  draw()
end

local function watchEnded(tv)
  local t = now()
  if tv.watching then
    local d = t - tv.watching
    -- A plausible watch only (not one resumed after a reload).
    if lib and not tv.resumed and d >= 10 and d <= 3600 then
      lib.watch[#lib.watch + 1] = d
      while #lib.watch > WATCH_LEARN do table.remove(lib.watch, 1) end
      save()
    end
  end
  watchOver(tv, t)
end

-- A watch is over (its drop line, a disconnect): the TV closes now, or
-- when tvDue says (a young scry, a tvclose delay); also a TV the player
-- opened. Its lines stay for ◻ and tv <name>.
watchOver = function(tv, t)
  tv.watching = nil
  tv.resumed = nil
  tv.ended = t
  tv.auto = true
  tvAdd(tv, nil, "· watch ended", true)
  if tv.pane then tv.pane:setTitle(tvTitle(tv, t)) end
  if tv.pane and t >= tvDue(tv) then closeTv(tv) end
  startTvTick()
  draw()
end

-- ------------------------------------------------------------ the pick window

-- True when `mob` is your own character (a locate of your own room).
local function isMe(mob)
  local me = state.char and state.char.name
  return type(me) == "string" and mob:lower() == me:lower()
end

-- The name a hit is offered under: its name in the library, else one made
-- up from the room type (your own room) or the creature.
local function suggest(h)
  return nameOfKey(h.key) or autoName(isMe(h.mob) and h.room or h.mob) or ""
end

local function closePick()
  local p = pick
  if not p then return end
  pick = nil
  p.pane:close()
end

-- Stores hit `i` under `name`; true when stored.
local function storeHit(hits, i, name)
  local h = hits[i]
  if not h then return false end
  if not lib then
    notLoggedIn()
    return false
  end
  addKey(name, h.key, h.room, h.dist)
  return true
end

-- The typed name without a leading $.
local function typed(p)
  local v = p.field:value() or ""
  v = trim(v):gsub("^%$", "")
  return v
end

-- What Enter will do with the typed name, or why it cannot.
local function pickStatus(p)
  local name = typed(p)
  local h = p.hits[p.sel]
  if name == "" then return "<" .. DIM .. ">Type a name for the key." end
  if not validName(name) then return "<ansi_light_red>A name is 1 to " .. NAME_MAX .. " letters, digits or _." end
  local k = lib and lib.keys[name:lower()]
  if k and k.key == h.key then return "<" .. DIM .. ">Enter renews $" .. k.name .. "." end
  if k then return "<orange>Enter replaces $" .. k.name .. " (" .. k.key .. ")." end
  return "<" .. DIM .. ">Enter stores hit " .. p.sel .. " as $" .. name .. "."
end

local drawPick

local function pickStore(p)
  local name = typed(p)
  if not validName(name) then
    drawPick(p)
    p.field:select()
    return
  end
  if storeHit(p.hits, p.sel, name) then closePick() end
end

-- Selects hit `i`; an unedited name follows the selection.
local function pickSelect(p, i)
  p.sel = math.max(1, math.min(#p.hits, i))
  if not p.edited then p.field:setValue(suggest(p.hits[p.sel])) end
  drawPick(p)
end

drawPick = function(p)
  local pn = p.pane
  local w = p.w
  local idxW = #tostring(#p.hits)
  pn:setLine(2, " " .. pickStatus(p))
  pn:setLine(3, "<" .. DIM .. ">   " .. pad("#", idxW) .. "  " .. pad("Mob", w.mob) .. "  " .. pad("Room type", w.room)
    .. "  " .. pad("Distance", w.dist) .. "  Key")
  for i, h in ipairs(p.hits) do
    local sel = i == p.sel
    local known = nameOfKey(h.key)
    local r = i + 3
    pn:setLine(r, (sel and " <ansi_light_green>▶<reset> " or "   ") .. pad(tostring(i), idxW) .. "  "
      .. (sel and "<ansi_white>" or "") .. pad(cut(h.mob, w.mob), w.mob) .. (sel and "<reset>" or "") .. "  "
      .. pad(cut(h.room, w.room), w.room) .. "  " .. pad(cut(h.dist, w.dist), w.dist) .. "  "
      .. "<" .. DIM .. ">" .. h.key .. "<reset>"
      .. (known and ("  <" .. NAME_C .. ">= $" .. known .. "<reset>") or ""))
    local hint = h.mob .. " - " .. h.room .. ", " .. h.dist .. "\nkey " .. h.key
      .. (known and ("\n(stored as $" .. known .. ")") or "") .. "\nClick: select · double-click: store"
    pn:setLink(r, 1, w.total, function()
      local t = now()
      local again = p.lastClick and p.lastClick.i == i and t - p.lastClick.at < 0.5
      p.lastClick = { i = i, at = t }
      if again and p.sel == i then
        pickStore(p)
        return
      end
      pickSelect(p, i)
      p.field:focus()
    end, hint)
  end
  local foot = #p.hits + 5
  pn:setLine(foot - 1, "")
  local keys = " ↑↓ select · Enter store · Esc close   "
  pn:setLine(foot, "<" .. DIM .. ">" .. keys .. "<reset><" .. LINK_C .. ">[ OK ]")
  pn:setLink(foot, len(keys) + 1, 6, function() pickStore(p) end, "Store the selected hit under the typed name")
end

-- Opens the pick window for `hits`, the name field filled with `name` or
-- a suggestion, selected so that typing replaces it.
local function openPick(hits, name)
  closePick()
  local w = { mob = 3, room = 9, dist = 8, key = 3 }
  for _, h in ipairs(hits) do
    w.mob = math.max(w.mob, math.min(24, len(h.mob)))
    w.room = math.max(w.room, math.min(16, len(h.room)))
    w.dist = math.max(w.dist, math.min(12, len(h.dist)))
    w.key = math.max(w.key, len(h.key) + 14) -- room for "  = $name"
  end
  w.total = 3 + #tostring(#hits) + 2 + w.mob + 2 + w.room + 2 + w.dist + 2 + w.key
  local cols = math.min(110, math.max(w.total, 48) + 1)
  local p = { hits = hits, sel = 1, w = w, edited = name ~= nil }
  p.pane = createPane{ id = "pick", temporary = true, at = "top", rows = #hits + 5, cols = cols, title = "Pick a key" }
  pick = p
  p.pane:onClose(function()
    if pick == p then pick = nil end
  end)
  p.pane:setLine(1, " Name: $")
  p.field = p.pane:setInput(1, 9, NAME_MAX + 2, {
    value = name or suggest(hits[1]),
    maxLength = NAME_MAX,
    placeholder = "name",
    onSubmit = function() pickStore(p) end,
    onCancel = function() closePick() end,
    onChange = function()
      p.edited = true
      p.pane:setLine(2, " " .. pickStatus(p))
    end,
    onKey = function(key)
      if key == "ArrowUp" or key == "PageUp" then pickSelect(p, p.sel - 1)
      elseif key == "ArrowDown" or key == "PageDown" then pickSelect(p, p.sel + 1) end
    end,
  })
  drawPick(p)
  p.field:select()
end

-- ------------------------------------------------------------ capture

local function disarm()
  local a = armed
  armed = nil
  if a and a.timer then killTimer(a.timer) end
  return a
end

-- A locate block ended: a locatel name with one hit is stored at once;
-- anything else opens the pick window.
local function finishBlock()
  local b = block
  if not b then return end
  block = nil
  killTrigger(b.trig)
  if b.timer then killTimer(b.timer) end
  local name = b.arm and b.arm.name or nil
  last = { hits = b.hits, name = name }
  if not lib then
    notLoggedIn()
    return
  end
  if name and #b.hits == 1 then
    storeHit(b.hits, 1, name)
    return
  end
  openPick(b.hits, name)
end

-- A row of a locate block.
tempRegexTrigger("^(.*?)\\s+-\\s+(.*?)\\s{2,}(.*?)\\s{2,}key: '(.*)'$", function()
  local h = { mob = trim(matches[2]), room = trim(matches[3]), dist = trim(matches[4]), key = trim(matches[5]) }
  if h.key == "" then return end
  if not block then
    block = { hits = {}, arm = disarm() }
    -- The block ends at the first line that is not a row.
    block.trig = tempRegexTrigger("^(?!.*key: '.*'$)", finishBlock)
  end
  local b = block
  b.hits[#b.hits + 1] = h
  deleteLine()
  if b.timer then killTimer(b.timer) end
  b.timer = tempTimer(BLOCK_END, finishBlock)
end)

-- Lines that end a locate before it finds anything (the Mudlet script's).
tempRegexTrigger("^(?:Argh! You cannot concentrate any more\\.\\.\\.|Nah\\.\\.\\. You feel too relaxed to do that\\.|In your dreams, or what\\?|Alas, this location is out of range!|Alas, not enough mana flows through you\\.\\.\\.|Your spell backfired!|Your mind fails to locate any such creature\\.|You feel very confused and can't concentrate any more\\.)$", function()
  local pc = pendingCast
  if pc then
    pendingCast = nil
    if pc.timer then killTimer(pc.timer) end
    fail("The " .. (pc.kind == "watch" and "watch room" or "scry") .. " on $" .. pc.name .. " failed.")
  end
  if not armed then return end
  local a = disarm()
  if line:find("fails to locate", 1, true) then
    fail("Locate found nothing: no key stored for $" .. a.name .. ".")
  else
    fail("The locate failed: no key stored for $" .. a.name .. ".")
  end
end)

-- ------------------------------------------------------------ TV capture
-- (Line formats from the Mudlet script; no MUME log has them.)

local function takePending(kind)
  local pc = pendingCast
  if not pc or pc.kind ~= kind then return nil end
  pendingCast = nil
  if pc.timer then killTimer(pc.timer) end
  return pc
end

-- MUME sends each watched line as its own packet: the line, a blank line
-- and a fresh prompt. With tvgag, after a gagged watch line the blank
-- line right after it and the prompt right after that (or right after the
-- line) are gagged too; anything else ends it, and nothing is gagged after
-- 2 s. The prompt is the line layer's (GA/EOR, isPrompt), not a guess.
local tail, tailTrig = nil, nil

local function endTail()
  if tail and tail.timer then killTimer(tail.timer) end
  tail = nil
  if tailTrig then
    killTrigger(tailTrig)
    tailTrig = nil
  end
end

local function gagTail()
  if not settings.tvgag then return end
  if tail and tail.timer then killTimer(tail.timer) end
  -- The follower already exists: it sees this line too and must skip it.
  tail = { blank = false, skip = tailTrig ~= nil }
  local tl = tail
  tl.timer = tempTimer(2, function()
    if tail == tl then endTail() end
  end)
  if not tailTrig then
    tailTrig = tempRegexTrigger("^", function()
      local cur = tail
      if not cur then return endTail() end
      if cur.skip then
        cur.skip = false
        return
      end
      if line == "" and not cur.blank then
        cur.blank = true
        deleteLine()
        return
      end
      if isPrompt() then deleteLine() end
      endTail()
    end)
  end
end

-- A watch starts: its lines will come as [name] ….
tempRegexTrigger("^You feel aware of this place\\.$", function()
  local pc = takePending("watch")
  if not pc or not lib then return end
  local tv = tvOf(pc.name)
  tvSay(tv, "watching")
  watchStarted(tv)
end)

-- A watched room's line, or the watch's end. Only for a name we watch or
-- know (a key): other bracketed lines are left alone.
tempRegexTrigger("^\\[(\\w+)\\] (.*)$", function()
  if not lib then return end
  local label, text = matches[2], matches[3]
  local id = label:lower()
  local tv = tvs[id]
  if not tv then
    if not lib.keys[id] then return end
    tv = tvOf(lib.keys[id].name)
  end
  if text == "Your awareness decreases." then
    tvSay(tv, "watch ended")
    watchEnded(tv)
    return
  end
  if not tv.watching then
    -- A watch that started before (a reload): follow it from here.
    tv.watching = now()
    tv.resumed = true
    tv.ended = nil
    tv.auto = true
    openTv(tv.id)
    startTvTick()
    draw()
  end
  -- The game's colours, without the [name] in front.
  local c = copy2cecho() or text
  local at = c:find("[" .. label .. "] ", 1, true)
  if at then c = c:sub(1, at - 1) .. c:sub(at + #label + 3) end
  tvAdd(tv, c, text)
  if settings.tvgag then
    deleteLine()
    gagTail()
  end
end)

-- A scry: the room's lines follow, up to a blank line.
local scrying = nil
-- The scried room on the map (ADR 0057): its first line is the room's
-- name, the rest narrow by the description and the Exits: line. The dim
-- KEYS TV line says what happened.
local MARK_COLOR = "#ff40ff"
local MARK_FADE = 5

local function tvWho(tv) return tv.id == "scry" and "TV scry" or ("TV $" .. tv.name) end

local function scryLine(tv, what)
  cecho(TAG .. "<" .. DIM .. ">" .. tvWho(tv) .. ": " .. what .. ".")
end

local function markScry(tv, lines)
  if #lines == 0 then return scryLine(tv, "scried") end
  local name = lines[1].p
  local rest, exits = {}, nil
  for i = 2, #lines do
    local p = lines[i].p
    if p:match("^%s*Exits:") then exits = p else rest[#rest + 1] = p end
  end
  local opts = { color = MARK_COLOR, duration = SCRY_SECS, fade = MARK_FADE, linger = SCRY_LINGER, focus = true }
  if tv.id ~= "scry" then opts.label = "$" .. tv.name end
  local h, why = mapMark({ name = name, lines = rest, exits = exits }, opts, function(count, total)
    if count == 0 then
      scryLine(tv, 'scried; "' .. name .. '" is not on the map')
    elseif total == 1 then
      scryLine(tv, "scried; on the map")
    elseif count < total then
      scryLine(tv, "scried; " .. count .. " of " .. total .. ' rooms named "' .. name .. '" marked (nearest first)')
    else
      scryLine(tv, "scried; " .. count .. ' rooms named "' .. name .. '" marked (nearest first)')
    end
  end)
  if not h then scryLine(tv, "scried (" .. (why or "map off") .. ")") end
end

local function scryDone()
  local sc = scrying
  if not sc then return end
  scrying = nil
  killTrigger(sc.trig)
  if sc.timer then killTimer(sc.timer) end
  markScry(sc.tv, sc.lines)
  -- A key's last scry is kept (small), for its TV after a reload.
  local k = lib and lib.keys[sc.tv.id]
  if k and #sc.lines > 0 then
    k.scry = { at = sc.tv.scried, lines = sc.lines }
    save()
    draw()
  end
end

tempRegexTrigger("^You let your inner eye find the area\\.\\.\\. and you see:$", function()
  if not lib then return end
  scryDone()
  local pc = takePending("scry")
  local tv = pc and tvOf(pc.name) or tvOf("scry")
  tv.scried = now()
  tvAdd(tv, nil, "· scried", true)
  -- The header line goes; the KEYS TV line with the map's answer follows the block.
  if settings.tvgag then deleteLine() end
  local sc = { tv = tv, n = 0, lines = {} }
  scrying = sc
  sc.trig = tempRegexTrigger("^(.*)$", function()
    if scrying ~= sc then return end
    -- After the block's blank line: MUME's prompt, gagged with it.
    if sc.blank then
      if settings.tvgag and isPrompt() then deleteLine() end
      return scryDone()
    end
    if line == "" then
      if not settings.tvgag then return scryDone() end
      deleteLine()
      sc.blank = true
      return
    end
    if sc.n >= 60 then return scryDone() end
    sc.n = sc.n + 1
    local c = copy2cecho() or line
    sc.lines[#sc.lines + 1] = { c = c, p = line }
    tvAdd(tv, c, line)
    if settings.tvgag then deleteLine() end
  end)
  sc.timer = tempTimer(3, function()
    if scrying == sc then scryDone() end
  end)
  tv.shut = false
  tv.auto = true
  openTv(tv.id)
  if tv.pane then tv.pane:setTitle(tvTitle(tv, tv.scried)) end
  startTvTick()
  draw()
end)

local function locate(target, name)
  if not validName(name) then
    fail("A key name is 1 to " .. NAME_MAX .. " letters, digits or _ (not " .. name .. ").")
    return
  end
  if not lib then return notLoggedIn() end
  disarm()
  local a = { name = name, target = target }
  a.timer = tempTimer(LOCATE_TIMEOUT, function()
    if armed == a then
      armed = nil
      fail("No locate result within " .. LOCATE_TIMEOUT .. " s: no key stored for $" .. name .. ".")
    end
  end)
  armed = a
  local old = lib.keys[name:lower()] and " (replaces the old one)" or ""
  say("Locating " .. (target and target or "your room") .. " for " .. nm(name) .. old .. ".")
  send("cast n 'locate life'" .. (target and (" " .. target) or ""))
end

-- ------------------------------------------------------------ the character

local function follow()
  local c = state.char
  local n = c and c.name
  if type(n) ~= "string" or n == "" then return end
  local id = n:lower()
  if char and char.id == id then return end
  closePick()
  disarm()
  -- TVs belong to the character too.
  for _, tv in pairs(tvs) do closeTv(tv) end
  tvs = {}
  pendingCast = nil
  last = nil
  confirm = nil
  fresh = {}
  char = { id = id, name = n:sub(1, 1):upper() .. n:sub(2) }
  lib = loadLib(id)
  prune()
  if ensureSafe() then save() end
  draw()
end

-- A lost connection ends every watch (no duration is learnt).
registerAnonymousEventHandler("sysDisconnectionEvent", function()
  for _, tv in pairs(tvs) do
    if tv.watching then watchOver(tv, now()) end
  end
  draw()
end)

registerAnonymousEventHandler("gmcp.Char.Name", function()
  -- state.char is up to date once the message is handled.
  tempTimer(0, follow)
end)

-- ------------------------------------------------------------ aliases

local function list()
  if not lib then return notLoggedIn() end
  prune()
  local l = sorted()
  if #l == 0 then
    say("No keys for " .. char.name .. ". locatel <name> stores your room's key.")
    return
  end
  local t = now()
  say(char.name .. "'s keys:")
  for _, e in ipairs(l) do
    local k = e.k
    cecho("  " .. (lib.safe == e.id and "<ansi_light_green>★<reset> " or "  ") .. "<" .. NAME_C .. ">"
      .. pad("$" .. k.name, NAME_MAX + 1) .. "<reset>  " .. pad(k.room, 16) .. "  <" .. DIM .. ">" .. pad(k.key, 12)
      .. "<reset>  " .. long(expires(k) - t) .. " left")
  end
end

showHelp = function()
  expandAlias("#script help " .. scriptName)
end

tempAlias("^keys(?:\\s+(\\S+))?\\s*$", function()
  local sub = matches[2]
  if sub == "" then
    if pane:visible() then pane:hide() else pane:show() end
  elseif sub == "list" then
    list()
  elseif sub == "help" then
    showHelp()
  else
    say("keys, keys list, keys help")
  end
end)

tempAlias("^locatel(?:\\s+(\\S+))?(?:\\s+(\\S+))?\\s*$", function()
  local a, b = matches[2], matches[3]
  if a == "" then
    say("Usage: locatel <name> (your room), or locatel <target> <name>")
  elseif b == "" then
    locate(nil, a)
  else
    locate(a, b)
  end
end)

tempAlias("^kpick(?:\\s+(\\S+))?.*$", function()
  if matches[2] ~= "" then return say("kpick reopens the last pick list.") end
  if not last or #last.hits == 0 then
    fail("No locate to pick from. Cast locate life, or locatel <target> <name>.")
    return
  end
  openPick(last.hits, last.name)
end)

tempAlias("^nkey(?:\\s+(\\S+))?(?:\\s+(\\S+))?\\s*$", function()
  local name, key = matches[2], matches[3]:gsub("^'", ""):gsub("'$", "")
  if name == "" or key == "" then return say("Usage: nkey <name> <key>") end
  if not validName(name) then return fail("A key name is 1 to " .. NAME_MAX .. " letters, digits or _.") end
  if not key:match("^%w+$") then return fail("A key is letters and digits (not " .. key .. ").") end
  if not lib then return notLoggedIn() end
  addKey(name, key, "", "")
end)

for what in pairs(SPELLS) do
  tempAlias("^" .. what .. "\\s+\\$?(\\w+)\\s*$", function()
    local k = find(matches[2])
    if k then cast(what, k) end
  end)
end

tempAlias("^tsafe\\s*$", function() castSafe("teleport") end)
tempAlias("^qtsafe\\s*$", function() castSafe("teleport", true) end)
tempAlias("^psafe\\s*$", function() castSafe("portal") end)

tempKey("Ctrl+S", function() castSafe("teleport") end)
tempKey("Alt+S", function() castSafe("teleport", true) end)

-- TVs: tv shows or hides them all, tv <name> opens one.
tempAlias("^tv(?:\\s+\\$?(\\w+))?\\s*$", function()
  local name = matches[2]
  if name ~= "" then
    local id = name:lower()
    if not tvs[id] then return fail("No TV for $" .. name .. " yet: watchr " .. name .. " or scry " .. name .. ".") end
    openTv(id, true)
    return
  end
  local shown = false
  for _, tv in pairs(tvs) do
    if tv.pane and tv.pane:visible() then shown = true end
  end
  if shown then
    for _, tv in pairs(tvs) do
      if tv.pane then tv.pane:hide() end
    end
    draw()
    return
  end
  local any = false
  for id, tv in pairs(tvs) do
    if tv.pane then
      tv.pane:show()
      any = true
    elseif tv.watching then
      any = openTv(id, true) or any
    end
  end
  draw()
  if not any then say("No TV open: watchr <name> or scry <name>, or tv <name> for an old one.") end
end)

-- kecho <name> [rows]: a TV's last lines in the game text.
tempAlias("^kecho\\s+\\$?(\\w+)(?:\\s+(\\d+))?\\s*$", function()
  local tv = tvs[matches[2]:lower()]
  if not tv or #tv.lines == 0 then return fail("No TV lines for $" .. matches[2] .. ".") end
  local n = math.min(#tv.lines, tonumber(matches[3]) or 20)
  say("TV $" .. tv.name .. ", the last " .. n .. " lines:")
  for i = #tv.lines - n + 1, #tv.lines do
    local e = tv.lines[i]
    cecho("  " .. (e.mark and ("<" .. DIM .. ">" .. e.p) or e.c))
  end
end)

-- A watch or scry cast some other way (typed, a profile alias, or after
-- $name): its answer goes to the key's TV. It never takes the command.
local function noteCast(cmd)
  if not lib then return end
  local spell, key, label = cmd:match("^c%w*%s+%a?%s*'([^']+)'%s+(%S+)%s*(%S*)")
  if not spell then return end
  spell = spell:lower()
  local name = nameOfKey(key)
  if #spell >= 2 and ("scry"):sub(1, #spell) == spell then
    if name then expectCast("scry", name) end
  elseif #spell >= 3 and ("watch room"):sub(1, #spell) == spell then
    local n = label ~= "" and label or name
    if n and n:match("^[%w_]+$") then expectCast("watch", n) end
  end
end

tempAlias("^c\\w*\\s+(?:\\w\\s+)?'[^']+'\\s+\\S+", function()
  noteCast(command)
  return false
end)

-- $name in any command: the key. Defined last, so the aliases above take
-- their own commands (teleport $home) first.
tempAlias("^.*\\$[A-Za-z0-9_]", function()
  if not lib then return false end
  if prune() then draw() end
  local hit = false
  local out = command:gsub("%$([%w_]+)", function(w)
    local k = lib.keys[w:lower()]
    if k then
      hit = true
      return k.key
    end
    return nil
  end)
  if not hit then return false end
  noteCast(out)
  expandAlias(out)
end)

-- ------------------------------------------------------------ the clock

-- `#script set keymanager hours …` (or the Scripts page): redraw now.
registerAnonymousEventHandler("sysSettingChanged", function()
  prune()
  draw()
end)

-- Once a minute: drop expired keys, redraw the time left.
tempTimer(60, function()
  prune()
  draw()
end, true)

-- ------------------------------------------------------------ start

follow()
draw()
