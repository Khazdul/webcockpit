-- @name     panebar
-- @summary  A bar of buttons that turn the panes on and off
-- @api      1
-- @alias    bar  Show or hide the pane bar (also: bar list)
-- @help     One button per pane: the built-in panes (CHAR, TIME, GRP,
-- @help     COMM, UI, MAP) and the panes of the scripts that run, in the
-- @help     order of Options -> Panes. Click a button to hide its pane,
-- @help     click again to show it. A bright button is on, a dark one is
-- @help     off. Point at a button to see the pane's full name.
-- @help
-- @help     The bar starts at the bottom of the right dock, under the
-- @help     other panes. Drag it by the dots at its left end (or press a
-- @help     button and move) to another dock or over the game to float it.
-- @help     It is always one row. When it is too narrow for the full
-- @help     names, the buttons get narrower (down to two letters each).
-- @help     When even that is too wide, arrows at both ends show that
-- @help     there are more: click an arrow, or scroll sideways (two
-- @help     fingers on a touchpad, or the mouse wheel), to see them.
-- @help
-- @help       bar        show or hide the bar
-- @help       bar list   the panes and whether they are on, as text

--[[
How it works

getPanes() lists every pane in Options -> Panes order with its short
name, title and on/off; the bar leaves out its own pane. On is the
Character pane's lit toggle box, the pane background shade on the glow
shade (<@bg:@glow>); off is the mid shade on the track shade
(<@mid:@track>), faded but readable. Both follow the pane tint and the
light (paper) backgrounds. Under the pointer a button turns a step
lighter, text and fill (pane:setHover("lighten")). A click calls
setPaneOn.

The bar is one row: a grip, a dotted cell (pane:setGrip) that drags the
bar, a blank cell, then the buttons, one empty cell apart. How wide the
buttons are depends on the room after the grip (ADR 0065 round 3):

- Full: every button is the longest short name plus one cell on each
  side, the name centred. Used whenever all of them fit; spare room stays
  empty on the right.
- Shrunk: the buttons share the room, as wide as it allows, at least two
  cells. Their widths differ by at most one: the spare cells go to the
  first and the last button, then the second and the second-last, and so
  on, a single odd one to the middle button (with an even number of
  buttons it stays empty at the right end), so the row is mirror-even. A
  name that fits is centred; a longer one is cut to the button (CHAR,
  CHA, CH).
- Scrolled: when even two cells each do not fit, the buttons are two
  cells wide and the row shows as many as fit between a left arrow (after
  the grip) and a right arrow (in the last column). `offset` is the
  first button shown, in whole buttons, clamped on every draw. A click on
  an arrow moves a page (the buttons shown); at the end the arrow is dim
  and does nothing. The wheel (pane:onWheel) scrolls too: sideways or
  up/down, a button per three cells (a button and its gap).

The bar redraws when the list changes (sysPanesChanged), when it is
resized and when it moves to another dock. Docked, it asks for one row
with pane:wantSize (a height the player drags stays until the bar moves).
]]

local ON = "<@bg:@glow>"
local OFF = "<@mid:@track>"
local GRIP = "<@mid>\u{2237}<reset>"
local LEFT, RIGHT = "\u{2190}", "\u{2192}"
-- The first button column: the grip, then one blank cell.
local FIRST = 3
-- Scrolled: the left arrow and a blank before the buttons.
local SCROLL_FIRST = FIRST + 2
-- The narrowest button.
local MIN_W = 2

local pane = createPane{
  id = "bar", title = "Pane bar", short = "BAR",
  dock = "right", rows = 1, cols = 30, border = false,
}
-- A hovered button lightens (text and fill) instead of the glow band.
pane:setHover("lighten")
local width = 30
-- Scrolled: the first button shown (0-based), and the wheel not yet used.
local offset = 0
local wheelRest = 0
-- Set by the last draw: scrolled or not, buttons in the list and shown.
local scrolled, count, shown = false, 0, 0

