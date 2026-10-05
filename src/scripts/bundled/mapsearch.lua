-- @name     mapsearch
-- @summary  Finds rooms on the map like MMapper's Find Rooms, marks them and shows the way
-- @api      1
-- @alias    mapsearch  Show or hide the Map search pane (mapsearch <text>: search for it)
-- @help     The Map search pane finds rooms on the map, as MMapper's Find
-- @help     Rooms dialog does. Type in Query and press Enter (or Find).
-- @help     Search says where to look:
-- @help
-- @help       Name         the room's name
-- @help       Description  the room's description
-- @help       Contents     what MMapper saw lying in the room
-- @help       Area         the area's name
-- @help       Exits        door names
-- @help       Notes        the map's notes (Herb: …, Quest: …)
-- @help       Flags        mob, load, exit and door flags (rent, shop, herb,
-- @help                    aggmob, guild, door, climb …)
-- @help       All          any of them
-- @help
-- @help     Case sensitive makes case count; Regular expression takes the
-- @help     query as one (JavaScript syntax). Changing them searches again.
-- @help
-- @help     The results come nearest first: the steps to walk, the room,
-- @help     its area and the way there as text (3e n 2u: three east, north,
-- @help     two up). Nothing is sent to the game. Point at a row for the
-- @help     whole way and the room's note.
-- @help
-- @help     Click a row to mark the room: it pulses on the map until you
-- @help     clear it, and the map zooms out to show you and the marked
-- @help     rooms. When you walk, the map follows you again; the marks
-- @help     keep pulsing. Mark all marks the rooms in the list (up to 200),
-- @help     Clear removes the marks, Close hides the pane and clears them.
-- @help     A new search keeps the marks you made.
-- @help
-- @help     The Map pane must be on with a map loaded.
-- @help
-- @help       mapsearch          show or hide the pane
-- @help       mapsearch <text>   search for text (with the pane's options)

--[[
How it works

mapSearch (ADR 0077 §B) does the matching and the shortest paths in the
map's worker; this script is the dialog around it. It asks for at most
200 rooms (MAX), nearest first, and draws one pane row per room.

The pane has three parts, drawn apart so a redraw does not take the
keyboard from the query field:
  controls  the query field, Find / Close, the Search radio buttons and
            the Options checkboxes. Drawn only when the width changes.
  status    the counts and Mark all / Clear, or a message (map off, bad
            regex, no rooms).
  list      a rule, the column header and the results.
The list scrolls with the pane's own scrolling (the wheel, the touchpad or
a finger); the controls scroll with it, which keeps touch working (a
script's own wheel paging has no touch).

Marks: one live mapMark with every marked room (duration 0, focus
"move"). Each change unmarks it and marks the new set, so the map zooms
again to the player and the marks; the first move to another room gives
the map back to the player. The marks belong to rooms, not to the list: a
new search keeps them, Clear and Close remove them.
]]

-- ------------------------------------------------------------ constants

local MAX = 200            -- results asked for; also mapMark's room cap
local LINK_C = "#b8b8b8"   -- buttons, as the other bundled scripts
local MARK_C = "~#ff40ff"  -- mapMark's default colour
local ERR_C = "~#ff6b6b"
local MIN_W = 30
local WIDE_W = 53          -- Options beside the Search buttons from here
local TIP_W = 56           -- tooltip line width

local FIELDS = {
  -- { value, label, hint }; two columns, as MMapper's dialog.
  { "name", "Name", "Search the room names" },
  { "desc", "Description", "Search the room descriptions" },
  { "contents", "Contents", "Search what lies in the rooms (as MMapper saw it)" },
  { "area", "Area", "Search the area names" },
  { "exits", "Exits", "Search the door names" },
  { "note", "Notes", "Search the map's notes (Herb: …, Quest: …)" },
  { "flags", "Flags", "Search the flags: rent, shop, herb, aggmob, guild,\ndoor, climb … or in words (aggressive mob)" },
  { "all", "All", "Search every field" },
}

-- ------------------------------------------------------------ state

local saved = store.get("query") or {}
local query = type(saved.text) == "string" and saved.text or ""
local field = "name"
for _, f in ipairs(FIELDS) do
  if f[1] == saved.field then field = f[1] end
end
local caseOn = saved.case == true
local regexOn = saved.regex == true

local results = nil        -- the last answer's rooms, or nil
local total = 0
local searched = false     -- a search was made (option changes search again)
local message = nil        -- { text, error } instead of the counts
local seq = 0              -- the newest search; older answers are dropped
local lost = false         -- the player's room was unknown: no ways

local marked = {}          -- id -> true
local markN = 0
local markHandle = nil

local W = 60
local controlsW = nil      -- the width the controls were drawn for
local statusRow, listRow = 0, 0
local shownN = 0           -- pane lines written
local input = nil          -- the query field
local focusWanted = false

local pane = createPane{ id = "main", title = "Map search", short = "FIND", dock = "right", lane = "own",
  rows = 24, cols = W, anchor = "top" }

-- ------------------------------------------------------------ helpers

local function trim(s) return (s:gsub("^%s+", ""):gsub("%s+$", "")) end

local function len(s) return utf8.len(s) or #s end

local function cut(s, n)
  if n <= 0 then return "" end
  if len(s) <= n then return s end
  if n == 1 then return "…" end
  return (s:sub(1, utf8.offset(s, n) - 1):gsub("%s+$", "")) .. "…"
end

local function pad(s, n)
  s = cut(s, n)
  return s .. string.rep(" ", n - len(s))
end

local function lpad(s, n)
  s = cut(s, n)
  return string.rep(" ", n - len(s)) .. s
end

-- Wraps text at spaces to lines of at most w cells (a long word is cut).
local function wrap(text, w, maxLines)
  local out = {}
  for para in (text .. "\n"):gmatch("(.-)\n") do
    local line = ""
    for word in para:gmatch("%S+") do
      if line == "" then line = word
      elseif len(line) + 1 + len(word) <= w then line = line .. " " .. word
      else
        out[#out + 1] = line
        line = word
      end
      while len(line) > w do
        out[#out + 1] = line:sub(1, utf8.offset(line, w + 1) - 1)
        line = line:sub(utf8.offset(line, w + 1))
      end
    end
    out[#out + 1] = line
  end
  if maxLines and #out > maxLines then
    local n = #out
    while #out > maxLines do table.remove(out) end
    out[#out] = cut(out[#out], w - 1) .. "…"
    out[#out + 1] = "(" .. n .. " lines in all)"
  end
  return table.concat(out, "\n")
end

local function save()
  store.set("query", { text = query, field = field, case = caseOn, regex = regexOn })
end

-- Writes a row from segments { text, color, fn, hint } and their links.
local function row(n, segs)
  local out, links, col = {}, {}, 1
  for _, s in ipairs(segs) do
    local w = len(s.text)
    out[#out + 1] = (s.color and ("<" .. s.color .. ">") or "<reset>") .. s.text
    if s.fn and w > 0 then links[#links + 1] = { col, w, s.fn, s.hint } end
    col = col + w
  end
  pane:setLine(n, table.concat(out))
  for _, l in ipairs(links) do pane:setLink(n, l[1], l[2], l[3], l[4]) end
  return col - 1
end

-- ------------------------------------------------------------ marks

local function markedIds()
  local ids = {}
  for id in pairs(marked) do ids[#ids + 1] = id end
  table.sort(ids)
  return ids
end

-- Replaces the live mark with one for every marked room, zoomed to show
-- the player and them until the player moves.
local function applyMarks()
  if markHandle then mapUnmark(markHandle) end
  markHandle = nil
  if markN == 0 then return end
  local h, why = mapMark(markedIds(), { duration = 0, focus = "move" })
  markHandle = h
  if not h then message = { "No marks: " .. tostring(why), true } end
end

local function clearMarks()
  marked, markN = {}, 0
  applyMarks()
end

-- ------------------------------------------------------------ drawing

local find, close, drawStatus, drawAll -- below

-- Whether any room in the list has an area (most rooms of arda.mm2 have none).
local function anyArea()
  for _, r in ipairs(results or {}) do
    if r.area ~= "" then return true end
  end
  return false
end

-- The list's columns for the width: name, area and way (0 = not shown).
-- Area goes first when the pane is narrow, or when no room has one.
local function columns()
  local avail = W - 10 - 1   -- " ● " + steps (5) + 2 spaces, and the last cell
  if avail >= 44 and anyArea() then
    local area = math.max(8, math.min(14, math.floor(avail * 0.18)))
    local name = math.max(12, math.min(28, math.floor(avail * 0.38)))
    return name, area, avail - 4 - name - area
  elseif avail >= 26 then
    local name = math.max(12, math.min(28, math.floor(avail * 0.5)))
    return name, 0, avail - 2 - name
  end
  return math.max(4, avail), 0, 0
end

local function drawControls()
  controlsW = W
  -- Row 1: the query field and the buttons.
  local closeB = W >= 40
  local btnW = 7 + (closeB and 8 or 0)   -- " [Find]" " [Close]"
  local fieldLen = math.max(6, W - 8 - btnW - 1)
  local segs = {
    { text = " Query: ", color = "@label" },
    { text = string.rep(" ", fieldLen) },
    { text = " " },
    { text = "[Find]", color = LINK_C, fn = function() find() end, hint = "Search (Enter in the field does too)" },
  }
  if closeB then
    segs[#segs + 1] = { text = " " }
    segs[#segs + 1] = { text = "[Close]", color = LINK_C, fn = function() close() end, hint = "Hide the pane and clear the marks" }
  end
  row(1, segs)
  input = pane:setInput(1, 9, fieldLen, {
    value = query,
    placeholder = "a room, a herb, rent …",
    maxLength = 200,
    onChange = function(text) query = text end,
    onSubmit = function(text)
      query = text
      focusWanted = false
      find()
    end,
    onCancel = function() focusWanted = false end,
    onBlur = function() focusWanted = false end,
  })

  -- The Search radio buttons in two columns, Options beside them when wide.
  local wide = W >= WIDE_W
  local optX = 31
  pane:setLine(2, "<@label> Search" .. (wide and (string.rep(" ", optX - 8) .. "Options") or ""))
  for i, f in ipairs(FIELDS) do
    local r = 3 + (i - 1) % 4
    local c = i <= 4 and 2 or 19
    if c == 2 then pane:setLine(r, "") end
    local value = f[1]
    pane:setRadio(r, c, {
      group = "field", value = value, label = f[2], checked = field == value, hint = f[3],
      onChange = function(v)
        field = v
        save()
        if searched and trim(query) ~= "" then find() end
      end,
    })
  end
  local function option(r, c, label, on, hint, set)
    pane:setCheckbox(r, c, {
      label = label, checked = on, hint = hint,
      onChange = function(v)
        set(v)
        save()
        if searched and trim(query) ~= "" then find() end
      end,
    })
  end
  local r = 7
  if not wide then
    pane:setLine(7, "<@label> Options")
    pane:setLine(8, "")
    pane:setLine(9, "")
    r = 10
  end
  local oy, ox = wide and 3 or 8, wide and optX or 2
  option(oy, ox, "Case sensitive", caseOn, "Upper and lower case must match", function(v) caseOn = v end)
  option(oy + 1, ox, "Regular expression", regexOn,
    "Take the query as a regular expression\n(JavaScript syntax: ^Herb: (athelas|mint))", function(v) regexOn = v end)
  statusRow = r
  listRow = r + 1
  if focusWanted and input then input:focus() end
end

local function statusSegs()
  local segs = {}
  local left
  if message then
    left = { text = " " .. message[1], color = message[2] and ERR_C or "@label" }
  elseif results then
    local n = #results
    local what = n == total and (total == 1 and "1 room" or total .. " rooms") or (n .. " of " .. total .. " rooms")
    left = { text = " " .. what .. (markN > 0 and (" · " .. markN .. " marked") or "")
      .. (lost and " · your room is unknown" or ""), color = "@label" }
  else
    left = { text = markN > 0 and (" " .. markN .. " marked") or " Type a query and press Enter.", color = "@label" }
  end
  local buttons = {}
  if results and #results > 0 then
    buttons[#buttons + 1] = { text = "[Mark all]", color = LINK_C, fn = function()
      local added = 0
      for _, r in ipairs(results) do
        if markN >= MAX then break end
        if not marked[r.id] then
          marked[r.id] = true
          markN = markN + 1
          added = added + 1
        end
      end
      message = nil
      if added > 0 then applyMarks() end
      drawAll()
    end, hint = "Mark every room in the list (" .. MAX .. " at most)" }
  end
  if markN > 0 then
    buttons[#buttons + 1] = { text = "[Clear]", color = LINK_C, fn = function()
      clearMarks()
      message = nil
      drawAll()
    end, hint = "Remove the marks from the map" }
  end
  local bw = 0
  for _, b in ipairs(buttons) do bw = bw + 1 + len(b.text) end
  local room = W - 1 - bw
  left.text = cut(left.text, math.max(1, room))
  segs[1] = left
  segs[2] = { text = string.rep(" ", math.max(0, room - len(left.text))) }
  for _, b in ipairs(buttons) do
    segs[#segs + 1] = { text = " " }
    segs[#segs + 1] = b
  end
  return segs
end

local function hintOf(r)
  local lines = { r.name .. (r.area ~= "" and (" (" .. r.area .. ")") or "") }
  if r.steps == nil then
    lines[#lines + 1] = "No path from here."
  elseif r.steps == 0 then
    lines[#lines + 1] = "You are here."
  else
    lines[#lines + 1] = r.steps .. (r.steps == 1 and " step:" or " steps:")
    lines[#lines + 1] = wrap(r.dirs or "", TIP_W, 14)
  end
  if r.note and r.note ~= "" then
    lines[#lines + 1] = "Note: " .. wrap(r.note, TIP_W - 6, 6):gsub("\n", "\n      ")
  end
  lines[#lines + 1] = marked[r.id] and "Click to unmark." or "Click to mark it on the map."
  return table.concat(lines, "\n")
end

local function drawResult(n, r)
  local nameW, areaW, wayW = columns()
  local on = marked[r.id]
  local bg = on and ":@dim" or ""
  local steps = r.steps == nil and "—" or tostring(r.steps)
  local way
  if r.steps == nil then way = "no path"
  elseif r.steps == 0 then way = "here"
  else way = r.dirs or "" end
  local segs = {
    { text = " ", color = bg ~= "" and bg or nil },
    { text = on and "●" or " ", color = MARK_C .. bg },
    { text = " " .. lpad(steps, 5) .. "  ", color = "@label" .. bg },
    { text = pad(r.name, nameW), color = "@text" .. bg },
  }
  if areaW > 0 then
    segs[#segs + 1] = { text = "  " .. pad(r.area, areaW), color = "@label" .. bg }
  end
  if wayW > 0 then
    segs[#segs + 1] = { text = "  " .. pad(way, wayW), color = (r.steps == nil and "@mid" or "@text") .. bg }
  end
  segs[#segs + 1] = { text = " ", color = bg ~= "" and bg or nil }
  -- The whole row is one link.
  local out = {}
  for _, s in ipairs(segs) do out[#out + 1] = (s.color and ("<" .. s.color .. ">") or "<reset>") .. s.text end
  pane:setLine(n, table.concat(out))
  pane:setLink(n, 1, W, function()
    if marked[r.id] then
      marked[r.id] = nil
      markN = markN - 1
    elseif markN >= MAX then
      message = { "At most " .. MAX .. " marks.", true }
      drawStatus()
      return
    else
      marked[r.id] = true
      markN = markN + 1
    end
    message = nil
    applyMarks()
    drawResult(n, r)
    drawStatus()
  end, hintOf(r))
end

drawStatus = function()
  if statusRow == 0 then return end
  row(statusRow, statusSegs())
end

local function drawList()
  local nameW, areaW, wayW = columns()
  local n = listRow
  pane:setLine(n, "<@mid>" .. string.rep("─", W))
  n = n + 1
  local head = " " .. " " .. " " .. lpad("Steps", 5) .. "  " .. pad("Room name", nameW)
  if areaW > 0 then head = head .. "  " .. pad("Area", areaW) end
  if wayW > 0 then head = head .. "  " .. pad("Way", wayW) end
  pane:setLine(n, "<@label>" .. head)
  pane:setLink(n, 1, W, nil, "Nearest first: the shortest way by MMapper's walking cost\n(terrain, doors, climbs), from where you stood when you\nsearched. Find again after walking.")
  for _, r in ipairs(results or {}) do
    n = n + 1
    drawResult(n, r)
  end
  return n
end

drawAll = function()
  if controlsW ~= W then
    pane:clear()
    shownN = 0
    drawControls()
  end
  drawStatus()
  local last = drawList()
  if last < shownN then
    -- Fewer rows than before: start over (the pane has no way to drop rows).
    pane:clear()
    controlsW = nil
    shownN = 0
    return drawAll()
  end
  shownN = last
end

-- ------------------------------------------------------------ search

find = function(text)
  if text then
    query = text
    if input then input:setValue(text) end
  end
  local q = trim(query)
  seq = seq + 1
  local mine = seq
  if q == "" then
    message = { "Type something to find.", true }
    drawAll()
    return
  end
  searched = true
  save()
  local answered = false
  local ok, why = mapSearch({ text = q, field = field, case = caseOn, regex = regexOn, max = MAX }, function(list, all, here)
    if mine ~= seq then return end
    answered = true
    results, total, lost = list, all, here == nil
    message = all == 0 and { "No rooms found.", false } or nil
    drawAll()
  end)
  if not ok then
    results, total = nil, 0
    if why == "map off" then
      message = { "Map off: turn the Map pane on (with a map) to search.", true }
    else
      message = { (tostring(why):gsub("^bad regex", "Bad regex")), true }
    end
    drawAll()
  elseif not answered then
    message = { "Searching …", false }
    drawStatus()
  end
end

close = function()
  clearMarks()
  pane:hide()
end

-- The pane's close cross (or Options → Panes) hides it: the marks go too.
registerAnonymousEventHandler("sysPanesChanged", function()
  -- Shown by the alias: the field can take the keyboard once it is on screen
  -- (a pane shown again at the same size gets no onResize).
  if focusWanted and input then
    for _, e in ipairs(getPanes()) do
      if e.own and e.shown then
        input:focus()
        focusWanted = false
      end
    end
  end
  if markN > 0 and not pane:visible() then
    clearMarks()
    message = nil
    drawAll()
  end
end)

pane:onResize(function(rows, cols)
  if cols <= 0 then return end
  W = math.max(MIN_W, cols)
  drawAll()
  -- Shown by the alias: the field can take the keyboard once it is on screen.
  if focusWanted and input then input:focus() end
end)

-- ------------------------------------------------------------ alias

tempAlias("^mapsearch(?:\\s+(.*))?$", function()
  local text = trim(matches[2] or "")
  if text == "" then
    if pane:visible() then
      close()
    else
      pane:show()
      focusWanted = true
      if input then input:focus() end
      -- The field is made again if the pane comes back at another width.
      tempTimer(1, function() focusWanted = false end)
    end
    return
  end
  if not pane:visible() then pane:show() end
  find(text)
end)

-- ------------------------------------------------------------ start

drawAll()