-- The panes the bar has buttons for: every pane but its own.
local function others()
  local out = {}
  for _, e in ipairs(getPanes()) do
    if not e.own then out[#out + 1] = e end
  end
  return out
end

local function hint(e)
  if not e.on then return e.title .. ": off (click to show)" end
  if not e.shown then return e.title .. ": on, no room now" end
  return e.title .. ": on (click to hide)"
end

-- `text` in `w` cells: centred when it fits (the odd cell goes right),
-- else its first `w` characters.
local function label(text, w)
  local n = utf8.len(text)
  if n > w then return text:sub(1, utf8.offset(text, w + 1) - 1) end
  local left = math.floor((w - n) / 2)
  return string.rep(" ", left) .. text .. string.rep(" ", w - n - left)
end

-- The full button width: the longest short name plus one cell on each side.
local function fullWidth(list)
  local w = 0
  for _, e in ipairs(list) do w = math.max(w, utf8.len(e.short)) end
  return w + 2
end

-- The buttons for the bar's width: { {col, w, e}, … } and whether the
-- row scrolls (then only the buttons shown, from `offset`).
local function layout(list)
  local n = #list
  local room = width - FIRST + 1
  local out = {}
  if n == 0 then return out, false end
  local full = fullWidth(list)
  -- Full: as wide as the longest name needs.
  if n * full + n - 1 <= room then
    for i, e in ipairs(list) do out[i] = { col = FIRST + (i - 1) * (full + 1), w = full, e = e } end
    return out, false
  end
  -- Shrunk: share the room, the spare cells mirror-even.
  local cells = room - (n - 1)
  local base = math.floor(cells / n)
  if base >= MIN_W then
    local widths = {}
    for i = 1, n do widths[i] = base end
    local spare = cells - base * n
    local i, j = 1, n
    while spare >= 2 and i < j do
      widths[i], widths[j] = widths[i] + 1, widths[j] + 1
      spare, i, j = spare - 2, i + 1, j - 1
    end
    if spare == 1 and n % 2 == 1 then widths[(n + 1) // 2] = widths[(n + 1) // 2] + 1 end
    local col = FIRST
    for k, e in ipairs(list) do
      out[k] = { col = col, w = widths[k], e = e }
      col = col + widths[k] + 1
    end
    return out, false
  end
  -- Scrolled: two-cell buttons between the arrows.
  local fit = math.max(0, (width - 1 - SCROLL_FIRST + 1) // (MIN_W + 1))
  fit = math.min(fit, n)
  offset = math.max(0, math.min(offset, n - fit))
  for k = 1, fit do
    out[k] = { col = SCROLL_FIRST + (k - 1) * (MIN_W + 1), w = MIN_W, e = list[offset + k] }
  end
  return out, true
end

local draw

-- Scrolls by `by` buttons (scrolled only) and redraws.
local function scroll(by)
  local to = math.max(0, math.min(offset + by, count - shown))
  if to == offset then return end
  offset = to
  draw()
end

local function more(k, side)
  return k .. " more " .. (k == 1 and "pane" or "panes") .. " to the " .. side
end

draw = function()
  local list = others()
  local dock = pane:dock()
  if not dock then return end
  local buttons, isScrolled = layout(list)
  scrolled, count, shown = isScrolled, #list, #buttons
  if not scrolled then
    offset, wheelRest = 0, 0
  end
  pane:clear()
  local parts, at = { GRIP }, 2
  local function put(col, text)
    parts[#parts + 1] = string.rep(" ", col - at) .. text
  end
  local left, right = offset, count - offset - shown
  if scrolled and width > FIRST then
    put(FIRST, (left > 0 and "<@text>" or "<@dim>") .. LEFT .. "<reset>")
    at = FIRST + 1
  end
  for _, b in ipairs(buttons) do
    put(b.col, (b.e.on and ON or OFF) .. label(b.e.short, b.w) .. "<reset>")
    at = b.col + b.w
  end
  if scrolled and width > FIRST then
    put(width, (right > 0 and "<@text>" or "<@dim>") .. RIGHT .. "<reset>")
  end
  pane:setLine(1, table.concat(parts))
  for _, b in ipairs(buttons) do
    local id, on = b.e.id, b.e.on
    pane:setLink(1, b.col, b.w, function() setPaneOn(id, not on) end, hint(b.e))
  end
  if scrolled and width > FIRST then
    local page = math.max(1, shown)
    -- At an end the arrow is dim and has no link.
    if left > 0 then pane:setLink(1, FIRST, 1, function() scroll(-page) end, more(left, "left")) end
    if right > 0 then pane:setLink(1, width, 1, function() scroll(page) end, more(right, "right")) end
  end
  pane:setGrip(1, 1, FIRST - 1)
  -- One row (the surface ignores a repeated request, so a height the
  -- player dragged stays).
  if dock ~= "float" then pane:wantSize(1) end
end

-- The wheel scrolls a scrolled bar, sideways or up and down (a mouse
-- wheel), a button per three cells; otherwise it is left alone.
pane:onWheel(function(dx, dy)
  if not scrolled then return false end
  local d = dx + dy
  if d ~= 0 and (wheelRest > 0) ~= (d > 0) then wheelRest = 0 end
  wheelRest = wheelRest + d
  local steps = wheelRest >= 0 and wheelRest // (MIN_W + 1) or -((-wheelRest) // (MIN_W + 1))
  wheelRest = wheelRest - steps * (MIN_W + 1)
  if steps ~= 0 then scroll(steps) end
  return true
end)

pane:onResize(function(rows, cols)
  if cols < 1 then return end
  width = cols
  draw()
end)

registerAnonymousEventHandler("sysPanesChanged", draw)
registerAnonymousEventHandler("sysLoadEvent", draw)

local function say(text)
  cecho("<ansi_light_yellow>BAR<reset> " .. text)
end

tempAlias("^bar(?: +(\\S+))?$", function()
  local sub = matches[2]
  if sub == "" then
    if pane:visible() then pane:hide() else pane:show() end
  elseif sub == "list" then
    for _, e in ipairs(others()) do
      local state = e.on and "on " or "off"
      local owner = e.script and (" (" .. e.script .. ")") or ""
      say(string.format("%-8s %s  %s%s", e.short, state, e.title, owner))
    end
  else
    say("bar, bar list")
  end
end)
